import { useState, type FormEvent } from "react";
import { useDemo } from "./context";
import { acceptRequest } from "./model";
import { AssessmentBody } from "./Intelligence";
import { listingId, recommendation, requestLabel } from "./intelligence-data";
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

const rfpStages = [
  "Request accepted",
  "Reading scope, criteria and requirements",
  "Reassessing competition and recommendation",
  "Analyst checks incumbent scope",
  "Preparing revised report",
  "Report published",
];
const stages = [
  "Request accepted",
  "Reading sources",
  "Reassessing scope and competition",
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
  const last = labels.length - 1;
  const current =
    (
      {
        queued: 1,
        reading: 1,
        processing: 2,
        assessing: 2,
        review: 3,
        preparing: last - 1,
        ready: last,
        complete: last,
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
            index < current || current === last
              ? "done"
              : index === current
                ? "current"
                : ""
          }
        >
          <div className="step-icon">
            {index < current || current === last ? (
              <I.CheckCircle size={25} weight="fill" />
            ) : index === current && stage === "failed" ? (
              <I.WarningCircle size={25} />
            ) : index === current &&
              stage !== "cancelled" &&
              stage !== "queued" &&
              stage !== "review" ? (
              <I.Spinner className="spin" size={25} />
            ) : (
              <I.Circle size={25} />
            )}
          </div>
          <div>
            <h3>{label}</h3>
            <p>
              {index < current || current === last
                ? operator
                  ? "Succeeded · output accepted"
                  : "Complete"
                : index === current
                  ? stage === "failed"
                    ? "Required source extraction failed"
                    : stage === "cancelled"
                      ? "Cancelled; no new output published"
                      : stage === "review"
                        ? "Awaiting an attributed analytical review"
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
              index < current || current === last
                ? "success"
                : index === current && stage === "failed"
                  ? "error"
                  : index === current
                    ? "warning"
                    : "neutral"
            }
          >
            {index < current || current === last
              ? "Succeeded"
              : index === current
                ? stage === "failed"
                  ? "Failed"
                  : stage === "cancelled"
                    ? "Cancelled"
                    : stage === "review"
                      ? "Review needed"
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
      : params.get("kind") === "rfp"
        ? "Document assessment"
        : "Notice-only assessment",
  );
  const [listing, setListing] = useState(
    params.get("listing") === listingId ? listingId : "",
  );
  const [identityChecked, setIdentityChecked] = useState(false);
  const activeRequest =
    !!demo.request &&
    !["ready", "failed", "cancelled"].includes(demo.request.stage);
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
    if (
      !ack ||
      activeRequest ||
      (kind === "Competitor profile" && (!listing || !identityChecked))
    )
      return;
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      if (scene === "error" && !error) {
        setError(true);
        return;
      }
      setDemo((d) =>
        acceptRequest(
          d,
          kind,
          targetId,
          kind === "Competitor profile" ? listing : listingId,
        ),
      );
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
            {activeRequest && (
              <Notice title="An assessment is already open" tone="info">
                Resume or cancel the existing sample request before starting
                another.
                <Button kind="text" onClick={() => go("processing")}>
                  Resume existing request
                </Button>
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
                  <strong>{requestLabel(value)}</strong>
                  <small>
                    {value === "Notice-only assessment"
                      ? "Opportunity, incumbent position, reasoned bidders and a separate firm layer."
                      : value === "Document assessment"
                        ? "Revisit scope, criteria and competitors; change or retract findings and reassess the recommendation."
                        : "A verified sample firm assessed against a specific listing using the named analytical methods."}
                  </small>
                </span>
              </label>
            ))}
            {kind === "Competitor profile" && (
              <div className="competitor-request-context">
                <label>
                  Required listing context
                  <select
                    value={listing}
                    onChange={(e) => setListing(e.target.value)}
                  >
                    <option value="">Select a listing</option>
                    <option value={listingId}>
                      Digital service transformation · {listingId}
                    </option>
                  </select>
                </label>
                <p>
                  <strong>{supplierNames[Number(targetId)]}</strong> · DEMO-ORG-
                  {Number(targetId) + 1}
                  <br />
                  <small>
                    Identity matched in the fictional dataset; not a live
                    company verification.
                  </small>
                </p>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={identityChecked}
                    onChange={(e) => setIdentityChecked(e.target.checked)}
                  />
                  This is the intended firm for this listing.
                </label>
              </div>
            )}
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
                disabled={
                  !ack ||
                  activeRequest ||
                  busy ||
                  scene === "submitting" ||
                  (kind === "Competitor profile" &&
                    (!listing || !identityChecked))
                }
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
                  "Listing",
                  kind === "Competitor profile"
                    ? listing || "Required · select a listing"
                    : listingId,
                ],
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
          : scene === "partial"
            ? "assessing"
            : scene;
  const ready = stage === "ready";
  const review = stage === "review";
  const rfp =
    demo.request?.kind === "Document assessment" || scene === "review";
  const failed = stage === "failed";
  const cancelled = stage === "cancelled";
  const retry = () => {
    setDemo((d) =>
      d.request
        ? {
            ...d,
            request: {
              ...d.request,
              stage: "queued",
              inputRevision: d.changed ? 3 : 2,
              reviewReason: undefined,
            },
          }
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
            : review
              ? "A finding needs an analyst’s review."
              : failed
                ? "Your request needs attention."
                : cancelled
                  ? "Request cancelled."
                  : "Good decisions take groundwork."
        }
        description={
          ready
            ? "A new report version is available in your library."
            : review
              ? "The draft revision is held. Your previous report remains available."
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
                  : review
                    ? "Awaiting review"
                    : stage === "queued"
                      ? "Queued"
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
          [
            "Scope",
            requestLabel(rfp ? "Document assessment" : demo.request?.kind),
          ],
          ["Firm", demo.firm],
          ["Submitted", "9 Sep 2026 · 10:18 NZST"],
        ]}
      />
      {review && (
        <Notice title="Incumbent scope differs between sources">
          The agency register lists Aster for platform support; the RFP defines
          a separate advisory package. An analyst must resolve the
          interpretation before this example publishes.
          <Button kind="text" onClick={() => go("run", "review", { job: "1" })}>
            Open analyst review
          </Button>
        </Notice>
      )}
      {scene === "partial" && (
        <Notice title="Optional supplier context unavailable">
          The required notice and award inputs remain available. The report will
          identify the missing web material and limit conclusions that depend on
          it.
        </Notice>
      )}
      {rfp && (
        <p className="prototype-policy">
          Proposed publication policy: hold a changed incumbent finding for an
          attributed analyst review. Reviewer ownership and response time await
          Bobby’s confirmation.
        </p>
      )}
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
        <ProgressSteps stage={stage} labels={rfp ? rfpStages : stages} />
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
                  {
                    id: demo.request?.targetId || "0",
                    listing: demo.request?.listingId || "",
                    ...(scene === "complete" && !demo.request?.published
                      ? { state: "reassessed" }
                      : {}),
                  },
                )
              }
            >
              Read report <I.ArrowRight size={17} />
            </Button>
          ) : review ? (
            <Button onClick={() => go("run", "review", { job: "1" })}>
              Inspect review item
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
            title={
              demo.request?.stage === "review"
                ? "An assessment is awaiting analyst review"
                : demo.request?.stage === "failed"
                  ? "An assessment needs attention"
                  : "An assessment is in progress"
            }
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
                      onClick={() =>
                        go(
                          row.page,
                          "normal",
                          row.page === "competitor"
                            ? { id: "0", listing: listingId }
                            : {},
                        )
                      }
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
                    <Button
                      kind="text"
                      onClick={() =>
                        go(
                          row.page,
                          "normal",
                          row.page === "competitor"
                            ? { id: "0", listing: listingId }
                            : {},
                        )
                      }
                    >
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
  const { demo, scene, params, go, notify } = useDemo();
  const [version, setVersion] = useState(
    shared
      ? demo.shareVersion
      : Math.min(
          demo.reportVersion,
          Number(params.get("version")) || demo.reportVersion,
        ),
  );
  const record =
    demo.reportHistory.find((r) => r.version === version) ||
    demo.reportHistory[0];
  const documentReport =
    scene === "reassessed" || record.kind === "Document assessment";
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
      "# Groundwork by BidEdge · fictional sample report\n\nDigital service transformation\nVersion " +
      version +
      "\nScope: " +
      record.kind +
      "\n\n" +
      recommendation(documentReport) +
      "\n\nThis is a UX prototype, not procurement advice.";
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/markdown" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "groundwork-sample-report-v" + version + ".md";
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
            <Badge tone={scene === "reassessed" ? "info" : "success"}>
              {scene === "reassessed"
                ? "RFP result preview"
                : "Published · v" + version}
            </Badge>
            {!shared && scene !== "reassessed" && (
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
        {scene === "reassessed" && (
          <Notice title="Illustrative RFP result · preview" tone="info">
            This scene previews the revised assessment. Complete the upload and
            processing journey to publish a new sample version.
          </Notice>
        )}
        {shared && (
          <Notice title="Recipient preview · fictional share" tone="info">
            Read-only report version {version}. Private source files are not
            included. Demo expiry: {demo.shareExpires}.
          </Notice>
        )}
        {(scene === "stale" || version < demo.reportVersion) && (
          <Notice title="You’re reading an earlier evidence snapshot">
            This report preserves its original facts. A newer assessment may use
            additional sources or a different interpretation.
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
            {["Summary", "Opportunity", "Your firm", "Gaps & next steps"].map(
              (name, index) => (
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
              ),
            )}
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
            <AssessmentBody rfp={documentReport} shared={shared} />
            {record.reviewReason && (
              <details className="section-gap">
                <summary>Analyst correction retained with this version</summary>
                <p>{record.reviewReason}</p>
                <small>
                  Alex Morgan · sample analyst · 9 Sep 2026, 10:24 NZST
                </small>
              </details>
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
