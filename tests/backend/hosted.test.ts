import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../server/config.ts";
import { database } from "../../server/db.ts";
import { createApi } from "../../server/api.ts";
import {
  assertSubscriptionAuth,
  claudeEnvironment,
} from "../../server/claude.ts";

const base = loadConfig(),
  db = database(base);
const root = await mkdtemp(join(tmpdir(), "groundwork-hosted-test-"));
await writeFile(
  join(root, "index.html"),
  "<!doctype html><title>Groundwork test</title>",
);
const config = {
  ...base,
  publicOrigin: "https://pilot.example.com",
  staticRoot: root,
  reviewerSecret: "r".repeat(48),
};
const app = await createApi(config, db);
await db.query(
  "INSERT INTO accounts(id,name) VALUES('11111111-1111-4111-8111-111111111111','Hosted fixture') ON CONFLICT DO NOTHING",
);
await db.query(
  "INSERT INTO memberships(user_id,account_id,role) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'),('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','reviewer') ON CONFLICT DO NOTHING",
);
const headers = {
  host: "pilot.example.com",
  origin: config.publicOrigin,
  "x-groundwork-request": "local",
};

test("hosted configuration defaults to no inference or research and requires HTTPS", () => {
  const env = {
    GROUNDWORK_HOSTED: "true",
    DATABASE_URL: base.databaseUrl,
    GROUNDWORK_ACCESS_KEY: "a".repeat(48),
    RAILWAY_PUBLIC_DOMAIN: "pilot.example.com",
  };
  const c = loadConfig(env);
  assert.equal(c.claudeSubscriptionApproved, false);
  assert.equal(c.firecrawlIncludedConfirmed, false);
  assert.equal(c.firecrawlCredentialFile, undefined);
  const research = loadConfig({
    ...env,
    GROUNDWORK_FIRECRAWL_INCLUDED_CONFIRMED: "true",
    GROUNDWORK_FIRECRAWL_CREDENTIAL_FILE: "/data/secrets/firecrawl.env",
  });
  assert.equal(research.firecrawlIncludedConfirmed, true);
  assert.equal(research.firecrawlCredentialFile, "/data/secrets/firecrawl.env");
  assert.equal(c.claudeHome, "/data/claude-home");
  assert.throws(() =>
    loadConfig({
      ...env,
      GROUNDWORK_PUBLIC_ORIGIN: "http://pilot.example.com",
    }),
  );
  assert.throws(() =>
    loadConfig({ ...env, GROUNDWORK_REVIEW_KEY: env.GROUNDWORK_ACCESS_KEY }),
  );
});

test("hosted authentication rejects foreign hosts, missing origin and cross-site requests", async () => {
  for (const h of [
    { ...headers, host: "evil.example.com" },
    { ...headers, origin: "https://evil.example.com" },
    { host: headers.host, "x-groundwork-request": "local" },
  ]) {
    const r = await app.inject({
      method: "POST",
      url: "/api/session",
      headers: h,
      payload: { key: config.sessionSecret },
    });
    assert.equal(r.statusCode, 403);
  }
  const anonymous = await app.inject({ url: "/api/bootstrap", headers });
  assert.equal(anonymous.statusCode, 401);
});

test("hosted reviewer has a secure session but cannot enqueue work or change administration", async () => {
  const login = await app.inject({
    method: "POST",
    url: "/api/session",
    headers,
    payload: { key: config.reviewerSecret },
  });
  assert.equal(login.statusCode, 200, login.body);
  const cookie = String(login.headers["set-cookie"]);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  const h = { ...headers, cookie: cookie.split(";")[0] };
  const boot = await app.inject({ url: "/api/bootstrap", headers: h });
  assert.equal(boot.json().role, "reviewer");
  const search = await app.inject({
    method: "POST",
    url: "/api/opportunities/11111111-1111-4111-8111-111111111111/search",
    headers: h,
    payload: { query: "evidence" },
  });
  assert.equal(
    search.statusCode,
    404,
    "Reviewer search reaches the account-scoped source lookup",
  );
  for (const url of [
    "/api/clients",
    "/api/opportunities",
    "/api/opportunities/11111111-1111-4111-8111-111111111111/research",
    "/api/reports/11111111-1111-4111-8111-111111111111/derive",
  ]) {
    const denied = await app.inject({
      method: "POST",
      url,
      headers: h,
      payload: {},
    });
    assert.equal(denied.statusCode, 403, url);
  }
  const out = await app.inject({
    method: "POST",
    url: "/api/sign-out",
    headers: h,
    payload: {},
  });
  assert.equal(out.statusCode, 200);
  assert.equal(
    (await app.inject({ url: "/api/bootstrap", headers: h })).statusCode,
    401,
  );
});

test("hosted owner can save an opportunity with the same protected API", async () => {
  const login = await app.inject({
    method: "POST",
    url: "/api/session",
    headers,
    payload: { key: config.sessionSecret },
  });
  const h = {
    ...headers,
    cookie: String(login.headers["set-cookie"]).split(";")[0],
  };
  const r = await app.inject({
    method: "POST",
    url: "/api/opportunities",
    headers: h,
    payload: {
      title: "Hosting smoke fixture",
      buyer: "Synthetic buyer",
      noticeId: "HOST-TEST",
      cutoff: "2026-09-22",
      provenance: "synthetic",
    },
  });
  assert.equal(r.statusCode, 200, r.body);
});

test("compiled app is public but protected APIs and missing assets never return the SPA", async () => {
  assert.match(
    (await app.inject({ url: "/local", headers })).body,
    /Groundwork test/,
  );
  assert.equal(
    (await app.inject({ url: "/assets/missing.js", headers })).statusCode,
    404,
  );
  assert.equal(
    (await app.inject({ url: "/api/not-real", headers })).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/health",
        headers: { host: "healthcheck.railway.app" },
      })
    ).statusCode,
    200,
  );
});

test("subscription preflight rejects API authentication and strips provider overrides", () => {
  assertSubscriptionAuth({
    loggedIn: true,
    authMethod: "claude.ai",
    apiProvider: "firstParty",
  });
  for (const status of [
    { loggedIn: false },
    { loggedIn: true, authMethod: "api_key", apiProvider: "firstParty" },
    { loggedIn: true, authMethod: "claude.ai", apiProvider: "bedrock" },
  ])
    assert.throws(() => assertSubscriptionAuth(status));
  const env = claudeEnvironment(
    {
      HOME: "/worker",
      ANTHROPIC_API_KEY: "never-send",
      ANTHROPIC_AUTH_TOKEN: "never-send",
      CLAUDE_CODE_USE_BEDROCK: "1",
    },
    "/tmp",
  );
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, undefined);
  assert.equal(env.CLAUDE_CODE_USE_BEDROCK, undefined);
});

test("login attempts are bounded", async () => {
  let last;
  for (let i = 0; i < 11; i++)
    last = await app.inject({
      method: "POST",
      url: "/api/session",
      headers,
      payload: { key: "wrong" },
    });
  assert.equal(last?.statusCode, 429);
});
test.after(async () => {
  await app.close();
  await db.end();
  await rm(root, { recursive: true, force: true });
});
