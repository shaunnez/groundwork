import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../../server/config.ts";
import { database } from "../../server/db.ts";
import { baseInput } from "./fixtures.ts";
import {
  createCollection,
  readCollection,
  deliverCollection,
} from "../../server/collections.ts";
import { recordReview, sampleWeekly } from "../../server/operations.ts";
const db = database(loadConfig()),
  account = randomUUID(),
  other = randomUUID(),
  actor = randomUUID();
await db.query(
  "INSERT INTO accounts(id,name) VALUES($1,'Collection fixture'),($2,'Other collection fixture')",
  [account, other],
);
async function seed(title: string) {
  const o = randomUUID(),
    run = randomUUID(),
    intel = randomUUID(),
    report = randomUUID(),
    payload = baseInput().payload;
  await db.query(
    "INSERT INTO opportunities(id,account_id,title,buyer,notice_id,cutoff,metadata) VALUES($1,$2,$3,'Fixture buyer',$3,'2026-09-01','{\"provenance\":\"synthetic\"}')",
    [o, account, title],
  );
  await db.query(
    "INSERT INTO runs(id,account_id,opportunity_id,input_hash,manifest,state) VALUES($1,$2,$3,$4,'{\"sourceIds\":[],\"sourceHashes\":[]}','succeeded')",
    [run, account, o, randomUUID()],
  );
  await db.query(
    "INSERT INTO intelligence(id,account_id,opportunity_id,run_id,cutoff,payload) VALUES($1,$2,$3,$4,'2026-09-01',$5)",
    [intel, account, o, run, payload.intelligence],
  );
  await db.query(
    "INSERT INTO reports(id,account_id,opportunity_id,run_id,intelligence_id,kind,payload) VALUES($1,$2,$3,$4,$5,'pursuit',$6)",
    [report, account, o, run, intel, payload],
  );
  await db.query(
    "INSERT INTO reviews(id,account_id,report_id,state,reasons) VALUES($1,$2,$3,'pending','[\"Fixture review required\"]')",
    [randomUUID(), account, report],
  );
  return report;
}
const parents = await Promise.all([
  seed("Synthetic opportunity A"),
  seed("Synthetic opportunity B"),
]);
let collectionId: string;
test("M5 account weekly digest freezes multiple notice-level snapshots with independent cutoffs and no new claims", async () => {
  const results = await Promise.all([
    createCollection(db, account, "weekly", null),
    createCollection(db, account, "weekly", null),
  ]);
  assert.equal(results[0].id, results[1].id);
  collectionId = results[0].id;
  const c = await readCollection(db, account, collectionId);
  assert.equal(c.items.length, 2);
  assert.equal(new Set(c.items.map((i) => i.intelligenceId)).size, 2);
  assert.equal(
    c.items.every((i) => i.cutoff === "2026-09-01"),
    true,
  );
  assert.equal(c.readyForInternalDelivery, false);
  await assert.rejects(readCollection(db, other, collectionId), /not found/);
  await assert.rejects(
    createCollection(db, other, "weekly", randomUUID()),
    /Client not found/,
  );
});
test("Collection delivery is atomic and idempotent and requires every underlying review", async () => {
  const c = await readCollection(db, account, collectionId);
  await assert.rejects(
    deliverCollection(db, account, collectionId),
    /Every included/,
  );
  for (const id of [...parents, ...c.items.map((i) => i.reportId!)])
    await recordReview(
      db,
      account,
      actor,
      id,
      "approved",
      "Synthetic local collection delivery test",
    );
  const results = await Promise.all([
    deliverCollection(db, account, collectionId),
    deliverCollection(db, account, collectionId),
  ]);
  assert.equal(results.filter((r) => !r.reused).length, 1);
  await sampleWeekly(db);
  await sampleWeekly(db);
  const sampled = await db.query(
    "SELECT report_id FROM review_samples WHERE account_id=$1",
    [account],
  );
  assert.equal(sampled.rowCount, 1);
  assert.ok(c.items.some((i) => i.reportId === sampled.rows[0].report_id));
  assert.equal(
    (await readCollection(db, account, collectionId)).readyForInternalDelivery,
    true,
  );
  await assert.rejects(deliverCollection(db, other, collectionId), /not found/);
});
test("New unassessed notices are named and block a complete collection; prior collection stays immutable", async () => {
  const o = randomUUID();
  await db.query(
    "INSERT INTO opportunities(id,account_id,title,buyer,notice_id,cutoff,metadata) VALUES($1,$2,'Unassessed fixture','Fixture buyer','UNASSESSED','2026-09-22','{\"provenance\":\"synthetic\"}')",
    [o, account],
  );
  const old = await readCollection(db, account, collectionId);
  assert.equal(old.stale, true);
  assert.equal(old.items.length, 2);
  await assert.rejects(
    deliverCollection(db, account, collectionId),
    /Every included/,
  );
  const fresh = await createCollection(db, account, "weekly", null);
  const read = await readCollection(db, account, fresh.id);
  assert.equal(read.items.length, 3);
  assert.equal(
    read.items.find((i) => i.opportunityId === o)?.state,
    "needs-assessment",
  );
  assert.equal(read.readyForInternalDelivery, false);
  await assert.rejects(
    db.query("UPDATE collections SET payload='{}' WHERE id=$1", [collectionId]),
    /immutable/,
  );
});
test.after(async () => {
  await db.query("DELETE FROM accounts WHERE id=ANY($1::uuid[])", [
    [account, other],
  ]);
  await db.end();
});
