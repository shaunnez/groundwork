import { readFile, writeFile } from "node:fs/promises";
import { loadConfig } from "../server/config.ts";
import { join } from "node:path";
const config = loadConfig();
const session = await fetch("http://127.0.0.1:4318/api/session", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-groundwork-request": "local",
  },
  body: JSON.stringify({ key: config.sessionSecret }),
});
const cookie = session.headers.get("set-cookie")!.split(";")[0];
const api = async (path: string, payload?: unknown) => {
  const r = await fetch(`http://127.0.0.1:4318/api${path}`, {
    method: payload === undefined ? "GET" : "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      "x-groundwork-request": "local",
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(data));
  return data;
};
const file = join(config.storageRoot, "reassessment-evaluation.json");
let state: {
  opportunityId: string;
  baselineRunId?: string;
  baselineReportId?: string;
  reassessmentRunId?: string;
};
try {
  state = JSON.parse(await readFile(file, "utf8"));
} catch {
  state = { opportunityId: "" };
}
const source = (name: string, purpose: string, text: string) =>
  api(`/opportunities/${state.opportunityId}/sources`, {
    name,
    purpose,
    mediaType: "text/plain",
    text,
    provenance: "synthetic",
    rightsConfirmed: true,
    publishedAt: "2026-09-21",
  });
if (process.argv.includes("--baseline")) {
  if (state.opportunityId)
    throw new Error("Evaluation already exists; inspect before rerunning");
  const client = await api("/clients", {
    legalName: "Synthetic Harbour Analytics Ltd",
    capabilities:
      "Synthetic evaluation firm supplies psychometric assessment services. Current security certification unknown.",
    effectiveDate: "2026-09-21",
  });
  const opp = await api("/opportunities", {
    title: "SYNTHETIC — Harbour assessment services",
    buyer: "Synthetic Harbour Agency",
    noticeId: "SYNTHETIC-M4-001",
    category: "Assessment services",
    cutoff: "2026-09-22",
    clientId: client.id,
    provenance: "synthetic",
    dateStatus: "known",
    closingAt: "2026-10-05T12:00:00+13:00",
  });
  state.opportunityId = opp.id;
  await writeFile(file, JSON.stringify(state), { mode: 0o600 });
  await source(
    "Synthetic notice — baseline",
    "notice",
    "SYNTHETIC EVALUATION ONLY. Harbour Agency invites competitive proposals for assessment services, notice SYNTHETIC-M4-001.\n\nThe original submission deadline is 5 October 2026 at 12:00 New Zealand daylight time (UTC+13). The procurement has not been awarded.\n\nSuppliers must submit a completed response form. Evaluation criteria will be published in the RFP; no weights are stated in this notice. No incumbent is identified in this synthetic notice.",
  );
  state.baselineRunId = (
    await api(`/opportunities/${state.opportunityId}/runs`, {})
  ).id;
} else if (process.argv.includes("--addendum")) {
  const detail = await api(`/opportunities/${state.opportunityId}`);
  const baseline = detail.reports.find(
    (r: { kind: string }) => r.kind === "pursuit",
  );
  if (!baseline) throw new Error("Baseline report not yet complete");
  if (state.reassessmentRunId) throw new Error("Reassessment already admitted");
  state.baselineReportId = baseline.id;
  await source(
    "Synthetic RFP — exhaustive review fixture",
    "rfp",
    Array.from({ length: 18 }, (_, i) =>
      i === 17
        ? "Clause 18. Every bidder must provide a signed data-residency declaration with its response."
        : `Section ${i + 1}. Background information for synthetic assessment service evaluation. This paragraph imposes no mandatory condition.`,
    ).join("\n\n"),
  );
  await source(
    "Synthetic applicable addendum 1 — revised closing date",
    "addendum",
    "SYNTHETIC EVALUATION ONLY. Addendum 1 applies only to notice SYNTHETIC-M4-001. It supersedes the original closing deadline in that notice: responses now close on 12 October 2026 at 12:00 New Zealand daylight time (UTC+13), replacing 5 October 2026. All other requirements remain unchanged.",
  );
  state.reassessmentRunId = (
    await api(`/opportunities/${state.opportunityId}/runs`, {
      parentReportId: baseline.id,
    })
  ).id;
} else {
  console.log(await api(`/opportunities/${state.opportunityId}`));
}
await writeFile(file, JSON.stringify(state, null, 2), { mode: 0o600 });
console.log(state);
