import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../../server/config.ts";
import { database } from "../../server/db.ts";
import { reserveCall } from "../../server/ledger.ts";

test("parallel model reservations cannot exceed the per-run allowance", async () => {
  const db = database(loadConfig());
  const accountId = randomUUID();
  const opportunityId = randomUUID();
  const runId = randomUUID();
  try {
    await db.query(
      "INSERT INTO accounts(id,name) VALUES($1,'Call limit test')",
      [accountId],
    );
    await db.query(
      "INSERT INTO opportunities(id,account_id,title,buyer,notice_id,cutoff,metadata) VALUES($1,$2,'Call limit test','Test buyer','LIMIT-1','2026-09-23','{}')",
      [opportunityId, accountId],
    );
    await db.query(
      "INSERT INTO runs(id,account_id,opportunity_id,input_hash,manifest,state) VALUES($1,$2,$3,$4,'{}','running')",
      [runId, accountId, opportunityId, randomUUID()],
    );
    const reservations = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        reserveCall(db, {
          accountId,
          runId,
          key: `${runId}:batch-${index}`,
          provider: "test-model",
          maximum: 0,
          runCallLimit: 3,
        }),
      ),
    );
    assert.equal(
      reservations.filter((result) => result.status === "fulfilled").length,
      3,
    );
    assert.ok(
      reservations
        .filter((result) => result.status === "rejected")
        .every((result) =>
          /Model call budget reached/.test(String(result.reason)),
        ),
    );
    const saved = await db.query(
      "SELECT count(*)::int AS count FROM provider_calls WHERE run_id=$1",
      [runId],
    );
    assert.equal(saved.rows[0].count, 3);
  } finally {
    await db.query("DELETE FROM accounts WHERE id=$1", [accountId]);
    await db.end();
  }
});
