import { randomUUID } from "node:crypto";
import type pg from "pg";
import { z } from "zod";
import { transaction, type Database } from "./db.ts";
import { classifySavedOpportunity } from "./sector-classifier.ts";

export const SECTOR_CLASSIFIER_VERSION = "gets-context-rules-v4";
const sectorInput = z
  .object({
    name: z.string().trim().min(3).max(80),
    keywords: z.array(z.string().trim().min(4).max(80)).max(12).default([]),
  })
  .strict();
async function version(c: pg.PoolClient, accountId: string) {
  await c.query(
    "INSERT INTO sector_taxonomy(account_id) VALUES($1) ON CONFLICT DO NOTHING",
    [accountId],
  );
  const result = await c.query(
    "SELECT version FROM sector_taxonomy WHERE account_id=$1 FOR UPDATE",
    [accountId],
  );
  return result.rows[0].version as number;
}
async function bump(c: pg.PoolClient, accountId: string) {
  await version(c, accountId);
  const result = await c.query(
    "UPDATE sector_taxonomy SET version=version+1,updated_at=now() WHERE account_id=$1 RETURNING version",
    [accountId],
  );
  return result.rows[0].version as number;
}
export async function createSector(
  db: Database,
  accountId: string,
  input: unknown,
) {
  const parsed = sectorInput.parse(input);
  return transaction(db, async (c) => {
    const taxonomyVersion = await bump(c, accountId);
    const id = randomUUID();
    await c.query(
      "INSERT INTO groundwork_sectors(id,account_id,name,keywords,status) VALUES($1,$2,$3,$4,'active')",
      [
        id,
        accountId,
        parsed.name,
        [...new Set(parsed.keywords.map((word) => word.toLowerCase()))],
      ],
    );
    return { id, taxonomyVersion };
  });
}
export async function editSector(
  db: Database,
  accountId: string,
  sectorId: string,
  input: unknown,
) {
  const parsed = z
    .object({ ...sectorInput.shape, archived: z.boolean() })
    .strict()
    .parse(input);
  return transaction(db, async (c) => {
    const taxonomyVersion = await bump(c, accountId);
    const result = await c.query(
      "UPDATE groundwork_sectors SET name=$3,keywords=$4,status=$5,updated_at=now() WHERE id=$1 AND account_id=$2 RETURNING id",
      [
        sectorId,
        accountId,
        parsed.name,
        [...new Set(parsed.keywords.map((word) => word.toLowerCase()))],
        parsed.archived ? "archived" : "active",
      ],
    );
    if (!result.rowCount) throw new Error("Sector not found");
    return { id: sectorId, taxonomyVersion };
  });
}
export async function sectorSettings(db: Database, accountId: string) {
  const [taxonomy, sectors, assignments] = await Promise.all([
    db.query(
      "SELECT version,updated_at FROM sector_taxonomy WHERE account_id=$1",
      [accountId],
    ),
    db.query(
      "SELECT s.*,count(o.id)::int AS assigned_count FROM groundwork_sectors s LEFT JOIN opportunity_sectors a ON a.sector_id=s.id AND a.account_id=s.account_id LEFT JOIN opportunities o ON o.id=a.opportunity_id AND o.account_id=a.account_id AND o.archived_at IS NULL WHERE s.account_id=$1 GROUP BY s.id ORDER BY s.status,s.name",
      [accountId],
    ),
    db.query(
      "SELECT a.*,o.title,o.notice_id,n.rfx_id FROM opportunity_sectors a JOIN opportunities o ON o.id=a.opportunity_id AND o.account_id=a.account_id LEFT JOIN gets_notices n ON n.opportunity_id=o.id AND n.account_id=o.account_id WHERE a.account_id=$1 AND o.archived_at IS NULL ORDER BY a.updated_at DESC LIMIT 1000",
      [accountId],
    ),
  ]);
  const inventory = await db.query(
    "SELECT count(*)::int AS total FROM opportunities WHERE account_id=$1 AND archived_at IS NULL",
    [accountId],
  );
  return {
    taxonomyVersion: taxonomy.rows[0]?.version ?? 1,
    sectors: sectors.rows,
    assignments: assignments.rows,
    totalOpportunities: inventory.rows[0].total as number,
  };
}
export function chooseSector(
  sectors: { id: string; name: string; keywords: string[] }[],
  title: string,
) {
  const text = title.toLowerCase();
  const matches = sectors.flatMap((sector) => {
    const keyword = sector.keywords.find((word) => {
      const position = text.indexOf(word.toLowerCase());
      if (position < 0) return false;
      const before = text[position - 1],
        after = text[position + word.length];
      return (
        (!before || !/[a-z0-9]/.test(before)) &&
        (!after || !/[a-z0-9]/.test(after))
      );
    });
    return keyword ? [{ sector, keyword }] : [];
  });
  return matches.length === 1 ? matches[0] : null;
}
export async function classifyOpportunity(
  c: pg.PoolClient,
  accountId: string,
  opportunityId: string,
  revisionId: string | null,
  title: string,
  overview: string | null,
) {
  const taxonomyVersion = await version(c, accountId);
  const prior = await c.query(
    "SELECT * FROM opportunity_sectors WHERE account_id=$1 AND opportunity_id=$2 FOR UPDATE",
    [accountId, opportunityId],
  );
  if (prior.rows[0]?.method === "person")
    return {
      method: "person" as const,
      sectorId: prior.rows[0].sector_id as string | null,
    };
  if (
    prior.rows[0]?.notice_revision_id === revisionId &&
    prior.rows[0]?.taxonomy_version === taxonomyVersion &&
    prior.rows[0]?.classifier_version === SECTOR_CLASSIFIER_VERSION
  )
    return {
      method: prior.rows[0].method as string,
      sectorId: prior.rows[0].sector_id as string | null,
    };
  const available = await c.query(
    "SELECT id,name,keywords FROM groundwork_sectors WHERE account_id=$1 AND status='active'",
    [accountId],
  );
  const saved = revisionId
    ? await c.query(
        "SELECT fields FROM gets_notice_revisions WHERE id=$1 AND account_id=$2",
        [revisionId, accountId],
      )
    : null;
  const categories = saved?.rows[0]?.fields?.categories;
  const contextualMatch = classifySavedOpportunity({
    title,
    overview: saved?.rows[0]?.fields?.overview ?? overview,
    getsCategories: Array.isArray(categories) ? categories : [],
    availableSectors: available.rows.map((row) => row.name),
  });
  const ownerMatch = contextualMatch
    ? null
    : chooseSector(available.rows, title);
  const match =
    contextualMatch ??
    (ownerMatch
      ? {
          sector: ownerMatch.sector.name,
          field: "title" as const,
          match: ownerMatch.keyword,
        }
      : null);
  const sectorId =
    available.rows.find((row) => row.name === match?.sector)?.id ?? null;
  const method = match ? "rule" : "unknown";
  const reason = match
    ? `Saved ${match.field} contains “${match.match}”; classified as ${match.sector} by ${SECTOR_CLASSIFIER_VERSION}`
    : "Saved title, overview and GETS categories do not support a clear Groundwork sector; remains Unknown";
  const evidencePointer = revisionId
    ? `GETS notice revision ${revisionId}, ${match?.field ?? "fields"}`
    : `Opportunity ${match?.field ?? "title and overview"}`;
  await c.query(
    `INSERT INTO opportunity_sectors(account_id,opportunity_id,sector_id,method,classifier_version,taxonomy_version,notice_revision_id,reason,evidence_pointer)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT(account_id,opportunity_id) DO UPDATE SET sector_id=EXCLUDED.sector_id,method=EXCLUDED.method,classifier_version=EXCLUDED.classifier_version,taxonomy_version=EXCLUDED.taxonomy_version,notice_revision_id=EXCLUDED.notice_revision_id,reason=EXCLUDED.reason,evidence_pointer=EXCLUDED.evidence_pointer,updated_at=now()
    WHERE opportunity_sectors.method<>'person'`,
    [
      accountId,
      opportunityId,
      sectorId,
      method,
      SECTOR_CLASSIFIER_VERSION,
      taxonomyVersion,
      revisionId,
      reason,
      evidencePointer,
    ],
  );
  await c.query(
    "INSERT INTO opportunity_sector_events(id,account_id,opportunity_id,sector_id,method,classifier_version,taxonomy_version,notice_revision_id,reason,evidence_pointer) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      randomUUID(),
      accountId,
      opportunityId,
      sectorId,
      method,
      SECTOR_CLASSIFIER_VERSION,
      taxonomyVersion,
      revisionId,
      reason,
      evidencePointer,
    ],
  );
  return { method, sectorId };
}
export async function correctSector(
  db: Database,
  accountId: string,
  opportunityId: string,
  actorId: string,
  input: unknown,
) {
  const { sectorId, reason } = z
    .object({
      sectorId: z.string().uuid().nullable(),
      reason: z.string().trim().min(10).max(1000),
    })
    .strict()
    .parse(input);
  return transaction(db, async (c) => {
    const opp = await c.query(
      "SELECT id FROM opportunities WHERE id=$1 AND account_id=$2 FOR UPDATE",
      [opportunityId, accountId],
    );
    if (!opp.rowCount) throw new Error("Opportunity not found");
    if (sectorId) {
      const sector = await c.query(
        "SELECT id FROM groundwork_sectors WHERE id=$1 AND account_id=$2 AND status='active'",
        [sectorId, accountId],
      );
      if (!sector.rowCount)
        throw new Error("Choose an active Groundwork sector");
    }
    const taxonomyVersion = await version(c, accountId);
    const notice = await c.query(
      "SELECT current_revision_id FROM gets_notices WHERE opportunity_id=$1 AND account_id=$2",
      [opportunityId, accountId],
    );
    const revisionId = notice.rows[0]?.current_revision_id ?? null;
    await c.query(
      `INSERT INTO opportunity_sectors(account_id,opportunity_id,sector_id,method,classifier_version,taxonomy_version,notice_revision_id,reason,evidence_pointer)
      VALUES($1,$2,$3,'person','manual-v1',$4,$5,$6,'Owner review')
      ON CONFLICT(account_id,opportunity_id) DO UPDATE SET sector_id=EXCLUDED.sector_id,method='person',classifier_version='manual-v1',taxonomy_version=EXCLUDED.taxonomy_version,notice_revision_id=EXCLUDED.notice_revision_id,reason=EXCLUDED.reason,evidence_pointer='Owner review',updated_at=now()`,
      [accountId, opportunityId, sectorId, taxonomyVersion, revisionId, reason],
    );
    await c.query(
      "INSERT INTO opportunity_sector_events(id,account_id,opportunity_id,sector_id,method,classifier_version,taxonomy_version,notice_revision_id,reason,evidence_pointer,actor_id) VALUES($1,$2,$3,$4,'person','manual-v1',$5,$6,$7,'Owner review',$8)",
      [
        randomUUID(),
        accountId,
        opportunityId,
        sectorId,
        taxonomyVersion,
        revisionId,
        reason,
        actorId,
      ],
    );
    return { sectorId, method: "person" };
  });
}
export async function backfillSectors(
  db: Database,
  accountId: string,
  limit: number,
) {
  const client = await db.connect();
  try {
    const taxonomyVersion = await version(client, accountId);
    const pending = await client.query(
      `SELECT o.id,o.title,o.metadata,n.current_revision_id
      FROM opportunities o LEFT JOIN opportunity_sectors a ON a.opportunity_id=o.id AND a.account_id=o.account_id
      LEFT JOIN gets_notices n ON n.opportunity_id=o.id AND n.account_id=o.account_id
      WHERE o.account_id=$1 AND o.archived_at IS NULL AND (a.opportunity_id IS NULL OR (a.method<>'person' AND (a.taxonomy_version<$2 OR a.classifier_version<>$4 OR a.notice_revision_id IS DISTINCT FROM n.current_revision_id)))
      ORDER BY o.id LIMIT $3`,
      [
        accountId,
        taxonomyVersion,
        Math.min(25, Math.max(1, limit)),
        SECTOR_CLASSIFIER_VERSION,
      ],
    );
    let classified = 0,
      unknown = 0,
      failed = 0;
    for (const row of pending.rows) {
      try {
        const result = await transaction(db, (c) =>
          classifyOpportunity(
            c,
            accountId,
            row.id,
            row.current_revision_id,
            row.title,
            row.metadata.overview ?? null,
          ),
        );
        if (result.sectorId) classified++;
        else unknown++;
      } catch {
        failed++;
      }
    }
    const summary = await client.query(
      `SELECT count(*)::int AS inventory,
      count(*) FILTER (WHERE a.method='person')::int AS manual,
      count(*) FILTER (WHERE a.opportunity_id IS NULL OR (a.method<>'person' AND (a.taxonomy_version<$2 OR a.classifier_version<>$3 OR a.notice_revision_id IS DISTINCT FROM n.current_revision_id)))::int AS remaining
      FROM opportunities o LEFT JOIN opportunity_sectors a ON a.opportunity_id=o.id AND a.account_id=o.account_id LEFT JOIN gets_notices n ON n.opportunity_id=o.id AND n.account_id=o.account_id WHERE o.account_id=$1 AND o.archived_at IS NULL`,
      [accountId, taxonomyVersion, SECTOR_CLASSIFIER_VERSION],
    );
    return {
      attempted: pending.rowCount,
      classified,
      unknown,
      failed,
      manuallyOverridden: summary.rows[0].manual,
      inventory: summary.rows[0].inventory,
      remaining: summary.rows[0].remaining,
    };
  } finally {
    client.release();
  }
}
