import { readFile } from "node:fs/promises";
import { loadConfig } from "../server/config.ts";
import { database } from "../server/db.ts";
import { ObjectStore } from "../server/storage.ts";
import { reconcileResearch } from "../server/reconcile.ts";
if (!process.argv[2])
  throw new Error(
    "Provide a private operator-checked provider reconciliation JSON file; never assume a timeout consumed zero credits",
  );
const config = loadConfig(),
  db = database(config);
try {
  console.log(
    await reconcileResearch(
      db,
      new ObjectStore(config.storageRoot),
      JSON.parse(await readFile(process.argv[2], "utf8")),
    ),
  );
} finally {
  await db.end();
}
