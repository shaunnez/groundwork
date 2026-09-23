import { createHash } from "node:crypto";
import type { Database } from "./db.ts";
import { transaction } from "./db.ts";
import type { SourceUnit } from "./domain/evidence.ts";
import {
  ANALYSIS_METHOD,
  BatchAnalysisSchema,
  analysisBatchesAsync,
  excludedUnitId,
  highLevelExclusionReason,
  validateBatchAnalysis,
  type BatchAnalysis,
} from "./analysis-pipeline.ts";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
type Run = {
  id: string;
  account_id: string;
  manifest: { sourceIds: string[]; sourceHashes: string[] };
};

export async function* streamSourceUnits(
  db: Database,
  accountId: string,
  sourceIds: string[],
): AsyncGenerator<SourceUnit> {
  let sourceId: string | null = null;
  let ordinal = 0;
  for (;;) {
    const page: { rows: SourceUnit[] } = await db.query(
      `SELECT id,source_id AS "sourceId",ordinal,location,text_content AS text
       FROM units WHERE account_id=$1 AND source_id=ANY($2::uuid[])
         AND ($3::uuid IS NULL OR (source_id,ordinal)>($3::uuid,$4::int))
       ORDER BY source_id,ordinal LIMIT 100`,
      [accountId, sourceIds, sourceId, ordinal],
    );
    if (!page.rows.length) return;
    for (const unit of page.rows) {
      yield unit;
      sourceId = unit.sourceId;
      ordinal = unit.ordinal;
    }
  }
}

export async function analyseReadableUnits(
  db: Database,
  run: Run,
  units: AsyncIterable<SourceUnit> | Iterable<SourceUnit>,
  model: (
    name: string,
    input: unknown,
    prompt: string,
  ) => Promise<BatchAnalysis>,
  active: () => Promise<void>,
) {
  let batchNumber = 0;
  let peakPromptBytes = 0;
  async function* eligible() {
    for await (const unit of units) {
      const reason = highLevelExclusionReason(unit);
      if (reason) {
        await db.query(
          `INSERT INTO analysis_segments(run_id,account_id,segment_id,source_id,unit_id,location,start_offset,end_offset,text_hash,method,state,reason)
           VALUES($1,$2,$3,$4,$5,$6,0,$7,$8,$9,'excluded',$10)
           ON CONFLICT(run_id,segment_id) DO NOTHING`,
          [
            run.id,
            run.account_id,
            excludedUnitId(unit),
            unit.sourceId,
            unit.id,
            unit.location,
            unit.text.length,
            hash(unit.text),
            ANALYSIS_METHOD,
            reason,
          ],
        );
      } else yield unit;
    }
  }
  for await (const batch of analysisBatchesAsync(eligible())) {
    await active();
    const name = `analyse-${String(batchNumber++).padStart(5, "0")}`;
    peakPromptBytes = Math.max(peakPromptBytes, batch.promptBytes);
    await transaction(db, async (c) => {
      for (const segment of batch.segments)
        await c.query(
          `INSERT INTO analysis_segments(run_id,account_id,segment_id,source_id,unit_id,location,start_offset,end_offset,text_hash,method,state)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending') ON CONFLICT(run_id,segment_id) DO NOTHING`,
          [
            run.id,
            run.account_id,
            segment.id,
            segment.sourceId,
            segment.unitId,
            segment.location,
            segment.start,
            segment.end,
            hash(segment.text),
            ANALYSIS_METHOD,
          ],
        );
    });
    const done = await db.query(
      "SELECT count(*)::int AS count FROM analysis_segments WHERE run_id=$1 AND segment_id=ANY($2::text[]) AND state='processed'",
      [run.id, batch.segments.map((s) => s.id)],
    );
    if (done.rows[0].count === batch.segments.length) continue;
    try {
      const raw = await model(
        name,
        {
          method: ANALYSIS_METHOD,
          segments: batch.segments.map((s) => ({
            id: s.id,
            sourceId: s.sourceId,
            sourceHash:
              run.manifest.sourceHashes[
                run.manifest.sourceIds.indexOf(s.sourceId)
              ],
            unitId: s.unitId,
            textHash: hash(s.text),
          })),
        },
        batch.prompt,
      );
      const output = validateBatchAnalysis(
        batch.segments,
        BatchAnalysisSchema.parse(raw),
      );
      await active();
      await transaction(db, async (c) => {
        for (const outcome of output.outcomes) {
          const segment = batch.segments.find(
            (s) => s.id === outcome.segmentId,
          )!;
          await c.query(
            "UPDATE analysis_segments SET state='processed',outcome=$3,reason=null,prompt_bytes=$4,updated_at=now() WHERE run_id=$1 AND segment_id=$2",
            [run.id, segment.id, outcome, batch.promptBytes],
          );
          for (const item of outcome.items) {
            const itemId = hash(
              JSON.stringify({ segmentId: segment.id, item }),
            );
            await c.query(
              `INSERT INTO analysis_items(run_id,account_id,item_id,segment_id,source_id,unit_id,location,kind,text_content,quote,mandatory,revision_state,contradiction)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(run_id,item_id) DO NOTHING`,
              [
                run.id,
                run.account_id,
                itemId,
                segment.id,
                segment.sourceId,
                segment.unitId,
                segment.location,
                item.kind,
                item.text,
                item.quote,
                item.mandatory,
                "operative",
                item.contradiction,
              ],
            );
          }
        }
      });
    } catch (error) {
      await db.query(
        "UPDATE analysis_segments SET state='failed',reason=$3,updated_at=now() WHERE run_id=$1 AND segment_id=ANY($2::text[]) AND state<>'processed'",
        [run.id, batch.segments.map((s) => s.id), (error as Error).message],
      );
      throw error;
    }
  }
  const status = await db.query(
    "SELECT state,count(*)::int AS count FROM analysis_segments WHERE run_id=$1 GROUP BY state",
    [run.id],
  );
  const counts = Object.fromEntries(status.rows.map((r) => [r.state, r.count]));
  if ((counts.pending ?? 0) || (counts.failed ?? 0))
    throw new Error("Analysis coverage ledger contains unresolved segments");
  return {
    method: ANALYSIS_METHOD,
    batches: batchNumber,
    peakPromptBytes,
    segmentsProcessed: counts.processed ?? 0,
    unitsExcluded: counts.excluded ?? 0,
  };
}

