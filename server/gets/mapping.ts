import { randomUUID } from "node:crypto";
import * as cheerio from "cheerio";
import type pg from "pg";
import { z } from "zod";
import { transaction, type Database } from "../db.ts";
import type { ObjectStore } from "../storage.ts";
import { parseGetsDetail, type GetsNoticeFields } from "./parser.ts";

export const GETS_MAPPING_VERSION = "gets-fields-v2";
const Keys = [
  "rfxId",
  "title",
  "buyer",
  "noticeType",
  "status",
  "openedAt",
  "closesAt",
  "category",
  "region",
  "overview",
] as const;
export type MappingKey = (typeof Keys)[number];
type Trace = Record<
  MappingKey,
  {
    sourceLabel: string;
    sourceLocation: string;
    rawText: string | null;
    parsedValue: string | null;
    displayedValue: string | null;
    rule: string;
    ruleVersion: string;
    state:
      | "copied from source"
      | "normalized by rule"
      | "conflicting"
      | "unresolved"
      | "human-verified";
    warnings: string[];
    humanOverride?: { value: string | null; reason: string };
  }
>;
const aliases: Record<Exclude<MappingKey, "rfxId" | "overview">, string[]> = {
  title: ["title", "tender title", "tender name"],
  buyer: ["purchaser", "buyer", "agency", "organisation", "organization"],
  noticeType: ["tender type", "notice type", "type"],
  status: ["status", "tender status"],
  openedAt: ["open date", "opening date", "published date"],
  closesAt: ["close date", "closing date", "deadline"],
  category: ["categories", "category"],
  region: ["regions", "region"],
};
function projection(
  fields: GetsNoticeFields,
): Record<MappingKey, string | null> {
  return {
    rfxId: fields.rfxId,
    title: fields.title,
    buyer: fields.buyer,
    noticeType: fields.noticeType,
    status: fields.status,
    openedAt: fields.openedAt,
    closesAt: fields.closesAt,
    category: fields.categories[0] ?? null,
    region: fields.regions[0] ?? null,
    overview: fields.overview,
  };
}
export function buildMappingTrace(html: string, fields: GetsNoticeFields) {
  const $ = cheerio.load(html);
  const rows: {
    label: string;
    normalized: string;
    rawText: string;
    location: string;
  }[] = [];
  $("tr").each((index, row) => {
    const cells = $(row).children("th,td");
    if (cells.length < 2) return;
    const label = $(cells[0]).text().trim();
    rows.push({
      label,
      normalized: label
        .toLowerCase()
        .replace(/[^a-z ]/g, "")
        .trim(),
      rawText: $(cells[1]).text(),
      location: `Detail row ${index + 1}`,
    });
  });
  $("dt").each((index, term) => {
    const label = $(term).text().trim();
    rows.push({
      label,
      normalized: label
        .toLowerCase()
        .replace(/[^a-z ]/g, "")
        .trim(),
      rawText: $(term).next("dd").text(),
      location: `Detail term ${index + 1}`,
    });
  });
  const values = projection(fields);
  const trace = {} as Trace;
  const flags: string[] = [];
  for (const key of Keys) {
    const candidates =
      key === "rfxId"
        ? []
        : rows.filter((row) =>
            (aliases as Record<string, string[]>)[key]?.includes(
              row.normalized,
            ),
          );
    const selected =
      candidates.find((row) => row.rawText.trim()) ?? candidates[0];
    let sourceLabel = selected?.label ?? "";
    let sourceLocation = selected?.location ?? "";
    let rawText: string | null = selected?.rawText ?? null;
    if (key === "rfxId") {
      sourceLabel = "URL id";
      sourceLocation = "GETS detail URL";
      rawText = new URL(fields.url).searchParams.get("id");
    }
    if (key === "title" && !rawText) {
      sourceLabel = "Page heading";
      sourceLocation = "First h1";
      rawText = $("h1").first().text() || null;
    }
    if (key === "buyer" && !rawText) {
      sourceLabel = "Buyer breadcrumb";
      sourceLocation = "GETS breadcrumb";
      rawText = $("#theDrill a").eq(1).text() || null;
    }
    if (key === "overview" && !rawText) {
      const heading = $("h2,h3,h4,.legend")
        .filter((_, node) => $(node).text().trim().toLowerCase() === "overview")
        .first();
      sourceLabel = "Overview";
      sourceLocation = "Overview section";
      rawText =
        $(".overview").first().text() ||
        (heading.is(".legend")
          ? heading.parent().next("p")
          : heading.next("p,div")
        ).text() ||
        null;
    }
    const distinct = new Set(
      candidates
        .map((row) => row.rawText.replace(/\s+/g, " ").trim())
        .filter(Boolean),
    );
    const conflict = distinct.size > 1;
    const parsedValue = values[key];
    const missing = !rawText?.trim() || !parsedValue;
    const warnings = [
      ...(conflict ? [`Multiple conflicting GETS values for ${key}`] : []),
      ...(missing ? [`${key} missing or unresolved`] : []),
    ];
    const state = conflict
      ? "conflicting"
      : missing
        ? "unresolved"
        : rawText!.replace(/\s+/g, " ").trim() === parsedValue
          ? "copied from source"
          : "normalized by rule";
    trace[key] = {
      sourceLabel,
      sourceLocation,
      rawText,
      parsedValue,
      displayedValue: parsedValue,
      rule:
        key === "openedAt" || key === "closesAt"
          ? "GETS date with explicit NZ offset"
          : key === "category" || key === "region"
            ? "first listed value"
            : "GETS detail parser",
      ruleVersion: GETS_MAPPING_VERSION,
      state,
      warnings,
    };
    flags.push(...warnings);
  }
  if (
    /\bbridge|roadworks|civil works\b/i.test(
      `${fields.title} ${fields.overview}`,
    ) &&
    /\bsoftware|information technology|computer\b/i.test(
      fields.categories.join(" "),
    )
  )
    flags.push("GETS category may conflict with civil construction scope");
  flags.push(...fields.warnings);
  return { trace, projection: values, flags: [...new Set(flags)] };
}

