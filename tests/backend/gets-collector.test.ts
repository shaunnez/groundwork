import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { loadConfig } from "../../server/config.ts";
import { database } from "../../server/db.ts";
import {
  GetsPackWorker,
  changeCollectionJob,
  getsCollectionDetail,
} from "../../server/gets/collection-queue.ts";
import {
  GetsIntakeWorker,
  startGetsRun,
} from "../../server/gets/intake.ts";
import {
  GetsCollectionBlocked,
  RealMeLoginBudget,
  realMeFailure,
  type GetsCollectionSession,
} from "../../server/gets/hosted-session.ts";
import { hash } from "../../server/storage.ts";
import type { PackDeclaration } from "../../server/tender-packs.ts";
import { nativePdf } from "./document-fixtures.ts";

const config = loadConfig();
const db = database(config);
const account = randomUUID(),
  actor = randomUUID(),
  run = randomUUID();
const pdf = nativePdf();
const makeFile = (fileId: string, name = `${fileId}.pdf`) => ({
  fileId,
  name,
  bytes: pdf.length,
  sha256: hash(pdf),
  kind: "attachment" as const,
  status: "current" as const,
});
const manifest = (rfxId: string, files = [makeFile("1")]): PackDeclaration => ({
  rfxId,
  observedAt: new Date().toISOString(),
  files,
});

