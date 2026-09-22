import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApi } from "../../server/api.ts";
import { loadConfig } from "../../server/config.ts";
import { database } from "../../server/db.ts";
import {
  GetsIntakeWorker,
  getsStatus,
  startGetsRun,
  cancelGetsRun,
  retryGetsRun,
} from "../../server/gets/intake.ts";
import {
  canonicalGetsDetail,
  parseGetsDetail,
  parseGetsListing,
} from "../../server/gets/parser.ts";
import type { GetsTransport } from "../../server/gets/transport.ts";
import { hash } from "../../server/storage.ts";

const config = loadConfig(),
  db = database(config);
const account = randomUUID(),
  other = randomUUID(),
  owner = randomUUID(),
  reviewer = randomUUID();
const ownerToken = randomBytes(32).toString("hex"),
  reviewerToken = randomBytes(32).toString("hex");
await db.query(
  "INSERT INTO accounts(id,name) VALUES($1,'GETS fixture account'),($2,'Other account')",
  [account, other],
);
await db.query(
  "INSERT INTO memberships(user_id,account_id,role) VALUES($1,$3,'owner'),($2,$3,'reviewer')",
  [owner, reviewer, account],
);
await db.query(
  "INSERT INTO sessions(token_hash,user_id,account_id,expires_at) VALUES($1,$3,$5,now()+interval '1 hour'),($2,$4,$5,now()+interval '1 hour')",
  [hash(ownerToken), hash(reviewerToken), owner, reviewer, account],
);
const app = await createApi(config, db);
const headers = (token: string) => ({
  host: "127.0.0.1:4318",
  cookie: `groundwork_session=${token}`,
  "x-groundwork-request": "local",
});
const detailUrl = (id: string) =>
  `https://www.gets.govt.nz/TEST/ExternalTenderDetails.htm?id=${id}`;
const listing = (body: string, next?: string) =>
  `<html><body><table>${body}</table>${next ? `<a rel="next" href="${next}">Next</a>` : ""}</body></html>`;
const row = (id: string, title: string) =>
  `<tr><td><a href="${detailUrl(id)}">${id}</a></td><td><a href="${detailUrl(id)}">${title}</a></td></tr>`;
const detail = (
  id: string,
  close: string,
  footer = "",
) => `<html><body><h1>Fictional testing services ${id}</h1><table>
<tr><th>Purchaser</th><td>Fixture buyer</td></tr><tr><th>Department</th><td>Test procurement</td></tr>
<tr><th>Reference</th><td>FIX-${id}</td></tr><tr><th>Tender Type</th><td>RFI</td></tr>
<tr><th>Status</th><td>Current</td></tr><tr><th>Open Date</th><td>12 June 2026 at 12:00 PM NZST</td></tr>
<tr><th>Close Date</th><td>${close}</td></tr><tr><th>Categories</th><td>Services, Healthcare</td></tr>
<tr><th>Regions</th><td>Auckland, Wellington</td></tr>
<tr><th>Overview</th><td>This is a synthetic notice. It does not invite a procurement response.</td></tr>
</table><footer>${footer}</footer></body></html>`;
function fixtureTransport(
  pages: Record<string, string>,
  details: Record<string, string | Error>,
): GetsTransport {
  return {
    async listing(url) {
      if (!pages[url]) throw new Error("Listing missing");
      return pages[url];
    },
    async detail(url) {
      const id = canonicalGetsDetail(url).rfxId;
      const result = details[id];
      if (result instanceof Error) throw result;
      if (!result) throw new Error("Detail missing");
      return result;
    },
  };
}
async function queueFixture(cursor: string, scope = "current") {
  const id = randomUUID();
  await db.query(
    "INSERT INTO gets_intake_runs(id,account_id,actor_id,scope,state,mode,cursor) VALUES($1,$2,$3,$4,'queued','fixture',$5)",
    [id, account, owner, scope, cursor],
  );
  return id;
}
async function drain(worker: GetsIntakeWorker, id: string) {
  for (let i = 0; i < 12; i++) {
    const run = (
      await db.query("SELECT state FROM gets_intake_runs WHERE id=$1", [id])
    ).rows[0];
    if (!["queued", "running"].includes(run.state)) return run.state as string;
    await worker.tick();
  }
  throw new Error("Fixture worker did not finish");
}

