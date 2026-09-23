import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { createApi } from "../../server/api.ts";
import { loadConfig } from "../../server/config.ts";
import { database } from "../../server/db.ts";
import { hash, ObjectStore } from "../../server/storage.ts";
import { reserveCall, settleCall } from "../../server/ledger.ts";
import { Worker } from "../../server/worker.ts";
const config = loadConfig(),
  db = database(config);
const accountId = randomUUID(),
  otherId = randomUUID(),
  userId = randomUUID(),
  token = randomBytes(32).toString("hex");
await db.query(
  "INSERT INTO accounts(id,name) VALUES($1,'Integration test'),($2,'Other test')",
  [accountId, otherId],
);
await db.query(
  "INSERT INTO memberships(user_id,account_id,role) VALUES($1,$2,'owner')",
  [userId, accountId],
);
await db.query(
  "INSERT INTO sessions(token_hash,user_id,account_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
  [hash(token), userId, accountId],
);
const app = await createApi(config, db);
const headers = {
  cookie: `groundwork_session=${token}`,
  "x-groundwork-request": "local",
  host: "127.0.0.1:4318",
};
const post = (url: string, payload: Record<string, unknown>) =>
  app.inject({ method: "POST", url, payload, headers });
let opportunityId: string, sourceId: string;
test("A1 save, extract, reload snapshots through authenticated API", async () => {
  const create = await post("/api/opportunities", {
    title: "Synthetic integration notice",
    buyer: "Test buyer",
    noticeId: "TEST-1",
    cutoff: "2026-09-22",
    provenance: "synthetic",
  });
  assert.equal(create.statusCode, 200, create.body);
  opportunityId = create.json().id;
  const source = await post(`/api/opportunities/${opportunityId}/sources`, {
    name: "Notice.txt",
    mediaType: "text/plain",
    text: "Test buyer invites proposals.\n\nSuppliers must submit Form X.",
    purpose: "notice",
    provenance: "synthetic",
    rightsConfirmed: true,
  });
  assert.equal(source.statusCode, 200, source.body);
  sourceId = source.json().id;
  const before = await app.inject({ url: `/api/sources/${sourceId}`, headers });
  assert.equal(before.json().units.length, 2);
  const fresh = await createApi(config, db);
  const after = await fresh.inject({
    url: `/api/sources/${sourceId}`,
    headers,
  });
  assert.deepEqual(after.json(), before.json());
  await fresh.close();
});
test("A14 unauthenticated and cross-account source/download/report access denied", async () => {
  const unauth = await app.inject({
    url: `/api/sources/${sourceId}`,
    headers: { host: "127.0.0.1" },
  });
  assert.equal(unauth.statusCode, 401);
  const otherToken = randomBytes(32).toString("hex"),
    otherUser = randomUUID();
  await db.query(
    "INSERT INTO memberships(user_id,account_id,role) VALUES($1,$2,'owner')",
    [otherUser, otherId],
  );
  await db.query(
    "INSERT INTO sessions(token_hash,user_id,account_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
    [hash(otherToken), otherUser, otherId],
  );
  for (const path of [
    `/api/sources/${sourceId}`,
    `/api/sources/${sourceId}/download`,
    `/api/opportunities/${opportunityId}`,
    `/api/reports/${randomUUID()}`,
  ]) {
    const r = await app.inject({
      url: path,
      headers: { ...headers, cookie: `groundwork_session=${otherToken}` },
    });
    assert.equal(r.statusCode, 404, r.body);
  }
  const store = new ObjectStore(config.storageRoot);
  const ref = await store.put(accountId, "private");
  await assert.rejects(store.get(otherId, ref), /denied/);
  await assert.rejects(
    store.get(accountId, `${accountId}/../../etc/passwd`),
    /denied/,
  );
});
test("A2 unsupported source remains named; A4 search cannot report absence", async () => {
  const r = await post(`/api/opportunities/${opportunityId}/sources`, {
    name: "Pricing.xlsx",
    mediaType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    text: "unreadable spreadsheet fixture",
    purpose: "rfp",
    provenance: "synthetic",
    rightsConfirmed: true,
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().state, "unread");
  assert.match(r.json().coverage.failures[0], /spreadsheet.*reader/);
  const search = await post(`/api/opportunities/${opportunityId}/search`, {
    query: "missing phrase",
  });
  assert.equal(search.json().state, "not_searched");
});
test("A12 required unread source is rejected before a run or model call is queued", async () => {
  const before = await db.query(
    "SELECT count(*)::int AS n FROM runs WHERE opportunity_id=$1",
    [opportunityId],
  );
  const results = await Promise.all([
    post(`/api/opportunities/${opportunityId}/runs`, {}),
    post(`/api/opportunities/${opportunityId}/runs`, {}),
  ]);
  assert.equal(results[0].statusCode, 409);
  assert.equal(results[1].statusCode, 409);
  assert.match(results[0].json().error, /Pricing.xlsx.*xlsx-cells-v1.*reader/);
  const after = await db.query(
    "SELECT count(*)::int AS n FROM runs WHERE opportunity_id=$1",
    [opportunityId],
  );
  assert.equal(after.rows[0].n, before.rows[0].n);
});
test("A13 concurrent budget reservations and uncertain outcomes retain allowance", async () => {
  const budgetId = `test-${randomUUID()}`;
  await db.query("INSERT INTO budgets(id,allowance) VALUES($1,3)", [budgetId]);
  const calls = await Promise.allSettled(
    [1, 2].map((n) =>
      reserveCall(db, {
        accountId,
        runId: null,
        key: `test-${budgetId}-${n}`,
        provider: "fixture",
        maximum: 2,
        budgetId,
      }),
    ),
  );
  assert.equal(calls.filter((c) => c.status === "fulfilled").length, 1);
  const call = calls.find(
    (c) => c.status === "fulfilled",
  ) as PromiseFulfilledResult<string>;
  await settleCall(db, call.value, { status: "uncertain" });
  let balance = (
    await db.query("SELECT * FROM budgets WHERE id=$1", [budgetId])
  ).rows[0];
  assert.equal(Number(balance.reserved), 2);
  await assert.rejects(
    reserveCall(db, {
      accountId,
      runId: null,
      key: `again-${budgetId}`,
      provider: "fixture",
      maximum: 2,
      budgetId,
    }),
    /budget/,
  );
  await settleCall(db, call.value, { status: "succeeded", actual: 1 });
  balance = (await db.query("SELECT * FROM budgets WHERE id=$1", [budgetId]))
    .rows[0];
  assert.equal(Number(balance.spent), 1);
  assert.equal(Number(balance.reserved), 0);
  await db.query("DELETE FROM provider_calls WHERE budget_id=$1", [budgetId]);
  await db.query("DELETE FROM budgets WHERE id=$1", [budgetId]);
});
test("A15 remote origins and missing request protection rejected", async () => {
  const bad = await app.inject({
    method: "POST",
    url: "/api/opportunities",
    headers: { ...headers, origin: "https://attacker.example" },
    payload: {},
  });
  assert.equal(bad.statusCode, 403);
  const noProtection = await app.inject({
    method: "POST",
    url: "/api/opportunities",
    headers: { host: "127.0.0.1", cookie: headers.cookie },
    payload: {},
  });
  assert.equal(noProtection.statusCode, 403);
});
test.after(async () => {
  await app.close();
  await db.query("DELETE FROM accounts WHERE id=ANY($1::uuid[])", [
    [accountId, otherId],
  ]);
  await db.end();
});

test("A18 SQL calendar cutoff survives API and manifest serialization without timezone drift", async () => {
  const r = await app.inject({
    url: `/api/opportunities/${opportunityId}`,
    headers,
  });
  assert.equal(r.json().opportunity.cutoff, "2026-09-22");
});
test("A12 completed stage is reused and a stale worker loses write authority", async () => {
  const runId = randomUUID(),
    worker = new Worker(config, db);
  await db.query(
    "INSERT INTO runs(id,account_id,opportunity_id,input_hash,manifest,state) VALUES($1,$2,$3,$4,'{}','running')",
    [runId, accountId, opportunityId, randomUUID()],
  );
  await db.query(
    "INSERT INTO dispatch(run_id,lease_owner,lease_until) VALUES($1,$2,now()+interval '5 minutes')",
    [runId, worker.owner],
  );
  const run = { id: runId, account_id: accountId };
  let executions = 0;
  const output = await worker.stage(
    run,
    "test-cache",
    { immutable: "input" },
    async () => ({ count: ++executions }),
  );
  assert.deepEqual(output, { count: 1 });
  const cached = await worker.stage(
    run,
    "test-cache",
    { immutable: "input" },
    async () => ({ count: ++executions }),
  );
  assert.deepEqual(cached, { count: 1 });
  assert.equal(executions, 1);
  await db.query("UPDATE dispatch SET lease_owner=$2 WHERE run_id=$1", [
    runId,
    randomUUID(),
  ]);
  await assert.rejects(
    worker.stage(run, "test-cache", { immutable: "input" }, async () => ({
      count: ++executions,
    })),
    /lease lost/,
  );
  assert.equal(executions, 1);
});
test("A12 completed provider receipt survives a crash before stage commit without another model call", async () => {
  const { callClaude } = await import("../../server/claude.ts");
  const { z } = await import("zod");
  const store = new ObjectStore(config.storageRoot),
    key = `receipt-recovery-${randomUUID()}`;
  const r = await db.query("SELECT id FROM runs WHERE account_id=$1 LIMIT 1", [
    accountId,
  ]);
  const runId = r.rows[0].id;
  const callId = await reserveCall(db, {
    accountId,
    runId,
    key,
    provider: "claude-subscription",
    maximum: 0,
  });
  const ref = await store.put(
    accountId,
    JSON.stringify({
      type: "result",
      subtype: "success",
      structured_output: { ok: true },
      total_cost_usd: 0,
      modelUsage: { fixture: {} },
    }) + "\n",
  );
  await db.query("UPDATE provider_calls SET receipt_ref=$2 WHERE id=$1", [
    callId,
    ref,
  ]);
  const result = await callClaude(
    { ...config, claudeSubscriptionApproved: true },
    db,
    store,
    accountId,
    runId,
    key,
    "Must not be sent; recover the existing receipt",
    z.object({ ok: z.literal(true) }),
  );
  assert.deepEqual(result, { ok: true });
  const settled = await db.query(
    "SELECT status,usage FROM provider_calls WHERE id=$1",
    [callId],
  );
  assert.equal(settled.rows[0].status, "succeeded");
  assert.equal(settled.rows[0].usage.recovered, true);
});

test("A14/A16 saved report is account-isolated and cannot be overwritten by a failed reassessment", async () => {
  const intelligenceId = randomUUID(),
    reportId = randomUUID();
  const r = await db.query("SELECT id FROM runs WHERE account_id=$1 LIMIT 1", [
    accountId,
  ]);
  const runId = r.rows[0].id;
  await db.query(
    "INSERT INTO intelligence(id,account_id,opportunity_id,run_id,cutoff,payload) VALUES($1,$2,$3,$4,$5,$6)",
    [
      intelligenceId,
      accountId,
      opportunityId,
      runId,
      "2026-09-22",
      { fixture: true },
    ],
  );
  await db.query(
    "INSERT INTO reports(id,account_id,opportunity_id,run_id,intelligence_id,kind,payload) VALUES($1,$2,$3,$4,$5,'pursuit',$6)",
    [
      reportId,
      accountId,
      opportunityId,
      runId,
      intelligenceId,
      { fixture: true, content: "Original immutable report" },
    ],
  );
  await assert.rejects(
    db.query("UPDATE reports SET payload=$2 WHERE id=$1", [
      reportId,
      { content: "overwrite" },
    ]),
    /immutable/,
  );
  const otherSession = (
    await db.query(
      "SELECT token_hash FROM sessions WHERE account_id=$1 LIMIT 1",
      [otherId],
    )
  ).rows[0];
  assert.ok(otherSession);
  const user = randomUUID(),
    secret = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO memberships(user_id,account_id,role) VALUES($1,$2,'owner')",
    [user, otherId],
  );
  await db.query(
    "INSERT INTO sessions(token_hash,user_id,account_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
    [hash(secret), user, otherId],
  );
  const foreign = await app.inject({
    url: `/api/reports/${reportId}`,
    headers: { ...headers, cookie: `groundwork_session=${secret}` },
  });
  assert.equal(foreign.statusCode, 404);
  await db.query(
    "UPDATE runs SET state='failed',error='fixture reassessment failure' WHERE id=$1",
    [runId],
  );
  const current = await app.inject({
    url: `/api/reports/${reportId}`,
    headers,
  });
  assert.equal(current.json().payload.content, "Original immutable report");
});

