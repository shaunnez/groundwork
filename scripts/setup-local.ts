import pg from "pg";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root =
  process.env.GROUNDWORK_LOCAL_ROOT ??
  fileURLToPath(new URL("../.local-groundwork", import.meta.url));
const path = `${root}/config.json`;
await mkdir(root, { recursive: true, mode: 0o700 });
if (!existsSync(path)) {
  const admin = new pg.Client({ host: "/tmp", database: "postgres" });
  await admin.connect();
  const role = "groundwork_local",
    db = "groundwork_local";
  const existing = await admin.query(
    "SELECT rolname FROM pg_roles WHERE rolname=$1",
    [role],
  );
  const existingDb = await admin.query(
    "SELECT datname FROM pg_database WHERE datname=$1",
    [db],
  );
  if (existing.rowCount || existingDb.rowCount)
    throw new Error(
      "Groundwork resources exist but local config is missing; inspect ownership before proceeding.",
    );
  const password = randomBytes(32).toString("hex");
  await admin.query(
    `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
  );
  await admin.query(`CREATE DATABASE ${db} OWNER ${role}`);
  await admin.end();
  await writeFile(
    path,
    JSON.stringify(
      {
        databaseUrl: `postgresql://${role}:${password}@127.0.0.1:5432/${db}`,
        storageRoot: `${root}/objects`,
        sessionSecret: randomBytes(32).toString("hex"),
        claudeSubscriptionApproved: false,
        port: 4318,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}
const config = JSON.parse(await readFile(path, "utf8"));
const db = new pg.Client({ connectionString: config.databaseUrl });
await db.connect();
await db.query(
  await readFile(new URL("../server/schema.sql", import.meta.url), "utf8"),
);
await db.query(
  "INSERT INTO accounts(id,name) VALUES ('11111111-1111-4111-8111-111111111111','Groundwork internal evaluation'),('22222222-2222-4222-8222-222222222222','Isolation test account') ON CONFLICT DO NOTHING",
);
await db.query(
  "INSERT INTO memberships(user_id,account_id,role) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','owner') ON CONFLICT DO NOTHING",
);
await db.end();
console.log(`Local database ready. Private configuration: ${path}`);
