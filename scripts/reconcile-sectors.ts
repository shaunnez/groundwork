import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { loadConfig } from "../server/config.ts";
import { database } from "../server/db.ts";
import {
  backfillSectors,
  chooseSector,
  createSector,
} from "../server/sectors.ts";
import { classifySavedOpportunity } from "../server/sector-classifier.ts";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, "").split("=");
    return [key, value.join("=")];
  }),
);
const mode = args.mode;
if (!args.output || !["inventory", "apply"].includes(mode))
  throw new Error(
    "Usage: reconcile-sectors --mode=inventory|apply --output=<private.json> [--snapshot=<bootstrap.json> --gets=<status.json> | --account=<uuid>] [--taxonomy=<approved.json>]",
  );

const Opportunity = z.object({
  id: z.string().uuid(),
  title: z.string(),
  notice_id: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
});
const Notice = z.object({
  opportunity_id: z.string().uuid(),
  fields: z
    .object({
      categories: z.array(z.string()).default([]),
      overview: z.string().nullable().optional(),
    })
    .passthrough(),
});
let db: ReturnType<typeof database> | undefined;
let opportunities: z.infer<typeof Opportunity>[];
let notices: z.infer<typeof Notice>[];
if (args.snapshot) {
  const snapshot = JSON.parse(await readFile(args.snapshot, "utf8"));
  const status = JSON.parse(await readFile(args.gets, "utf8"));
  opportunities = z.array(Opportunity).parse(snapshot.opportunities);
  notices = z.array(Notice).parse(status.notices);
} else {
  if (!args.account)
    throw new Error("--account is required for a database inventory");
  db = database(loadConfig());
  opportunities = z
    .array(Opportunity)
    .parse(
      (
        await db.query(
          "SELECT id,title,notice_id,metadata FROM opportunities WHERE account_id=$1 AND archived_at IS NULL ORDER BY id",
          [args.account],
        )
      ).rows,
    );
  notices = z.array(Notice).parse(
    (
      await db.query(
        `SELECT n.opportunity_id,r.fields FROM gets_notices n JOIN gets_notice_revisions r
     ON r.id=n.current_revision_id AND r.account_id=n.account_id WHERE n.account_id=$1`,
        [args.account],
      )
    ).rows,
  );
}
const noticeByOpportunity = new Map(notices.map((n) => [n.opportunity_id, n]));
const rows = opportunities
  .filter((o) => o.metadata.provenance !== "synthetic")
  .map((o) => {
    const notice = noticeByOpportunity.get(o.id);
    return {
      id: o.id,
      rfxId: o.notice_id,
      title: o.title,
      overview: notice?.fields.overview ?? o.metadata.overview ?? null,
      getsCategories: notice?.fields.categories ?? o.metadata.categories ?? [],
      hasSavedGetsNotice: !!notice,
    };
  });
const categoryCounts = new Map<string, number>();
for (const row of rows)
  for (const category of row.getsCategories as string[])
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
const inventory = {
  capturedAt: new Date().toISOString(),
  opportunityCount: rows.length,
  savedGetsNotices: notices.length,
  missingSavedGetsNotice: rows
    .filter((r) => /^\d{5,12}$/.test(r.rfxId ?? "") && !r.hasSavedGetsNotice)
    .map((r) => r.rfxId),
  rawGetsCategories: [...categoryCounts].sort((a, b) => b[1] - a[1]),
  rows,
};
if (mode === "inventory") {
  if (args.taxonomy) {
    const proposed = z
      .array(z.object({ name: z.string(), keywords: z.array(z.string()) }))
      .parse(JSON.parse(await readFile(args.taxonomy, "utf8")));
    const sectors = proposed.map((sector) => ({ ...sector, id: sector.name }));
    const counts = new Map<string, number>();
    const preview = rows.map((row) => {
      const contextualMatch = classifySavedOpportunity({
        title: row.title,
        overview: typeof row.overview === "string" ? row.overview : null,
        getsCategories: row.getsCategories as string[],
        availableSectors: sectors.map((sector) => sector.name),
      });
      const ownerMatch = contextualMatch
        ? null
        : chooseSector(sectors, row.title);
      const match =
        contextualMatch ??
        (ownerMatch
          ? {
              sector: ownerMatch.sector.name,
              field: "title" as const,
              match: ownerMatch.keyword,
            }
          : null);
      const name = match?.sector ?? "Unknown";
      counts.set(name, (counts.get(name) ?? 0) + 1);
      return {
        ...row,
        proposedSector: name,
        classificationEvidence: match ?? null,
      };
    });
    Object.assign(inventory, {
      rows: preview,
      proposalCounts: [...counts].sort((a, b) => b[1] - a[1]),
    });
  }
  await writeFile(args.output, JSON.stringify(inventory, null, 2), {
    mode: 0o600,
  });
  console.log(
    `Inventoried ${rows.length} opportunities, ${notices.length} saved GETS notices, ${categoryCounts.size} raw categories`,
  );
} else {
  if (!db || !args.taxonomy || !args.account)
    throw new Error(
      "Apply requires --account and --taxonomy against the configured database",
    );
  const expected = Number(args.expect ?? rows.length);
  if (
    rows.length !== expected ||
    notices.length !==
      rows.filter((r) => /^\d{5,12}$/.test(r.rfxId ?? "")).length
  )
    throw new Error(
      `Inventory mismatch: ${rows.length} opportunities, ${notices.length} saved notices; expected ${expected} opportunities`,
    );
  const approved = z
    .array(z.object({ name: z.string(), keywords: z.array(z.string()) }))
    .min(1)
    .parse(JSON.parse(await readFile(args.taxonomy, "utf8")));
  const existing = await db.query(
    "SELECT id,name,keywords,status FROM groundwork_sectors WHERE account_id=$1",
    [args.account],
  );
  const byName = new Map(existing.rows.map((s) => [s.name.toLowerCase(), s]));
  for (const sector of approved) {
    const current = byName.get(sector.name.toLowerCase());
    // The checked-in baseline seeds missing sectors. Subsequent runs must not
    // overwrite a person's edited keywords or resurrect archived sectors.
    if (!current) await createSector(db, args.account, sector);
  }
  let attempted = 0,
    classified = 0,
    unknown = 0,
    failed = 0;
  for (let batch = 0; batch < Math.ceil(rows.length / 25) + 1; batch++) {
    const result = await backfillSectors(db, args.account, 25);
    attempted += result.attempted ?? 0;
    classified += result.classified;
    unknown += result.unknown;
    failed += result.failed;
    if (
      !result.remaining ||
      !result.attempted ||
      result.failed === result.attempted
    )
      break;
  }
  const summary = {
    inventory: rows.length,
    savedGetsNotices: notices.length,
    attempted,
    classified,
    unknown,
    failed,
    assignments: (
      await db.query(
        `SELECT coalesce(s.name,'Unknown') AS sector,count(*)::int AS count FROM opportunities o
       LEFT JOIN opportunity_sectors a ON a.opportunity_id=o.id AND a.account_id=o.account_id
       LEFT JOIN groundwork_sectors s ON s.id=a.sector_id AND s.account_id=a.account_id
       WHERE o.account_id=$1 AND o.archived_at IS NULL AND o.metadata->>'provenance' IS DISTINCT FROM 'synthetic' GROUP BY coalesce(s.name,'Unknown') ORDER BY count DESC`,
        [args.account],
      )
    ).rows,
  };
  await writeFile(args.output, JSON.stringify(summary, null, 2), {
    mode: 0o600,
  });
  console.log(JSON.stringify(summary));
}
await db?.end();
