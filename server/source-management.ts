import { randomUUID } from "node:crypto";
import { z } from "zod";
import type pg from "pg";
import { transaction, type Database } from "./db.ts";
import { ObjectStore } from "./storage.ts";
import type { Extraction } from "./extract.ts";
export const SourceMetadata = z
  .object({
    name: z.string().trim().min(1).max(250),
    purpose: z.enum([
      "notice",
      "context",
      "awards",
      "rfp",
      "addendum",
      "client",
    ]),
    publishedAt: z.string().date().nullable(),
    required: z.boolean(),
    provenance: z.enum(["public", "synthetic", "authenticated"]),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();
export async function lockSource(
  c: pg.PoolClient,
  account: string,
  sourceId: string,
) {
  const r = await c.query(
    `SELECT s.*,coalesce(l.status,'active') AS lifecycle_status FROM sources s
 JOIN opportunities o ON o.id=s.opportunity_id AND o.account_id=s.account_id
 LEFT JOIN source_lifecycle l ON l.source_id=s.id AND l.account_id=s.account_id
 WHERE s.id=$1 AND s.account_id=$2 FOR UPDATE OF o`,
    [sourceId, account],
  );
  if (!r.rowCount)
    throw Object.assign(new Error("Source not found"), { statusCode: 404 });
  // Re-read after obtaining the opportunity lock: concurrent versions may have committed while waiting.
  const state = await c.query(
    "SELECT status FROM source_lifecycle WHERE source_id=$1 AND account_id=$2",
    [sourceId, account],
  );
  return { ...r.rows[0], lifecycle_status: state.rows[0]?.status ?? "active" };
}
export async function recordSourceEvent(
  c: pg.PoolClient,
  account: string,
  source: string,
  actor: string,
  action: string,
  detail: unknown,
) {
  await c.query(
    "INSERT INTO source_events(id,account_id,source_id,actor_id,action,detail) VALUES($1,$2,$3,$4,$5,$6)",
    [randomUUID(), account, source, actor, action, detail],
  );
}
export async function supersede(
  c: pg.PoolClient,
  account: string,
  oldId: string,
  newId: string,
  actor: string,
  reason: string,
) {
  await c.query(
    `INSERT INTO source_lifecycle(source_id,account_id,status,successor_id,reason) VALUES($1,$2,'superseded',$3,$4)
 ON CONFLICT(source_id) DO UPDATE SET status='superseded',successor_id=$3,reason=$4,updated_at=now()`,
    [oldId, account, newId, reason],
  );
  await c.query(
    "INSERT INTO source_lifecycle(source_id,account_id,status,previous_id,reason) VALUES($1,$2,'active',$3,$4)",
    [newId, account, oldId, reason],
  );
  await recordSourceEvent(c, account, oldId, actor, "superseded", {
    successorId: newId,
    reason,
  });
}
export async function editSource(
  db: Database,
  store: ObjectStore,
  account: string,
  sourceId: string,
  actor: string,
  input: z.infer<typeof SourceMetadata>,
) {
  return transaction(db, async (c) => {
    const old = await lockSource(c, account, sourceId);
    if (old.lifecycle_status !== "active")
      throw Object.assign(
        new Error(
          "This version is no longer active. Refresh the source library.",
        ),
        { statusCode: 409 },
      );
    const id = randomUUID();
    const units = await c.query(
      "SELECT ordinal,location,text_content AS text,geometry FROM units WHERE source_id=$1 AND account_id=$2 ORDER BY ordinal",
      [sourceId, account],
    );
    const extraction: Extraction = {
      reader: old.reader,
      state: old.state,
      coverage: old.coverage,
      units: units.rows.map((u) => ({ ...u, id: randomUUID(), sourceId: id })),
    };
    const extractionRef = await store.put(account, JSON.stringify(extraction));
    await c.query(
      `INSERT INTO sources(id,account_id,opportunity_id,name,media_type,origin,published_at,purpose,required,hash,object_ref,reader,state,coverage,extraction_ref,provenance)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        id,
        account,
        old.opportunity_id,
        input.name,
        old.media_type,
        old.origin,
        input.publishedAt,
        input.purpose,
        input.required,
        old.hash,
        old.object_ref,
        old.reader,
        old.state,
        old.coverage,
        extractionRef,
        input.provenance,
      ],
    );
    for (const u of extraction.units)
      await c.query(
        "INSERT INTO units(id,account_id,source_id,ordinal,location,text_content,geometry) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [u.id, account, id, u.ordinal, u.location, u.text, u.geometry ?? null],
      );
    await supersede(c, account, sourceId, id, actor, input.reason);
    return { id };
  });
}
export async function setSourceArchived(
  db: Database,
  account: string,
  sourceId: string,
  actor: string,
  archived: boolean,
  reason: string,
) {
  return transaction(db, async (c) => {
    const source = await lockSource(c, account, sourceId);
    if (source.lifecycle_status === "superseded")
      throw Object.assign(
        new Error("A replaced version cannot be restored; use its successor."),
        { statusCode: 409 },
      );
    if (!archived) {
      const count = await c.query(
        "SELECT count(*)::int AS count,coalesce(sum(CASE WHEN media_type='application/pdf' THEN (coverage->>'total')::int ELSE 0 END),0)::int AS pages FROM active_sources WHERE opportunity_id=$1 AND account_id=$2 AND id<>$3",
        [source.opportunity_id, account, sourceId],
      );
      if (
        count.rows[0].count >= 20 ||
        count.rows[0].pages +
          (source.media_type === "application/pdf"
            ? (source.coverage.total ?? 0)
            : 0) >
          200
      )
        throw new Error(
          "Restoring this source would exceed the pack limits (20 documents / 200 PDF pages)",
        );
    }
    await c.query(
      `INSERT INTO source_lifecycle(source_id,account_id,status,reason) VALUES($1,$2,$3,$4)
  ON CONFLICT(source_id) DO UPDATE SET status=$3,reason=$4,updated_at=now()`,
      [sourceId, account, archived ? "archived" : "active", reason],
    );
    await recordSourceEvent(
      c,
      account,
      sourceId,
      actor,
      archived ? "archived" : "restored",
      { reason },
    );
    return { id: sourceId, status: archived ? "archived" : "active" };
  });
}