async function seed(rfxId: string, currentRun = run) {
  const opportunity = randomUUID(),
    notice = randomUUID(),
    revision = randomUUID(),
    source = randomUUID(),
    job = randomUUID();
  await db.query(
    `INSERT INTO opportunities(id,account_id,title,buyer,notice_id,cutoff,metadata)
    VALUES($1,$2,$3,'Fixture buyer',$4,'2026-09-23','{}')`,
    [opportunity, account, `RFx ${rfxId}`, rfxId],
  );
  await db.query(
    `INSERT INTO sources(id,account_id,opportunity_id,name,media_type,purpose,required,hash,object_ref,reader,state,coverage,provenance)
    VALUES($1,$2,$3,'GETS notice','text/html','notice',true,$4,$5,'html-structure-v1','read',$6,'synthetic')`,
    [
      source,
      account,
      opportunity,
      hash(`notice-${rfxId}`),
      `${account}/${randomUUID()}`,
      { total: 1, read: 1, unread: 0, unit: "section", failures: [] },
    ],
  );
  await db.query(
    "INSERT INTO gets_notices(id,account_id,rfx_id,opportunity_id) VALUES($1,$2,$3,$4)",
    [notice, account, rfxId, opportunity],
  );
  await db.query(
    `INSERT INTO gets_notice_revisions(id,account_id,notice_id,semantic_hash,raw_hash,raw_ref,source_id,fields,parser_version)
    VALUES($1,$2,$3,$4,$5,$6,$7,'{}','fixture-v1')`,
    [
      revision,
      account,
      notice,
      hash(`semantic-${revision}`),
      hash(`raw-${revision}`),
      `${account}/${randomUUID()}`,
      source,
    ],
  );
  await db.query("UPDATE gets_notices SET current_revision_id=$2 WHERE id=$1", [
    notice,
    revision,
  ]);
  await db.query(
    `INSERT INTO gets_pack_jobs(id,account_id,intake_run_id,notice_revision_id,opportunity_id,actor_id,rfx_id)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [job, account, currentRun, revision, opportunity, actor, rfxId],
  );
  return { opportunity, notice, revision, job };
}

class FakeSession implements GetsCollectionSession {
  inventories = new Map<string, PackDeclaration>();
  downloads = 0;
  inventoryCalls = 0;
  loginRetries = 0;
  corruptOnce = false;
  blocked = false;
  async inventory(rfxId: string) {
    this.inventoryCalls++;
    if (this.blocked)
      throw new GetsCollectionBlocked("RealMe requires MFA or CAPTCHA");
    const value = this.inventories.get(rfxId);
    if (!value) throw new Error("Missing fixture inventory");
    return value;
  }
  async download(
    _rfxId: string,
    _manifest: PackDeclaration,
    needed: PackDeclaration["files"],
    directory: string,
  ) {
    this.downloads++;
    for (const [index, file] of needed.entries())
      await writeFile(
        join(directory, file.fileId),
        this.corruptOnce && index === needed.length - 1
          ? Buffer.from("wrong")
          : pdf,
      );
    this.corruptOnce = false;
  }
  async close() {}
}

test("manual changed tenders share one collection session and retain pack-ready records", async () => {
  await db.query(
    "INSERT INTO accounts(id,name) VALUES($1,'GETS collector fixture')",
    [account],
  );
  await db.query(
    `INSERT INTO gets_intake_runs(id,account_id,actor_id,scope,state,mode)
    VALUES($1,$2,$3,'current','complete','live')`,
    [run, account, actor],
  );
  const first = await seed("34995788"),
    second = await seed("34995789");
  const fake = new FakeSession();
  fake.inventories.set("34995788", manifest("34995788"));
  fake.inventories.set("34995789", manifest("34995789"));
  let sessions = 0;
  const worker = new GetsPackWorker(config, db, () => {
    sessions++;
    return fake;
  });
  assert.equal(await worker.tick(), true);
  assert.equal(await worker.tick(), true);
  assert.equal(await worker.tick(), false);
  assert.equal(sessions, 1);
  assert.equal(fake.inventoryCalls, 2);
  const jobs = await db.query(
    "SELECT id,state,pack_id FROM gets_pack_jobs WHERE id=ANY($1::uuid[])",
    [[first.job, second.job]],
  );
  assert.deepEqual(jobs.rows.map((r) => r.state).sort(), [
    "admitted",
    "admitted",
  ]);
  for (const item of jobs.rows) {
    assert.ok(item.pack_id);
    const files = await db.query(
      "SELECT source_id FROM tender_pack_files WHERE pack_id=$1",
      [item.pack_id],
    );
    assert.equal(files.rowCount, 1);
    const ready = await getsCollectionDetail(db, account, item.id);
    assert.equal(ready.packReady, true);
    assert.equal(ready.pack?.files[0].sourceId, files.rows[0].source_id);
  }
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM reports WHERE account_id=$1",
        [account],
      )
    ).rows[0].n,
    0,
  );
  await worker.close();
});

test("manual live notice check queues changed details but not unchanged details", async () => {
  const rfxId = "34995793";
  const url = `https://www.gets.govt.nz/DCC/ExternalTenderDetails.htm?id=${rfxId}`;
  const detail = `<html><body><h1>Fixture bridge maintenance</h1><table>
    <tr><th>Purchaser</th><td>Fixture buyer</td></tr><tr><th>Department</th><td>Test procurement</td></tr>
    <tr><th>Reference</th><td>FIX-${rfxId}</td></tr><tr><th>Tender Type</th><td>RFT</td></tr>
    <tr><th>Status</th><td>Current</td></tr><tr><th>Open Date</th><td>12 June 2026 at 12:00 PM NZST</td></tr>
    <tr><th>Close Date</th><td>1 October 2026 at 5:00 PM NZDT</td></tr>
    <tr><th>Categories</th><td>Construction</td></tr><tr><th>Regions</th><td>Otago</td></tr>
    <tr><th>Overview</th><td>Fictional bridge maintenance work is requested for this test notice.</td></tr>
    </table></body></html>`;
  const intake = new GetsIntakeWorker(config, db, {
    async listing() {
      throw new Error("Single notice must not list");
    },
    async detail() {
      return detail;
    },
  });
  const first = await startGetsRun(db, account, actor, {
    scope: "single",
    url,
  });
  await intake.tick();
  const queued = await db.query(
    "SELECT id FROM gets_pack_jobs WHERE intake_run_id=$1",
    [first.id],
  );
  assert.equal(queued.rowCount, 1);
  for (let i = 0; i < 5; i++) {
    const status = await db.query(
      "SELECT state FROM gets_intake_runs WHERE id=$1",
      [first.id],
    );
    if (!["queued", "running"].includes(status.rows[0].state)) break;
    await intake.tick();
  }
  const second = await startGetsRun(db, account, actor, {
    scope: "single",
    url,
  });
  assert.notEqual(second.id, first.id);
  await intake.tick();
  const runResult = await db.query(
    "SELECT state,new_count,changed_count,unchanged_count,details_read FROM gets_intake_runs WHERE id=$1",
    [second.id],
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM gets_pack_jobs WHERE intake_run_id=$1",
        [second.id],
      )
    ).rows[0].n,
    0,
    JSON.stringify(runResult.rows[0]),
  );
  for (let i = 0; i < 5; i++) {
    const status = await db.query(
      "SELECT state FROM gets_intake_runs WHERE id=$1",
      [second.id],
    );
    if (!["queued", "running"].includes(status.rows[0].state)) break;
    await intake.tick();
  }
  await changeCollectionJob(db, account, queued.rows[0].id, "cancel");
});

