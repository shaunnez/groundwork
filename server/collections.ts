import { randomUUID } from "node:crypto";
import type { Database } from "./db.ts";
import { transaction } from "./db.ts";
import { hash } from "./storage.ts";
import { materialise, reportFreshness } from "./operations.ts";
export type CollectionKind = "watchlist" | "weekly";
export interface CollectionItem {
  opportunityId: string;
  title: string;
  buyer: string;
  reportId: string | null;
  intelligenceId: string | null;
  cutoff: string;
  provenance: string;
  state: "assessed" | "needs-assessment";
}
export interface CollectionPayload {
  version: "1";
  kind: CollectionKind;
  periodStart: string;
  scope: string;
  clientId: string | null;
  items: CollectionItem[];
  limitations: string[];
}
function period(kind: CollectionKind, now: Date) {
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  if (kind === "weekly")
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}
export async function createCollection(
  db: Database,
  accountId: string,
  kind: CollectionKind,
  clientId: string | null,
  now = new Date(),
) {
  if (
    clientId &&
    !(
      await db.query("SELECT id FROM clients WHERE id=$1 AND account_id=$2", [
        clientId,
        accountId,
      ])
    ).rowCount
  )
    throw new Error("Client not found");
  const opportunities = (
    await db.query(
      "SELECT * FROM opportunities WHERE account_id=$1 AND archived_at IS NULL AND ($2::uuid IS NULL OR client_id=$2) ORDER BY id",
      [accountId, clientId],
    )
  ).rows;
  if (!opportunities.length)
    throw new Error("No tracked opportunities in this scope");
  if (opportunities.length > 50)
    throw new Error(
      "Local collection limit is 50 tracked opportunities; choose a client scope",
    );
  const items: CollectionItem[] = [];
  for (const o of opportunities) {
    const p = (
      await db.query(
        "SELECT id,intelligence_id,payload->>'cutoff' AS cutoff FROM reports WHERE account_id=$1 AND opportunity_id=$2 AND kind='pursuit' ORDER BY created_at DESC LIMIT 1",
        [accountId, o.id],
      )
    ).rows[0];
    const derived = p ? await materialise(db, accountId, p.id, kind) : null;
    items.push({
      opportunityId: o.id,
      title: o.title,
      buyer: o.buyer,
      reportId: derived?.id ?? null,
      intelligenceId: p?.intelligence_id ?? null,
      cutoff: p?.cutoff ?? o.cutoff,
      provenance: o.metadata.provenance,
      state: p ? "assessed" : "needs-assessment",
    });
  }
  const periodStart = period(kind, now);
  const payload: CollectionPayload = {
    version: "1",
    kind,
    periodStart,
    scope: clientId
      ? "Selected client tracked opportunities"
      : "All tracked opportunities in this internal account",
    clientId,
    items,
    limitations: [
      "Each item retains its own assessment cutoff and exact immutable report; compiling this collection performs no new analysis.",
      "Changes, actions and collection questions come from the accepted notice-level assessments. No market trend or shared supplier identity is inferred across notices.",
      "Unassessed opportunities remain individually visible and block delivery of a fully assessed collection.",
    ],
  };
  const inputHash = hash(JSON.stringify(payload));
  return transaction(db, async (c) => {
    const id = randomUUID();
    const saved = await c.query(
      "INSERT INTO collections(id,account_id,client_id,kind,period_start,input_hash,payload) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(account_id,kind,input_hash) DO NOTHING RETURNING id",
      [id, accountId, clientId, kind, periodStart, inputHash, payload],
    );
    if (!saved.rowCount)
      return {
        id: (
          await c.query(
            "SELECT id FROM collections WHERE account_id=$1 AND kind=$2 AND input_hash=$3",
            [accountId, kind, inputHash],
          )
        ).rows[0].id,
        reused: true,
      };
    for (const item of items)
      if (item.reportId)
        await c.query(
          "INSERT INTO collection_items(collection_id,account_id,report_id) VALUES($1,$2,$3)",
          [id, accountId, item.reportId],
        );
    return { id, reused: false };
  });
}
export async function readCollection(
  db: Pick<Database, "query">,
  accountId: string,
  id: string,
) {
  const result = await db.query<{
    id: string;
    account_id: string;
    client_id: string | null;
    kind: CollectionKind;
    period_start: string;
    input_hash: string;
    created_at: Date;
    payload: CollectionPayload;
  }>("SELECT * FROM collections WHERE id=$1 AND account_id=$2", [
    id,
    accountId,
  ]);
  if (!result.rowCount) throw new Error("Collection not found");
  const row = result.rows[0],
    payload = row.payload as CollectionPayload;
  const current = (
    await db.query(
      "SELECT id FROM opportunities WHERE account_id=$1 AND archived_at IS NULL AND ($2::uuid IS NULL OR client_id=$2) ORDER BY id",
      [accountId, payload.clientId],
    )
  ).rows.map((o) => o.id);
  const scopeChanged =
    JSON.stringify(current) !==
    JSON.stringify(payload.items.map((i) => i.opportunityId));
  const items = await Promise.all(
    payload.items.map(async (item) => {
      if (!item.reportId) return { ...item, report: null, freshness: null };
      const report = (
        await db.query(
          "SELECT id,kind,payload FROM reports WHERE id=$1 AND account_id=$2",
          [item.reportId, accountId],
        )
      ).rows[0];
      return {
        ...item,
        report: report ?? null,
        freshness: report
          ? await reportFreshness(db, accountId, item.reportId)
          : null,
      };
    }),
  );
  return {
    ...row,
    payload,
    items,
    stale: scopeChanged || items.some((i) => i.freshness?.stale),
    scopeChanged,
    readyForInternalDelivery:
      !scopeChanged &&
      items.every(
        (i) =>
          i.report &&
          i.freshness &&
          !i.freshness.stale &&
          i.freshness.reviewState === "approved" &&
          i.freshness.upstreamReviewState === "approved",
      ),
  };
}
export async function deliverCollection(
  db: Database,
  accountId: string,
  id: string,
) {
  return transaction(db, async (c) => {
    const collection = (
      await c.query(
        "SELECT payload FROM collections WHERE id=$1 AND account_id=$2",
        [id, accountId],
      )
    ).rows[0];
    if (!collection) throw new Error("Collection not found");
    const payload = collection.payload as CollectionPayload;
    // Same row locks used by ingestion, report save, reviews and single-report delivery.
    await c.query(
      "SELECT id FROM opportunities WHERE account_id=$1 AND archived_at IS NULL AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE",
      [accountId, payload.items.map((i) => i.opportunityId)],
    );
    const state = await readCollection(c, accountId, id);
    if (!state.readyForInternalDelivery)
      throw new Error(
        "Every included assessment and underlying pursuit must be current and approved; unassessed notices or scope changes block collection delivery",
      );
    const saved = await c.query(
      "INSERT INTO collection_deliveries(id,account_id,collection_id,channel) VALUES($1,$2,$3,'local') ON CONFLICT(collection_id) DO NOTHING RETURNING id",
      [randomUUID(), accountId, id],
    );
    return {
      ok: true,
      reused: !saved.rowCount,
      channel: "local",
      customerPublication: false,
    };
  });
}