test("A30 sourced observed outcome is stored separately from the verdict and customer decision", async () => {
  const report = (
    await db.query(
      "SELECT id,payload FROM reports WHERE account_id=$1 LIMIT 1",
      [accountId],
    )
  ).rows[0];
  const unit = (
    await db.query("SELECT id FROM units WHERE source_id=$1 LIMIT 1", [
      sourceId,
    ])
  ).rows[0];
  const before = report.payload;
  const result = await post(`/api/reports/${report.id}/outcomes`, {
    event: "Synthetic procurement outcome",
    outcome: "Fixture observation for persistence only",
    observedAt: "2026-09-22",
    unitId: unit.id,
  });
  assert.equal(result.statusCode, 200, result.body);
  const read = await app.inject({ url: `/api/reports/${report.id}`, headers });
  assert.deepEqual(read.json().payload, before);
  assert.equal(read.json().outcomes[0].unit_id, unit.id);
  const invalid = await post(`/api/reports/${report.id}/outcomes`, {
    event: "Synthetic",
    outcome: "Invalid evidence",
    observedAt: "2026-09-22",
    unitId: randomUUID(),
  });
  assert.equal(invalid.statusCode, 400);
});

test("Terminal failed provider call is not offered a dead-end resume or silently repaid", async () => {
  const run = (
    await db.query("SELECT id FROM runs WHERE account_id=$1 LIMIT 1", [
      accountId,
    ])
  ).rows[0];
  await db.query("UPDATE runs SET state='failed' WHERE id=$1", [run.id]);
  const callId = await reserveCall(db, {
    accountId,
    runId: run.id,
    key: `failed-fixture-${randomUUID()}`,
    provider: "fixture",
    maximum: 0,
  });
  await settleCall(db, callId, { status: "failed" });
  const result = await post(`/api/runs/${run.id}/resume`, {});
  assert.equal(result.statusCode, 400);
  assert.match(result.json().error, /terminal receipt|unresolved/);
});

