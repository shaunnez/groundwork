import { useState, type FormEvent } from "react";
import { useDemo } from "./context";
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
                    : currentReq?.section || "Source page " + page}
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
                      : currentReq?.detail ||
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
  const { demo, setDemo, scene, params, go, notify } = useDemo();
  const [capability, setCapability] = useState(false);
  const [research, setResearch] = useState(false);
  const req =
    requirements.find((r) => r.id === params.get("req")) || requirements[0];
  const d =
    scene === "complete"
      ? completeFixture(demo)
      : scene === "partial"
        ? { ...completeFixture(demo), coverageComplete: false }
        : scene === "stale"
          ? { ...demo, changed: true }
          : demo;
  const outcome = d.reviews[req.id]?.outcome || "unresolved";
  const met = outcome === "met";
  const ready = eligible(d);
  const stale = d.changed;
  return (
    <>
      <div className="breadcrumb">
        <button onClick={() => go("watchlist")}>Watchlist</button>
        <span>/</span>
        <span>Digital service transformation</span>
      </div>
      <header className="pursuit-heading">
        <div>
          <h1>Build a defensible pursuit decision.</h1>
          <p className="subtitle">
            Digital service transformation <span>·</span> Harbour Regional
            Council
          </p>
        </div>
        <div className="header-status">
          <small>Fictional demo data · 9 Sep 2026</small>
          <Badge tone={ready ? "success" : "warning"} dot>
            {ready ? "Assessment reviewed" : "Working assessment"} ·{" "}
            {d.decisions[0] ? "Decision recorded" : "Decision pending"}
          </Badge>
        </div>
      </header>
      {stale && (
        <Notice title="Deadline changed · your assessment needs review">
          Closes 24 Sep, previously 17 Sep. The certificate in the previous
          review expires 20 Sep.
          <Button kind="text" onClick={() => go("decisions", "stale")}>
            Inspect the previous decision <I.ArrowRight size={16} />
          </Button>
        </Notice>
      )}
      {scene === "processing" && (
        <Notice title="Your document assessment is in progress" tone="info">
          The public-notice summary remains available. Requirements are still
          being reconciled.
          <Button kind="text" onClick={() => go("processing", "processing")}>
            View saved request
          </Button>
        </Notice>
      )}
      {scene === "conflict" && (
        <Notice title="Conflicting mandatory requirements">
          The original clause and later addendum need an explicit resolution.
          Commercial fit has not changed this result.
        </Notice>
      )}
      <StateBoundary errorTitle="We couldn’t load this assessment">
        <div className="pursuit-grid">
          <section className="assessment">
            <div className="assessment-summary">
              <h2 className="small-heading">Current assessment</h2>
              <h2
                className={"assessment-verdict " + (ready ? "green" : "amber")}
              >
                <I.Circle weight="fill" size={20} />
                {stale
                  ? "Needs review"
                  : ready
                    ? "Ready for your decision"
                    : outcome === "not-met"
                      ? "Mandatory condition not met"
                      : "Hold for review"}
              </h2>
              <p>
                {ready
                  ? "The required evidence has been reviewed. The pursuit decision is yours."
                  : met
                    ? "Certification reviewed. Other required evidence and capability checks remain."
                    : "Mandatory certification has not been confirmed. Commercial fit cannot resolve this gap."}
              </p>
            </div>
            <div className="dimensions">
              <button onClick={() => setResearch(true)}>
                <strong>Commercial fit</strong>
                <b className="green">Promising</b>
                <span>
                  Strong alignment with our services and strategic priorities.
                </span>
              </button>
              <button
                onClick={() =>
                  go(
                    "requirements",
                    scene === "complete" ? "complete" : "normal",
                  )
                }
              >
                <strong>Mandatory eligibility</strong>
                <b className={ready ? "green" : "amber"}>
                  {ready
                    ? "Reviewed as met"
                    : outcome === "not-met"
                      ? "Not met"
                      : "Unresolved"}
                </b>
                <span>
                  {ready
                    ? "All applicable fixture requirements reviewed."
                    : "At least one mandatory requirement is not confirmed."}
                </span>
              </button>
              <button onClick={() => setCapability(true)}>
                <strong>Delivery capability</strong>
                <b>{d.capabilityReviewed ? "Reviewed" : "Needs review"}</b>
                <span>
                  {d.capabilityReviewed
                    ? "Firm capability evidence reviewed."
                    : "Some capability areas require further investigation."}
                </span>
              </button>
            </div>
            <div className="requirement-heading">
              <h2>Requirement to resolve</h2>
              <Button kind="text" onClick={() => go("requirements")}>
                View all <I.ArrowRight size={15} />
              </Button>
            </div>
            <section className={"focused-requirement " + (met ? "is-met" : "")}>
              <h3>{req.title}</h3>
              <button
                className="citation"
                onClick={() =>
                  go("document", "normal", {
                    req: req.id,
                    page: String(req.page),
                  })
                }
              >
                [1] Tender requirements, p. {req.page}
              </button>
              <p>
                <strong>Source requirement:</strong>{" "}
                {req.id === "security"
                  ? "Evidence of certification is mandatory."
                  : req.detail}
                <br />
                <strong>Your firm:</strong>{" "}
                {met
                  ? d.reviews[req.id]?.evidence || "Sample evidence reviewed."
                  : req.firm}
              </p>
              <div className="inline">
                <Button onClick={() => go("review", "normal", { req: req.id })}>
                  {met ? "Review evidence" : "Resolve requirement"}
                </Button>
                <span className="muted small">
                  Record evidence before making a pursuit decision.
                </span>
              </div>
            </section>
            <section className="other-research">
              <button
                className="text-button"
                onClick={() => setResearch(!research)}
              >
                Other research <I.Info size={17} />
              </button>
              <strong>Incumbent unknown</strong>
              <p>
                Current incumbent has not been identified in the available
                sources.
              </p>
              {research && (
                <div className="inset">
                  <strong>Possible bidders · qualitative research</strong>
                  <p>
                    Aster Consulting has relevant historical participation. That
                    is not proof it will bid for this opportunity.
                  </p>
                  <Button kind="text" onClick={() => go("competitor")}>
                    View supplier evidence <I.ArrowRight size={16} />
                  </Button>
                </div>
              )}
            </section>
            {d.decisions[0] && (
              <Notice
                title={"Your recorded decision: " + d.decisions[0].outcome}
                tone={stale ? "warning" : "info"}
              >
                {d.decisions[0].reason}
              </Notice>
            )}
          </section>
          <Evidence compact />
        </div>
        <footer className="workspace-footer">
          <span>Assessment saved · visible only to {demo.firm}</span>
          <div>
            <Button
              kind="text"
              onClick={() =>
                go("decisions", scene === "complete" ? "complete" : "normal")
              }
            >
              Record decision
            </Button>
            <Button kind="text" onClick={() => go("request")}>
              Request report
            </Button>
            <Button kind="text" onClick={() => go("sources")}>
              View all sources <I.ArrowRight size={19} />
            </Button>
          </div>
        </footer>
      </StateBoundary>
      {capability && (
        <Modal
          title="Review delivery capability"
          onClose={() => setCapability(false)}
        >
          <p>
            The firm’s capability statement lists two comparable programmes and
            a delivery team.
          </p>
          <p className="muted">
            Source: Koru capability statement, version 1 · firm supplied, not
            independently authenticated.
          </p>
          <Notice title="Capability is a separate assessment" tone="info">
            Recording this review will not resolve mandatory requirements or
            missing document pages.
          </Notice>
          <div className="form-actions">
            <Button kind="secondary" onClick={() => setCapability(false)}>
              Keep unresolved
            </Button>
            <Button
              onClick={() => {
                setDemo((v) => ({ ...v, capabilityReviewed: true }));
                setCapability(false);
                notify("Delivery capability review recorded.");
              }}
            >
              Record capability review
            </Button>
          </div>
        </Modal>
      )}
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
      const next = recordDecision(d, outcome, reason);
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
          {!eligible(d) && (
            <Notice title="Pursue is not available yet">
              <ul>
                {blockers(d).map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <p className="small">
                This conservative gate is a proposed policy for review.
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
              <option disabled={!eligible(d)}>Pursue</option>
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
