import { z } from "zod";
import type { Database } from "./db.ts";
import { ObjectStore } from "./storage.ts";
import { settleCall } from "./ledger.ts";
export const Reconciliation = z
  .object({
    callId: z.string().uuid(),
    logicalKey: z.string().min(1),
    provider: z.literal("firecrawl-search"),
    actualCredits: z.number().int().min(0).max(2),
    outcome: z.enum(["succeeded", "failed"]),
    providerRecordReference: z.string().min(5),
    checkedBy: z.string().min(2),
    reason: z.string().min(10),
  })
  .strict();
export async function reconcileResearch(
  db: Database,
  store: ObjectStore,
  evidence: unknown,
) {
  const x = Reconciliation.parse(evidence);
  const row = (
    await db.query("SELECT * FROM provider_calls WHERE id=$1", [x.callId])
  ).rows[0];
  if (
    !row ||
    row.provider !== x.provider ||
    row.logical_key !== x.logicalKey ||
    !["uncertain", "reserved"].includes(row.status)
  )
    throw new Error(
      "Unresolved research call and its logical identity must match the reconciliation record",
    );
  if (x.actualCredits > Number(row.reserved))
    throw new Error(
      "Usage exceeds reservation; investigate allowance before settlement",
    );
  const receiptRef = await store.put(
    row.account_id,
    JSON.stringify({
      operatorReconciliation: x,
      priorReceipt: row.receipt_ref,
    }),
  );
  await settleCall(db, x.callId, {
    status: x.outcome,
    actual: x.actualCredits,
    receiptRef,
    usage: {
      ...row.usage,
      credits: x.actualCredits,
      reconciliation: x,
      providerReceiptRef: row.receipt_ref,
    },
  });
  return { id: x.callId, status: x.outcome, credits: x.actualCredits };
}
