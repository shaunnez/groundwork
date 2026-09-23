import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { loadConfig } from "../server/config.ts";
import { database } from "../server/db.ts";
import { ObjectStore } from "../server/storage.ts";
import { completeCoverage } from "../server/domain/evidence.ts";
import { preflightAnalysisAsync } from "../server/analysis-pipeline.ts";
import { streamSourceUnits } from "../server/analysis-engine.ts";
import { hasUnmarkedLegacyRevisions } from "../server/run-readiness.ts";

const root = resolve(
  fileURLToPath(new URL("../.local-groundwork", import.meta.url)),
);
const rfx = process.argv.find((arg) => arg.startsWith("--rfx="))?.slice(6);
if (!rfx || !/^\d{1,20}$/.test(rfx))
  throw new Error("Use --rfx=<selected GETS RFx ID>");
const output = resolve(
  process.argv.find((arg) => arg.startsWith("--output="))?.slice(9) ??
    `${root}/receipts/large-pack-${rfx}-preflight.json`,
);
if (!output.startsWith(root + sep))
  throw new Error(
    "Private preflight receipt must stay under this worktree's .local-groundwork directory",
  );
const config = loadConfig();
if (config.publicOrigin)
  throw new Error("This preflight reads only the private local mirror");
const db = database(config);
const store = new ObjectStore(config.storageRoot);
const started = performance.now();
const baselineRss = process.memoryUsage().rss;
try {
  const pack = (
    await db.query(
      "SELECT id,account_id,opportunity_id,manifest FROM tender_packs WHERE rfx_id=$1 ORDER BY created_at DESC LIMIT 1",
      [rfx],
    )
  ).rows[0];
  if (!pack)
    throw new Error("Selected RFx pack is absent from the local mirror");
  const files = (
    pack.manifest.files as Array<{
      fileId: string;
      name: string;
      bytes: number;
      sha256: string;
      status: string;
    }>
  ).filter((file) => file.status === "current");
  const admitted = (
    await db.query(
      `SELECT f.file_id,f.actual_bytes,f.actual_sha256,s.id AS source_id,s.hash,s.object_ref,s.reader,s.state,s.coverage
     FROM tender_pack_files f JOIN sources s ON s.id=f.source_id AND s.account_id=f.account_id
     WHERE f.pack_id=$1 AND f.account_id=$2`,
      [pack.id, pack.account_id],
    )
  ).rows;
  const byId = new Map(admitted.map((row) => [row.file_id, row]));
  const fileOutcomes = [];
  for (const expected of files) {
    const row = byId.get(expected.fileId);
    if (!row) {
      fileOutcomes.push({
        fileId: expected.fileId,
        state: "missing",
        reader: null,
        coverage: null,
      });
      continue;
    }
    const path = store.path(pack.account_id, row.object_ref);
    const size = (await stat(path)).size;
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(path)) digest.update(chunk);
    const actualHash = digest.digest("hex");
    if (
      size !== expected.bytes ||
      Number(row.actual_bytes) !== expected.bytes ||
      actualHash !== expected.sha256 ||
      row.actual_sha256 !== expected.sha256 ||
      row.hash !== expected.sha256
    )
      throw new Error(
        `Immutable original failed checksum/size reconciliation for declared file ${expected.fileId}`,
      );
    fileOutcomes.push({
      fileId: expected.fileId,
      sourceId: row.source_id,
      state: row.state,
      reader: row.reader,
      coverage: row.coverage,
      bytes: size,
    });
  }
  const sourceRows = (
    await db.query(
      "SELECT id,name,purpose,reader,state,coverage,hash,required,published_at FROM active_sources WHERE account_id=$1 AND opportunity_id=$2 ORDER BY id",
      [pack.account_id, pack.opportunity_id],
    )
  ).rows;
  const counts = (
    await db.query(
      "SELECT count(*)::int AS units,coalesce(sum(length(u.text_content)),0)::bigint AS characters,count(*) FILTER(WHERE length(btrim(u.text_content))>0)::int AS candidates FROM active_sources s JOIN units u ON u.source_id=s.id WHERE s.account_id=$1 AND s.opportunity_id=$2",
      [pack.account_id, pack.opportunity_id],
    )
  ).rows[0];
  const plan = await preflightAnalysisAsync(
    streamSourceUnits(
      db,
      pack.account_id,
      sourceRows.map((source) => source.id),
    ),
  );
  const highLevelExcluded = sourceRows.filter(hasUnmarkedLegacyRevisions);
  const highLevelPlan = await preflightAnalysisAsync(
    streamSourceUnits(
      db,
      pack.account_id,
      sourceRows
        .filter(
          (source) =>
            !highLevelExcluded.some((excluded) => excluded.id === source.id),
        )
        .map((source) => source.id),
    ),
  );
  if (
    plan.unitCount !== counts.units ||
    plan.characters !== Number(counts.characters)
  )
    throw new Error(
      "Streaming preflight does not reconcile with immutable unit inventory",
    );
  const usage = (
    await db.query(
      "SELECT avg((usage->>'apiEquivalentUsd')::numeric) AS average FROM provider_calls WHERE provider='claude-subscription' AND status='succeeded' AND usage->>'apiEquivalentUsd' ~ '^[0-9]+(\\.[0-9]+)?$'",
    )
  ).rows[0];
  const average = usage.average === null ? null : Number(usage.average);
  const partial = sourceRows.filter(
    (source) => !completeCoverage(source.coverage),
  );
  const receipt = {
    rfx,
    expectedCurrent: files.length,
    admittedOriginals: admitted.length,
    originalBytes: fileOutcomes.reduce(
      (sum, file) => sum + (file.bytes ?? 0),
      0,
    ),
    files: fileOutcomes,
    sourceCount: sourceRows.length,
    candidateCount: counts.candidates,
    legacyRequirementCalls: Math.ceil(counts.candidates / 8),
    legacyCharacterGuard: 160_000,
    legacyGate:
      "Pack-completeness check rejects the four partial Office readers first; the prior run-readiness path then rejected any selected text above 160,000 characters before a model call.",
    readerGaps: partial.map((source) => ({
      sourceId: source.id,
      name: source.name,
      reader: source.reader,
      coverage: source.coverage,
    })),
    ...plan,
    highLevel: {
      excludedLegacySourceIds: highLevelExcluded.map((source) => source.id),
      ...highLevelPlan,
      estimatedApiEquivalentUsd:
        average === null
          ? null
          : Number((average * highLevelPlan.estimatedCalls).toFixed(2)),
      eligible:
        fileOutcomes.length === files.length &&
        fileOutcomes.every((file) =>
          ["read", "partial"].includes(file.state),
        ) &&
        highLevelPlan.estimatedCalls <= config.analysisMaxModelCalls &&
        config.claudeSubscriptionApproved,
    },
    callAllowance: config.analysisMaxModelCalls,
    estimatedApiEquivalentUsd:
      average === null
        ? null
        : Number((average * plan.estimatedCalls).toFixed(2)),
    estimateBasis:
      "Historical successful Claude subscription receipts; API equivalent only, not actual subscription billing",
    fullRunEligible:
      fileOutcomes.length === files.length &&
      partial.length === 0 &&
      plan.estimatedCalls <= config.analysisMaxModelCalls &&
      config.claudeSubscriptionApproved,
    elapsedMs: Math.round(performance.now() - started),
    rssIncreaseBytes: process.memoryUsage().rss - baselineRss,
  };
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(output, JSON.stringify(receipt, null, 2), { mode: 0o600 });
  console.log(
    JSON.stringify({
      rfx,
      expectedCurrent: receipt.expectedCurrent,
      admittedOriginals: receipt.admittedOriginals,
      unitCount: receipt.unitCount,
      characters: receipt.characters,
      batches: plan.batches,
      estimatedCalls: plan.estimatedCalls,
      peakPromptBytes: plan.peakPromptBytes,
      readerGapCount: partial.length,
      fullRunEligible: receipt.fullRunEligible,
      highLevelExcludedSources: highLevelExcluded.length,
      highLevelBatches: highLevelPlan.batches,
      highLevelEstimatedCalls: highLevelPlan.estimatedCalls,
      highLevelEligible: receipt.highLevel.eligible,
      estimatedApiEquivalentUsd: receipt.estimatedApiEquivalentUsd,
      elapsedMs: receipt.elapsedMs,
      rssIncreaseBytes: receipt.rssIncreaseBytes,
      receipt: output,
    }),
  );
} finally {
  await db.end();
}