test("Explicitly narrower manifests preserve excluded failures and require a reason", async () => {
  const excluded = (
    await db.query(
      "SELECT id FROM sources WHERE opportunity_id=$1 AND state='unread'",
      [opportunityId],
    )
  ).rows.map((s) => s.id);
  const invalid = await post(`/api/opportunities/${opportunityId}/runs`, {
    excludedSourceIds: excluded,
  });
  assert.equal(invalid.statusCode, 400);
  assert.match(invalid.json().error, /scope/);
  const accepted = await post(`/api/opportunities/${opportunityId}/runs`, {
    excludedSourceIds: excluded,
    scopeNote:
      "Only assess the public notice; pricing analysis explicitly excluded.",
  });
  assert.equal(accepted.statusCode, 200, accepted.body);
  await post(`/api/runs/${accepted.json().id}/cancel`, {});
  const run = (
    await db.query("SELECT manifest FROM runs WHERE id=$1", [
      accepted.json().id,
    ])
  ).rows[0];
  assert.equal(run.manifest.excludedSources.length, excluded.length);
  assert.equal(
    run.manifest.sourceIds.length + excluded.length,
    run.manifest.allSourceIds.length,
  );
  assert.equal(
    (await db.query("SELECT state FROM sources WHERE id=$1", [excluded[0]]))
      .rows[0].state,
    "unread",
  );
});

