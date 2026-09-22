import pg from "pg";
import { randomBytes } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { loadConfig } from "../server/config.ts";
const config = loadConfig(),
  url = new URL(config.databaseUrl),
  owner = decodeURIComponent(url.username);
if (!/^[a-z_][a-z0-9_]*$/.test(owner))
  throw new Error("Unexpected local database role");
const dbName = `groundwork_test_${randomBytes(6).toString("hex")}`,
  root = join(dirname(process.env.GROUNDWORK_CONFIG!), "test-runs");
await mkdir(root, { recursive: true, mode: 0o700 });
const temp = await mkdtemp(join(root, "run-")),
  configPath = join(temp, "config.json");
const admin = new pg.Client({ host: "/tmp", database: "postgres" });
await admin.connect();
let created = false;
try {
  await admin.query(`CREATE DATABASE ${dbName} OWNER ${owner}`);
  created = true;
  url.pathname = "/" + dbName;
  const testConfig = {
    ...config,
    databaseUrl: url.href,
    storageRoot: join(temp, "objects"),
    claudeSubscriptionApproved: false,
    firecrawlIncludedConfirmed: false,
    firecrawlCredentialFile: undefined,
  };
  await writeFile(configPath, JSON.stringify(testConfig), { mode: 0o600 });
  const db = new pg.Client({ connectionString: url.href });
  await db.connect();
  await db.query(
    await readFile(new URL("../server/schema.sql", import.meta.url), "utf8"),
  );
  await db.end();
  const files = (await readdir(new URL("../tests/backend/", import.meta.url)))
    .filter((f) => f.endsWith(".test.ts"))
    .map((f) => new URL("../tests/backend/" + f, import.meta.url).pathname);
  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--test", ...files],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          GROUNDWORK_CONFIG: configPath,
          GROUNDWORK_TEST_MODE: "1",
        },
      },
    );
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
  process.exitCode = code;
} finally {
  if (created) await admin.query(`DROP DATABASE ${dbName} WITH (FORCE)`);
  await admin.end();
  await rm(temp, { recursive: true, force: true });
}
