import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { loadConfig } from "../server/config.ts";
import { database } from "../server/db.ts";

if (process.env.GROUNDWORK_HOSTED !== "true")
  throw new Error("Hosted start requires explicit hosted configuration");
const config = loadConfig();
await mkdir(config.storageRoot, { recursive: true, mode: 0o700 });
await mkdir(config.claudeHome!, { recursive: true, mode: 0o700 });
const db = database(config);
const client = await db.connect();
try {
  await client.query("SELECT pg_advisory_lock(782104231)");
  await client.query("BEGIN");
  await client.query(
    await readFile(new URL("../server/schema.sql", import.meta.url), "utf8"),
  );
  await client.query(
    "INSERT INTO accounts(id,name) VALUES ('11111111-1111-4111-8111-111111111111','Groundwork private pilot') ON CONFLICT DO NOTHING",
  );
  await client.query(
    "INSERT INTO memberships(user_id,account_id,role) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'),('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','reviewer') ON CONFLICT DO NOTHING",
  );
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.query("SELECT pg_advisory_unlock(782104231)");
  client.release();
  await db.end();
}

const children: ChildProcess[] = [];
let stopping = false;
function stop(code: number) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => {
    for (const child of children)
      if (child.exitCode === null) child.kill("SIGKILL");
  }, 20000).unref();
}
for (const file of ["server/api.ts", "server/worker.ts"]) {
  const child = spawn(process.execPath, ["--import", "tsx", file], {
    stdio: "inherit",
    env: process.env,
  });
  children.push(child);
  child.on("error", () => stop(1));
  child.on("exit", () => {
    if (!stopping) stop(1);
  });
}
process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));
