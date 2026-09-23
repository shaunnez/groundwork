import { readFile } from "node:fs/promises";
import { loadConfig } from "../server/config.ts";
import { database } from "../server/db.ts";
import { ObjectStore } from "../server/storage.ts";
import { ingest } from "../server/sources.ts";
const cfg = loadConfig(),
  db = database(cfg),
  store = new ObjectStore(cfg.storageRoot);
const accountId = "11111111-1111-4111-8111-111111111111",
  opportunityId = "16566f8a-83f0-4160-9151-19a787571da4";
try {
  const name = "Web-enrichment lead verified in official OCDS: UKRI CSP26550";
  const exists = await db.query(
    "SELECT id FROM sources WHERE account_id=$1 AND opportunity_id=$2 AND name=$3",
    [accountId, opportunityId, name],
  );
  if (exists.rowCount) {
    console.log({ reused: exists.rows[0].id });
  } else {
    const receipt = JSON.parse(
      await readFile(
        "/Users/shaun/projects/groundwork/.local-groundwork/receipts/ukri-related-award.json",
        "utf8",
      ),
    );
    const r = receipt.body.records[0].compiledRelease;
    const source = {
      license: receipt.body.license,
      noticeId: r.id,
      publicationDate: r.date,
      buyer: r.buyer,
      tender: r.tender,
      awards: r.awards,
      contracts: r.contracts?.map((c: any) => ({
        id: c.id,
        awardID: c.awardID,
        title: c.title,
        status: c.status,
        period: c.period,
        value: c.value,
        dateSigned: c.dateSigned,
      })),
      lineage: {
        discovery:
          "Firecrawl bounded web search, verified through official published OCDS API",
        relationship:
          "Another UKRI psychometric notice; no predecessor/follow-on equivalence asserted",
        rawReceipt: "ukri-related-award.json",
      },
    };
    const result = await ingest(db, store, accountId, opportunityId, {
      name,
      mediaType: "application/json",
      body: Buffer.from(JSON.stringify(source, null, 2)),
      origin: receipt.url,
      publishedAt: r.date.slice(0, 10),
      purpose: "context",
      required: false,
      provenance: "public",
    });
    console.log({
      sourceId: result.id,
      units: result.units.length,
      sourceDate: r.date,
      bytes: JSON.stringify(source).length,
    });
  }
} finally {
  await db.end();
}
