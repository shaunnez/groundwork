import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { createApi } from "../../server/api.ts";
import { loadConfig } from "../../server/config.ts";
import { database } from "../../server/db.ts";
import { hash, ObjectStore } from "../../server/storage.ts";
import { ingest } from "../../server/sources.ts";
import { reportFreshness } from "../../server/operations.ts";
const config = loadConfig(),
  db = database(config),
  account = randomUUID(),
  other = randomUUID(),
  owner = randomUUID(),
  reviewer = randomUUID(),
  foreign = randomUUID();
const token = randomBytes(32).toString("hex"),
  reviewToken = randomBytes(32).toString("hex"),
  foreignToken = randomBytes(32).toString("hex");
await db.query(
  "INSERT INTO accounts(id,name) VALUES($1,'Source management fixture'),($2,'Other fixture')",
  [account, other],
);
for (const [user, a, role, t] of [
  [owner, account, "owner", token],
  [reviewer, account, "reviewer", reviewToken],
  [foreign, other, "owner", foreignToken],
]) {
  await db.query(
    "INSERT INTO memberships(user_id,account_id,role) VALUES($1,$2,$3)",
    [user, a, role],
  );
  await db.query(
    "INSERT INTO sessions(token_hash,user_id,account_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
    [hash(t), user, a],
  );
}
const app = await createApi(config, db),
  headers = {
    cookie: `groundwork_session=${token}`,
    "x-groundwork-request": "local",
    host: "127.0.0.1:4318",
  };
const post = (url: string, payload: unknown, h = headers) =>
  app.inject({
    method: "POST",
    url,
    payload: payload as Record<string, unknown>,
    headers: h,
  });
const get = (url: string) => app.inject({ url, headers });
let opportunity: string,
  original: string,
  current: string,
  unit: string,
  run: string,
  report: string;
