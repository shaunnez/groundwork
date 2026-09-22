import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../server/config.ts";
import { database } from "../server/db.ts";
import { ObjectStore } from "../server/storage.ts";
import { ingest } from "../server/sources.ts";
import { fetchSource } from "../server/fetch-source.ts";
import { research } from "../server/research.ts";
const cfg = loadConfig(),
  db = database(cfg),
  store = new ObjectStore(cfg.storageRoot),
  accountId = "11111111-1111-4111-8111-111111111111";
try {
  const existing = await db.query(
    "SELECT id FROM opportunities WHERE account_id=$1 AND notice_id=$2",
    [accountId, "CSP26317-live-evaluation"],
  );
  const receipt = JSON.parse(
    await readFile(
      "/Users/shaun/projects/procint/.local-groundwork/receipts/psychometric-award.json",
      "utf8",
    ),
  );
  const pack = JSON.parse(receipt.body),
    release = pack.releases[0];
  const opportunityId = existing.rows[0]?.id ?? randomUUID(),
    cutoff = "2026-09-22";
  if (!existing.rowCount)
    await db.query(
      "INSERT INTO opportunities(id,account_id,title,buyer,notice_id,cutoff,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        opportunityId,
        accountId,
        release.tender.title,
        release.buyer.name,
        "CSP26317-live-evaluation",
        cutoff,
        {
          title: release.tender.title,
          buyer: release.buyer.name,
          noticeId: "CSP26317",
          category: "85147000",
          cutoff,
          closingAt: null,
          dateStatus: "not_applicable",
          provenance: "public",
          noticeUrl:
            "https://www.find-tender.service.gov.uk/Notice/020323-2026",
          evaluationNote:
            "Separate permitted UK public case; not Bobby historical validation. Contract details notice, not an open competition.",
        },
      ],
    );
  const minimized = {
    license: pack.license,
    publisher: pack.publisher.name,
    publishedDate: pack.publishedDate,
    releaseId: release.id,
    buyer: release.buyer,
    tender: release.tender,
    awards: release.awards,
    contracts: release.contracts.map((c: any) => ({
      id: c.id,
      awardID: c.awardID,
      title: c.title,
      status: c.status,
      period: c.period,
      value: c.value,
      dateSigned: c.dateSigned,
    })),
  };
  const primary = await ingest(db, store, accountId, opportunityId, {
    name: "Official OCDS award and contract data (contact fields omitted)",
    mediaType: "application/json",
    body: Buffer.from(JSON.stringify(minimized, null, 2)),
    origin: receipt.url,
    publishedAt: "2026-03-06",
    purpose: "notice",
    required: true,
    provenance: "public",
  });
  const normalized = release.awards.flatMap((a: any) =>
    a.suppliers.map((s: any) => {
      const contract = release.contracts.find((c: any) => c.awardID === a.id);
      return {
        id: `${release.ocid}:${a.id}:${s.id}`,
        buyer: release.buyer.name,
        supplier: s.name,
        category: "85147000",
        scope: release.tender.title,
        awardDate: contract.dateSigned.slice(0, 10),
        startDate: contract.period.startDate.slice(0, 10),
        endDate: contract.period.endDate.slice(0, 10),
        predecessorId: null,
        outcome: "awarded",
      };
    }),
  );
  await ingest(db, store, accountId, opportunityId, {
    name: "Normalized single-notice award population — not sector history",
    mediaType: "application/json",
    body: Buffer.from(JSON.stringify(normalized, null, 2)),
    origin: receipt.url,
    publishedAt: "2026-03-06",
    purpose: "awards",
    required: true,
    provenance: "public",
  });
  const settings = JSON.parse(
    await readFile(process.env.GROUNDWORK_CONFIG!, "utf8"),
  );
  const result = await research(
    db,
    store,
    accountId,
    'site:find-tender.service.gov.uk "UK Research and Innovation" "Psychometric"',
    {
      includedConfirmed: settings.firecrawlIncludedConfirmed,
      credentialFile: settings.firecrawlCredentialFile,
    },
  );
  await writeFile(
    "/Users/shaun/projects/procint/.local-groundwork/receipts/public-case-inventory.json",
    JSON.stringify(
      {
        opportunityId,
        cutoff,
        sourceLicence: pack.license,
        primarySourceId: primary.id,
        research: result,
        limitations: [
          "Single notice award sample; no re-procurement linkage; no retention rate",
          "Buyer/supplier profile enrichment remains bounded",
          "Client context absent; no client capability conclusion",
          "Bobby source pack unavailable; separate case only",
        ],
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log({
    opportunityId,
    primarySourceId: primary.id,
    normalizedAwards: normalized.length,
    research: result,
  });
} finally {
  await db.end();
}
