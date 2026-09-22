import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../../server/config.ts";
import { database } from "../../server/db.ts";
import { baseInput } from "./fixtures.ts";
import {
  materialise,
  recordReview,
  deliverLocal,
  reportFreshness,
  scheduleTick,
  sampleWeekly,
} from "../../server/operations.ts";
const config = loadConfig(),
  db = database(config),
  accountId = randomUUID(),
  otherId = randomUUID(),
  opportunityId = randomUUID(),
  runId = randomUUID(),
  intelligenceId = randomUUID(),
  reportId = randomUUID(),
  actorId = randomUUID();
await db.query(
  "INSERT INTO accounts(id,name) VALUES($1,'Operations fixture'),($2,'Other operations fixture')",
  [accountId, otherId],
);
await db.query(
  "INSERT INTO opportunities(id,account_id,title,buyer,notice_id,cutoff,metadata) VALUES($1,$2,'Synthetic notice','Fixture buyer','OPS-FIXTURE','2026-09-01','{}')",
  [opportunityId, accountId],
);
await db.query(
  "INSERT INTO runs(id,account_id,opportunity_id,input_hash,manifest,state) VALUES($1,$2,$3,'fixture',$4,'succeeded')",
  [runId, accountId, opportunityId, { sourceIds: [], sourceHashes: [] }],
);
const payload = baseInput().payload;
await db.query(
  "INSERT INTO intelligence(id,account_id,opportunity_id,run_id,cutoff,payload) VALUES($1,$2,$3,$4,$5,$6)",
  [
    intelligenceId,
    accountId,
    opportunityId,
    runId,
    "2026-09-01",
    payload.intelligence,
  ],
);
await db.query(
  "INSERT INTO reports(id,account_id,opportunity_id,run_id,intelligence_id,kind,payload) VALUES($1,$2,$3,$4,$5,'pursuit',$6)",
  [reportId, accountId, opportunityId, runId, intelligenceId, payload],
);
await db.query(
  "INSERT INTO reviews(id,account_id,report_id,state,reasons) VALUES($1,$2,$3,'pending','[\"Adverse competitor claim\"]')",
  [randomUUID(), accountId, reportId],
);
let derived: string;
test("A29 all four saved outputs share one intelligence, account and verdict; concurrent derivation is idempotent", async () => {
  const results = await Promise.all([
    materialise(db, accountId, reportId, "watchlist"),
    materialise(db, accountId, reportId, "watchlist"),
  ]);
  assert.equal(results[0].id, results[1].id);
  derived = results[0].id;
  await materialise(db, accountId, reportId, "competitor");
  await materialise(db, accountId, reportId, "weekly");
  const rows = (
    await db.query(
      "SELECT intelligence_id,payload FROM reports WHERE run_id=$1",
      [runId],
    )
  ).rows;
  assert.equal(rows.length, 4);
  for (const r of rows) {
    assert.equal(r.intelligence_id, intelligenceId);
    assert.deepEqual(r.payload.assessment.verdict, payload.assessment.verdict);
  }
  await assert.rejects(
    materialise(db, otherId, reportId, "weekly"),
    /not found/,
  );
});
test("A28 changing deliverable cannot bypass upstream review; internal delivery is idempotent", async () => {
  await assert.rejects(deliverLocal(db, accountId, derived), /approved/);
  await recordReview(
    db,
    accountId,
    actorId,
    derived,
    "approved",
    "Fixture local approval",
  );
  await assert.rejects(
    deliverLocal(db, accountId, derived),
    /underlying pursuit/,
  );
  await recordReview(
    db,
    accountId,
    actorId,
    reportId,
    "approved",
    "Fixture parent approval",
  );
  const results = await Promise.all([
    deliverLocal(db, accountId, derived),
    deliverLocal(db, accountId, derived),
  ]);
  assert.equal(results.filter((r) => !r.reused).length, 1);
  assert.equal(
    results.every((r) => r.customerPublication === false),
    true,
  );
  await assert.rejects(deliverLocal(db, otherId, derived), /not found/);
  await assert.rejects(
    recordReview(db, otherId, actorId, derived, "approved", "Cross account"),
    /not found/,
  );
  await recordReview(
    db,
    accountId,
    actorId,
    reportId,
    "changes-requested",
    "Correct underlying claim",
  );
  await assert.rejects(deliverLocal(db, accountId, derived), /approved/);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM review_events WHERE report_id=$1",
        [reportId],
      )
    ).rows[0].n,
    2,
  );
});
test("Local scheduling survives duplicate workers and never automatically delivers or pays for model calls", async () => {
  const scheduleId = randomUUID();
  await db.query(
    "INSERT INTO schedules(id,account_id,opportunity_id,kind,next_at,interval_hours) VALUES($1,$2,$3,'weekly',now()-interval '1 hour',168)",
    [scheduleId, accountId, opportunityId],
  );
  const now = new Date();
  await Promise.all([
    scheduleTick(db, config, now),
    scheduleTick(db, config, now),
  ]);
  const ticks = await db.query(
    "SELECT * FROM schedule_ticks WHERE schedule_id=$1",
    [scheduleId],
  );
  assert.equal(ticks.rowCount, 1);
  assert.equal(ticks.rows[0].state, "succeeded");
  assert.equal(
    ticks.rows[0].result.delivery,
    "Awaiting explicit internal approval; nothing sent",
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM provider_calls WHERE account_id=$1",
        [accountId],
      )
    ).rows[0].n,
    0,
  );
  const restarted = database(config);
  assert.equal(await scheduleTick(restarted, config, now), false);
  await restarted.end();
  await sampleWeekly(db, now);
  await sampleWeekly(db, now);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM review_samples WHERE account_id=$1",
        [accountId],
      )
    ).rows[0].n,
    1,
  );
});
test("A29 new source marks old outputs stale without altering frozen report", async () => {
  const sourceId = randomUUID();
  await db.query(
    "INSERT INTO sources(id,account_id,opportunity_id,name,media_type,purpose,required,hash,object_ref,reader,state,coverage,provenance) VALUES($1,$2,$3,'Synthetic new evidence','text/plain','addendum',true,'changed','fixture','fixture','read','{}','synthetic')",
    [sourceId, accountId, opportunityId],
  );
  const state = await reportFreshness(db, accountId, derived);
  assert.equal(state.stale, true);
  assert.equal(state.sourceChanged, true);
  await assert.rejects(deliverLocal(db, accountId, derived), /New evidence/);
  const saved = (
    await db.query("SELECT payload FROM reports WHERE id=$1", [derived])
  ).rows[0];
  assert.deepEqual(saved.payload.assessment, payload.assessment);
});
test.after(async () => {
  await db.query("DELETE FROM accounts WHERE id=ANY($1::uuid[])", [
    [accountId, otherId],
  ]);
  await db.end();
});