test("GETS public collection is disabled without a recorded access arrangement; reviewer cannot initiate", async () => {
  const status = await app.inject({
    url: "/api/gets/status",
    headers: headers(ownerToken),
  });
  assert.equal(status.statusCode, 200);
  assert.equal(status.json().access.enabled, false);
  const denied = await app.inject({
    method: "POST",
    url: "/api/gets/runs",
    headers: headers(ownerToken),
    payload: { scope: "current" },
  });
  assert.equal(denied.statusCode, 409);
  const reviewerDenied = await app.inject({
    method: "POST",
    url: "/api/gets/runs",
    headers: headers(reviewerToken),
    payload: { scope: "current" },
  });
  assert.equal(reviewerDenied.statusCode, 403);
  assert.equal((await getsStatus(db, config, other)).runs.length, 0);
});
test("owner-authorised live test is account scoped, time limited and does not claim provider approval", async () => {
  const testConfig = {
    ...config,
    getsOperatorTest: {
      accountId: account,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    },
  };
  const status = await getsStatus(db, testConfig, account);
  assert.equal(status.access.enabled, true);
  assert.equal(status.access.mode, "operator_test");
  assert.match(status.access.reason, /permission is pending/);
  assert.equal((await getsStatus(db, testConfig, other)).access.enabled, false);
  const accepted = await startGetsRun(db, testConfig, account, owner, {
    scope: "single",
    url: detailUrl("90000006"),
  });
  assert.equal(accepted.reused, false);
  await cancelGetsRun(db, account, accepted.id);
  assert.equal(
    (
      await getsStatus(
        db,
        {
          ...testConfig,
          getsOperatorTest: {
            accountId: account,
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          },
        },
        account,
      )
    ).access.enabled,
    false,
  );
});
test("parser keeps RFx identity, NZ timezone and duplicate sightings without treating RFI as an RFP", () => {
  const html = listing(
    row("90000001", "Fixture one") + row("90000001", "Fixture one"),
  );
  const parsed = parseGetsListing(
    html,
    "https://www.gets.govt.nz/ExternalIndex.htm",
  );
  assert.equal(parsed.sightings.length, 2);
  const notice = parseGetsDetail(
    detail("90000001", "26 June 2026 at 5:00 PM NZST"),
    detailUrl("90000001"),
  );
  assert.equal(notice.noticeType, "RFI");
  assert.equal(notice.closesAt, "2026-06-26T17:00:00+12:00");
  const timeFirst = parseGetsDetail(
    detail("90000001", "5:00 PM 28 Sep 2026 (Pacific/Auckland UTC+13:00)"),
    detailUrl("90000001"),
  );
  assert.equal(timeFirst.closesAt, "2026-09-28T17:00:00+13:00");
  assert.deepEqual(notice.regions, ["Auckland", "Wellington"]);
  assert.throws(() =>
    canonicalGetsDetail(
      "http://127.0.0.1/TEST/ExternalTenderDetails.htm?id=90000001",
    ),
  );
});
test("GETS-shaped listing pagination and detail fields are parsed without losing buyer or overview", () => {
  const url = "https://www.gets.govt.nz/ExternalIndex.htm";
  const page = `<table><tr class="tender"><td><a href="${detailUrl("90000007")}">90000007</a></td><td>FIX-7</td><td><a href="${detailUrl("90000007")}">Synthetic title</a></td><td><a href="${detailUrl("90000007")}">RFI</a></td></tr></table><span class="paging">1 - 25 of 26 <a href="ExternalIndex.htm?page=2&orderBy=date"><img id="next-active"></a></span>`;
  const parsed = parseGetsListing(page, url);
  assert.equal(parsed.sightings[0].title, "Synthetic title");
  assert.equal(parsed.advertisedTotal, 26);
  assert.equal(parsed.nextUrl, `${url}?page=2&orderBy=date`);
  const html = `<div id="theDrill"><a>GETS</a><a>Fixture agency</a></div><h1>Synthetic title</h1><div class="tender-details"><table><tr><td>Tender Name :</td><td>Synthetic title</td></tr><tr><td>Department/Business Unit :</td><td>Testing</td></tr><tr><td>Open Date :</td><td>Friday, 12 June 2026 12:00 PM (Pacific/Auckland UTC+12:00)</td></tr><tr><td>Tender Type :</td><td>Request for Information (RFI)</td></tr><tr><td>Categories :</td><td><ul><li>Category A</li><li>Category B</li></ul></td></tr></table><div class="detail-divider"><span class="legend">Overview</span></div><p>A synthetic notice for parser testing.</p></div>`;
  const notice = parseGetsDetail(html, detailUrl("90000007"));
  assert.equal(notice.buyer, "Fixture agency");
  assert.equal(notice.department, "Testing");
  assert.equal(notice.overview, "A synthetic notice for parser testing.");
  assert.deepEqual(notice.categories, ["Category A", "Category B"]);
});
test("fixture replay reconciles pages and details, creates one opportunity per RFx and immutable revisions", async () => {
  const base = "https://www.gets.govt.nz/ExternalIndex.htm";
  const second = `${base}?page=2`;
  const pages = {
    [base]: listing(row("90000001", "Fixture one"), second),
    [second]: listing(
      row("90000001", "Fixture one") + row("90000002", "Fixture two"),
    ),
  };
  const details = {
    "90000001": detail("90000001", "26 June 2026 at 5:00 PM NZST"),
    "90000002": detail("90000002", "1 October 2026 at 5:00 PM NZDT"),
  };
  const worker = new GetsIntakeWorker(
    config,
    db,
    fixtureTransport(pages, details),
  );
  const first = await queueFixture(base);
  assert.equal(
    await drain(worker, first),
    "complete",
    JSON.stringify(
      (
        await db.query("SELECT error FROM gets_intake_runs WHERE id=$1", [
          first,
        ])
      ).rows[0],
    ),
  );
  const run = (
    await db.query("SELECT * FROM gets_intake_runs WHERE id=$1", [first])
  ).rows[0];
  assert.equal(run.pages_read, 2);
  assert.equal(run.pages_attempted, 2);
  assert.equal(run.rows_observed, 3);
  assert.equal(run.unique_discovered, 2);
  assert.equal(run.duplicate_sightings, 1);
  assert.equal(run.new_count, 2);
  assert.equal(run.details_read, 2);
  const sources = await db.query(
    "SELECT s.provenance,s.state,n.rfx_id FROM gets_notices n JOIN gets_notice_revisions r ON r.id=n.current_revision_id JOIN sources s ON s.id=r.source_id WHERE n.account_id=$1 ORDER BY n.rfx_id",
    [account],
  );
  assert.deepEqual(
    sources.rows.map((s) => [s.rfx_id, s.provenance, s.state]),
    [
      ["90000001", "synthetic", "read"],
      ["90000002", "synthetic", "read"],
    ],
  );
  const imported = (
    await db.query(
      "SELECT n.opportunity_id,r.source_id FROM gets_notices n JOIN gets_notice_revisions r ON r.id=n.current_revision_id WHERE n.account_id=$1 AND n.rfx_id='90000001'",
      [account],
    )
  ).rows[0];
  const originalView = await app.inject({
    url: `/api/sources/${imported.source_id}`,
    headers: headers(ownerToken),
  });
  assert.equal(originalView.statusCode, 200);
  assert.match(
    JSON.stringify(originalView.json().units),
    /does not invite a procurement response/,
  );
  const generation = await app.inject({
    method: "POST",
    url: `/api/opportunities/${imported.opportunity_id}/runs`,
    headers: headers(ownerToken),
    payload: {},
  });
  assert.equal(generation.statusCode, 200, generation.body);
  const queued = (
    await db.query(
      "SELECT manifest->'sourceIds' AS sources FROM runs WHERE id=$1",
      [generation.json().id],
    )
  ).rows[0];
  assert.deepEqual(queued.sources, [imported.source_id]);
  await app.inject({
    method: "POST",
    url: `/api/runs/${generation.json().id}/cancel`,
    headers: headers(ownerToken),
    payload: {},
  });
  const original = (
    await db.query(
      "SELECT current_revision_id FROM gets_notices WHERE account_id=$1 AND rfx_id='90000001'",
      [account],
    )
  ).rows[0].current_revision_id;

  const repeat = await queueFixture(base);
  assert.equal(await drain(worker, repeat), "complete");
  const repeated = (
    await db.query("SELECT * FROM gets_intake_runs WHERE id=$1", [repeat])
  ).rows[0];
  assert.equal(repeated.unchanged_count, 2);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM opportunities WHERE account_id=$1 AND notice_id IN ('90000001','90000002')",
        [account],
      )
    ).rows[0].n,
    2,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM gets_notice_revisions WHERE account_id=$1",
        [account],
      )
    ).rows[0].n,
    2,
  );

  const changedTransport = fixtureTransport(pages, {
    ...details,
    "90000001": detail(
      "90000001",
      "27 June 2026 at 5:00 PM NZST",
      "unrelated footer",
    ),
  });
  const changed = await queueFixture(base);
  assert.equal(
    await drain(new GetsIntakeWorker(config, db, changedTransport), changed),
    "complete",
  );
  assert.equal(
    (
      await db.query("SELECT changed_count FROM gets_intake_runs WHERE id=$1", [
        changed,
      ])
    ).rows[0].changed_count,
    1,
  );
  const notice = (
    await db.query(
      "SELECT current_revision_id FROM gets_notices WHERE account_id=$1 AND rfx_id='90000001'",
      [account],
    )
  ).rows[0];
  assert.notEqual(notice.current_revision_id, original);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM gets_notice_revisions WHERE notice_id=(SELECT id FROM gets_notices WHERE account_id=$1 AND rfx_id='90000001')",
        [account],
      )
    ).rows[0].n,
    2,
  );
  const oldSource = (
    await db.query("SELECT source_id FROM gets_notice_revisions WHERE id=$1", [
      original,
    ])
  ).rows[0].source_id;
  assert.equal(
    (
      await db.query("SELECT status FROM source_lifecycle WHERE source_id=$1", [
        oldSource,
      ])
    ).rows[0].status,
    "superseded",
  );
  const visible = await getsStatus(db, config, account);
  assert.equal(visible.notices.length, 2);
  assert.equal((await getsStatus(db, config, other)).notices.length, 0);
});
test("unread detail is visible as partial and never counted as complete coverage", async () => {
  const url =
    "https://www.gets.govt.nz/FutureProcurementOpportunitiesIndex.htm";
  const runId = await queueFixture(url, "future");
  const worker = new GetsIntakeWorker(
    config,
    db,
    fixtureTransport(
      { [url]: listing(row("90000003", "Missing detail")) },
      { "90000003": new Error("GETS returned HTTP 429; Retry-After 120") },
    ),
  );
  assert.equal(await drain(worker, runId), "partial");
  const run = (
    await db.query(
      "SELECT state,details_read,details_failed,unique_discovered FROM gets_intake_runs WHERE id=$1",
      [runId],
    )
  ).rows[0];
  assert.deepEqual(
    [run.state, run.details_read, run.details_failed, run.unique_discovered],
    ["partial", 0, 1, 1],
  );
  assert.equal(
    (
      await db.query(
        "SELECT state,error,attempts FROM gets_intake_items WHERE run_id=$1",
        [runId],
      )
    ).rows[0].state,
    "failed",
  );
  assert.equal(
    (
      await db.query("SELECT attempts FROM gets_intake_items WHERE run_id=$1", [
        runId,
      ])
    ).rows[0].attempts,
    1,
  );
});
test("a transient listing failure retries the same page and reconciles observed coverage", async () => {
  const url = "https://www.gets.govt.nz/ExternalIndex.htm";
  const runId = await queueFixture(url);
  let reads = 0;
  const worker = new GetsIntakeWorker(config, db, {
    async listing() {
      reads++;
      if (reads === 1) throw new Error("Temporary GETS transport failure");
      return listing(row("90000004", "Retry fixture"));
    },
    async detail() {
      return detail(
        "90000004",
        "5:00 PM 28 Sep 2026 (Pacific/Auckland UTC+13:00)",
      );
    },
  });
  assert.equal(await drain(worker, runId), "complete");
  const run = (
    await db.query(
      "SELECT pages_attempted,pages_read,attempts,details_read FROM gets_intake_runs WHERE id=$1",
      [runId],
    )
  ).rows[0];
  assert.deepEqual(
    [run.pages_attempted, run.pages_read, run.attempts, run.details_read],
    [1, 1, 3, 1],
  );
});
test("an explicit retry resumes a partial fixture run with a fresh bounded attempt", async () => {
  const url = "https://www.gets.govt.nz/ExternalIndex.htm";
  const runId = await queueFixture(url);
  let canRead = false;
  const worker = new GetsIntakeWorker(config, db, {
    async listing() {
      return listing(row("90000005", "Recovery fixture"));
    },
    async detail() {
      if (!canRead) throw new Error("Temporary detail failure");
      return detail(
        "90000005",
        "5:00 PM 28 Sep 2026 (Pacific/Auckland UTC+13:00)",
      );
    },
  });
  assert.equal(await drain(worker, runId), "partial");
  const dir = await mkdtemp(join(tmpdir(), "gets-retry-test-"));
  const path = join(dir, "approval.json");
  try {
    await writeFile(
      path,
      JSON.stringify({
        agreementReference: "TEST ONLY 2026-09-23",
        authorisedAccountIds: [account],
        allowedScopes: ["current"],
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        route: "public-gets-html",
      }),
      { mode: 0o600 },
    );
    canRead = true;
    await retryGetsRun(
      db,
      { ...config, getsApprovalFile: path },
      account,
      runId,
    );
    assert.equal(await drain(worker, runId), "complete");
    const run = (
      await db.query(
        "SELECT pages_attempted,pages_read,details_read,details_failed FROM gets_intake_runs WHERE id=$1",
        [runId],
      )
    ).rows[0];
    assert.deepEqual(
      [
        run.pages_attempted,
        run.pages_read,
        run.details_read,
        run.details_failed,
      ],
      [1, 1, 1, 0],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("two owner clicks attach to one approved queued run without making a network call", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gets-approval-test-"));
  const path = join(dir, "approval.json");
  try {
    await writeFile(
      path,
      JSON.stringify({
        agreementReference: "TEST ONLY 2026-09-23",
        authorisedAccountIds: [account],
        allowedScopes: ["current"],
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        route: "public-gets-html",
      }),
      { mode: 0o600 },
    );
    const approved = { ...config, getsApprovalFile: path };
    const pair = await Promise.all([
      startGetsRun(db, approved, account, owner, { scope: "current" }),
      startGetsRun(db, approved, account, owner, { scope: "current" }),
    ]);
    assert.equal(pair[0].id, pair[1].id);
    assert.equal(pair.filter((entry) => entry.reused).length, 1);
    assert.equal(
      (
        await db.query("SELECT state FROM gets_intake_runs WHERE id=$1", [
          pair[0].id,
        ])
      ).rows[0].state,
      "queued",
    );
    await cancelGetsRun(db, account, pair[0].id);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("account removal cascades GETS receipts and notice revisions without touching other accounts", async () => {
  await db.query("DELETE FROM accounts WHERE id=$1", [account]);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM gets_intake_runs WHERE account_id=$1",
        [account],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM gets_notices WHERE account_id=$1",
        [account],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query("SELECT count(*)::int AS n FROM accounts WHERE id=$1", [
        other,
      ])
    ).rows[0].n,
    1,
  );
});
test.after(async () => {
  await app.close();
  await db.end();
});