export async function saveInitialMapping(
  c: pg.PoolClient,
  accountId: string,
  noticeId: string,
  revisionId: string,
  html: string,
  fields: GetsNoticeFields,
) {
  const mapping = buildMappingTrace(html, fields);
  await c.query(
    "INSERT INTO gets_mapping_versions(id,account_id,notice_id,revision_id,version,trace,projection,flags,review_state) VALUES($1,$2,$3,$4,1,$5,$6,$7,'pending')",
    [
      randomUUID(),
      accountId,
      noticeId,
      revisionId,
      mapping.trace,
      mapping.projection,
      JSON.stringify(mapping.flags),
    ],
  );
}

export async function carryForwardOverrides(
  c: pg.PoolClient,
  accountId: string,
  previousRevisionId: string | null,
  revisionId: string,
) {
  const next = await c.query(
    "SELECT * FROM gets_mapping_versions WHERE revision_id=$1 AND account_id=$2 ORDER BY version DESC LIMIT 1",
    [revisionId, accountId],
  );
  if (!next.rowCount || !previousRevisionId)
    return next.rows[0]?.projection as Record<MappingKey, string | null>;
  const prior = await c.query(
    "SELECT * FROM gets_mapping_versions WHERE revision_id=$1 AND account_id=$2 ORDER BY version DESC LIMIT 1",
    [previousRevisionId, accountId],
  );
  if (!prior.rowCount)
    return next.rows[0].projection as Record<MappingKey, string | null>;
  const trace = structuredClone(next.rows[0].trace) as Trace;
  const projection = structuredClone(next.rows[0].projection) as Record<
    MappingKey,
    string | null
  >;
  const flags = [...next.rows[0].flags] as string[];
  let carried = false;
  for (const key of Keys) {
    const override = (prior.rows[0].trace as Trace)[key]?.humanOverride;
    if (!override) continue;
    carried = true;
    projection[key] = override.value;
    trace[key] = {
      ...trace[key],
      displayedValue: override.value,
      state: "conflicting",
      humanOverride: override,
      warnings: [
        ...trace[key].warnings,
        "Prior human correction carried forward; review against changed GETS notice",
      ],
    };
    flags.push(`${key} prior human correction requires review`);
  }
  if (carried)
    await c.query(
      "INSERT INTO gets_mapping_versions(id,account_id,notice_id,revision_id,version,trace,projection,flags,review_state,reason) VALUES($1,$2,$3,$4,2,$5,$6,$7,'pending','Prior human corrections carried forward for review')",
      [
        randomUUID(),
        accountId,
        next.rows[0].notice_id,
        revisionId,
        trace,
        projection,
        JSON.stringify(flags),
      ],
    );
  return projection;
}