const metadata = {
  name: "Renamed notice",
  purpose: "notice",
  required: true,
  publishedAt: null,
  provenance: "synthetic",
  reason: "Correct the source label",
};
test("Source versions preserve original metadata, text, downloads and frozen run manifests", async () => {
  opportunity = (
    await post("/api/opportunities", {
      title: "Synthetic source management",
      buyer: "Test buyer",
      noticeId: "SOURCE-TEST",
      cutoff: "2026-09-23",
      provenance: "synthetic",
    })
  ).json().id;
  original = (
    await post(`/api/opportunities/${opportunity}/sources`, {
      name: "Original.txt",
      mediaType: "text/plain",
      text: "Original notice: submit Form X.",
      purpose: "notice",
      provenance: "synthetic",
      rightsConfirmed: true,
    })
  ).json().id;
  const before = (await get(`/api/sources/${original}`)).json();
  unit = before.units[0].id;
  const queued = await post(`/api/opportunities/${opportunity}/runs`, {});
  run = queued.json().id;
  const manifest = (
    await db.query("SELECT manifest FROM runs WHERE id=$1", [run])
  ).rows[0].manifest;
  const edited = await post(`/api/sources/${original}/edit`, metadata);
  assert.equal(edited.statusCode, 200, edited.body);
  current = edited.json().id;
  assert.notEqual(current, original);
  assert.deepEqual((await get(`/api/sources/${original}`)).json(), before);
  assert.equal(
    (await get(`/api/sources/${current}`)).json().name,
    "Renamed notice",
  );
  assert.equal(
    (await get(`/api/sources/${original}/download`)).body,
    "Original notice: submit Form X.",
  );
  assert.equal((await get(`/api/units/${unit}`)).json().sourceId, original);
  assert.deepEqual(
    (await db.query("SELECT manifest FROM runs WHERE id=$1", [run])).rows[0]
      .manifest,
    manifest,
  );
  const detail = (await get(`/api/opportunities/${opportunity}`)).json();
  assert.deepEqual(
    detail.sources.map((s: { id: string }) => s.id),
    [current],
  );
  assert.equal(detail.sourceHistory[0].status, "superseded");
  const stale = await post(`/api/sources/${original}/edit`, metadata);
  assert.equal(stale.statusCode, 409);
  const newRun = (
    await post(`/api/opportunities/${opportunity}/runs`, {})
  ).json().id;
  assert.notEqual(newRun, run);
  assert.deepEqual(
    (await db.query("SELECT manifest FROM runs WHERE id=$1", [newRun])).rows[0]
      .manifest.sourceIds,
    [current],
  );
});
test("Reports become stale after edits while preserving immutable payloads and citation units", async () => {
  const intelligence = randomUUID();
  report = randomUUID();
  const payload = { evidence: [{ unitId: unit, excerpt: "Original notice" }] };
  await db.query(
    "INSERT INTO intelligence(id,account_id,opportunity_id,run_id,cutoff,payload) VALUES($1,$2,$3,$4,'2026-09-23','{}')",
    [intelligence, account, opportunity, run],
  );
  await db.query(
    "INSERT INTO reports(id,account_id,opportunity_id,run_id,intelligence_id,kind,payload) VALUES($1,$2,$3,$4,$5,'pursuit',$6)",
    [report, account, opportunity, run, intelligence, payload],
  );
  const status = await reportFreshness(db, account, report);
  assert.equal(status.sourceChanged, true);
  assert.deepEqual(
    (await db.query("SELECT payload FROM reports WHERE id=$1", [report]))
      .rows[0].payload,
    payload,
  );
});
test("Archive excludes future searches/runs, retains downloads, and supports restore", async () => {
  const archived = await post(`/api/sources/${current}/archive`, {
    archived: true,
    reason: "Not part of the current pack",
  });
  assert.equal(archived.statusCode, 200);
  const detail = (await get(`/api/opportunities/${opportunity}`)).json();
  assert.equal(detail.sources.length, 0);
  assert.equal(detail.sourceHistory.length, 2);
  assert.equal(
    (
      await post(`/api/opportunities/${opportunity}/search`, {
        query: "Form X",
      })
    ).json().state,
    "not_searched",
  );
  assert.equal(
    (await post(`/api/opportunities/${opportunity}/runs`, {})).statusCode,
    400,
  );
  assert.equal((await get(`/api/sources/${current}/download`)).statusCode, 200);
  assert.equal(
    (
      await post(`/api/sources/${current}/archive`, {
        archived: false,
        reason: "Restore for reassessment",
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await post(`/api/opportunities/${opportunity}/search`, {
        query: "Form X",
      })
    ).json().state,
    "found",
  );
  assert.equal(
    (
      await post(`/api/sources/${original}/archive`, {
        archived: false,
        reason: "Try restoring replaced",
      })
    ).statusCode,
    409,
  );
});
test("Concurrent edits produce one active successor", async () => {
  const results = await Promise.all([
    post(`/api/sources/${current}/edit`, metadata),
    post(`/api/sources/${current}/edit`, {
      ...metadata,
      name: "Concurrent edit",
    }),
  ]);
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
  current = results.find((r) => r.statusCode === 200)!.json().id;
  assert.equal(
    (await get(`/api/opportunities/${opportunity}`)).json().sources.length,
    1,
  );
});
test("Replacement creates new evidence and cannot cross opportunities", async () => {
  const store = new ObjectStore(config.storageRoot);
  const replaced = await ingest(db, store, account, opportunity, {
    name: "Replacement.txt",
    mediaType: "text/plain",
    body: Buffer.from("Changed notice: submit Form Y."),
    purpose: "notice",
    provenance: "synthetic",
    publishedAt: null,
    required: true,
    replacesId: current,
    actorId: owner,
    reason: "New notice revision",
  });
  current = replaced.id;
  assert.equal(
    (await get(`/api/opportunities/${opportunity}`)).json().sources.length,
    1,
  );
  assert.equal(
    (
      await post(`/api/opportunities/${opportunity}/search`, {
        query: "Form X",
      })
    ).json().state,
    "not_found",
  );
  assert.equal(
    (
      await post(`/api/opportunities/${opportunity}/search`, {
        query: "Form Y",
      })
    ).json().state,
    "found",
  );
  assert.equal(
    (await get(`/api/sources/${original}/download`)).body,
    "Original notice: submit Form X.",
  );
  const another = (
    await post("/api/opportunities", {
      title: "Other opportunity",
      buyer: "Test buyer",
      noticeId: "OTHER",
      cutoff: "2026-09-23",
      provenance: "synthetic",
    })
  ).json().id;
  await assert.rejects(
    ingest(db, store, account, another, {
      name: "wrong.txt",
      mediaType: "text/plain",
      body: Buffer.from("Different pack"),
      purpose: "notice",
      provenance: "synthetic",
      publishedAt: null,
      required: true,
      replacesId: current,
      actorId: owner,
      reason: "wrong pack",
    }),
    /this opportunity/,
  );
});
test("Source management enforces owner/account boundaries and mandatory audit reasons", async () => {
  for (const [cookie, status] of [
    [reviewToken, 403],
    [foreignToken, 404],
  ] as const) {
    const h = { ...headers, cookie: `groundwork_session=${cookie}` };
    assert.equal(
      (await post(`/api/sources/${current}/edit`, metadata, h)).statusCode,
      status,
    );
    assert.equal(
      (
        await post(
          `/api/sources/${current}/archive`,
          { archived: true, reason: "Archive request" },
          h,
        )
      ).statusCode,
      status,
    );
  }
  assert.equal(
    (await post(`/api/sources/${current}/edit`, { ...metadata, reason: "" }))
      .statusCode,
    400,
  );
  assert.ok(
    (
      await db.query("SELECT id FROM source_events WHERE account_id=$1", [
        account,
      ])
    ).rowCount! >= 5,
  );
});
test.after(async () => {
  await app.close();
  await db.query("DELETE FROM accounts WHERE id=ANY($1::uuid[])", [
    [account, other],
  ]);
  await db.end();
});
