import { randomUUID } from "node:crypto";
import type { Database } from "./db.ts";
import { transaction } from "./db.ts";
import { ObjectStore, hash } from "./storage.ts";
import {
  lockSource,
  supersede,
  recordSourceEvent,
} from "./source-management.ts";
import { detectMediaType } from "./readers/office.ts";
import { extract } from "./extract.ts";
export async function ingest(
  db: Database,
  store: ObjectStore,
  accountId: string,
  opportunityId: string,
  input: {
    name: string;
    mediaType: string;
    body: Buffer;
    origin?: string;
    publishedAt: string | null;
    purpose: string;
    required: boolean;
    provenance: string;
    replacesId?: string;
    actorId?: string;
    reason?: string;
    maxFileBytes?: number;
    skipPackPageLimit?: boolean;
    originalPath?: string;
  },
) {
  if (input.body.length > (input.maxFileBytes ?? 20 * 1024 * 1024))
    throw new Error("File exceeds the upload limit");
  if (input.replacesId && !input.actorId)
    throw new Error("Replacement requires an accountable actor");
  const ownership = await db.query(
    "SELECT id FROM opportunities WHERE id=$1 AND account_id=$2",
    [opportunityId, accountId],
  );
  if (!ownership.rowCount)
    throw Object.assign(new Error("Opportunity not found"), {
      statusCode: 404,
    });
  input.mediaType = detectMediaType(input.name, input.mediaType, input.body);
  const id = randomUUID();
  const result = await extract(id, input.mediaType, input.body);
  return transaction(db, async (c) => {
    const owner = await c.query(
      "SELECT cutoff FROM opportunities WHERE id=$1 AND account_id=$2 FOR UPDATE",
      [opportunityId, accountId],
    );
    if (!owner.rowCount) throw new Error("Opportunity not found");
    if (input.replacesId) {
      const previous = await lockSource(c, accountId, input.replacesId);
      if (previous.opportunity_id !== opportunityId)
        throw new Error("Replacement must belong to this opportunity");
      if (previous.lifecycle_status !== "active")
        throw Object.assign(
          new Error(
            "This source version is no longer active. Refresh before replacing it.",
          ),
          { statusCode: 409 },
        );
    }
    const count = await c.query(
      "SELECT count(*)::int AS count,coalesce(sum(CASE WHEN media_type='application/pdf' THEN (coverage->>'total')::int ELSE 0 END),0)::int AS pages FROM active_sources WHERE opportunity_id=$1 AND account_id=$2 AND ($3::uuid IS NULL OR id<>$3)",
      [opportunityId, accountId, input.replacesId ?? null],
    );
    if (count.rows[0].count >= 20) throw new Error("Pack limit: 20 documents");
    if (input.body.length > (input.maxFileBytes ?? 20 * 1024 * 1024))
      throw new Error("File exceeds the upload limit");
    if (
      !input.skipPackPageLimit &&
      input.mediaType === "application/pdf" &&
      count.rows[0].pages + (result.coverage.total ?? 0) > 200
    )
      throw new Error("Pack limit: 200 PDF pages");
    const objectRef = input.originalPath
      ? await store.putFile(accountId, input.originalPath)
      : await store.put(accountId, input.body);
    const extractionRef = await store.put(accountId, JSON.stringify(result));
    await c.query(
      "INSERT INTO sources(id,account_id,opportunity_id,name,media_type,origin,published_at,purpose,required,hash,object_ref,reader,state,coverage,extraction_ref,provenance) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)",
      [
        id,
        accountId,
        opportunityId,
        input.name,
        input.mediaType,
        input.origin ?? null,
        input.publishedAt,
        input.purpose,
        input.required,
        hash(input.body),
        objectRef,
        result.reader,
        result.state,
        result.coverage,
        extractionRef,
        input.provenance,
      ],
    );
    for (const u of result.units)
      await c.query(
        "INSERT INTO units(id,account_id,source_id,ordinal,location,text_content,geometry) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          u.id,
          accountId,
          id,
          u.ordinal,
          u.location,
          u.text,
          u.geometry ?? null,
        ],
      );
    if (input.replacesId && input.actorId)
      await supersede(
        c,
        accountId,
        input.replacesId,
        id,
        input.actorId,
        input.reason ?? "Document replaced",
      );
    if (input.actorId)
      await recordSourceEvent(c, accountId, id, input.actorId, "admitted", {
        replacesId: input.replacesId ?? null,
      });
    return { id, name: input.name, ...result };
  });
}
