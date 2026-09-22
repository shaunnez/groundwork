import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadConfig } from "../../server/config.ts";
import { database } from "../../server/db.ts";
import { ObjectStore } from "../../server/storage.ts";
test("Account purge removes only the identified local account and requires explicit confirmation", async () => {
  const config = loadConfig(),
    db = database(config),
    store = new ObjectStore(config.storageRoot),
    a = randomUUID(),
    b = randomUUID();
  try {
    await db.query(
      "INSERT INTO accounts(id,name) VALUES($1,'Purge fixture'),($2,'Retained fixture')",
      [a, b],
    );
    const original = await store.put(a, "private synthetic fixture"),
      retained = await store.put(b, "retained synthetic fixture");
    await assert.rejects(
      promisify(execFile)(process.execPath, [
        "--import",
        "tsx",
        "scripts/purge-local-account.ts",
        a,
      ]),
    );
    assert.equal(
      (await db.query("SELECT id FROM accounts WHERE id=$1", [a])).rowCount,
      1,
    );
    await promisify(execFile)(process.execPath, [
      "--import",
      "tsx",
      "scripts/purge-local-account.ts",
      a,
      `--confirm-purge=${a}`,
    ]);
    assert.equal(
      (await db.query("SELECT id FROM accounts WHERE id=$1", [a])).rowCount,
      0,
    );
    await assert.rejects(store.get(a, original));
    assert.equal(
      (await store.get(b, retained)).toString(),
      "retained synthetic fixture",
    );
  } finally {
    await db.query("DELETE FROM accounts WHERE id=ANY($1::uuid[])", [[a, b]]);
    await db.end();
  }
});
