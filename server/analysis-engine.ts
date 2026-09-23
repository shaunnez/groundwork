import { createHash } from "node:crypto";
import type { Database } from "./db.ts";
import { transaction } from "./db.ts";
import { quoteState, type SourceUnit } from "./domain/evidence.ts";
import { ClaudeTerminalError } from "./claude-receipt.ts";
import {
  ANALYSIS_METHOD,
  analysisBatchesAsync,
  analysisPrompt,
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
type RejectedQuotes = { total: number; mandatory: number };
type ValidatedBatch = BatchAnalysis & {
  rejectedBySegment: Record<string, RejectedQuotes>;
  recoveredCallIds: string[];
};

export async function validatedAnalysisBatch(
  name: string,
  input: unknown,
  batch: {
    segments: Parameters<typeof validateBatchAnalysis>[0];
    prompt: string;
  },
  model: (
    name: string,
    input: unknown,
    prompt: string,
  ) => Promise<BatchAnalysis>,
  splitDepth = 0,
): Promise<ValidatedBatch> {
  const byId = new Map(batch.segments.map((segment) => [segment.id, segment]));
  const reconciles = (segments: typeof batch.segments, value: BatchAnalysis) =>
    value.outcomes.length === segments.length &&
    new Set(value.outcomes.map((outcome) => outcome.segmentId)).size ===
      segments.length &&
    value.outcomes.every((outcome) =>
      segments.some((segment) => segment.id === outcome.segmentId),
    );
  let candidate: BatchAnalysis;
  try {
    candidate = await model(name, input, batch.prompt);
  } catch (error) {
    if (
      !(error instanceof ClaudeTerminalError) ||
      error.subtype !== "error_max_turns" ||
      batch.segments.length < 2 ||
      splitDepth >= 2
    )
      throw error;
    const middle = Math.ceil(batch.segments.length / 2);
    const halves = [
      batch.segments.slice(0, middle),
      batch.segments.slice(middle),
    ];
    const results: ValidatedBatch[] = [];
    for (const [index, segments] of halves.entries())
      results.push(
        await validatedAnalysisBatch(
          `${name}-split-${index + 1}`,
          { parentInput: input, splitSegmentIds: segments.map((s) => s.id) },
          { segments, prompt: analysisPrompt(segments) },
          model,
          splitDepth + 1,
        ),
      );
    return {
      ...validateBatchAnalysis(batch.segments, {
        outcomes: results.flatMap((result) => result.outcomes),
      }),
      rejectedBySegment: Object.assign({}, ...results.map((result) => result.rejectedBySegment)),
      recoveredCallIds: [error.callId, ...results.flatMap((result) => result.recoveredCallIds)],
    };
  }
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      return {
        ...validateBatchAnalysis(batch.segments, candidate),
        rejectedBySegment: {},
        recoveredCallIds: [],
      };
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !(
          error.message.startsWith("Quote does not match saved segment ") ||
          error.message === "Unknown analysis segment" ||
          error.message === "Batch outcomes do not reconcile with inputs"
        )
      )
        throw error;
      if (attempt === 2) {
        if (!reconciles(batch.segments, candidate)) throw error;
        const rejectedBySegment: Record<string, RejectedQuotes> = {};
        const grounded = {
          outcomes: candidate.outcomes.map((outcome) => {
            const segment = byId.get(outcome.segmentId);
            if (!segment) throw error;
            const items = outcome.items.filter((item) => {
              if (quoteState(item.quote, segment.text) !== "NOT_FOUND")
                return true;
              const count = (rejectedBySegment[outcome.segmentId] ??= {
                total: 0,
                mandatory: 0,
              });
              count.total++;
              if (item.mandatory) count.mandatory++;
              return false;
            });
            return { ...outcome, items };
          }),
        };
        return {
          ...validateBatchAnalysis(batch.segments, grounded),
          rejectedBySegment,
          recoveredCallIds: [],
        };
      }
      const counts = new Map<string, number>();
      for (const outcome of candidate.outcomes)
        counts.set(outcome.segmentId, (counts.get(outcome.segmentId) ?? 0) + 1);
      const invalidIds = new Set(
        batch.segments
          .filter(
            (segment) =>
              counts.get(segment.id) !== 1 ||
              candidate.outcomes
                .find((outcome) => outcome.segmentId === segment.id)
                ?.items.some(
                  (item) =>
                    quoteState(item.quote, segment.text) === "NOT_FOUND",
                ),
          )
          .map((segment) => segment.id),
      );
      if (!invalidIds.size) throw error;
      const invalidSegments = batch.segments.filter((segment) =>
        invalidIds.has(segment.id),
      );
      const structural = !reconciles(batch.segments, candidate);
      const repairKind = structural ? "segment-repair" : "quote-repair";
      const corrected = await model(
        `${name}-${repairKind}-${attempt + 1}`,
        {
          input,
          repairAttempt: attempt + 1,
          repairSegmentIds: [...invalidIds],
          previousOutputHash: hash(JSON.stringify(candidate)),
        },
        `${analysisPrompt(invalidSegments)}\nThe earlier response failed ${structural ? "segment ID reconciliation" : "exact quote validation"} for these segments. Regenerate only their outcomes, with exactly one outcome per listed segmentId copied without alteration. Use short, meaningful quotes of 4-16 consecutive words copied directly from the listed source text, including its spelling and punctuation. Omit an item if you cannot copy a supporting excerpt exactly; do not paraphrase or combine segments.`,
      );
      try {
        validateBatchAnalysis(invalidSegments, corrected);
      } catch (repairError) {
        if (
          !(repairError instanceof Error) ||
          !(
            repairError.message.startsWith(
              "Quote does not match saved segment ",
            ) ||
            repairError.message === "Unknown analysis segment" ||
            repairError.message ===
              "Batch outcomes do not reconcile with inputs"
          )
        )
          throw repairError;
      }
      if (!reconciles(invalidSegments, corrected)) continue;
      const replacements = new Map(
        corrected.outcomes.map((outcome) => [outcome.segmentId, outcome]),
      );
      candidate = {
        outcomes: batch.segments.map(
          (segment) =>
            replacements.get(segment.id) ??
            candidate.outcomes.find(
              (outcome) => outcome.segmentId === segment.id,
            )!,
        ),
      };
    }
  }
  throw new Error("Quote repair attempts exhausted");
}

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
      const output = await validatedAnalysisBatch(
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
        batch,
        model,
      );
      await active();
      await transaction(db, async (c) => {
        for (const outcome of output.outcomes) {
          const segment = batch.segments.find(
            (s) => s.id === outcome.segmentId,
          )!;
          const rejected = output.rejectedBySegment[segment.id] ?? {
            total: 0,
            mandatory: 0,
          };
          await c.query(
            "UPDATE analysis_segments SET state='processed',outcome=$3,reason=$4,prompt_bytes=$5,updated_at=now() WHERE run_id=$1 AND segment_id=$2",
            [
              run.id,
              segment.id,
              {
                ...outcome,
                rejectedQuoteCount: rejected.total,
                rejectedMandatoryQuoteCount: rejected.mandatory,
              },
              rejected.total
                ? `${rejected.total} ungrounded quote item(s) quarantined after bounded correction`
                : null,
              batch.promptBytes,
            ],
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
        if (output.recoveredCallIds.length) {
          const recovered = await c.query(
            `UPDATE provider_calls SET usage=coalesce(usage,'{}'::jsonb)||'{"recoveredBySplit":true}'::jsonb
             WHERE run_id=$1 AND id=ANY($2::uuid[]) AND status='failed'
               AND usage->>'providerTerminal'='error_max_turns'`,
            [run.id, output.recoveredCallIds],
          );
          if (recovered.rowCount !== output.recoveredCallIds.length)
            throw new Error("Split recovery receipt reconciliation failed");
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
    "SELECT state,count(*)::int AS count,coalesce(sum((outcome->>'rejectedQuoteCount')::int),0)::int AS rejected_quotes,coalesce(sum((outcome->>'rejectedMandatoryQuoteCount')::int),0)::int AS rejected_mandatory_quotes FROM analysis_segments WHERE run_id=$1 GROUP BY state",
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
    rejectedQuotes:
      status.rows.find((row) => row.state === "processed")?.rejected_quotes ??
      0,
    rejectedMandatoryQuotes:
      status.rows.find((row) => row.state === "processed")
        ?.rejected_mandatory_quotes ?? 0,
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