test("Invalid completed provider output is classified as failed with usage retained, without replay", async () => {
  const { callClaude } = await import("../../server/claude.ts"),
    { z } = await import("zod");
  const run = (
    await db.query("SELECT id FROM runs WHERE account_id=$1 LIMIT 1", [
      accountId,
    ])
  ).rows[0];
  const key = `invalid-output-${randomUUID()}`,
    store = new ObjectStore(config.storageRoot);
  const callId = await reserveCall(db, {
    accountId,
    runId: run.id,
    key,
    provider: "claude-subscription",
    maximum: 0,
  });
  const receipt = await store.put(
    accountId,
    JSON.stringify({
      type: "result",
      subtype: "success",
      structured_output: { wrong: true },
      total_cost_usd: 0.01,
    }),
  );
  await db.query("UPDATE provider_calls SET receipt_ref=$2 WHERE id=$1", [
    callId,
    receipt,
  ]);
  await assert.rejects(
    callClaude(
      { ...config, claudeSubscriptionApproved: true },
      db,
      store,
      accountId,
      run.id,
      key,
      "Not sent",
      z.object({ required: z.string() }),
    ),
    /invalid structured output/,
  );
  const r = (
    await db.query("SELECT status,usage FROM provider_calls WHERE id=$1", [
      callId,
    ])
  ).rows[0];
  assert.equal(r.status, "failed");
  assert.equal(r.usage.apiEquivalentUsd, 0.01);
  assert.equal(r.usage.providerTerminal, "success");
});

