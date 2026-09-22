import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { request } from "node:http";

// Exercise the proxy's original Host header over the local test connection.
function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      { method: options.method || "GET", headers: options.headers },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("error", reject);
        res.on("end", () => {
          const headers = new Headers();
          for (let i = 0; i < res.rawHeaders.length; i += 2)
            headers.append(res.rawHeaders[i], res.rawHeaders[i + 1]);
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode,
              headers,
            }),
          );
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(10000, () =>
      req.destroy(new Error("HTTP smoke request timed out")),
    );
    req.end(options.body);
  });
}

// Disposable resources only. No local application database or credentials are read.
const name = `groundwork-smoke-${randomBytes(5).toString("hex")}`;
const root = mkdtempSync(join(tmpdir(), name));
const password = randomBytes(32).toString("hex"),
  owner = randomBytes(32).toString("hex");
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const file = (name, lines) => {
  const path = join(root, name);
  writeFileSync(path, lines.join("\n"), { mode: 0o600 });
  return path;
};
const pgEnv = file("postgres.env", [
  `POSTGRES_PASSWORD=${password}`,
  "POSTGRES_DB=groundwork",
]);
const appEnv = file("app.env", [
  `DATABASE_URL=postgresql://postgres:${password}@${name}-db:5432/groundwork`,
  `GROUNDWORK_ACCESS_KEY=${owner}`,
  "GROUNDWORK_PUBLIC_ORIGIN=https://pilot.example.com",
  "PORT=4318",
]);
let port;
async function ready() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Container did not become healthy");
}
try {
  docker("network", "create", name);
  docker("volume", "create", name);
  docker(
    "run",
    "-d",
    "--name",
    `${name}-db`,
    "--network",
    name,
    "--env-file",
    pgEnv,
    "postgres:17-alpine",
  );
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      docker("exec", `${name}-db`, "pg_isready", "-U", "postgres");
      break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  docker(
    "run",
    "-d",
    "--name",
    `${name}-app`,
    "--network",
    name,
    "--env-file",
    appEnv,
    "-v",
    `${name}:/data`,
    "-p",
    "127.0.0.1::4318",
    "groundwork-pilot:local",
  );
  port = docker("port", `${name}-app`, "4318").split(":").at(-1);
  await ready();
  let base = `http://127.0.0.1:${port}`;
  const headers = {
    host: "pilot.example.com",
    origin: "https://pilot.example.com",
    "x-groundwork-request": "local",
    "content-type": "application/json",
  };
  const health = await (await fetch(base + "/api/health")).json();
  assert.equal(health.modelEnabled, false);
  assert.equal((await fetch(base + "/api/bootstrap", { headers })).status, 401);
  assert.match(
    await (await fetch(base + "/", { headers })).text(),
    /<!doctype html>/i,
  );
  const login = await fetch(base + "/api/session", {
    method: "POST",
    headers,
    body: JSON.stringify({ key: owner }),
  });
  assert.equal(login.status, 200);
  headers.cookie = login.headers.get("set-cookie").split(";")[0];
  const create = await fetch(base + "/api/opportunities", {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Disposable hosting fixture",
      buyer: "Test buyer",
      noticeId: "HOST-SMOKE",
      cutoff: "2026-09-22",
      provenance: "synthetic",
    }),
  });
  assert.equal(create.status, 200);
  const { id } = await create.json();
  const source = await fetch(base + `/api/opportunities/${id}/sources`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "smoke.txt",
      mediaType: "text/plain",
      text: "Synthetic hosting persistence evidence.",
      purpose: "notice",
      provenance: "synthetic",
      rightsConfirmed: true,
    }),
  });
  assert.equal(source.status, 200);
  const saved = await source.json();
  docker("restart", `${name}-app`);
  port = docker("port", `${name}-app`, "4318").split(":").at(-1);
  base = `http://127.0.0.1:${port}`;
  await ready();
  assert.equal(
    (await fetch(base + `/api/opportunities/${id}`, { headers })).status,
    200,
  );
  const persisted = await fetch(base + `/api/sources/${saved.id}/download`, {
    headers,
  });
  assert.equal(persisted.status, 200);
  assert.match(await persisted.text(), /hosting persistence evidence/);
  assert.match(
    docker("exec", `${name}-app`, "/home/node/.local/bin/claude", "--version"),
    /2\.1\.278/,
  );
  console.log(
    "PASS: container startup, compiled UI, protected login, disabled inference, source intake, database/file persistence across restart and official CLI version. No model calls.",
  );
} catch (error) {
  try {
    console.error(
      docker("logs", `${name}-app`)
        .replaceAll(password, "[redacted]")
        .replaceAll(owner, "[redacted]"),
    );
  } catch {}
  throw error;
} finally {
  for (const container of [`${name}-app`, `${name}-db`]) {
    try {
      docker("rm", "-f", container);
    } catch {}
  }
  try {
    docker("volume", "rm", name);
  } catch {}
  try {
    docker("network", "rm", name);
  } catch {}
  rmSync(root, { recursive: true, force: true });
}
