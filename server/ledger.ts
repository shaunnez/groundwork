import { randomUUID } from "node:crypto";
import type { Database } from "./db.ts";
import { transaction } from "./db.ts";
export async function reserveCall(
  db: Database,
  input: {
    accountId: string | null;
    runId: string | null;
    key: string;
    provider: string;
    maximum: number;
    budgetId?: string;
  },
): Promise<string> {
  return transaction(db, async (c) => {
    if (input.maximum < 0 || !Number.isFinite(input.maximum))
      throw new Error("Invalid reservation");
    const existing = await c.query(
      "SELECT id,status FROM provider_calls WHERE logical_key=$1",
      [input.key],
    );
    if (existing.rowCount)
      throw new Error(
        `Call already recorded (${existing.rows[0].status}); reconcile receipt before retry`,
      );
    if (input.budgetId) {
      const r = await c.query(
        "UPDATE budgets SET reserved=reserved+$2 WHERE id=$1 AND spent+reserved+$2<=allowance RETURNING id",
        [input.budgetId, input.maximum],
      );
      if (!r.rowCount) throw new Error("Research budget exhausted");
    }
    const callId = randomUUID();
    await c.query(
      "INSERT INTO provider_calls(id,account_id,run_id,logical_key,provider,status,budget_id,reserved) VALUES($1,$2,$3,$4,$5,'reserved',$6,$7)",
      [
        callId,
        input.accountId,
        input.runId,
        input.key,
        input.provider,
        input.budgetId ?? null,
        input.maximum,
      ],
    );
    return callId;
  });
}
export async function settleCall(
  db: Database,
  callId: string,
  result: {
    status: "succeeded" | "failed" | "uncertain";
    actual?: number;
    usage?: unknown;
    receiptRef?: string;
  },
): Promise<void> {
  await transaction(db, async (c) => {
    const r = await c.query(
      "SELECT * FROM provider_calls WHERE id=$1 FOR UPDATE",
      [callId],
    );
    const row = r.rows[0];
    if (!row || !["reserved", "uncertain"].includes(row.status))
      throw new Error("Call is already settled or missing");
    if (result.status !== "uncertain" && row.budget_id) {
      const actual = result.actual;
      if (actual === undefined || actual < 0 || actual > Number(row.reserved))
        throw new Error("Actual usage must be known and within reservation");
      await c.query(
        "UPDATE budgets SET reserved=reserved-$2,spent=spent+$3 WHERE id=$1",
        [row.budget_id, row.reserved, actual],
      );
    }
    await c.query(
      "UPDATE provider_calls SET status=$2,settled=$3,usage=$4,receipt_ref=$5,finished_at=now() WHERE id=$1",
      [
        callId,
        result.status,
        result.actual ?? null,
        result.usage ?? null,
        result.receiptRef ?? null,
      ],
    );
  });
}