test("failed file resumes after worker restart without duplicating admitted sources; withdrawn file leaves current pack", async () => {
  const prior = await seed("34995790");
  const fake = new FakeSession();
  fake.inventories.set(
    "34995790",
    manifest("34995790", [makeFile("1"), makeFile("2")]),
  );
  fake.corruptOnce = true;
  const firstWorker = new GetsPackWorker(config, db, () => fake);
  await firstWorker.tick();
  let job = (
    await db.query("SELECT state,pack_id FROM gets_pack_jobs WHERE id=$1", [
      prior.job,
    ])
  ).rows[0];
  assert.equal(job.state, "failed");
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM tender_pack_files WHERE pack_id=$1",
        [job.pack_id],
      )
    ).rows[0].n,
    1,
  );
  const firstSource = (
    await db.query(
      "SELECT source_id FROM tender_pack_files WHERE pack_id=$1 AND file_id='1'",
      [job.pack_id],
    )
  ).rows[0].source_id;
  await changeCollectionJob(db, account, prior.job, "continue");
  const restarted = new GetsPackWorker(config, db, () => fake);
  await restarted.tick();
  job = (
    await db.query("SELECT state,pack_id FROM gets_pack_jobs WHERE id=$1", [
      prior.job,
    ])
  ).rows[0];
  assert.equal(job.state, "admitted");
  assert.equal(
    (
      await db.query(
        "SELECT source_id FROM tender_pack_files WHERE pack_id=$1 AND file_id='1'",
        [job.pack_id],
      )
    ).rows[0].source_id,
    firstSource,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM tender_pack_files WHERE pack_id=$1",
        [job.pack_id],
      )
    ).rows[0].n,
    2,
  );
  const nextRevision = randomUUID(),
    nextJob = randomUUID();
  const source = (
    await db.query("SELECT source_id FROM gets_notice_revisions WHERE id=$1", [
      prior.revision,
    ])
  ).rows[0].source_id;
  await db.query(
    `INSERT INTO gets_notice_revisions(id,account_id,notice_id,semantic_hash,raw_hash,raw_ref,source_id,fields,parser_version)
    VALUES($1,$2,$3,$4,$5,$6,$7,'{}','fixture-v1')`,
    [
      nextRevision,
      account,
      prior.notice,
      hash(nextRevision),
      hash(`raw-${nextRevision}`),
      `${account}/${randomUUID()}`,
      source,
    ],
  );
  await db.query("UPDATE gets_notices SET current_revision_id=$2 WHERE id=$1", [
    prior.notice,
    nextRevision,
  ]);
  await db.query(
    `INSERT INTO gets_pack_jobs(id,account_id,intake_run_id,notice_revision_id,opportunity_id,actor_id,rfx_id)
    VALUES($1,$2,$3,$4,$5,$6,'34995790')`,
    [nextJob, account, run, nextRevision, prior.opportunity, actor],
  );
  fake.inventories.set(
    "34995790",
    manifest("34995790", [makeFile("1"), makeFile("3")]),
  );
  await restarted.tick();
  const current = (
    await db.query("SELECT state,pack_id FROM gets_pack_jobs WHERE id=$1", [
      nextJob,
    ])
  ).rows[0];
  assert.equal(current.state, "admitted");
  const currentFiles = await db.query(
    "SELECT file_id,source_id FROM tender_pack_files WHERE pack_id=$1 ORDER BY file_id",
    [current.pack_id],
  );
  assert.deepEqual(
    currentFiles.rows.map((r) => r.file_id),
    ["1", "3"],
  );
  assert.equal(currentFiles.rows[0].source_id, firstSource);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM tender_pack_files WHERE pack_id=$1",
        [job.pack_id],
      )
    ).rows[0].n,
    2,
  );
  await restarted.close();
});

test("interactive challenge blocks the batch, and the fourth re-login is refused", async () => {
  const a = await seed("34995791"),
    b = await seed("34995792");
  const fake = new FakeSession();
  fake.blocked = true;
  const worker = new GetsPackWorker(config, db, () => fake);
  await worker.tick();
  await worker.tick();
  assert.equal(
    fake.inventoryCalls,
    1,
    "unchanged interactive challenge must not retry credentials for each tender",
  );
  const states = await db.query(
    "SELECT state FROM gets_pack_jobs WHERE id=ANY($1::uuid[])",
    [[a.job, b.job]],
  );
  assert.deepEqual(
    states.rows.map((r) => r.state),
    ["blocked", "blocked"],
  );
  const budget = new RealMeLoginBudget();
  budget.reserve(); // initial sign-in
  for (let i = 0; i < 3; i++) budget.reserve(); // session expired, then successfully signed in again
  assert.equal(budget.loginRetries, 3);
  assert.throws(() => budget.reserve(), /three re-login attempts/);
  assert.match(
    realMeFailure("<h1>Enter verification code</h1>").message,
    /interactive challenge/,
  );
  await worker.close();
});

test.after(async () => {
  await db.end();
});
