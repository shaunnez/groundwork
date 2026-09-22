import { rm, rename, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { loadConfig } from "../server/config.ts";
import { database, transaction } from "../server/db.ts";
// Maintenance command, not an HTTP action. Purges only the explicitly identified local account.
const accountId = z.string().uuid().parse(process.argv[2]);
if (process.argv[3] !== `--confirm-purge=${accountId}`)
  throw new Error("Explicit account-specific purge confirmation required");
const config = loadConfig(),
  db = database(config);
const quarantine = join(config.storageRoot, "purge", randomUUID());
try {
  await transaction(db, async (c) => {
    const account = await c.query(
      "SELECT id FROM accounts WHERE id=$1 FOR UPDATE",
      [accountId],
    );
    if (!account.rowCount) throw new Error("Account not found");
    const active = await c.query(
      "SELECT id FROM runs WHERE account_id=$1 AND state IN ('queued','running')",
      [accountId],
    );
    if (active.rowCount)
      throw new Error("Cancel and settle active work before purging");
    const pending = await c.query(
      "SELECT id FROM provider_calls WHERE account_id=$1 AND status IN ('reserved','uncertain')",
      [accountId],
    );
    if (pending.rowCount)
      throw new Error("Reconcile external call outcomes before purging");
    await mkdir(join(config.storageRoot, "purge"), {
      recursive: true,
      mode: 0o700,
    });
    await rename(join(config.storageRoot, accountId), quarantine).catch(
      (e: NodeJS.ErrnoException) => {
        if (e.code !== "ENOENT") throw e;
      },
    );
    await c.query("DELETE FROM accounts WHERE id=$1", [accountId]);
  });
  await rm(quarantine, { recursive: true, force: true });
  console.log(
    "Local account database records and private objects purged. Goal credit totals retained.",
  );
} catch (error) {
  await rename(quarantine, join(config.storageRoot, accountId)).catch(
    () => undefined,
  );
  throw error;
} finally {
  await db.end();
}
