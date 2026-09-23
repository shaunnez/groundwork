import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createApi } from "../server/api.ts";
import { loadConfig } from "../server/config.ts";
import { database } from "../server/db.ts";
import { PackDeclaration } from "../server/tender-packs.ts";
import {
  MAX_ANALYSIS_CHARACTERS,
  runReadinessIssues,
} from "../server/run-readiness.ts";
import { Worker } from "../server/worker.ts";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, "").split("=");
    return [key, value.join("=")];
  }),
);
if (args.rfx !== "34995788" || !args.output)
  throw new Error(
    "Usage: run-local-gets-report --rfx=34995788 --output=.local-groundwork/<private-dir> [--skip-acquire=true]",
  );
const output = resolve(args.output);
const privateRoot = resolve(".local-groundwork");
if (!output.startsWith(privateRoot + "/"))
  throw new Error("Selected tender files must stay under .local-groundwork/");
const config = loadConfig();
if (!config.claudeSubscriptionApproved)
  throw new Error(
    "Local report generation is not enabled in GROUNDWORK_CONFIG",
  );

async function runScript(script: string, scriptArgs: string[]) {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", script, ...scriptArgs],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["inherit", "pipe", "inherit"],
    },
  );
  let stdout = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    const part = chunk.toString();
    stdout += part;
    process.stdout.write(part);
  });
  const status = await new Promise<number>((done) =>
    child.on("exit", (code) => done(code ?? 1)),
  );
  if (status !== 0) throw new Error(`${script} exited with status ${status}`);
  return stdout;
}

async function latestManifest() {
  const files = (await readdir(output)).filter((name) =>
    /^manifest-[a-f0-9]{64}\.json$/.test(name),
  );
  if (!files.length) throw new Error("No private GETS pack manifest was found");
  const ranked = await Promise.all(
    files.map(async (name) => ({
      name,
      time: (await stat(join(output, name))).mtimeMs,
    })),
  );
  ranked.sort((a, b) => b.time - a.time);
  const manifestPath = join(output, ranked[0].name);
  const noticePath = join(
    output,
    `notice-${ranked[0].name.slice(9)}`.replace(/\.json$/, ".html"),
  );
  return { manifestPath, noticePath };
}

if (args["skip-acquire"] !== "true")
  await runScript("scripts/acquire-gets-pack.ts", [
    `--rfx=${args.rfx}`,
    `--output=${output}`,
  ]);
const { manifestPath, noticePath } = await latestManifest();
const manifest = PackDeclaration.parse(
  JSON.parse(await readFile(manifestPath, "utf8")),
);
if (
  manifest.rfxId !== args.rfx ||
  manifest.files.length < 13 ||
  manifest.files.some((file) => file.status !== "current")
)
  throw new Error(
    "Selected GETS pack has fewer than the 13 baseline current files or includes a withdrawn file; review the new GETS file table",
  );