export async function analysisDigest(db: Database, runId: string) {
  const rows = await db.query(
    `WITH ranked AS (
       SELECT i.*,row_number() OVER(PARTITION BY i.source_id ORDER BY i.mandatory DESC,i.kind DESC,i.item_id) AS source_rank
       FROM analysis_items i WHERE i.run_id=$1
     )
     SELECT i.item_id,i.source_id,i.unit_id,i.location,i.kind,i.text_content,i.quote,i.mandatory,i.contradiction,
            s.purpose,s.name FROM ranked i JOIN sources s ON s.id=i.source_id
     WHERE i.source_rank<=12 ORDER BY i.source_rank,i.source_id LIMIT 180`,
    [runId],
  );
  const totals = await db.query(
    `SELECT count(*)::int AS items,
       count(*) FILTER(WHERE kind='requirement')::int AS requirement_occurrences,
       count(DISTINCT (text_content,quote,revision_state,mandatory,contradiction)) FILTER(WHERE kind='requirement')::int AS distinct_requirements
     FROM analysis_items WHERE run_id=$1`,
    [runId],
  );
  const preview = await db.query(
    `SELECT DISTINCT ON (text_content,quote,revision_state,mandatory,contradiction)
       unit_id,text_content,quote,mandatory,contradiction,source_id,location
     FROM analysis_items WHERE run_id=$1 AND kind='requirement'
     ORDER BY text_content,quote,revision_state,mandatory,contradiction,source_id LIMIT 100`,
    [runId],
  );
  return {
    items: rows.rows as Array<{
      item_id: string;
      source_id: string;
      unit_id: string;
      location: string;
      kind: "fact" | "requirement";
      text_content: string;
      quote: string;
      mandatory: boolean;
      contradiction: string | null;
      purpose: string;
      name: string;
    }>,
    totals: totals.rows[0] as {
      items: number;
      requirement_occurrences: number;
      distinct_requirements: number;
    },
    preview: preview.rows as Array<{
      unit_id: string;
      text_content: string;
      quote: string;
      mandatory: boolean;
      contradiction: string | null;
      source_id: string;
      location: string;
    }>,
  };
}