test("Research reconciliation requires matching identity and preserves actual usage under the original ceiling", async () => {
  const { reconcileResearch } = await import("../../server/reconcile.ts");
  const budgetId = `reconcile-${randomUUID()}`,
    key = `reconcile-call-${randomUUID()}`;
  await db.query("INSERT INTO budgets(id,allowance) VALUES($1,2)", [budgetId]);
  const callId = await reserveCall(db, {
    accountId,
    runId: null,
    key,
    provider: "firecrawl-search",
    maximum: 2,
    budgetId,
  });
  await settleCall(db, callId, { status: "uncertain" });
  const evidence = {
    callId,
    logicalKey: key,
    provider: "firecrawl-search",
    actualCredits: 1,
    outcome: "failed",
    providerRecordReference: "fixture provider record only",
    checkedBy: "Fixture operator",
    reason:
      "Synthetic provider record confirms exactly one credit was consumed",
  };
  const store = new ObjectStore(config.storageRoot);
  await assert.rejects(
    reconcileResearch(db, store, { ...evidence, logicalKey: "wrong identity" }),
    /identity/,
  );
  await reconcileResearch(db, store, evidence);
  await assert.rejects(reconcileResearch(db, store, evidence), /Unresolved/);
  const b = (await db.query("SELECT * FROM budgets WHERE id=$1", [budgetId]))
    .rows[0];
  assert.equal(Number(b.reserved), 0);
  assert.equal(Number(b.spent), 1);
  await db.query("DELETE FROM provider_calls WHERE id=$1", [callId]);
  await db.query("DELETE FROM budgets WHERE id=$1", [budgetId]);
});

test("Source snapshots and extracted units cannot be edited under an existing evidence identifier", async () => {
  await assert.rejects(
    db.query("UPDATE sources SET name='changed' WHERE id=$1", [sourceId]),
    /immutable/,
  );
  await assert.rejects(
    db.query("UPDATE units SET text_content='changed' WHERE source_id=$1", [
      sourceId,
    ]),
    /immutable/,
  );
});

test("Historical replay cannot inherit future report knowledge", async () => {
  const parent = (
    await db.query("SELECT id FROM reports WHERE account_id=$1 LIMIT 1", [
      accountId,
    ])
  ).rows[0];
  const result = await post(`/api/opportunities/${opportunityId}/runs`, {
    parentReportId: parent.id,
    cutoff: "2026-06-19",
  });
  assert.equal(result.statusCode, 400);
  assert.match(
    result.json().error,
    /historical assessment cannot use a later report/,
  );
});

test("Connected report library returns saved summaries only within the session account", async () => {
  const own = await app.inject({ url: "/api/report-library", headers });
  assert.equal(own.statusCode, 200);
  assert.ok(own.json().reports.length > 0);
  const expected = (
    await db.query("SELECT id FROM reports WHERE account_id=$1 ORDER BY id", [
      accountId,
    ])
  ).rows.map((r) => r.id);
  assert.deepEqual(
    own
      .json()
      .reports.map((r: { id: string }) => r.id)
      .sort(),
    expected,
  );
  assert.equal("payload" in own.json().reports[0], false);
  const otherToken = randomBytes(32).toString("hex");
  const otherMember = (
    await db.query(
      "SELECT user_id FROM memberships WHERE account_id=$1 LIMIT 1",
      [otherId],
    )
  ).rows[0].user_id;
  await db.query(
    "INSERT INTO sessions(token_hash,user_id,account_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
    [hash(otherToken), otherMember, otherId],
  );
  const other = await app.inject({
    url: "/api/report-library",
    headers: { ...headers, cookie: `groundwork_session=${otherToken}` },
  });
  assert.equal(other.statusCode, 200);
  assert.deepEqual(other.json().reports, []);
  const denied = await app.inject({
    url: "/api/report-library",
    headers: { host: "127.0.0.1:4318" },
  });
  assert.equal(denied.statusCode, 401);
});
test("Signing out invalidates only the current session", async () => {
  const logoutToken = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO sessions(token_hash,user_id,account_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
    [hash(logoutToken), userId, accountId],
  );
  const logoutHeaders = {
    ...headers,
    cookie: `groundwork_session=${logoutToken}`,
  };
  const result = await app.inject({
    method: "POST",
    url: "/api/sign-out",
    payload: {},
    headers: logoutHeaders,
  });
  assert.equal(result.statusCode, 200);
  assert.equal(
    (await app.inject({ url: "/api/bootstrap", headers: logoutHeaders }))
      .statusCode,
    401,
  );
  assert.equal(
    (await app.inject({ url: "/api/bootstrap", headers })).statusCode,
    200,
  );
});