export async function backfillMappings(
  db: Database,
  store: ObjectStore,
  accountId: string,
  limit: number,
) {
  const rows = await db.query(
    `SELECT n.id AS notice_id,r.id AS revision_id,r.raw_ref,r.fields,m.version,m.trace
     FROM gets_notices n JOIN gets_notice_revisions r ON r.id=n.current_revision_id AND r.account_id=n.account_id
     LEFT JOIN LATERAL (SELECT version,trace FROM gets_mapping_versions WHERE revision_id=r.id ORDER BY version DESC LIMIT 1) m ON true
     WHERE n.account_id=$1 AND (m.version IS NULL OR m.trace->'overview'->>'ruleVersion' IS DISTINCT FROM $3)
     ORDER BY n.rfx_id LIMIT $2`,
    [accountId, Math.min(25, Math.max(1, limit)), GETS_MAPPING_VERSION],
  );
  let created = 0,
    failed = 0;
  for (const row of rows.rows) {
    try {
      const html = (await store.get(accountId, row.raw_ref)).toString("utf8");
      await transaction(db, async (c) => {
        if (!row.version)
          return saveInitialMapping(
            c,
            accountId,
            row.notice_id,
            row.revision_id,
            html,
            row.fields,
          );
        const mapping = buildMappingTrace(html, row.fields);
        const prior = row.trace as Trace;
        for (const key of Keys) {
          const override = prior[key]?.humanOverride;
          if (!override) continue;
          mapping.trace[key].humanOverride = override;
          mapping.trace[key].displayedValue = override.value;
          mapping.trace[key].state = "conflicting";
          mapping.trace[key].warnings.push(
            "Human correction retained; review after mapping rule update",
          );
          mapping.projection[key] = override.value;
          mapping.flags.push(`${key} human correction requires review`);
        }
        await c.query(
          "INSERT INTO gets_mapping_versions(id,account_id,notice_id,revision_id,version,trace,projection,flags,review_state,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending','Mapping rules updated')",
          [
            randomUUID(),
            accountId,
            row.notice_id,
            row.revision_id,
            row.version + 1,
            mapping.trace,
            mapping.projection,
            JSON.stringify([...new Set(mapping.flags)]),
          ],
        );
      });
      created++;
    } catch {
      failed++;
    }
  }
  const remaining = await db.query(
    `SELECT count(*)::int AS n FROM gets_notices n JOIN gets_notice_revisions r ON r.id=n.current_revision_id
     LEFT JOIN LATERAL (SELECT version,trace FROM gets_mapping_versions WHERE revision_id=r.id ORDER BY version DESC LIMIT 1) m ON true
     WHERE n.account_id=$1 AND (m.version IS NULL OR m.trace->'overview'->>'ruleVersion' IS DISTINCT FROM $2)`,
    [accountId, GETS_MAPPING_VERSION],
  );
  return {
    attempted: rows.rowCount,
    created,
    failed,
    remaining: remaining.rows[0].n as number,
  };
}

export async function mappingQueue(
  db: Database,
  accountId: string,
  filter: string,
  page: number,
) {
  const rows = await db.query(
    `SELECT n.id AS notice_id,n.rfx_id,n.opportunity_id,r.id AS revision_id,r.fields,r.retrieved_at,a.sector_id AS groundwork_sector_id,
            m.id AS mapping_id,m.version,m.trace,m.projection,m.flags,m.review_state,
            EXISTS (SELECT 1 FROM gets_notice_revisions old WHERE old.notice_id=n.id AND old.id<>r.id) AS changed
     FROM gets_notices n JOIN gets_notice_revisions r ON r.id=n.current_revision_id AND r.account_id=n.account_id
     LEFT JOIN opportunity_sectors a ON a.opportunity_id=n.opportunity_id AND a.account_id=n.account_id
     LEFT JOIN LATERAL (SELECT * FROM gets_mapping_versions WHERE revision_id=r.id ORDER BY version DESC LIMIT 1) m ON true
     WHERE n.account_id=$1 ORDER BY n.rfx_id DESC LIMIT 1000`,
    [accountId],
  );
  const selected = rows.rows.filter((row) => {
    const flags = row.flags as string[] | null;
    switch (filter) {
      case "missing":
        return (
          !row.mapping_id || flags?.some((f) => /missing|unresolved/i.test(f))
        );
      case "changed":
        return row.changed;
      case "conflicting":
        return flags?.some((f) => /conflict/i.test(f));
      case "unusual":
        return flags?.some((f) =>
          /may conflict|format|timezone|not located/i.test(f),
        );
      case "reviewed":
        return row.review_state === "reviewed";
      case "unknown-sector":
        return row.groundwork_sector_id == null;
      default:
        return true;
    }
  });
  return {
    total: selected.length,
    page,
    pageSize: 25,
    rows: selected.slice((page - 1) * 25, page * 25),
  };
}

