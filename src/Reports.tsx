import { useState, type FormEvent } from "react";
import { useDemo } from "./context";
import { acceptRequest } from "./model";
import { supplierNames } from "./catalogue";
import {
  Badge,
  Button,
  Empty,
  I,
  KeyFacts,
  Modal,
  Notice,
  PageHeader,
  Search,
  StateBoundary,
} from "./ui";

const stages = [
  "Request accepted",
  "Reading sources",
  "Assessing requirements",
  "Preparing report",
  "Report published",
];
export function ProgressSteps({
  stage,
  operator = false,
  labels = stages,
}: {
  stage: string;
  operator?: boolean;
  labels?: string[];
}) {
  const current =
    (
      {
        queued: 1,
        reading: 1,
        processing: 2,
        assessing: 2,
        preparing: 3,
        ready: 4,
        complete: 4,
        retrying: 2,
        failed: 1,
        cancelled: 1,
      } as Record<string, number>
    )[stage] ?? 2;
  return (
    <ol className="progress-steps">
      {labels.map((label, index) => (
        <li
          key={label}
          className={
            index < current || current === 4
              ? "done"
              : index === current
                ? "current"
                : ""
          }
        >
          <div className="step-icon">
            {index < current || current === 4 ? (
              <I.CheckCircle size={25} weight="fill" />
            ) : index === current && stage === "failed" ? (
              <I.WarningCircle size={25} />
            ) : index === current &&
              stage !== "cancelled" &&
              stage !== "queued" ? (
              <I.Spinner className="spin" size={25} />
            ) : (
              <I.Circle size={25} />
            )}
          </div>
          <div>
            <h3>{label}</h3>
            <p>
              {index < current || current === 4
                ? operator
                  ? "Succeeded · output accepted"
                  : "Complete"
                : index === current
                  ? stage === "failed"
                    ? "Required source extraction failed"
                    : stage === "cancelled"
                      ? "Cancelled; no new output published"
                      : stage === "retrying"
                        ? "Retrying after a temporary interruption"
                        : stage === "queued"
                          ? "Saved in the queue; waiting for a worker"
                          : "Work is in progress"
                  : stage === "cancelled"
                    ? "Not run; request cancelled"
                    : stage === "failed"
                      ? "Blocked by required stage"
                      : "Waiting for the preceding step"}
            </p>
            {operator && (
              <small className="muted">
                Input manifest v2 · Stage {index + 1} ·{" "}
                {stage === "retrying" && index === current
                  ? "attempt 2"
                  : "attempt 1"}
              </small>
            )}
          </div>
          <Badge
            tone={
              index < current || current === 4
                ? "success"
                : index === current && stage === "failed"
                  ? "error"
                  : index === current
                    ? "warning"
                    : "neutral"
            }
          >
            {index < current || current === 4
              ? "Succeeded"
              : index === current
                ? stage === "failed"
                  ? "Failed"
                  : stage === "cancelled"
                    ? "Cancelled"
                    : stage === "queued"
                      ? "Queued"
                      : "Running"
                : stage === "cancelled"
                  ? "Not run"
                  : stage === "failed"
                    ? "Blocked"
                    : "Pending"}
          </Badge>
        </li>
      ))}
    </ol>
  );
}
export function RequestAnalysis() {
  const { demo, setDemo, scene, params, go } = useDemo();
  const [kind, setKind] = useState(
    params.get("kind") === "competitor"
      ? "Competitor profile"
      : "Notice-only assessment",
  );
  const targetId = String(
    Math.max(
      0,
      Math.min(supplierNames.length - 1, Number(params.get("id")) || 0),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(scene === "error");
  const [ack, setAck] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ack) return;
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      if (scene === "error" && !error) {
        setError(true);
        return;
      }
      setDemo((d) => acceptRequest(d, kind, targetId));
      go("processing");
    }, 500);
  };
  return (
    <>
      <PageHeader
        title="Request an assessment."
        description="Choose the scope. Check the inputs. Keep a record of the work."
        breadcrumb="Reports"
      />
      <StateBoundary
        inlineError
        emptyTitle="Add evidence for document analysis"
        emptyDescription="A notice-only assessment remains available. To assess the tender documents, add sample evidence first."
        emptyAction={
          <Button onClick={() => go("upload")}>Add documents</Button>
        }
      >
        <div className="two-col">
          <form className="form-surface" onSubmit={submit}>
            {error && (
              <Notice
                title="The previous request was not accepted"
                tone="error"
              >
                Your selections are preserved. Submit again to retry.
              </Notice>
            )}
            <h2>What would you like to know?</h2>
            {[
              "Notice-only assessment",
              "Document assessment",
              "Competitor profile",
            ].map((value) => (
              <label
                className={"radio-option " + (kind === value ? "selected" : "")}
                key={value}
              >
                <input
                  type="radio"
                  name="scope"
                  value={value}
                  checked={kind === value}
                  onChange={() => setKind(value)}
                />
                <span>
                  <strong>{value}</strong>
                  <small>
                    {value === "Notice-only assessment"
                      ? "A scoped view using the public notice and firm context."
                      : value === "Document assessment"
                        ? "Requirements and evidence across the included tender documents."
                        : "Historical participation and qualitative competitive context."}
                  </small>
                </span>
              </label>
            ))}
            {kind === "Document assessment" && !demo.coverageComplete && (
              <Notice title="Two pages need extraction or review">
                A full document assessment cannot be published until required
                coverage is resolved.
              </Notice>
            )}
            <label className="check-row">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              I have checked the scope, firm and source versions.
            </label>
            <div className="form-actions">
              <Button
                kind="secondary"
                type="button"
                onClick={() => go("pursuit")}
              >
                Back
              </Button>
              <Button
                type="submit"
                disabled={!ack || busy || scene === "submitting"}
              >
                {busy || scene === "submitting" ? (
                  <>
                    <I.Spinner className="spin" size={18} />
                    Saving request…
                  </>
                ) : (
                  "Request assessment"
                )}
              </Button>
            </div>
            <p className="muted small">
              Prototype only · no paid generation, uploads or email.
            </p>
          </form>
          <aside className="request-manifest">
            <h2>Included in this request</h2>
            <KeyFacts
              items={[
                ["Firm", demo.firm],
                [
                  kind === "Competitor profile" ? "Supplier" : "Opportunity",
                  kind === "Competitor profile"
                    ? supplierNames[Number(targetId)]
                    : "Digital service transformation",
                ],
                [
                  kind === "Competitor profile" ? "History snapshot" : "Notice",
                  kind === "Competitor profile"
                    ? "Accepted award records · 1 Sep 2026"
                    : "Revision 3 · closes 24 Sep 2026",
                ],
                ["Firm profile", "Version 1 · 8 Sep 2026"],
              ]}
            />
            <h3>Evidence sources</h3>
            <div className="simple-row">
              <I.File />
              <span>
                {kind === "Competitor profile"
                  ? "Award records and attributed supplier context"
                  : "Captured public notice"}
              </span>
              <Badge>Public</Badge>
            </div>
            {kind === "Document assessment" && (
              <>
                <div className="simple-row">
                  <I.File />
                  <span>Tender requirements.pdf · v2</span>
                  <Badge tone={demo.coverageComplete ? "success" : "warning"}>
                    {demo.coverageComplete ? "18 / 18 pages" : "16 / 18 pages"}
                  </Badge>
                </div>
                <div className="simple-row">
                  <I.File />
                  <span>Koru capability statement.pdf</span>
                  <Badge>Private</Badge>
                </div>
                <Button kind="text" onClick={() => go("upload")}>
                  Manage documents <I.ArrowRight size={16} />
                </Button>
              </>
            )}
            <Notice title="A saved request stays available" tone="info">
              You can leave the page and return to its progress. The browser
              does not own the work.
            </Notice>
          </aside>
        </div>
      </StateBoundary>
    </>
  );
}
export function Processing() {
  const { demo, setDemo, scene, go } = useDemo();
  const [confirm, setConfirm] = useState(false);
  const stage =
    scene === "normal"
      ? demo.request?.stage || "queued"
      : scene === "processing"
        ? "assessing"
        : scene === "complete"
          ? "ready"
          : scene;
  const ready = stage === "ready";
  const failed = stage === "failed";
  const cancelled = stage === "cancelled";
  const retry = () => {
    setDemo((d) =>
      d.request
        ? { ...d, request: { ...d.request, stage: "queued" } }
        : acceptRequest(d, "Notice-only assessment"),
    );
    go("processing");
  };
  return (
    <>
      <PageHeader
        title={
          ready
            ? "Your report is ready."
            : failed
              ? "Your request needs attention."
              : cancelled
                ? "Request cancelled."
                : "Good decisions take groundwork."
        }
        description={
          ready
            ? "A new report version is available in your library."
            : "Your request is saved. You can leave this page and return at any time."
        }
        breadcrumb="Reports"
        actions={
          <Badge tone={failed ? "error" : ready ? "success" : "warning"} dot>
            {ready
              ? "Published"
              : failed
                ? "Required stage failed"
                : cancelled
                  ? "Cancelled"
                  : "Processing"}
          </Badge>
        }
      />
      <KeyFacts
        items={[
          [
            "Request",
            "PR-2026-" + String(demo.request?.id || 1).padStart(3, "0"),
          ],
          ["Scope", demo.request?.kind || "Document assessment"],
          ["Firm", demo.firm],
          ["Submitted", "9 Sep 2026 · 10:18 NZST"],
        ]}
      />
      {failed && (
        <Notice
          title={
            demo.request &&
            demo.request.inputRevision !== (demo.changed ? 3 : 2)
              ? "The inputs changed before publication"
              : "Two required pages could not be read"
          }
          tone="error"
        >
          A replacement report has not been published. Review the request inputs
          before retrying. Your previous report is still available.
        </Notice>
      )}
      {scene === "retrying" && (
        <Notice title="Retrying the interrupted assessment" tone="info">
          Previously accepted work is retained. This is the same saved request.
        </Notice>
      )}
      {cancelled && (
        <Notice title="No new report will be published">
          Previously published reports remain available.
        </Notice>
      )}
      <div className="two-col progress-layout">
        <ProgressSteps stage={stage} />
        <aside className="inset">
          <h2>{ready ? "What’s next" : "While we work"}</h2>
          <p>
            {ready
              ? "Read the assessment, inspect the sources and record your own decision."
              : "Source facts, analysis and your firm’s decision remain separate. A completed report may still recommend holding."}
          </p>
          {ready ? (
            <Button
              onClick={() =>
                go(
                  demo.request?.kind === "Competitor profile"
                    ? "competitor"
                    : "report",
                  "normal",
                  { id: demo.request?.targetId || "0" },
                )
              }
            >
              Read report <I.ArrowRight size={17} />
            </Button>
          ) : failed || cancelled ? (
            <Button onClick={retry}>
              <I.Refresh size={17} />
              Retry this request
            </Button>
          ) : (
            <Button kind="secondary" onClick={() => go("watchlist")}>
              Return to watchlist
            </Button>
          )}
          <Button kind="text" onClick={() => go("reports")}>
            View previous reports
          </Button>
          {!ready && !failed && !cancelled && (
            <Button kind="text" onClick={() => setConfirm(true)}>
              Cancel request
            </Button>
          )}
        </aside>
      </div>
      {ready && demo.emailFailed && (
        <Notice title="Report ready; email delivery failed">
          The report is available. Delivery can be retried independently.
        </Notice>
      )}
      {confirm && (
        <Modal title="Cancel this request?" onClose={() => setConfirm(false)}>
          <p>
            Work for this request will stop. Earlier published reports remain in
            your library.
          </p>
          <div className="form-actions">
            <Button kind="secondary" onClick={() => setConfirm(false)}>
              Keep processing
            </Button>
            <Button
              kind="danger"
              onClick={() => {
                setDemo((d) =>
                  d.request
                    ? { ...d, request: { ...d.request, stage: "cancelled" } }
                    : d,
                );
                setConfirm(false);
                go("processing", "cancelled");
              }}
            >
              Cancel request
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function ReportLibrary() {
  const { demo, scene, go } = useDemo();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All reports");
  const rows = [
    {
      title: "Digital service transformation",
      type: "Pursuit assessment",
      version: demo.reportVersion,
      date: "9 Sep 2026",
      page: "report",
    },
    {
      title: "Your week in procurement",
      type: "Weekly brief",
      version: 1,
      date: "7 Sep 2026",
      page: "brief",
    },
    {
      title: "Aster Consulting",
      type: "Competitor profile",
      version: 1,
      date: "8 Sep 2026",
      page: "competitor",
    },
  ].filter(
    (r) =>
      (filter === "All reports" || r.type === filter) &&
      r.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        title="Intelligence you can return to."
        description="Published reports, preserved versions and work in progress."
        breadcrumb="Reports"
        actions={
          <Button onClick={() => go("request")}>
            <I.Plus size={18} />
            New assessment
          </Button>
        }
      />
      <div className="filter-row">
        <Search
          value={search}
          onChange={setSearch}
          placeholder="Search reports"
        />
        <select
          aria-label="Report type"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {[
            "All reports",
            "Pursuit assessment",
            "Weekly brief",
            "Competitor profile",
          ].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </div>
      <StateBoundary
        emptyTitle="Your report library starts here"
        emptyDescription="Request your first assessment from an opportunity or a competitor profile."
        emptyAction={
          <Button onClick={() => go("request")}>Request assessment</Button>
        }
      >
        {(scene === "processing" ||
          (demo.request &&
            !["ready", "cancelled"].includes(demo.request.stage))) && (
          <Notice
            title="An assessment is in progress"
            tone="info"
            action={
              <Button kind="text" onClick={() => go("processing")}>
                View progress
              </Button>
            }
          >
            The previous published reports below remain available.
          </Notice>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Report</th>
                <th>Type</th>
                <th>Published</th>
                <th>Version</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.title}>
                  <td>
                    <button
                      className="table-title"
                      onClick={() => go(row.page)}
                    >
                      {row.title}
                    </button>
                    <small>{demo.firm} · private</small>
                  </td>
                  <td>{row.type}</td>
                  <td>{row.date}</td>
                  <td>
                    <Badge>v{row.version}</Badge>
                  </td>
                  <td>
                    <Button kind="text" onClick={() => go(row.page)}>
                      Read <I.ArrowRight size={16} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <Empty
              title="No reports match these filters"
              description="Try a different report type or search term."
              action={
                <Button
                  kind="text"
                  onClick={() => {
                    setFilter("All reports");
                    setSearch("");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          )}
        </div>
      </StateBoundary>
    </>
  );
}
export function ReportReader({
  shared = false,
  brief = false,
}: {
  shared?: boolean;
  brief?: boolean;
}) {
  const { demo, scene, go, notify } = useDemo();
  const [version, setVersion] = useState(
    shared ? demo.shareVersion : demo.reportVersion,
  );
  const record =
    demo.reportHistory.find((r) => r.version === version) ||
    demo.reportHistory[0];
  const documentReport = record.kind === "Document assessment";
  if (
    shared &&
    (scene === "expired" || scene === "revoked" || demo.share === "revoked")
  )
    return (
      <Empty
        title={
          scene === "expired"
            ? "This share has expired"
            : "This share was revoked"
        }
        description="The report is no longer accessible through this link. Ask the report owner for a new share."
        action={
          <Button kind="secondary" onClick={() => go("access")}>
            Go to sign-in
          </Button>
        }
      />
    );
  const download = () => {
    const text =
      "# Procint · fictional sample report\n\nDigital service transformation\nVersion " +
      version +
      "\nScope: " +
      record.kind +
      "\n\n" +
      (record.reviewed
        ? "Evidence reviewed. The firm decision remains separate."
        : "Hold for review. Certification and required evidence remain unresolved.") +
      "\n\nThis is a UX prototype, not procurement advice.";
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/markdown" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "procint-sample-report-v" + version + ".md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Fictional report summary downloaded.");
  };
  return (
    <>
      <PageHeader
        staticBreadcrumb={shared}
        title={
          brief ? "Your week in procurement." : "Digital service transformation"
        }
        description={
          brief
            ? "7–13 September 2026 · prepared for " + demo.firm
            : "Pursuit assessment · Harbour Regional Council"
        }
        breadcrumb="Reports"
        actions={
          <>
            <Badge tone="success">Published · v{version}</Badge>
            {!shared && (
              <Button
                kind="secondary"
                onClick={() =>
                  go("sharing", "normal", { version: String(version) })
                }
              >
                <I.Link size={17} />
                Share report
              </Button>
            )}
          </>
        }
      />
      <StateBoundary
        emptyTitle="Your next brief is taking shape"
        emptyDescription="There were no matching published opportunities in this fixture."
        loadingLabel="Opening the report version"
      >
        {shared && (
          <Notice title="Recipient preview · fictional share" tone="info">
            Read-only report version {version}. Private source files are not
            included. Demo expiry: {demo.shareExpires}.
          </Notice>
        )}
        {(scene === "stale" || version < demo.reportVersion) && (
          <Notice title="You’re reading an earlier evidence snapshot">
            This report preserves its original facts. A newer notice closes on
            24 Sep 2026.
            <Button
              kind="text"
              onClick={() => {
                setVersion(demo.reportVersion);
                go("pursuit", "stale");
              }}
            >
              Review current opportunity
            </Button>
          </Notice>
        )}
        {scene === "partial" && (
          <Notice title="Limited scope · some source coverage is missing">
            This is a notice-only assessment. It is not a complete analysis of
            the tender documents.
          </Notice>
        )}
        {scene === "processing" && (
          <Notice title="The next brief is being prepared" tone="info">
            The last accepted brief is available below.
          </Notice>
        )}
        <div className="report-layout">
          <aside className="report-outline">
            <span className="eyebrow">IN THIS REPORT</span>
            {[
              "Summary",
              "Opportunity",
              "Evidence & gaps",
              "Recommended next steps",
            ].map((name, index) => (
              <a
                href={"#section-" + index}
                key={name}
                onClick={(e) => {
                  e.preventDefault();
                  document
                    .getElementById("section-" + index)
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                {name}
              </a>
            ))}
            {!shared && (
              <>
                <label>
                  Report version
                  <select
                    value={version}
                    onChange={(e) => setVersion(Number(e.target.value))}
                  >
                    {Array.from({ length: demo.reportVersion }, (_, i) => (
                      <option key={i} value={i + 1}>
                        Version {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
                <Button kind="text" onClick={download}>
                  <I.Download size={17} />
                  Download summary
                </Button>
              </>
            )}
          </aside>
          <article className="report-body">
            <div className="eyebrow">
              {brief
                ? "WEEKLY BRIEF"
                : documentReport
                  ? "DOCUMENT ASSESSMENT"
                  : "NOTICE-ONLY ASSESSMENT"}{" "}
              · 9 SEPTEMBER 2026
            </div>
            <h2 id="section-0">
              {brief
                ? "Three things worth your attention."
                : record.reviewed
                  ? "The evidence is ready for a considered decision."
                  : "A relevant opportunity, with questions to resolve."}
            </h2>
            <p className="lead">
              {brief
                ? "A deadline extension creates time for a closer review. A planned panel may offer a future opportunity. One renewal forecast needs better evidence."
                : record.reviewed
                  ? "The recorded mandatory requirements, document coverage and delivery capability were reviewed for this report version. Commercial fit remains a separate consideration."
                  : "The digital advisory scope aligns with your firm’s stated services. Mandatory eligibility and delivery capability still need review before a pursuit decision."}
            </p>
            <Notice
              title={
                record.reviewed
                  ? "Assessment: Evidence reviewed"
                  : "Assessment: Hold for review"
              }
              tone={record.reviewed ? "success" : "warning"}
            >
              This conclusion is separate from your firm’s recorded decision.
            </Notice>
            <h2 id="section-1">The opportunity</h2>
            <p>
              Harbour Regional Council is seeking support for a digital service
              transformation programme. The captured public notice closes on 24
              September 2026 at 5pm NZST. Contract value has not been disclosed.
            </p>
            <KeyFacts
              items={[
                [
                  "Scope",
                  documentReport
                    ? "Notice, tender documents and firm evidence"
                    : "Public notice and firm context",
                ],
                ["Incumbent", "Unknown"],
                ["Value", "Not disclosed"],
              ]}
            />
            <h2 id="section-2">Evidence and open questions</h2>
            <ol className="report-findings">
              <li>
                <strong>
                  {record.reviewed
                    ? "Mandatory certification reviewed."
                    : "Mandatory certification is not confirmed."}
                </strong>
                <p>
                  {record.reviewed
                    ? "The firm attributed a current certificate and rationale to its requirement review."
                    : "The requirement appears in the tender documents. This report does not establish that a current certificate satisfies it."}
                </p>
                <button
                  className="citation"
                  onClick={() =>
                    shared
                      ? notify(
                          "Private source files are outside this share grant.",
                        )
                      : go("document")
                  }
                >
                  [1] Tender requirements, p. 12 · v2
                  {shared ? " · firm access required" : ""}
                </button>
              </li>
              <li>
                <strong>
                  {record.coverageComplete
                    ? "Required document coverage is complete."
                    : "Document coverage is outside this report’s scope."}
                </strong>
                <p>
                  {record.coverageComplete
                    ? "All 18 sample pages were readable or reviewed before publication."
                    : "This notice-only report does not claim to identify every mandatory requirement in the tender documents."}
                </p>
              </li>
              <li>
                <strong>Incumbency is unknown.</strong>
                <p>
                  Historical participation alone does not establish the current
                  contract holder or future bidders.
                </p>
              </li>
            </ol>
            <h2 id="section-3">Recommended next steps</h2>
            <p>
              {record.reviewed
                ? "Review the commercial context and record the firm’s decision with a rationale. This published report does not itself record a pursuit decision."
                : "Review the certification requirement, document coverage and delivery capability. Record the firm’s decision with its rationale once the relevant evidence is available."}
            </p>
            {!shared && (
              <Button onClick={() => go("pursuit")}>
                Open pursuit workspace <I.ArrowRight size={17} />
              </Button>
            )}
            <footer className="report-end">
              Fictional demonstration · version {version} · evidence and review
              state preserved
            </footer>
          </article>
        </div>
      </StateBoundary>
    </>
  );
}
export function Sharing() {
  const { demo, setDemo, scene, params, go, notify } = useDemo();
  const selectedVersion = Math.max(
    1,
    Math.min(
      demo.reportVersion,
      Number(params.get("version")) || demo.reportVersion,
    ),
  );
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState(scene === "error");
  const [expiry, setExpiry] = useState(demo.shareExpires);
  const active =
    demo.share === "active" &&
    demo.shareVersion === selectedVersion &&
    scene !== "empty" &&
    scene !== "revoked" &&
    scene !== "expired";
  const create = () => {
    setBusy(true);
    setTimeout(() => {
      setDemo((d) => ({
        ...d,
        share: "active",
        shareExpires: expiry,
        shareVersion: selectedVersion,
      }));
      setBusy(false);
      setError(false);
      notify("Demo share created. No report was sent.");
    }, 450);
  };
  return (
    <>
      <PageHeader
        title="Share a considered view."
        description="Give access to one report version, with an expiry you control."
        breadcrumb="Reports"
      />
      <div className="two-col">
        <section>
          <h2>Digital service transformation</h2>
          <KeyFacts
            items={[
              ["Report", "Published version " + selectedVersion],
              ["Included", "Report text and embedded excerpts"],
              ["Excluded", "Private source files and firm profile"],
            ]}
          />
          <Notice title="Preview what your recipient sees" tone="info">
            This demo creates a local recipient view. It sends no email and
            grants no real external access.
          </Notice>
          <Button kind="secondary" onClick={() => go("shared")}>
            Preview recipient view <I.Eye size={17} />
          </Button>
        </section>
        <section className="form-surface">
          <h2>Access settings</h2>
          {error && (
            <Notice title="Couldn’t create the share" tone="error">
              Your selections have been kept. Try again.
            </Notice>
          )}
          {(scene === "revoked" || demo.share === "revoked") && (
            <Notice title="Share revoked">
              Future access through this share is blocked. Downloaded copies
              cannot be recalled.
            </Notice>
          )}
          {scene === "expired" && (
            <Notice title="Share expired">
              Create a new share if access is still required.
            </Notice>
          )}
          <label>
            Expires on
            <input
              type="date"
              min="2026-09-10"
              value={expiry}
              disabled={active}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </label>
          <p className="muted">
            Seven days is a proposed default. Source files remain private.
          </p>
          {active ? (
            <>
              <Badge tone="success" dot>
                Active · read only
              </Badge>
              <div className="form-actions">
                <Button
                  kind="secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        location.origin + location.pathname + "#/shared",
                      );
                      notify(
                        "Local demo link copied. It works only where this local server is reachable.",
                      );
                    } catch {
                      notify(
                        "Copy unavailable. Open the recipient preview to use its address.",
                      );
                    }
                  }}
                >
                  Copy demo link
                </Button>
                <Button kind="danger" onClick={() => setConfirm(true)}>
                  Revoke share
                </Button>
              </div>
            </>
          ) : (
            <Button
              disabled={
                busy || scene === "saving" || !expiry || expiry <= "2026-09-09"
              }
              onClick={create}
            >
              {busy || scene === "saving"
                ? "Creating share…"
                : "Create demo share"}
            </Button>
          )}
        </section>
      </div>
      {confirm && (
        <Modal title="Revoke this share?" onClose={() => setConfirm(false)}>
          <p>
            Future access to this report version through the share will stop.
          </p>
          <div className="form-actions">
            <Button kind="secondary" onClick={() => setConfirm(false)}>
              Keep active
            </Button>
            <Button
              kind="danger"
              onClick={() => {
                setDemo((d) => ({ ...d, share: "revoked" }));
                setConfirm(false);
              }}
            >
              Revoke share
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
