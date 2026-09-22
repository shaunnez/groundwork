import { Badge, Button, Empty, I, KeyFacts, Notice } from "../ui";
import { EnrichedSections } from "../LocalDeliverables";
import { Heading } from "./Chrome";
import {
  claimText,
  date,
  evidenceIds,
  kindLabel,
  provenance,
  type Client,
  type Detail,
  type Navigate,
  type SavedReport,
} from "./data";
const sections = [
  ["Executive summary", "summary"],
  ["Opportunity & competition", "competition"],
  ["Your firm", "firm"],
  ["Centre of gravity", "gravity"],
  ["Strategic framing", "strategy"],
  ["Evaluation priorities", "evaluation"],
  ["Cone of plausibility", "cone"],
  ["Competing hypotheses", "hypotheses"],
  ["Risk register", "risks"],
  ["Gaps & next steps", "gaps"],
  ["Version comparison", "changes"],
];
function jumpTo(id: string) {
  const section = document.getElementById(id);
  // References can target a finding inside the additional-findings disclosure.
  let parent = section?.parentElement;
  while (parent) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
    parent = parent.parentElement;
  }
  section?.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
  section?.focus({ preventScroll: true });
}
export function Citation({
  report,
  id,
  onEvidence,
}: {
  report: SavedReport;
  id: string;
  onEvidence: (id: string, quote?: string) => void;
}) {
  const e = report.payload.assessment.evidence.find((e) => e.id === id);
  if (!e) return null;
  const s = report.payload.quoteStates[id];
  return (
    <button
      className="citation"
      title={
        s === "VERBATIM"
          ? "Exact source quote"
          : s === "VERBATIM_MODULO_SPACING"
            ? "Exact wording; spacing normalized"
            : "Source reference; not a mechanically checked quotation"
      }
      onClick={() =>
        onEvidence(e.unitId, e.kind === "quote" ? e.excerpt : undefined)
      }
    >
      <I.File size={14} />
      {e.kind === "quote" ? "Source quote" : "Source evidence"} ·{" "}
      {id.replace(/^ev/, "")}
    </button>
  );
}
export function Claim({
  report,
  id,
  onEvidence,
  anchor,
}: {
  report: SavedReport;
  id: string;
  onEvidence: (id: string, quote?: string) => void;
  anchor?: string;
}) {
  const a = report.payload.assessment,
    c = a.claims.find((c) => c.id === id);
  if (!c) return null;
  const citations = evidenceIds(a, id);
  return (
    <div
      className="connected-claim"
      id={anchor}
      tabIndex={anchor ? -1 : undefined}
    >
      <p>{c.text}</p>
      <div className="inline connected-citations">
        <Badge>
          {
            {
              sourced: "Sourced",
              derived: "Derived",
              assessed: "Assessment",
              gap: "Evidence gap",
            }[c.provenance]
          }
        </Badge>
        {citations.slice(0, 2).map((e) => (
          <Citation key={e} report={report} id={e} onEvidence={onEvidence} />
        ))}
      </div>
      {citations.length > 2 && (
        <details className="small">
          <summary>{citations.length - 2} more source references</summary>
          <div className="inline connected-citations">
            {citations.slice(2).map((e) => (
              <Citation
                key={e}
                report={report}
                id={e}
                onEvidence={onEvidence}
              />
            ))}
          </div>
        </details>
      )}
      {c.assumptions.length > 0 && (
        <details className="small">
          <summary>Assumptions behind this assessment</summary>
          <ul>
            {c.assumptions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </details>
      )}
      {c.duplicateOf && (
        <p className="small muted">
          Related duplicate retained in the findings.
        </p>
      )}
    </div>
  );
}
export function Changes({ report }: { report: SavedReport }) {
  return (
    <section
      id="assessment-changes"
      tabIndex={-1}
      className="rfp-comparison section-gap"
    >
      <h2>What changed?</h2>
      {report.comparison ? (
        <>
          <p className="muted small">
            Compared with the previous assessment. A missing finding is not
            evidence that it has been resolved.
          </p>
          {report.comparison
            .filter((c) => c.status !== "UNCHANGED")
            .map((c, i) => (
              <article className="change-row" key={i}>
                <Badge>{c.status.replaceAll("_", " ").toLowerCase()}</Badge>
                <div className="change-columns">
                  <div>
                    <span className="eyebrow">PREVIOUS FINDING</span>
                    <p>
                      {c.previousText ||
                        "Not present in the previous assessment."}
                    </p>
                  </div>
                  <div>
                    <span className="eyebrow">CURRENT FINDING</span>
                    <p>
                      {c.currentText ||
                        "Absent from this run. Closure is not established."}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          {report.comparison.every((c) => c.status === "UNCHANGED") && (
            <p>No changed findings in this version.</p>
          )}
        </>
      ) : (
        <p>
          This is an independent assessment; no previous version is used as its
          comparison.
        </p>
      )}
    </section>
  );
}
function createClaimRenderer(
  report: SavedReport,
  onEvidence: (id: string, quote?: string) => void,
  shown = new Map<string, string>(),
) {
  return (id: string, section: string) => {
    const first = shown.get(id);
    const anchor = `finding-${report.id}-${id}`;
    if (first)
      return (
        <a
          className="finding-reference"
          href={"#" + anchor}
          onClick={(e) => {
            e.preventDefault();
            jumpTo(anchor);
          }}
        >
          <I.ArrowRight size={16} />
          See finding in {first}
        </a>
      );
    shown.set(id, section);
    return (
      <Claim report={report} id={id} onEvidence={onEvidence} anchor={anchor} />
    );
  };
}

export function AssessmentBody({
  report,
  client,
  onEvidence,
}: {
  report: SavedReport;
  client?: Client;
  onEvidence: (id: string, quote?: string) => void;
}) {
  const p = report.payload,
    a = p.assessment,
    intel = p.intelligence;
  const shown = new Map<string, string>();
  const claim = createClaimRenderer(report, onEvidence, shown);
  return (
    <>
      <section
        id="assessment-summary"
        tabIndex={-1}
        className="assessment-summary commercial-summary"
      >
        <span className="eyebrow">
          {p.requirements.status === "complete"
            ? "RFP REASSESSMENT"
            : "EVIDENCE-BACKED PURSUIT"}{" "}
          · INTERNAL DRAFT
        </span>
        <h2>Executive summary</h2>
        <p className="assessment-verdict">{a.verdict.recommendation}</p>
        <div className="executive-detail">
          {p.summarySentences.map((s, i) => {
            // Sentence 1 repeats the verdict already displayed above.
            if (i === 1) return null;
            const summaryId = [
              a.summary.what,
              null,
              a.summary.decidingFactor,
              a.summary.nextAction,
              a.summary.biggestGap,
            ][i];
            return (
              <div key={i} className={i === 3 ? "executive-gate" : ""}>
                {summaryId ? (
                  claim(summaryId, "Executive summary")
                ) : (
                  <p className={i === 0 ? "lead" : ""}>{s}</p>
                )}
              </div>
            );
          })}
        </div>
        <small className="muted">
          Assessment cutoff {date(p.cutoff)} ·{" "}
          {p.evaluation === "live"
            ? "Model-generated; analyst review required"
            : "Fixture output"}
        </small>
      </section>
      <section id="assessment-competition" tabIndex={-1}>
        <h2>The opportunity and competitive structure</h2>
        {claim(a.summary.what, "Opportunity & competition")}
        <div className="incumbent-panel">
          <span className="eyebrow">INCUMBENT POSITION</span>
          <h3>
            {intel.incumbent.entityName || "Current supplier not established"}
          </h3>
          <p>
            {intel.incumbent.status.replaceAll("_", " ")} · Client relationship:{" "}
            {intel.incumbent.clientRelationship.replaceAll("_", " ")}
          </p>
          {intel.incumbent.reviewReasons.map((r, i) => (
            <p key={i} className="small muted">
              {r}
            </p>
          ))}
        </div>
        <h3>Suppliers named in the evidence</h3>
        {intel.entities.length > 0 && (
          <p className="small muted">
            Names are retained as recorded. A supplier mention does not
            establish bid intention, legal identity or current incumbency.
          </p>
        )}
        {intel.entities.length ? (
          intel.entities.map((e, i) => (
            <article className="candidate-row" key={e.name + i}>
              <div className="candidate-identity">
                <h3>{e.name}</h3>
                <Badge>Identity unverified</Badge>
              </div>
              <div>
                {intel.entityEvidence?.observations
                  .filter((o) => o.entityName === e.name)
                  .map((o) => (
                    <div key={o.id}>
                      <p className="small">{o.kind.replaceAll("_", " ")}</p>
                      <button
                        className="citation"
                        onClick={() => onEvidence(o.unitId, o.quote)}
                      >
                        Inspect source relationship <I.ArrowRight size={14} />
                      </button>
                    </div>
                  ))}
              </div>
            </article>
          ))
        ) : (
          <p>No supplier identities established in this source pack.</p>
        )}
        <KeyFacts
          items={[
            ["Admitted award records", String(intel.metrics.awardCount)],
            ["Named suppliers", String(intel.metrics.supplierCount)],
            ["Repeat suppliers", String(intel.metrics.repeatSupplierCount)],
            ["Retention", "Not established"],
          ]}
        />
        <details className="small">
          <summary>Award population and limitations</summary>
          {intel.metrics.limitations.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </details>
      </section>
      <section id="assessment-firm" tabIndex={-1} className="client-layer">
        <span className="eyebrow">YOUR FIRM · SEPARATE CONTEXT</span>
        <h2>
          {client
            ? `What this means for ${client.legal_name}`
            : "Your firm’s position"}
        </h2>
        {client ? (
          <>
            <p>
              {client.context.capabilities ||
                "Capabilities have not been supplied."}
            </p>
            <p className="small muted">
              Current profile supplied by your team, effective{" "}
              {date(client.context.effectiveDate)}. It may differ from the
              context frozen in this report.
            </p>
          </>
        ) : (
          <Notice title="No firm profile supplied" tone="info">
            The assessment cannot establish your eligibility or disqualify your
            firm from missing information.
          </Notice>
        )}
        {claim(a.verdict.nextActionClaimId, "Your firm")}
      </section>
      <section id="assessment-gravity" tabIndex={-1} className="section-gap">
        <span className="eyebrow">THE DECISIVE FACTOR</span>
        <h2>Centre of gravity analysis</h2>
        <div className="gravity-panel">
          {claim(a.centreOfGravity.factorClaimId, "Centre of gravity")}
          <div className="gravity-implication">
            <strong>Strategic implication</strong>
            {claim(a.centreOfGravity.implicationClaimId, "Centre of gravity")}
          </div>
        </div>
      </section>
      <section
        id="assessment-strategy"
        tabIndex={-1}
        className="section-gap strategy-panel"
      >
        <span className="eyebrow">STRATEGIC FRAMING</span>
        <h2>Where to focus next</h2>
        {claim(a.centreOfGravity.actionClaimId, "Strategic framing")}
      </section>
      <section id="assessment-evaluation" tabIndex={-1} className="section-gap">
        <h2>Evaluation and response priorities</h2>
        {a.claims.some((c) => /evaluat|criteria/i.test(c.key)) ? (
          a.claims
            .filter((c) => /evaluat|criteria/i.test(c.key))
            .map((c) => (
              <div key={c.id}>{claim(c.id, "Evaluation priorities")}</div>
            ))
        ) : (
          <Notice title="Evaluation detail needs checking" tone="info">
            No separate evaluation findings are recorded in this saved
            assessment. Check the cited tender documents before prioritising
            your response.
          </Notice>
        )}
      </section>
      <section id="assessment-cone" tabIndex={-1} className="section-gap">
        <span className="eyebrow">TEST THE RANGE OF OUTCOMES</span>
        <h2>Cone of plausibility</h2>
        <p className="small muted">
          Planning scenarios, not a measured probability distribution.
        </p>
        <div className="scenario-grid">
          {a.scenarios.map((s, i) => (
            <article key={s.name} className={i === 1 ? "scenario-working" : ""}>
              <span className="eyebrow">SCENARIO {i + 1}</span>
              <h3>{s.name}</h3>
              {claim(s.outcomeClaimId, "Cone of plausibility")}
              <h4>Signals to watch</h4>
              <ul>
                {s.indicators.map((x, j) => (
                  <li key={j}>{x}</li>
                ))}
              </ul>
              <h4>Assumptions</h4>
              {s.assumptions.length ? (
                <ul>
                  {s.assumptions.map((x, j) => (
                    <li key={j}>{x}</li>
                  ))}
                </ul>
              ) : (
                <p>None separately recorded.</p>
              )}
            </article>
          ))}
        </div>
      </section>
      <section id="assessment-hypotheses" tabIndex={-1} className="section-gap">
        <span className="eyebrow">CHALLENGE THE COMPETITIVE READ</span>
        <h2>Analysis of competing hypotheses</h2>
        <p>{a.hypotheses.event}</p>
        <p className="small muted">{a.hypotheses.timeframe}</p>
        <div className="hypothesis-list">
          {a.hypotheses.alternatives.map((h) => (
            <article key={h.id}>
              <h3>{h.statement}</h3>
              <div className="hypothesis-evidence">
                <div>
                  <h4>Evidence for</h4>
                  {h.supportingEvidenceIds.length ? (
                    h.supportingEvidenceIds.map((id) => (
                      <Citation
                        key={id}
                        id={id}
                        report={report}
                        onEvidence={onEvidence}
                      />
                    ))
                  ) : (
                    <p>No supporting evidence cited.</p>
                  )}
                </div>
                <div>
                  <h4>Evidence against</h4>
                  {h.contradictingEvidenceIds.length ? (
                    h.contradictingEvidenceIds.map((id) => (
                      <Citation
                        key={id}
                        id={id}
                        report={report}
                        onEvidence={onEvidence}
                      />
                    ))
                  ) : (
                    <p>
                      No contradictory evidence cited; this does not confirm the
                      hypothesis.
                    </p>
                  )}
                </div>
              </div>
              <p className="hypothesis-test">{h.diagnosticRationale}</p>
            </article>
          ))}
        </div>
        <p>
          <strong>Next evidence to collect:</strong>{" "}
          {a.hypotheses.nextCollection}
        </p>
        <details>
          <summary>Conditions and alternative coverage</summary>
          {a.hypotheses.conditions.map((c, i) => (
            <p key={i}>{c}</p>
          ))}
          <p>{a.hypotheses.exclusivityRationale}</p>
          <p>{a.hypotheses.exhaustivenessRationale}</p>
        </details>
      </section>
      <section id="assessment-risks" tabIndex={-1} className="section-gap">
        <span className="eyebrow">DELIVERY & COMMERCIAL EXPOSURE</span>
        <h2>Risk register</h2>
        <div className="assessment-risk-list">
          {a.risks.map((r, i) => (
            <article key={r.id}>
              <div className="section-heading">
                <span className="eyebrow">RISK {i + 1}</span>
                <Badge tone="warning">{r.likelihood}</Badge>
              </div>
              {claim(r.claimId, "Risk register")}
              <p>
                <strong>Likelihood basis:</strong> {r.likelihoodRationale}
              </p>
              <p>
                <strong>Impact:</strong> {r.impact}
              </p>
              <p>
                <strong>Trigger:</strong> {r.trigger}
              </p>
              <h4>Mitigation</h4>
              {claim(r.mitigationClaimId, "Risk register")}
            </article>
          ))}
        </div>
      </section>
      <section id="assessment-gaps" tabIndex={-1}>
        <h2>Intelligence gaps and next steps</h2>
        {claim(a.summary.biggestGap, "Gaps & next steps")}
        <ul className="assessment-limitations">
          {p.limitations.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
        <details>
          <summary>Additional findings and source checks</summary>
          {a.claims
            .filter((c) => !shown.has(c.id))
            .map((c) => (
              <div key={c.id}>{claim(c.id, "Additional findings")}</div>
            ))}
        </details>
      </section>
      <Changes report={report} />
    </>
  );
}
export function PursuitView({
  detail,
  report,
  client,
  go,
  onEvidence,
  busy,
  onDerive,
  fixed = false,
}: {
  detail: Detail;
  report: SavedReport | null;
  client?: Client;
  go: Navigate;
  onEvidence: (id: string, quote?: string) => void;
  busy: boolean;
  onDerive: (kind: "watchlist" | "competitor" | "weekly") => void;
  fixed?: boolean;
}) {
  const o = detail.opportunity;
  const companionClaim = report
    ? createClaimRenderer(report, onEvidence)
    : null;
  return (
    <>
      <Heading
        go={go}
        back={{
          label: fixed ? "Reports" : "Watchlist",
          page: fixed ? "reports" : "watchlist",
        }}
        eyebrow={fixed ? "SAVED REPORT" : "PURSUIT ROOM"}
        title={fixed ? o.title : "Understand the field before you bid."}
        description={
          fixed
            ? `${report ? kindLabel[report.kind] : "Report"} · ${o.buyer}`
            : `${o.title} · ${o.buyer}`
        }
        actions={<Badge tone="info">{provenance(o)}</Badge>}
      />
      {report?.freshness.stale && (
        <Notice title="New evidence or a newer assessment is available">
          This saved version keeps its original findings.{" "}
          <Button kind="text" onClick={() => go("request", o.id)}>
            Request an updated assessment
          </Button>
        </Notice>
      )}
      {report?.review?.state === "changes-requested" && (
        <Notice title="Corrections requested">
          Read the reviewer feedback before relying on this assessment.
        </Notice>
      )}
      <div
        className={
          fixed
            ? "report-layout connected-report-layout"
            : "intelligence-layout"
        }
      >
        {fixed && report && (
          <aside className="report-outline">
            <span className="eyebrow">IN THIS REPORT</span>
            {!report.payload.deliverable && (
              <label className="mobile-report-contents">
                Jump to section
                <select
                  defaultValue=""
                  onChange={(event) => {
                    if (event.target.value)
                      jumpTo("assessment-" + event.target.value);
                    event.target.value = "";
                  }}
                >
                  <option value="" disabled>
                    Select a section
                  </option>
                  {sections.map(([label, id]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!report.payload.deliverable && (
              <nav className="package-navigation" aria-label="Report sections">
                {sections.map(([label, id]) => (
                  <a
                    key={id}
                    href={"#assessment-" + id}
                    onClick={(e) => {
                      e.preventDefault();
                      jumpTo("assessment-" + id);
                    }}
                  >
                    {label}
                  </a>
                ))}
              </nav>
            )}
            <label>
              Saved version
              <select
                aria-label="Assessment version"
                value={report.id}
                onChange={(e) => go("report", o.id, e.target.value)}
              >
                {detail.reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {kindLabel[r.kind]} · {date(r.created_at)} ·{" "}
                    {new Date(r.created_at).toLocaleTimeString("en-NZ")}
                  </option>
                ))}
              </select>
            </label>
            <Badge>
              {report.review?.state === "approved"
                ? "Internally reviewed"
                : "Awaiting review"}
            </Badge>
            <Button kind="text" onClick={() => go("pursuit", o.id)}>
              Return to pursuit <I.ArrowRight size={16} />
            </Button>
            <Button kind="text" onClick={() => go("sources", o.id)}>
              Inspect source library
            </Button>
          </aside>
        )}
        <article
          className={"connected-assessment" + (fixed ? " report-body" : "")}
        >
          {report ? (
            <>
              {report.payload.deliverable ? (
                <div className="connected-deliverable">
                  <EnrichedSections
                    data={report.payload.deliverable}
                    comparison={report.comparison || undefined}
                    renderClaim={(id) => companionClaim!(id, "this report")}
                  />
                  <Button
                    kind="secondary"
                    onClick={() =>
                      go("report", o.id, report.payload.sourcePursuitId)
                    }
                  >
                    Read the underlying pursuit <I.ArrowRight size={16} />
                  </Button>
                </div>
              ) : (
                <>
                  {!fixed && (
                    <details className="package-contents" open>
                      <summary>In this pursuit package</summary>
                      <nav
                        className="package-navigation"
                        aria-label="Pursuit package sections"
                      >
                        {sections.map(([label, id]) => (
                          <a
                            href={"#assessment-" + id}
                            key={id}
                            onClick={(e) => {
                              e.preventDefault();
                              jumpTo("assessment-" + id);
                            }}
                          >
                            {label}
                          </a>
                        ))}
                      </nav>
                    </details>
                  )}
                  <AssessmentBody
                    report={report}
                    client={client}
                    onEvidence={onEvidence}
                  />
                </>
              )}
            </>
          ) : (
            <Empty
              title="Understand this opportunity"
              description="Add the notice and supporting evidence, then request a pursuit assessment. Your saved source pack stays available while analysis runs."
              action={
                <Button
                  onClick={() =>
                    go(detail.sources.length ? "request" : "upload", o.id)
                  }
                >
                  {detail.sources.length
                    ? "Request assessment"
                    : "Add source evidence"}
                </Button>
              }
            />
          )}
        </article>
        {!fixed && (
          <aside className="pursuit-rail">
            <span className="eyebrow">THE NEXT STEP</span>
            <h2>
              {report ? "Keep the evidence current" : "Build the evidence pack"}
            </h2>
            <p>
              Add documents or request an updated assessment when new evidence
              arrives. Previous reports stay available.
            </p>
            <Button onClick={() => go("upload", o.id)}>
              Add RFP for reassessment
            </Button>
            <Button kind="text" onClick={() => go("request", o.id)}>
              {report ? "Request reassessment" : "Request assessment"}
            </Button>
            <hr />
            <h3>Assessment basis</h3>
            <p className="small">
              {o.notice_id}
              <br />
              As at {date(report?.payload.cutoff || o.cutoff)}
              <br />
              {detail.sources.length} saved sources
            </p>
            <Button kind="text" onClick={() => go("sources", o.id)}>
              Inspect source library
            </Button>
            <Button
              kind="text"
              onClick={() => go("requirements", o.id, report?.id)}
            >
              Requirements & evidence
            </Button>
            <hr />
            <h3>Your firm’s decision</h3>
            <p className="small">
              Keep your commercial decision separate from the assessment.
            </p>
            <Button
              kind="secondary"
              disabled={!report}
              onClick={() => go("decisions", o.id, report?.id)}
            >
              Record decision
            </Button>
            {report && (
              <>
                <hr />
                <h3>Saved report versions</h3>
                <select
                  aria-label="Assessment version"
                  value={report.id}
                  onChange={(e) => go("report", o.id, e.target.value)}
                >
                  {detail.reports.map((r) => (
                    <option key={r.id} value={r.id}>
                      {kindLabel[r.kind]} · {date(r.created_at)} ·{" "}
                      {new Date(r.created_at).toLocaleTimeString("en-NZ")}
                    </option>
                  ))}
                </select>
                <p className="small muted">
                  Internal draft ·{" "}
                  {report.review?.state === "approved"
                    ? "Internally reviewed"
                    : "Analyst review required"}
                </p>
                <hr />
                <h3>Use this intelligence</h3>
                {(["watchlist", "competitor", "weekly"] as const).map((k) => (
                  <Button
                    key={k}
                    kind="text"
                    disabled={busy}
                    onClick={() => onDerive(k)}
                  >
                    Open {kindLabel[k].toLowerCase()}
                    <I.ArrowRight size={15} />
                  </Button>
                ))}
              </>
            )}
          </aside>
        )}
      </div>
    </>
  );
}
