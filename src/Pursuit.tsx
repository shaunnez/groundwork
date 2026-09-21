import { useState, type FormEvent } from "react";
import { useDemo } from "./context";
import { AssessmentBody } from "./Intelligence";
import { PackageNavigation } from "./PursuitAnalysis";
import { assessmentChanges, listingId } from "./intelligence-data";
import { requirements, sources } from "./catalogue";
import {
  blockers,
  completeFixture,
  eligible,
  recordDecision,
  type ReviewOutcome,
  type Decision,
} from "./model";
import {
  Badge,
  Button,
  Empty,
  I,
  KeyFacts,
  Loading,
  Modal,
  Notice,
  PageHeader,
  StateBoundary,
} from "./ui";

export function Evidence({ compact = false }: { compact?: boolean }) {
  const { demo, setDemo, scene, params, go, notify } = useDemo();
  const req =
    requirements.find((r) => r.id === params.get("req")) || requirements[0];
  const sourceIndex = Math.max(
    0,
    Math.min(3, Number(params.get("source") || 0)),
  );
  const source = sources[sourceIndex];
  const [page, setPage] = useState(
    Math.min(
      source.pages,
      Math.max(
        1,
        Number(params.get("page")) ||
          (sourceIndex === 0
            ? scene === "partial" && !compact
              ? 17
              : req.page
            : sourceIndex === 3
              ? 8
              : 1),
      ),
    ),
  );
  const [textView, setTextView] = useState(false);
  const [version, setVersion] = useState(source.version);
  const currentReq = requirements.find((r) => r.page === page);
  const revisedFinding =
    sourceIndex === 0
      ? assessmentChanges.find((c) => c.page === page)
      : undefined;
  const complete = scene === "complete" || demo.coverageComplete;
  const missing =
    sourceIndex === 0 && !complete && (page === 17 || page === 18);
  return (
    <aside className={"evidence " + (compact ? "compact" : "")}>
      <div className="evidence-heading">
        <h2>Evidence</h2>
        {!compact && (
          <Button kind="text" onClick={() => setTextView(!textView)}>
            {textView ? "Document view" : "Accessible text"}
          </Button>
        )}
      </div>
      <p className="source-name">
        <I.File size={20} />
        {source.name}
      </p>
      <div className="source-meta">
        <span>
          <I.Lock size={15} />
          {source.scope === "Private"
            ? "Uploaded by your firm · Private"
            : "Captured public source"}
        </span>
        <span>
          {sourceIndex === 0 ? "Page " + page + " of 18" : "Source excerpt"} ·
          version {version}
        </span>
      </div>
      {!compact && (
        <div className="viewer-controls">
          <Button
            kind="secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            aria-label="Previous page"
          >
            <I.ArrowLeft size={16} />
          </Button>
          <label>
            Page{" "}
            <select
              value={page}
              onChange={(e) => setPage(Number(e.target.value))}
            >
              {Array.from({ length: source.pages }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <Button
            kind="secondary"
            disabled={page >= source.pages}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Next page"
          >
            <I.ArrowRight size={16} />
          </Button>
          <label>
            Version{" "}
            <select
              value={version}
              onChange={(e) => setVersion(Number(e.target.value))}
            >
              {Array.from(
                { length: source.version },
                (_, i) => source.version - i,
              ).map((v) => (
                <option key={v} value={v}>
                  {v} ·{" "}
                  {v === source.version ? "latest captured" : "historical"}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {scene === "loading" ? (
        <Loading label="Opening the captured source" rows={3} />
      ) : scene === "unavailable" ? (
        <Empty
          title="Source unavailable"
          description="This source is unavailable or requires firm access. No other version has been substituted."
        />
      ) : (
        <div className={"source-paper " + (textView ? "text-view" : "")}>
          <div className="paper-meta">
            <span>
              {sourceIndex === 2 ? "Koru Advisory" : "Harbour Regional Council"}
            </span>
            <span>
              {sourceIndex === 2
                ? "Firm capability statement"
                : "Request for Proposal"}
              <br />
              Digital service transformation
            </span>
          </div>
          {version < source.version && (
            <Badge tone="warning">Historical source version</Badge>
          )}
          <h3>
            {sourceIndex === 3
              ? "3.1 Planned procurement"
              : sourceIndex === 2
                ? "Our delivery experience"
                : sourceIndex === 1
                  ? "Notice overview"
                  : missing
                    ? "Schedule 2 · Delivery details"
                    : revisedFinding?.topic ||
                      currentReq?.section ||
                      "Source page " + page}
          </h3>
          <p>
            {sourceIndex === 2
              ? "Koru Advisory supports public-sector digital programmes through research, service design and independent assurance. The following examples were supplied by the firm."
              : sourceIndex === 3
                ? "The agency sets out its indicative procurement priorities for the coming financial year. These plans may change before an opportunity is published."
                : sourceIndex === 1
                  ? "The agency has updated its public procurement notice. Check the latest closing date before planning a response."
                  : currentReq?.id === "security"
                    ? "The supplier must demonstrate a strong approach to information security, including governance, risk management and incident response. The solution must meet all applicable New Zealand legislative and regulatory requirements."
                    : "Respondents must provide supporting evidence for the applicable conditions in this section of the tender."}
          </p>
          {missing ? (
            <Notice title="This page needs review">
              The scan could not be reliably extracted. Its requirements have
              not been included in the assessment.
            </Notice>
          ) : (
            <p>
              <mark>
                {sourceIndex === 3
                  ? "A service design panel is indicated for Q4 2026. Dates and requirements are not yet confirmed."
                  : sourceIndex === 2
                    ? "Two comparable transformation programmes are described, including the role, delivery period and referee."
                    : sourceIndex === 1
                      ? version === 3
                        ? "The closing date is 24 September 2026 at 5pm NZST. This notice replaces the earlier 17 September deadline."
                        : "The original closing date was 17 September 2026 at 5pm NZST. A later notice replaces this deadline."
                      : revisedFinding?.after ||
                        currentReq?.detail ||
                        "This sample page contains supporting context. No additional mandatory condition has been recorded for this page."}
              </mark>
            </p>
          )}
          <p>
            {sourceIndex === 0 && currentReq?.id === "security"
              ? version === 1
                ? "The original clause names ISO/IEC 27001 only. This historical wording does not include an equivalent-standard option."
                : "Acceptable certifications include ISO/IEC 27001 or an equivalent standard. The certification must be valid at the time of tender close."
              : "This is fictional source material for reviewing the prototype. It is not a live procurement notice or an authenticated client document."}
          </p>
          <p>
            {sourceIndex === 0 && currentReq?.id === "security"
              ? "The supplier should also describe how information security will be maintained throughout the term of the contract, including with any third-party providers."
              : "The original source date, captured version and interpretation remain separate throughout the assessment."}
          </p>
          <div className="paper-footer">
            <span>Fictional source · {source.scope.toLowerCase()}</span>
            <span>
              Page {page} of {source.pages}
            </span>
          </div>
        </div>
      )}
      {scene === "conflict" && (
        <Notice title="A later addendum conflicts with this clause">
          Both versions remain available. An attributed review is required.
          <Button kind="text" onClick={() => setVersion(version === 2 ? 1 : 2)}>
            Compare the other version
          </Button>
        </Notice>
      )}
      {sourceIndex === 0 && !complete && scene !== "unavailable" && (
        <div className="coverage-note">
          <I.WarningCircle weight="fill" size={20} />
          Coverage incomplete: 2 scanned pages need review.
        </div>
      )}
      {!compact && missing && (
        <Button
          onClick={() => {
            setDemo((d) => ({ ...d, coverageComplete: true }));
            notify(
              "Sample pages 17–18 reviewed. Other eligibility checks remain separate.",
            );
          }}
        >
          Record sample page review
        </Button>
      )}
      {!compact && (
        <div className="source-foot">
          <Button kind="text" onClick={() => go("sources")}>
            <I.ArrowLeft size={16} />
            All sources
          </Button>
          <span className="muted">
            Last checked {source.checked} · original retained
          </span>
        </div>
      )}
    </aside>
  );
}

export function Pursuit() {
  const { demo, scene, go } = useDemo();
  const latest = demo.reportHistory.find(
    (r) => r.version === demo.reportVersion,
  );
  const rfp =
    scene === "reassessed" ||
    scene === "complete" ||
    latest?.kind === "Document assessment";
  return (
    <>
      <PageHeader
        eyebrow="PURSUIT ROOM"
        title="Understand the field before you bid."
        description="Digital service transformation · Harbour Regional Council"
        breadcrumb="Watchlist"
        actions={
          <Badge tone={rfp ? "success" : "warning"}>
            {rfp ? "RFP reassessed" : "Public-data assessment"}
          </Badge>
        }
      />
      {scene === "stale" && (
        <Notice title="The notice changed after this assessment">
          The latest deadline is 24 September. Review the changed input before
          relying on the earlier assessment.
          <Button kind="text" onClick={() => go("request")}>
            Request updated assessment
          </Button>
        </Notice>
      )}
      {scene === "processing" && (
        <Notice title="RFP reassessment is in progress" tone="info">
          The previous public-data assessment remains available below.
          <Button kind="text" onClick={() => go("processing", "processing")}>
            View progress
          </Button>
        </Notice>
      )}
      {scene === "conflict" && (
        <Notice title="Incumbent scope needs an attributed review">
          The agency register and the RFP describe different services. The draft
          revision is held for review.
          <Button kind="text" onClick={() => go("run", "review", { job: "1" })}>
            Inspect review example
          </Button>
        </Notice>
      )}
      {scene === "partial" && (
        <Notice title="Some research sources were not accessible">
          The report distinguishes inaccessible material from searches that
          found no result. The limited assessment remains readable.
        </Notice>
      )}
      <StateBoundary errorTitle="We couldn’t load this assessment">
        <div className="intelligence-layout">
          <article>
            <details className="package-contents" open>
              <summary>In this pursuit package</summary>
              <PackageNavigation />
            </details>
            <AssessmentBody rfp={rfp} />
          </article>
          <aside className="pursuit-rail">
            <span className="eyebrow">THE NEXT STEP</span>
            <h2>
              {rfp ? "Make your firm’s decision" : "Add the tender documents"}
            </h2>
            <p>
              {rfp
                ? "Scope and competitive conclusions have been revisited. Your eligibility and capacity checks remain separate."
                : "Reassess scope, criteria, incumbency and the recommendation against the actual RFP."}
            </p>
            <Button onClick={() => go(rfp ? "decisions" : "upload")}>
              {rfp ? "Record decision" : "Add RFP for reassessment"}
            </Button>
            <hr />
            <h3>Assessment basis</h3>
            <p className="small">
              {listingId}
              <br />
              GETS notice · revision 3<br />
              Captured web research · 8 Sep
              <br />
              Held historical awards · 1 Sep
              {rfp && (
                <>
                  <br />
                  Tender requirements.pdf · v2
                </>
              )}
            </p>
            <Button kind="text" onClick={() => go("sources")}>
              Inspect source library
            </Button>
            <hr />
            <h3>Read the fixed report</h3>
            <p className="small">
              A published version keeps the facts and scope used at the time.
            </p>
            <Button
              kind="text"
              onClick={() =>
                go("report", scene === "reassessed" ? "reassessed" : "normal")
              }
            >
              Open report <I.ArrowRight size={16} />
            </Button>
          </aside>
        </div>
        <footer className="workspace-footer">
          <span>Fictional analysis · prepared for {demo.firm}</span>
          <Button kind="text" onClick={() => go("requirements")}>
            Requirements & evidence review <I.ArrowRight size={17} />
          </Button>
        </footer>
      </StateBoundary>
    </>
  );
}

export function Requirements() {
  const { demo, scene, go } = useDemo();
  const d =
    scene === "complete"
      ? completeFixture(demo)
      : scene === "partial"
        ? { ...completeFixture(demo), coverageComplete: false }
        : demo;
  return (
    <>
      <PageHeader
        title="Requirements, in full."
        description="Every recorded condition, its evidence and your firm’s review."
        breadcrumb="Watchlist"
        actions={
          <Button kind="secondary" onClick={() => go("pursuit")}>
            Back to assessment
          </Button>
        }
      />
      <StateBoundary
        emptyTitle="No requirements extracted yet"
        emptyDescription="An empty list does not establish eligibility. Add source documents or inspect extraction progress."
        emptyAction={
          <Button onClick={() => go("upload")}>Add documents</Button>
        }
      >
        {!d.coverageComplete && (
          <Notice title="The requirement inventory is incomplete">
            Pages 17–18 still need review. The list below contains the
            conditions extracted so far.
          </Notice>
        )}
        {scene === "conflict" && (
          <Notice title="One condition has conflicting evidence">
            Review both the tender clause and the later addendum.
          </Notice>
        )}
        <div className="list-heading">
          <strong>{requirements.length} recorded conditions</strong>
          <span>Mandatory first</span>
        </div>
        {requirements.map((req, index) => (
          <article className="requirement-row" key={req.id}>
            <span className="row-number">0{index + 1}</span>
            <div>
              <Badge>Mandatory</Badge>
              <h2>{req.title}</h2>
              <p>{req.detail}</p>
              <button
                className="citation"
                onClick={() =>
                  go("document", "normal", {
                    req: req.id,
                    page: String(req.page),
                  })
                }
              >
                Tender requirements · p. {req.page} · v2
              </button>
            </div>
            <div className="row-end">
              <Badge
                tone={
                  d.reviews[req.id].outcome === "met" ? "success" : "warning"
                }
              >
                {d.reviews[req.id].outcome === "met"
                  ? "Reviewed as met"
                  : "Needs review"}
              </Badge>
              <Button
                kind="text"
                onClick={() => go("review", "normal", { req: req.id })}
              >
                Review <I.ArrowRight size={17} />
              </Button>
            </div>
          </article>
        ))}
      </StateBoundary>
    </>
  );
}

export function Review() {
  const { demo, setDemo, scene, params, go } = useDemo();
  const req =
    requirements.find((r) => r.id === params.get("req")) || requirements[0];
  const existing = demo.reviews[req.id];
  const [outcome, setOutcome] = useState<ReviewOutcome>(
    existing?.outcome === "unresolved" ? "met" : existing?.outcome || "met",
  );
  const [evidence, setEvidence] = useState(existing?.evidence || "");
  const [reason, setReason] = useState(existing?.reason || "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(scene === "success");
  const [error, setError] = useState(
    scene === "error"
      ? "Your last save failed. Your changes are still here."
      : "",
  );
  const [conflict, setConflict] = useState(scene === "conflict");
  const [retry, setRetry] = useState(false);
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || (outcome === "met" && !evidence)) {
      setError(
        "Add a rationale and select supporting evidence before marking this condition met.",
      );
      return;
    }
    if (conflict) {
      setError("Review the current version before saving your changes.");
      return;
    }
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      if (scene === "error" && !retry) {
        setError("Couldn’t save your review. Your changes are still here.");
        setRetry(true);
        return;
      }
      setDemo((d) => ({
        ...d,
        reviews: { ...d.reviews, [req.id]: { outcome, reason, evidence } },
      }));
      setDone(true);
      setError("");
    }, 550);
  };
  return (
    <>
      <PageHeader
        title="Resolve the requirement."
        description={req.title}
        breadcrumb="Watchlist"
      />
      {done ? (
        <Empty
          title="Your review is recorded"
          description="The other requirements, coverage and pursuit decision remain separate."
          action={
            <Button onClick={() => go("pursuit", "normal", { req: req.id })}>
              Return to assessment <I.ArrowRight size={17} />
            </Button>
          }
        />
      ) : (
        <div className="review-grid">
          <form className="form-surface" onSubmit={save}>
            {conflict && (
              <Notice title="This assessment changed while you were reviewing">
                Your draft is preserved. The current version contains an updated
                closing date.
                <Button
                  kind="text"
                  onClick={() => {
                    setConflict(false);
                    setError("");
                  }}
                >
                  Use current version and retain my draft
                </Button>
              </Notice>
            )}
            {error && <Notice title={error} tone="error" />}
            <label>
              Review outcome
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as ReviewOutcome)}
              >
                <option value="met">Reviewed as met</option>
                <option value="not-met">Not met</option>
                <option value="clarify">Needs clarification</option>
              </select>
            </label>
            <label>
              Supporting evidence
              <select
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
              >
                <option value="">Select evidence</option>
                {evidence &&
                  ![
                    "Sample certificate.pdf · valid to 31 Dec 2026",
                    "Koru capability statement.pdf · v1",
                    "Insurance schedule.pdf · v1",
                  ].includes(evidence) && <option>{evidence}</option>}
                <option>Sample certificate.pdf · valid to 31 Dec 2026</option>
                <option>Koru capability statement.pdf · v1</option>
                <option>Insurance schedule.pdf · v1</option>
              </select>
            </label>
            <Button
              kind="secondary"
              type="button"
              onClick={() =>
                setEvidence("Sample certificate.pdf · valid to 31 Dec 2026")
              }
            >
              <I.Upload size={17} />
              Attach sample certificate
            </Button>
            <p className="muted small">
              Demo attachments only. No private files are uploaded.
            </p>
            <label>
              Your rationale
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={5}
                placeholder="Explain how this evidence meets the requirement, or what remains unresolved."
              />
            </label>
            <p className="muted">
              Recorded as {demo.firm} · reviewer Alex Morgan · source version 2.
            </p>
            <div className="form-actions">
              <Button
                kind="secondary"
                type="button"
                onClick={() => go("pursuit")}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || scene === "saving"}>
                {busy || scene === "saving" ? (
                  <>
                    <I.Spinner className="spin" size={18} />
                    Saving review…
                  </>
                ) : error ? (
                  "Retry save"
                ) : (
                  "Save review"
                )}
              </Button>
            </div>
          </form>
          <Evidence compact />
        </div>
      )}
    </>
  );
}

export function Decisions() {
  const { demo, setDemo, scene, go } = useDemo();
  const d =
    scene === "complete"
      ? completeFixture(demo)
      : scene === "stale"
        ? { ...demo, changed: true }
        : demo;
  const [outcome, setOutcome] = useState("Hold");
  const [enforceGate, setEnforceGate] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    scene === "error"
      ? "Couldn’t save the decision. Your rationale is still here."
      : "",
  );
  const [inspect, setInspect] = useState<Decision | null>(null);
  const save = (e: FormEvent) => {
    e.preventDefault();
    try {
      const next = recordDecision(d, outcome, reason, enforceGate);
      setBusy(true);
      setTimeout(() => {
        setBusy(false);
        setDemo(next);
        setReason("");
        setError("");
      }, 550);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <>
      <PageHeader
        title="Your decision. Your reasoning."
        description="Record the firm’s position separately from the generated assessment."
        breadcrumb="Watchlist"
      />
      {scene === "stale" && (
        <Notice title="The previous decision needs review">
          Closing date extended from 17 to 24 Sep. The earlier certificate
          expires 20 Sep.
        </Notice>
      )}
      <div className="two-col">
        <form className="form-surface" onSubmit={save}>
          <h2>Record a decision</h2>
          <label className="check-row">
            <input
              type="checkbox"
              checked={enforceGate}
              onChange={(e) => {
                setEnforceGate(e.target.checked);
                if (e.target.checked) setOutcome("Hold");
              }}
            />
            Preview proposed restriction: require all eligibility checks before
            Pursue
          </label>
          {!eligible(d) && (
            <Notice title="Outstanding checks to consider">
              <ul>
                {blockers(d).map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <p className="small">
                A missing check does not change the generated commercial
                assessment. Any restriction on recording your decision is an
                unresolved product policy.
              </p>
            </Notice>
          )}
          {error && <Notice title={error} tone="error" />}
          <label>
            Decision
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
            >
              <option>Hold</option>
              <option disabled={enforceGate && !eligible(d)}>Pursue</option>
              <option>Do not pursue</option>
            </select>
          </label>
          <label>
            Rationale
            <textarea
              rows={5}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain this decision and acknowledge any remaining concerns."
              required
            />
          </label>
          <Button type="submit" disabled={busy || scene === "saving"}>
            {busy || scene === "saving"
              ? "Saving decision…"
              : "Record decision"}
          </Button>
        </form>
        <section>
          <h2>Decision history</h2>
          {scene === "empty" || (!d.decisions.length && scene !== "stale") ? (
            <Empty
              title="No decision recorded"
              description="A generated assessment does not automatically record a decision for your firm."
            />
          ) : (
            <div className="history-list">
              {(d.decisions.length
                ? d.decisions
                : [
                    {
                      outcome: "Pursue",
                      reason:
                        "Previous certification was valid at the original closing date.",
                      at: "8 Sep 2026 · 14:20 NZST",
                      version: 2,
                    },
                  ]
              ).map((v, i) => (
                <article key={i}>
                  <Badge tone={d.changed ? "warning" : "success"}>
                    {v.outcome}
                    {d.changed ? " · needs review" : ""}
                  </Badge>
                  <h3>{v.reason}</h3>
                  <p className="muted">Alex Morgan · {v.at}</p>
                  <Button kind="text" onClick={() => setInspect(v)}>
                    Inspect input version {v.version} <I.ArrowRight size={16} />
                  </Button>
                </article>
              ))}
            </div>
          )}
          <Button kind="text" onClick={() => go("pursuit")}>
            Back to assessment
          </Button>
        </section>
      </div>
      {inspect && (
        <Modal
          title="Decision evidence snapshot"
          onClose={() => setInspect(null)}
        >
          <KeyFacts
            items={[
              [
                "Notice",
                inspect.snapshot
                  ? "Revision " +
                    inspect.snapshot.noticeRevision +
                    " · closes " +
                    inspect.snapshot.noticeClose
                  : "Revision 2 · closes 17 Sep 2026",
              ],
              ["Requirements", "Tender requirements.pdf · version 2"],
              [
                "Firm profile",
                demo.firm +
                  " · version " +
                  (inspect.snapshot?.firmVersion || 1),
              ],
              [
                "Certificate",
                inspect.snapshot?.certification || "Valid until 20 Sep 2026",
              ],
            ]}
          />
          <Notice title="Historical snapshot" tone="info">
            Later changes do not rewrite the recorded decision or its original
            evidence.
          </Notice>
          <Button
            kind="secondary"
            onClick={() => {
              setInspect(null);
              go("document", "normal", { source: "0" });
            }}
          >
            View captured source
          </Button>
        </Modal>
      )}
    </>
  );
}
