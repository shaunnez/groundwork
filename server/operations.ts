import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "./db.ts";
import { transaction } from "./db.ts";
import { compileDeliverable } from "./deliverables.ts";
import { research } from "./research.ts";
import { firecrawlSettings } from "./settings.ts";
import { ObjectStore } from "./storage.ts";
import type { Config } from "./config.ts";
export const DeliverableKind = z.enum(["watchlist", "competitor", "weekly"]);
export type DeliverableKind = z.infer<typeof DeliverableKind>;
export async function reportFreshness(
  db: Pick<Database, "query">,
  accountId: string,
  reportId: string,
) {
  const r = await db.query(
    `SELECT r.*,v.state AS review_state,run.manifest FROM reports r JOIN runs run ON run.id=r.run_id LEFT JOIN reviews v ON v.report_id=r.id WHERE r.id=$1 AND r.account_id=$2`,
    [reportId, accountId],
  );
  if (!r.rowCount) throw new Error("Report not found");
  const row = r.rows[0];
  const latest = await db.query(
    "SELECT id,intelligence_id FROM reports WHERE account_id=$1 AND opportunity_id=$2 AND kind='pursuit' ORDER BY created_at DESC LIMIT 1",
    [accountId, row.opportunity_id],
  );
  const src = await db.query(
    "SELECT id,hash FROM active_sources WHERE account_id=$1 AND opportunity_id=$2 ORDER BY id",
    [accountId, row.opportunity_id],
  );
  const manifest = row.manifest;
  const sourceChanged =
    JSON.stringify(src.rows.map((s) => s.id)) !==
      JSON.stringify(manifest.allSourceIds ?? manifest.sourceIds) ||
    JSON.stringify(src.rows.map((s) => s.hash)) !==
      JSON.stringify(manifest.allSourceHashes ?? manifest.sourceHashes);
  const upstream = await db.query(
    "SELECT v.state FROM reports r JOIN reviews v ON v.report_id=r.id WHERE r.intelligence_id=$1 AND r.kind='pursuit' AND r.account_id=$2",
    [row.intelligence_id, accountId],
  );
  return {
    stale:
      sourceChanged || latest.rows[0]?.intelligence_id !== row.intelligence_id,
    sourceChanged,
    latestPursuitId: latest.rows[0]?.id ?? null,
    reviewState: row.review_state,
    upstreamReviewState: upstream.rows[0]?.state ?? "pending",
  };
}
export async function materialise(
  db: Database,
  accountId: string,
  pursuitId: string,
  kind: DeliverableKind,
) {
  return transaction(db, async (c) => {
    const result = await c.query(
      "SELECT r.*,o.title,o.buyer,o.notice_id,o.metadata FROM reports r JOIN opportunities o ON o.id=r.opportunity_id WHERE r.id=$1 AND r.account_id=$2 AND r.kind='pursuit' FOR UPDATE OF o",
      [pursuitId, accountId],
    );
    if (!result.rowCount) throw new Error("Pursuit report not found");
    const r = result.rows[0];
    const existing = await c.query(
      "SELECT id FROM reports WHERE run_id=$1 AND kind=$2 AND account_id=$3",
      [r.run_id, kind, accountId],
    );
    if (existing.rowCount) return { id: existing.rows[0].id, reused: true };
    const parent = r.parent_report_id
      ? (
          await c.query(
            "SELECT id,payload FROM reports WHERE id=$1 AND account_id=$2",
            [r.parent_report_id, accountId],
          )
        ).rows[0]
      : null;
    const payload = compileDeliverable(kind, {
      reportId: r.id,
      intelligenceId: r.intelligence_id,
      opportunity: {
        id: r.opportunity_id,
        title: r.title,
        buyer: r.buyer,
        noticeId: r.notice_id,
        closingAt: r.metadata.closingAt ?? null,
      },
      payload: r.payload,
      previous: parent
        ? { reportId: parent.id, assessment: parent.payload.assessment }
        : null,
      generatedAt: new Date().toISOString(),
    });
    const id = randomUUID();
    await c.query(
      "INSERT INTO reports(id,account_id,opportunity_id,run_id,intelligence_id,kind,parent_report_id,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        accountId,
        r.opportunity_id,
        r.run_id,
        r.intelligence_id,
        kind,
        null,
        { ...r.payload, deliverable: payload, sourcePursuitId: r.id },
      ],
    );
    const inherited =
      (
        await c.query(
          "SELECT reasons FROM reviews WHERE report_id=$1 AND account_id=$2",
          [pursuitId, accountId],
        )
      ).rows[0]?.reasons ?? [];
    await c.query(
      "INSERT INTO reviews(id,account_id,report_id,state,reasons) VALUES($1,$2,$3,'pending',$4)",
      [
        randomUUID(),
        accountId,
        id,
        JSON.stringify([
          ...new Set([
            "Internal review required; local delivery only",
            ...inherited,
          ]),
        ]),
      ],
    );
    return { id, reused: false };
  });
}
export async function recordReview(
  db: Database,
  accountId: string,
  actorId: string,
  reportId: string,
  state: "approved" | "changes-requested",
  reason: string,
) {
  return transaction(db, async (c) => {
    const r = await c.query(
      "SELECT r.id FROM reports r JOIN opportunities o ON o.id=r.opportunity_id WHERE r.id=$1 AND r.account_id=$2 FOR UPDATE OF o",
      [reportId, accountId],
    );
    if (!r.rowCount) throw new Error("Report not found");
    const result = await c.query(
      "UPDATE reviews SET state=$3 WHERE report_id=$1 AND account_id=$2 RETURNING id",
      [reportId, accountId, state],
    );
    if (!result.rowCount) throw new Error("Review record missing");
    await c.query(
      "INSERT INTO review_events(id,account_id,report_id,actor_id,state,reason) VALUES($1,$2,$3,$4,$5,$6)",
      [randomUUID(), accountId, reportId, actorId, state, reason],
    );
    return { ok: true, publication: "internal-only" };
  });
}
export async function deliverLocal(
  db: Database,
  accountId: string,
  reportId: string,
) {
  return transaction(db, async (c) => {
    // Lock this opportunity so snapshot generation and delivery admission serialize.
    const r = await c.query(
      "SELECT o.id FROM reports r JOIN opportunities o ON o.id=r.opportunity_id WHERE r.id=$1 AND r.account_id=$2 FOR UPDATE OF o",
      [reportId, accountId],
    );
    if (!r.rowCount) throw new Error("Report not found");
    const freshness = await reportFreshness(c, accountId, reportId);
    if (freshness.stale)
      throw new Error(
        "New evidence or analysis is available; review the current version before delivery",
      );
    if (
      freshness.reviewState !== "approved" ||
      freshness.upstreamReviewState !== "approved"
    )
      throw new Error(
        "This deliverable and its underlying pursuit must both be approved for internal review delivery",
      );
    const key = `local:${accountId}:${reportId}`;
    const id = randomUUID();
    const saved = await c.query(
      "INSERT INTO deliveries(id,account_id,report_id,idempotency_key,channel) VALUES($1,$2,$3,$4,'local') ON CONFLICT(idempotency_key) DO NOTHING RETURNING id",
      [id, accountId, reportId, key],
    );
    return {
      ok: true,
      reused: !saved.rowCount,
      channel: "local",
      customerPublication: false,
    };
  });
}
export async function sampleWeekly(db: Database, now = new Date()) {
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  const week = day.toISOString().slice(0, 10);
  // Sample one locally delivered version per account per UTC week; never changes review state.
  await db.query(
    `WITH delivered AS (
      SELECT account_id,report_id,created_at,id FROM deliveries
      UNION ALL
      SELECT d.account_id,i.report_id,d.created_at,d.id FROM collection_deliveries d
      JOIN collection_items i ON i.collection_id=d.collection_id AND i.account_id=d.account_id
    ) INSERT INTO review_samples(id,account_id,report_id,week_start)
    SELECT gen_random_uuid(),d.account_id,d.report_id,$1::date FROM
    (SELECT DISTINCT ON(account_id) account_id,report_id FROM delivered
      WHERE created_at >= $1::date AND created_at < $1::date+interval '7 days'
      ORDER BY account_id,created_at,id,report_id) d
    ON CONFLICT(account_id,week_start) DO NOTHING`,
    [week],
  );
}
export async function scheduleTick(
  db: Database,
  config: Config,
  now = new Date(),
) {
  await db.query(
    "UPDATE schedule_ticks SET state='failed',result='{\"error\":\"Refresh interrupted; inspect provider receipts before replay\"}'::jsonb,finished_at=now() WHERE state='running' AND started_at < now()-interval '5 minutes'",
  );
  const claimed = await transaction(db, async (c) => {
    const r = await c.query(
      "SELECT * FROM schedules WHERE enabled AND next_at<=$1 ORDER BY next_at FOR UPDATE SKIP LOCKED LIMIT 1",
      [now],
    );
    if (!r.rowCount) return null;
    const schedule = r.rows[0];
    const inserted = await c.query(
      "INSERT INTO schedule_ticks(id,schedule_id,due_at,state) VALUES($1,$2,$3,'running') ON CONFLICT(schedule_id,due_at) DO NOTHING RETURNING id",
      [randomUUID(), schedule.id, schedule.next_at],
    );
    // Collapse missed intervals into one refresh; do not catch up with a burst of paid searches.
    await c.query(
      "UPDATE schedules SET next_at=$2::timestamptz+interval '1 hour'*interval_hours WHERE id=$1",
      [schedule.id, now],
    );
    return inserted.rowCount
      ? { ...schedule, tickId: inserted.rows[0].id }
      : null;
  });
  if (!claimed) return false;
  try {
    let leads: unknown = null;
    if (claimed.research_query) {
      leads = await research(
        db,
        new ObjectStore(config.storageRoot),
        claimed.account_id,
        claimed.research_query,
        await firecrawlSettings(db, config),
      );
      await db.query(
        "INSERT INTO searches(id,account_id,opportunity_id,query,result) VALUES($1,$2,$3,$4,$5)",
        [
          randomUUID(),
          claimed.account_id,
          claimed.opportunity_id,
          claimed.research_query,
          {
            scope: "scheduled bounded discovery; unverified leads only",
            result: leads,
          },
        ],
      );
    }
    const r = await db.query(
      "SELECT id FROM reports WHERE account_id=$1 AND opportunity_id=$2 AND kind='pursuit' ORDER BY created_at DESC LIMIT 1",
      [claimed.account_id, claimed.opportunity_id],
    );
    let result: unknown;
    if (!r.rowCount)
      result = {
        state: "needs-assessment",
        leadsFound: leads !== null,
        reason:
          "No completed pursuit; discovery leads require permitted ingestion and analysis",
      };
    else {
      const p = await materialise(
        db,
        claimed.account_id,
        r.rows[0].id,
        DeliverableKind.parse(claimed.kind),
      );
      const freshness = await reportFreshness(db, claimed.account_id, p.id);
      let collectionId: string | null = null;
      if (claimed.kind === "weekly" || claimed.kind === "watchlist") {
        const { createCollection } = await import("./collections.ts");
        const opportunity = (
          await db.query(
            "SELECT client_id FROM opportunities WHERE id=$1 AND account_id=$2",
            [claimed.opportunity_id, claimed.account_id],
          )
        ).rows[0];
        collectionId = (
          await createCollection(
            db,
            claimed.account_id,
            claimed.kind,
            opportunity.client_id,
            now,
          )
        ).id;
      }
      result = {
        collectionId,
        state: freshness.stale ? "needs-reassessment" : "internal-draft-ready",
        reportId: p.id,
        reused: p.reused,
        freshness,
        leadsFound: leads !== null,
        delivery: "Awaiting explicit internal approval; nothing sent",
      };
    }
    await transaction(db, async (c) => {
      await c.query(
        "UPDATE schedule_ticks SET state='succeeded',result=$2,finished_at=now() WHERE id=$1",
        [claimed.tickId, result],
      );
      await c.query("UPDATE schedules SET last_result=$2 WHERE id=$1", [
        claimed.id,
        result,
      ]);
    });
  } catch (error) {
    const result = { error: (error as Error).message };
    await transaction(db, async (c) => {
      await c.query(
        "UPDATE schedule_ticks SET state='failed',result=$2,finished_at=now() WHERE id=$1",
        [claimed.tickId, result],
      );
      await c.query("UPDATE schedules SET last_result=$2 WHERE id=$1", [
        claimed.id,
        result,
      ]);
    });
  }
  await sampleWeekly(db, now);
  return true;
}
