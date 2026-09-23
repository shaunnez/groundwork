import { setTimeout as delay } from "node:timers/promises";
import { createApi } from "../server/api.ts";
import { loadConfig } from "../server/config.ts";
import { database } from "../server/db.ts";
import { Worker } from "../server/worker.ts";

const runId = process.argv.find((arg) => arg.startsWith("--run-id="))?.slice(9);
if (!runId || !/^[a-f0-9-]{36}$/i.test(runId))
  throw new Error("Usage: resume-local-gets-report --run-id=<failed run UUID>");
const config = loadConfig();
if (config.publicOrigin)
  throw new Error(
    "This recovery command is for the private local workspace only",
  );
const db = database(config);
const app = await createApi(config, db);
try {
  const worker = new Worker(config, db);
  const headers = {
    host: "127.0.0.1",
    "x-groundwork-request": "local",
  };
  const session = await app.inject({
    method: "POST",
    url: "/api/session",
    payload: { key: config.sessionSecret },
    headers,
  });
  if (session.statusCode !== 200)
    throw new Error(`Local owner sign-in returned HTTP ${session.statusCode}`);
  const cookie = session.headers["set-cookie"]?.toString().split(";")[0];
  if (!cookie) throw new Error("Local owner session cookie was not set");
  const response = await app.inject({
    method: "POST",
    url: `/api/runs/${runId}/resume`,
    payload: { localWorkerOwner: worker.owner },
    headers: { ...headers, cookie },
  });
  if (response.statusCode !== 200)
    throw new Error(
      `Resume refused: ${response.json().error ?? response.body}`,
    );
  const admitted = (await db.query("SELECT * FROM runs WHERE id=$1", [runId]))
    .rows[0];
  if (!admitted) throw new Error("Resumed report run disappeared");
  let processingError: Error | undefined;
  const processing = worker.process(admitted).catch((error) => {
    processingError = error as Error;
  });
  let previous = "";
  for (;;) {
    if (processingError) throw processingError;
    const state = (
      await db.query("SELECT state,stage,error FROM runs WHERE id=$1", [runId])
    ).rows[0];
    if (!state) throw new Error("Resumed report run disappeared");
    const marker = `${state.state}/${state.stage}`;
    if (marker !== previous) {
      console.log(`Report ${runId}: ${marker}`);
      previous = marker;
    }
    if (state.state === "succeeded") {
      const report = await db.query(
        "SELECT id FROM reports WHERE run_id=$1 AND kind='pursuit'",
        [runId],
      );
      console.log(JSON.stringify({ runId, reportId: report.rows[0]?.id }));
      break;
    }
    if (["failed", "budget-blocked", "cancelled"].includes(state.state))
      throw new Error(`Report ${runId} ${state.state}: ${state.error}`);
    await delay(5000);
  }
  await processing;
} finally {
  await app.close();
  await db.end();
}