if (args["skip-acquire"] === "true") {
  for (const file of manifest.files) {
    const original = join(output, "originals", `${file.fileId}-${file.name}`);
    const digest = createHash("sha256");
    let bytes = 0;
    for await (const chunk of createReadStream(original)) {
      bytes += chunk.length;
      if (bytes > file.bytes)
        throw new Error(`${file.name}: size exceeded GETS declaration`);
      digest.update(chunk);
    }
    if (
      bytes !== file.bytes ||
      digest.digest("hex") !== file.sha256.toLowerCase()
    )
      throw new Error(
        `${file.name}: original no longer matches GETS size and SHA-256`,
      );
  }
}
const db = database(config);
let api: Awaited<ReturnType<typeof createApi>> | undefined;
let processing: Promise<void> | undefined;
let processingError: Error | undefined;
try {
  const accountId = "11111111-1111-4111-8111-111111111111";
  await runScript("scripts/admit-gets-pack.ts", [
    `--account=${accountId}`,
    `--notice=${noticePath}`,
    `--manifest=${manifestPath}`,
    `--originals=${join(output, "originals")}`,
    `--receipt=${join(output, "admission-receipt.json")}`,
  ]);
  const opportunity = await db.query(
    "SELECT id,cutoff FROM opportunities WHERE account_id=$1 AND notice_id=$2",
    [accountId, args.rfx],
  );
  if (opportunity.rows.length !== 1)
    throw new Error("Admitted GETS opportunity was not found exactly once");
  const opportunityId = opportunity.rows[0].id as string;
  const rows = (
    await db.query(
      `SELECT s.id,s.name,s.reader,s.required,s.coverage,s.published_at,s.purpose,s.state,
              coalesce(sum(length(u.text_content)),0)::int AS characters
       FROM active_sources s LEFT JOIN units u ON u.source_id=s.id
       WHERE s.account_id=$1 AND s.opportunity_id=$2
       GROUP BY s.id,s.name,s.reader,s.required,s.coverage,s.published_at,s.purpose,s.state ORDER BY s.name`,
      [accountId, opportunityId],
    )
  ).rows;
  const select = (
    test: (row: (typeof rows)[number]) => boolean,
    label: string,
  ) => {
    const matches = rows.filter(test);
    if (matches.length !== 1)
      throw new Error(
        `Core report source ${label} matched ${matches.length} files`,
      );
    return matches[0];
  };
  const selected = [
    select((r) => r.purpose === "notice", "GETS notice"),
    select((r) => /Remedial Bridge works RFT\.pdf$/i.test(r.name), "RFT"),
    select((r) => /Remedial Bridge Works - BoP\.pdf$/i.test(r.name), "BoP"),
    select(
      (r) =>
        /Remedial Bridge Works - Technical Specification\.pdf$/i.test(r.name),
      "technical specification",
    ),
  ];
  const selectedIds = new Set(selected.map((r) => r.id));
  const excluded = rows.filter((r) => !selectedIds.has(r.id));
  const characters = selected.reduce((n, r) => n + Number(r.characters), 0);
  const cutoff = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const issues = runReadinessIssues(selected, cutoff, characters);
  if (issues.length) throw new Error(issues.join(" | "));
  console.log(
    `Core report scope: ${selected.length} sources, ${characters}/${MAX_ANALYSIS_CHARACTERS} characters. ${excluded.length} other sources remain explicit exclusions.`,
  );

  api = await createApi(config, db);
  const base = await api.listen({ host: "127.0.0.1", port: 0 });
  const session = await fetch(`${base}/api/session`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-groundwork-request": "local",
    },
    body: JSON.stringify({ key: config.sessionSecret }),
  });
  if (!session.ok)
    throw new Error(`Local owner sign-in returned HTTP ${session.status}`);
  const cookie = session.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Local owner session cookie was not set");
  const parent = await db.query(
    "SELECT r.id FROM reports r JOIN intelligence i ON i.id=r.intelligence_id WHERE r.account_id=$1 AND r.opportunity_id=$2 AND r.kind='pursuit' AND i.cutoff<=$3 ORDER BY r.created_at DESC LIMIT 1",
    [accountId, opportunityId, cutoff],
  );
  const worker = new Worker(config, db);
  const response = await fetch(
    `${base}/api/opportunities/${opportunityId}/runs`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-groundwork-request": "local",
        cookie,
      },
      body: JSON.stringify({
        cutoff,
        parentReportId: parent.rows[0]?.id ?? null,
        excludedSourceIds: excluded.map((r) => r.id),
        allowIncompleteTenderPack: true,
        localWorkerOwner: worker.owner,
        scopeNote:
          "Limited first RFP assessment of the GETS notice, RFT, BoP and technical specification. Other admitted files are outside this report because the current full-pack analysis path exceeds its bounded context or has partial reader coverage. This does not claim exhaustive pack, contract, drawing or pricing-schedule review.",
      }),
    },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      `Report request returned HTTP ${response.status}: ${result.error ?? JSON.stringify(result)}`,
    );
  const runId = result.id as string;
  console.log(`Report run ${runId} admitted. Waiting for the local worker.`);
  if (!result.reused) {
    const admitted = await db.query("SELECT * FROM runs WHERE id=$1", [runId]);
    processing = worker.process(admitted.rows[0]).catch((error) => {
      processingError = error as Error;
    });
  }
  let previous = "";
  let lastProgressAt = 0;
  for (;;) {
    if (processingError) throw processingError;
    const state = (
      await db.query(
        "SELECT state,stage,error,started_at FROM runs WHERE id=$1 AND account_id=$2",
        [runId, accountId],
      )
    ).rows[0];
    if (!state) throw new Error("Queued report run disappeared");
    const marker = `${state.state}/${state.stage}`;
    if (marker !== previous || Date.now() - lastProgressAt >= 30000) {
      const calls = await db.query(
        "SELECT count(*) FILTER (WHERE status='succeeded')::int AS completed,coalesce(sum((usage->>'apiEquivalentUsd')::numeric) FILTER (WHERE status='succeeded'),0)::numeric AS estimate FROM provider_calls WHERE run_id=$1",
        [runId],
      );
      const minutes = state.started_at
        ? Math.floor(
            (Date.now() - new Date(state.started_at).getTime()) / 60000,
          )
        : 0;
      console.log(
        `Report ${runId}: ${marker} · ${minutes} min · ${calls.rows[0].completed} model calls · US$${Number(calls.rows[0].estimate).toFixed(2)} API equivalent estimate`,
      );
      previous = marker;
      lastProgressAt = Date.now();
    }
    if (state.state === "failed" || state.state === "budget-blocked")
      throw new Error(`Report ${runId} ${state.state}: ${state.error}`);
    if (state.state === "succeeded") {
      const report = await db.query(
        "SELECT id FROM reports WHERE run_id=$1 AND kind='pursuit'",
        [runId],
      );
      console.log(
        JSON.stringify({ runId, reportId: report.rows[0]?.id, opportunityId }),
      );
      break;
    }
    if (state.state === "cancelled")
      throw new Error(`Report ${runId} was cancelled`);
    await delay(5000);
  }
} finally {
  await processing?.catch(() => undefined);
  await api?.close();
  await db.end();
}
