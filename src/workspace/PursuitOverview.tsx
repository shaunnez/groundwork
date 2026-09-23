import { Badge, Button, I, Notice } from "../ui";
import { watchlistPreview } from "./watchlist-preview";
import {
  activeRun,
  claimText,
  date,
  kindLabel,
  reportMaturity,
  type Detail,
  type Navigate,
  type SavedReport,
  type Source,
} from "./data";

function reviewLabel(report: SavedReport): string {
  if (report.review?.state === "approved") return "Internally reviewed";
  if (report.review?.state === "changes-requested")
    return "Corrections requested";
  return "Analyst review required";
}

function sourceLabel(source: Source): string {
  if (
    source.state === "read" &&
    source.coverage.unread === 0 &&
    source.coverage.failures.length === 0
  )
    return "Read";
  if (source.coverage.read > 0) return "Partly read";
  return "Needs attention";
}

export function PursuitOverview({
  detail,
  report,
  owner,
  busy,
  go,
  onEvidence,
  onDerive,
}: {
  detail: Detail;
  report: SavedReport | null;
  owner: boolean;
  busy: boolean;
  go: Navigate;
  onEvidence: (id: string, quote?: string) => void;
  onDerive: (kind: "watchlist" | "competitor" | "weekly") => void;
}) {
  const opportunity = detail.opportunity;
  const run = activeRun(detail);
  const latestRun = detail.runs[0];
  const stopped =
    !run &&
    latestRun &&
    ["failed", "cancelled", "budget-blocked"].includes(latestRun.state);
  const pack = detail.tenderPacks?.[0];
  const decision = report?.decisions.at(-1);
  const noticeBrief = opportunity.notice_brief;
  const preview = watchlistPreview(
    opportunity,
    report
      ? {
          verdict: report.payload.assessment.verdict,
          summary: report.payload.summarySentences,
          entities: report.payload.intelligence.entities,
        }
      : undefined,
  );
  const flags =
    noticeBrief && !report
      ? noticeBrief.redFlags.map((item) => item.text)
      : preview.flags;
  const actions =
    noticeBrief && !report
      ? noticeBrief.actions.map((item) => item.text)
      : preview.actions;
  const hasBlockedScope = Boolean(latestRun?.progress?.readinessIssues.length);
  const firstAction = run
    ? { label: "View analysis progress", page: "processing" as const }
    : stopped
      ? { label: "Inspect the stopped request", page: "processing" as const }
      : pack && !pack.complete
        ? { label: "Complete tender pack", page: "upload" as const }
        : !detail.sources.length
          ? { label: "Add source evidence", page: "upload" as const }
          : {
              label: report ? "Request reassessment" : "Request assessment",
              page: "request" as const,
            };

  return (
    <div className="pursuit-overview">
      <section
        className="pursuit-latest"
        aria-labelledby="pursuit-latest-title"
      >
        <div className="pursuit-section-heading">
          <div>
            <span className="eyebrow">THE CURRENT READ</span>
            <h2 id="pursuit-latest-title">Latest read</h2>
          </div>
          {report && (
            <Button
              kind="secondary"
              onClick={() => go("report", opportunity.id, report.id)}
            >
              Read full report <I.ArrowRight size={16} />
            </Button>
          )}
        </div>
        {report ? (
          <>
            <div className="pursuit-read-intro">
              <div>
                <Badge tone="info">{reportMaturity(report)}</Badge>
                {reportMaturity(report) ===
                  "Tender evidence partly assessed" && (
                  <p className="small muted">
                    Tender documents were included, but full pack and
                    requirements coverage has not been confirmed.
                  </p>
                )}
                <p className="pursuit-read-verdict">
                  {report.payload.assessment.verdict.recommendation}
                </p>
                <p>
                  {claimText(report, report.payload.assessment.summary.what)}
                </p>
              </div>
              <dl className="pursuit-read-basis">
                <div>
                  <dt>Assessment cutoff</dt>
                  <dd>{date(report.payload.cutoff)}</dd>
                </div>
                <div>
                  <dt>Saved</dt>
                  <dd>{date(report.created_at)}</dd>
                </div>
                <div>
                  <dt>Review</dt>
                  <dd>{reviewLabel(report)}</dd>
                </div>
              </dl>
            </div>
            <div className="pursuit-read-points">
              <div>
                <h3>Decisive factor</h3>
                <p>
                  {claimText(
                    report,
                    report.payload.assessment.summary.decidingFactor,
                  )}
                </p>
              </div>
              <div>
                <h3>Red flags &amp; unknowns</h3>
                <ul>
                  {flags.map((flag, index) => (
                    <li key={`${index}:${flag}`}>{flag}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="pursuit-main-actions">
              <h3>Three main actions</h3>
              <ol>
                {actions.map((action, index) => (
                  <li key={`${index}:${action}`}>{action}</li>
                ))}
              </ol>
            </div>
            {report.freshness.stale && (
              <p className="pursuit-inline-status">
                Newer evidence or an assessment is available. This saved read
                keeps its original scope and findings.
              </p>
            )}
            {run && (
              <p className="pursuit-inline-status">
                {run.state === "queued"
                  ? "A new request is queued; no new report has been saved."
                  : "A new assessment is running; this is the previous saved read."}
              </p>
            )}
          </>
        ) : (
          <div className="pursuit-no-read">
            <Badge tone="warning">No saved pursuit assessment</Badge>
            {noticeBrief ? (
              <>
                <h3>Notice-only quick read</h3>
                <p>{noticeBrief.summary.text}</p>
                <Button
                  kind="text"
                  onClick={() =>
                    onEvidence(
                      noticeBrief.summary.unitId,
                      noticeBrief.summary.quote,
                    )
                  }
                >
                  Inspect public notice evidence
                </Button>
                <p className="small muted">
                  This saved notice brief is not a full pursuit assessment.
                </p>
              </>
            ) : (
              <p>
                There is no saved analysis to read yet. Check the source pack
                before requesting an assessment.
              </p>
            )}
            {flags.length > 0 && (
              <div className="pursuit-unassessed-flags">
                <h3>Red flags &amp; unknowns</h3>
                <ul>
                  {flags.map((flag, index) => (
                    <li key={`${index}:${flag}`}>{flag}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="pursuit-main-actions">
              <h3>Three main actions</h3>
              <ol>
                {actions.map((action, index) => (
                  <li key={`${index}:${action}`}>{action}</li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </section>

      {(run || stopped) && (
        <Notice
          title={
            run?.state === "queued"
              ? "Assessment requested, waiting for a worker"
              : run?.state === "running"
                ? "Assessment worker started"
                : latestRun?.state === "budget-blocked"
                  ? "Assessment blocked by usage limit"
                  : latestRun?.state === "cancelled"
                    ? "Assessment cancelled"
                    : "Assessment stopped"
          }
          tone={run ? "info" : "warning"}
        >
          {run?.state === "queued"
            ? run.started_at
              ? "A worker started an earlier attempt; this request is queued again. No worker is currently running or has saved a new report."
              : "No worker has started this request or saved a new report."
            : run?.state === "running"
              ? `Recorded stage: ${run.stage.replaceAll("-", " ")}. Open progress for the exact stages and blockers.`
              : latestRun?.error ||
                "The last request did not save a new report. The previous report, if any, remains available."}
          {hasBlockedScope && (
            <p className="small">
              Evidence blocker: {latestRun.progress!.readinessIssues.join("; ")}
            </p>
          )}
          <Button kind="text" onClick={() => go("processing", opportunity.id)}>
            View recorded progress <I.ArrowRight size={16} />
          </Button>
        </Notice>
      )}

      <div className="pursuit-overview-grid">
        <section
          className="connected-panel pursuit-next"
          aria-labelledby="pursuit-next-title"
        >
          <div className="pursuit-section-heading">
            <div>
              <span className="eyebrow">MOVE THE WORK FORWARD</span>
              <h2 id="pursuit-next-title">Next steps</h2>
            </div>
          </div>
          {owner && (
            <div className="pursuit-next-primary">
              <div>
                <strong>{firstAction.label}</strong>
                <p>
                  {run
                    ? "Check the recorded stages before changing the evidence pack."
                    : stopped
                      ? "Read the exact blocker before making a new request."
                      : pack && !pack.complete
                        ? `${pack.counts.received} of ${pack.counts.expected} original files admitted; ${pack.counts.readable} readable.`
                        : !detail.sources.length
                          ? "Add original evidence before analysis."
                          : report
                            ? "Use an explicit new request when the source pack or scope changes."
                            : "Use the saved sources for the first full pursuit assessment."}
                </p>
              </div>
              <Button onClick={() => go(firstAction.page, opportunity.id)}>
                {firstAction.label} <I.ArrowRight size={16} />
              </Button>
            </div>
          )}
          <div className="pursuit-next-links">
            <Button kind="text" onClick={() => go("sources", opportunity.id)}>
              Inspect source library <I.ArrowRight size={16} />
            </Button>
            {report && (
              <>
                <Button
                  kind="text"
                  onClick={() => go("requirements", opportunity.id, report.id)}
                >
                  Requirements & evidence <I.ArrowRight size={16} />
                </Button>
                {owner && (
                  <Button
                    kind="text"
                    onClick={() => go("decisions", opportunity.id, report.id)}
                  >
                    {decision ? "Review firm decision" : "Record firm decision"}
                    <I.ArrowRight size={16} />
                  </Button>
                )}
              </>
            )}
          </div>
          {decision && (
            <p className="small pursuit-decision">
              Your saved decision: <strong>{decision.choice}</strong> ·{" "}
              {date(decision.created_at)}. It remains separate from the
              assessment.
            </p>
          )}
        </section>

        <section
          className="connected-panel pursuit-sources"
          aria-labelledby="pursuit-sources-title"
        >
          <div className="pursuit-section-heading">
            <div>
              <span className="eyebrow">CURRENT EVIDENCE</span>
              <h2 id="pursuit-sources-title">Sources & coverage</h2>
            </div>
            <Button kind="text" onClick={() => go("sources", opportunity.id)}>
              View all <I.ArrowRight size={16} />
            </Button>
          </div>
          {pack && (
            <p className="small pursuit-pack-status">
              Tender pack: {pack.counts.received}/{pack.counts.expected}{" "}
              originals admitted · {pack.counts.readable} readable ·{" "}
              {pack.complete ? "inventory reconciled" : "incomplete inventory"}.
              Analytical coverage is shown per source.
            </p>
          )}
          {detail.sources.length ? (
            <>
              <ul className="pursuit-source-list">
                {detail.sources.slice(0, 4).map((source) => (
                  <li key={source.id}>
                    <div>
                      <strong>{source.name}</strong>
                      <span>
                        {source.purpose} · {source.coverage.read}/
                        {source.coverage.total ?? "?"} {source.coverage.unit}
                        {source.coverage.total === 1 ? "" : "s"} read
                      </span>
                    </div>
                    <Badge
                      tone={
                        sourceLabel(source) === "Read" ? "success" : "warning"
                      }
                    >
                      {sourceLabel(source)}
                    </Badge>
                  </li>
                ))}
              </ul>
              {detail.sources.length > 4 && (
                <p className="small muted">
                  {detail.sources.length - 4} more source
                  {detail.sources.length - 4 === 1 ? "" : "s"} in the library.
                </p>
              )}
            </>
          ) : (
            <p>No active source is saved for this opportunity.</p>
          )}
        </section>
      </div>

      {report && (
        <section className="pursuit-report-history">
          <div>
            <span className="eyebrow">SAVED INTELLIGENCE</span>
            <h2>Report versions</h2>
            <p className="small muted">
              Each version keeps its own assessment, source basis and review
              state. The latest pursuit read is shown above.
            </p>
          </div>
          <label>
            Open a saved version
            <select
              defaultValue=""
              onChange={(event) => {
                if (event.target.value)
                  go("report", opportunity.id, event.target.value);
              }}
            >
              <option value="" disabled>
                Choose a version
              </option>
              {detail.reports.map((item) => (
                <option key={item.id} value={item.id}>
                  {kindLabel[item.kind]} · {date(item.created_at)} ·{" "}
                  {new Date(item.created_at).toLocaleTimeString("en-NZ")}
                </option>
              ))}
            </select>
          </label>
          {owner && (
            <details>
              <summary>Use this intelligence in other reports</summary>
              <div className="pursuit-next-links">
                {(["watchlist", "competitor", "weekly"] as const).map(
                  (kind) => (
                    <Button
                      key={kind}
                      kind="text"
                      disabled={busy}
                      onClick={() => onDerive(kind)}
                    >
                      Open {kindLabel[kind].toLowerCase()}
                    </Button>
                  ),
                )}
              </div>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