export async function correctMapping(
  db: Database,
  accountId: string,
  revisionId: string,
  actorId: string,
  input: unknown,
) {
  const { field, value, reason } = z
    .object({
      field: z
        .enum(Keys)
        .refine(
          (v) => v !== "rfxId",
          "RFx identity must be resolved by notice reconciliation",
        ),
      value: z.string().trim().max(5000).nullable(),
      reason: z.string().trim().min(10).max(1000),
    })
    .strict()
    .parse(input);
  if (["title", "buyer"].includes(field) && !value)
    throw new Error("Title and buyer cannot be empty");
  if (
    ["openedAt", "closesAt"].includes(field) &&
    value &&
    Number.isNaN(Date.parse(value))
  )
    throw new Error("Date correction needs an ISO timestamp with offset");
  return transaction(db, async (c) => {
    const current = await c.query(
      `SELECT m.*,n.opportunity_id FROM gets_mapping_versions m JOIN gets_notices n ON n.id=m.notice_id AND n.account_id=m.account_id WHERE m.revision_id=$1 AND m.account_id=$2 ORDER BY m.version DESC LIMIT 1 FOR UPDATE OF m`,
      [revisionId, accountId],
    );
    if (!current.rowCount)
      throw new Error("Mapping version not found; backfill this notice first");
    const row = current.rows[0];
    const trace = structuredClone(row.trace) as Trace;
    const next = structuredClone(row.projection) as Record<
      MappingKey,
      string | null
    >;
    next[field] = value;
    trace[field] = {
      ...trace[field],
      displayedValue: value,
      state: "human-verified",
      humanOverride: { value, reason },
    };
    const flags = (row.flags as string[]).filter(
      (f) => !f.startsWith(`${field} missing`),
    );
    await c.query(
      "INSERT INTO gets_mapping_versions(id,account_id,notice_id,revision_id,version,trace,projection,flags,review_state,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'reviewed',$9,$10)",
      [
        randomUUID(),
        accountId,
        row.notice_id,
        revisionId,
        row.version + 1,
        trace,
        next,
        JSON.stringify(flags),
        actorId,
        reason,
      ],
    );
    const opp = await c.query(
      "SELECT metadata FROM opportunities WHERE id=$1 AND account_id=$2 FOR UPDATE",
      [row.opportunity_id, accountId],
    );
    if (
      opp.rowCount &&
      ["gets-intake", "gets-fixture"].includes(opp.rows[0].metadata.origin)
    ) {
      const metadata = {
        ...opp.rows[0].metadata,
        ...(field === "category" ? { category: value ?? "unspecified" } : {}),
        ...(field === "region" ? { regions: value ? [value] : [] } : {}),
        ...(field === "closesAt"
          ? { closingAt: value, dateStatus: value ? "known" : "not_published" }
          : {}),
        ...(field === "openedAt" ? { openedAt: value } : {}),
        ...(field === "overview" ? { overview: value } : {}),
        ...(field === "noticeType" ? { noticeType: value } : {}),
        ...(field === "status" ? { status: value } : {}),
      };
      await c.query(
        "UPDATE opportunities SET title=$3,buyer=$4,metadata=$5 WHERE id=$1 AND account_id=$2",
        [
          row.opportunity_id,
          accountId,
          field === "title" ? value : opp.rows[0].metadata.title,
          field === "buyer" ? value : opp.rows[0].metadata.buyer,
          metadata,
        ],
      );
    }
    return { version: row.version + 1 };
  });
}

export async function markMappingReviewed(
  db: Database,
  accountId: string,
  revisionId: string,
  actorId: string,
  reason: string,
) {
  return transaction(db, async (c) => {
    const row = await c.query(
      "SELECT * FROM gets_mapping_versions WHERE revision_id=$1 AND account_id=$2 ORDER BY version DESC LIMIT 1 FOR UPDATE",
      [revisionId, accountId],
    );
    if (!row.rowCount) throw new Error("Mapping version not found");
    await c.query(
      "INSERT INTO gets_mapping_versions(id,account_id,notice_id,revision_id,version,trace,projection,flags,review_state,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'reviewed',$9,$10)",
      [
        randomUUID(),
        accountId,
        row.rows[0].notice_id,
        revisionId,
        row.rows[0].version + 1,
        row.rows[0].trace,
        row.rows[0].projection,
        JSON.stringify(row.rows[0].flags),
        actorId,
        z.string().trim().min(10).max(1000).parse(reason),
      ],
    );
    return { version: row.rows[0].version + 1 };
  });
}
