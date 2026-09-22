import { readFile } from "node:fs/promises";
import { loadConfig } from "../server/config.ts";
import { database } from "../server/db.ts";
import { ObjectStore } from "../server/storage.ts";
import { research } from "../server/research.ts";
const cfg = loadConfig();
const privateSettings = JSON.parse(
  await readFile(process.env.GROUNDWORK_CONFIG!, "utf8"),
);
const db = database(cfg);
try {
  console.log(
    JSON.stringify(
      await research(
        db,
        new ObjectStore(cfg.storageRoot),
        "11111111-1111-4111-8111-111111111111",
        "site:find-tender.service.gov.uk psychometric testing contract award",
        {
          includedConfirmed: privateSettings.firecrawlIncludedConfirmed,
          credentialFile: privateSettings.firecrawlCredentialFile,
        },
      ),
      null,
      2,
    ),
  );
} finally {
  await db.end();
}
