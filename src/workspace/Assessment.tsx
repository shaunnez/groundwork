import { useState } from "react";
import { Badge, Button, Empty, I, KeyFacts, Notice } from "../ui";
import { EnrichedSections } from "../LocalDeliverables";
import { Heading } from "./Chrome";
import { PursuitOverview } from "./PursuitOverview";
import {
  claimText,
  date,
  evidenceIds,
  kindLabel,
  provenance,
  reportMaturity,
  request,
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
function getsNoticeUrl(value: string | null): string | null {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" && url.hostname === "www.gets.govt.nz"
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function nzClosing(value: string | null): string {
  if (!value) return "Closing date unknown";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Closing date unknown"
    : `Closes ${new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(parsed)}`;
}
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
  const location = report.citationLocations?.[id];
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
      <span>
        {location
          ? `${location.source_name} · ${location.location}`
          : "Source location unavailable"}
      </span>
      {e.kind === "quote" && (
        <span className="citation-quote">“{e.excerpt}”</span>
      )}
      <span className="small muted">
        {s === "VERBATIM"
          ? "Exact wording verified"
          : s === "VERBATIM_MODULO_SPACING"
            ? "Wording verified with spacing normalised"
            : "Quote not mechanically verified"}
      </span>
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
      <div className="connected-citations">
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
        <details className="small source-references">
          <summary>{citations.length - 2} more source references</summary>
          <div className="connected-citations">
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
          <span>
            {report.payload.assessment.claims.find((c) => c.id === id)?.text ||
              "Finding"}{" "}
            <small>Read full finding in {first}</small>
          </span>
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
  noticeUrl,
}: {
  report: SavedReport;
  client?: Client;
  onEvidence: (id: string, quote?: string) => void;
  noticeUrl?: string | null;
}) {
  const p = report.payload,
    a = p.assessment,
    intel = p.intelligence;
  const frozenClient = p.frozenClient === undefined ? client : p.frozenClient;
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
          {reportMaturity(report).toUpperCase()} · INTERNAL DRAFT
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
        <details className="assessment-basis">
          <summary>Assessment basis and frozen source coverage</summary>
          {noticeUrl && (
            <p>
              <a href={noticeUrl} target="_blank" rel="noopener noreferrer">
                Open original GETS notice
              </a>
            </p>
          )}
          {p.sourceInventory.map((source) => (
            <p key={source.id} className="small">
              {source.name} · {source.purpose}
              {source.reader ? ` · ${source.reader}` : ""}
              {source.state ? ` · ${source.state}` : ""}
              {source.coverage
                ? ` · ${source.coverage.read}/${source.coverage.total ?? "?"} ${source.coverage.unit}s read`
                : ""}
              {source.coverage?.failures?.length
                ? ` · ${source.coverage.failures.join("; ")}`
                : ""}
            </p>
          ))}
          {p.tenderPack && (
            <p className="small">
              GETS pack {p.tenderPack.rfxId} ·{" "}
              {p.tenderPack.complete
                ? "all declared originals reconciled"
                : "incomplete pack; see named file states"}
            </p>
          )}
          {reportMaturity(report) === "Notice-only pursuit" && (
            <p className="small">
              Protected tender attachments were not examined in this version.
              Missing evidence is not a negative finding.
            </p>
          )}
        </details>
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
          {frozenClient
            ? `What this means for ${frozenClient.legal_name}`
            : "Your firm’s position"}
        </h2>
        {frozenClient ? (
          <>
            <p>
              {frozenClient.context.capabilities ||
                "Capabilities have not been supplied."}
            </p>
            <p className="small muted">
              Firm profile frozen for this report, effective{" "}
              {date(frozenClient.context.effectiveDate)}.
            </p>
          </>
        ) : (
          <Notice title="No firm profile supplied" tone="info">
            The assessment cannot establish your eligibility or disqualify your
            firm from missing information. Supply services and capabilities,
            relevant credentials, current relationships, delivery capacity and
            case examples.
          </Notice>
        )}
        {claim(a.verdict.nextActionClaimId, "Your firm")}
      </section>
      <section id="assessment-gravity" tabIndex={-1} className="section-gap">
        <span className="eyebrow">THE DECISIVE FACTOR</span>
        <h2>Centre of gravity analysis</h2>
        <p className="section-explainer">
          This tests which evidenced factor most changes the pursuit decision,
          then links it to a practical response. A thin source pack can leave
          that factor unresolved.
        </p>
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
        <p className="section-explainer">
          These are conditional planning outcomes and signals to watch. Compare
          their assumptions with the evidence; they are not probabilities or a
          prediction of bidders.
        </p>
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
        <p className="section-explainer">
          Compare alternative explanations against supporting and contradictory
          evidence. An empty evidence column means the question remains open.
        </p>
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
        <p className="hypothesis-next">
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
        <p className="section-explainer">
          Use each risk to check its evidence, trigger, impact and mitigation
          before committing delivery or commercial terms.
        </p>
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
        <p className="section-explainer">
          These are the facts still needed to strengthen the assessment. An
          unread source or missing observation is a gap, not proof that a
          condition is absent.
        </p>
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
  clients = [],
  owner = false,
  onRefresh,
  go,
  onEvidence,
  busy,
  onDerive,
  fixed = false,
}: {
  detail: Detail;
  report: SavedReport | null;
  client?: Client;
  clients?: Client[];
  owner?: boolean;
  onRefresh?: () => Promise<void>;
  go: Navigate;
  onEvidence: (id: string, quote?: string) => void;
  busy: boolean;
  onDerive: (kind: "watchlist" | "competitor" | "weekly") => void;
  fixed?: boolean;
}) {
  const opportunity = detail.opportunity;
  const noticeUrl = getsNoticeUrl(opportunity.metadata.noticeUrl);
  const [selectedFirm, setSelectedFirm] = useState(opportunity.client_id ?? "");
  const [firmError, setFirmError] = useState("");
  const [savingFirm, setSavingFirm] = useState(false);
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
        title={opportunity.title}
        description={
          fixed
            ? `${report ? kindLabel[report.kind] : "Report"} · ${opportunity.buyer}`
            : opportunity.buyer
        }
        actions={
          <>
            <Badge tone="info">{provenance(opportunity)}</Badge>
            {noticeUrl && (
              <a
                className="button secondary"
                href={noticeUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open original GETS notice
              </a>
            )}
          </>
        }
      />
      <p className="small muted">
        RFx {opportunity.notice_id} ·{" "}
        {nzClosing(opportunity.metadata.closingAt)}
        {report ? ` · ${reportMaturity(report)}` : " · No saved assessment"}
        {fixed && report
          ? ` · Assessment cutoff ${date(report.payload.cutoff)}`
          : ""}
      </p>
      {fixed ? (
        <>
          {report?.freshness.stale && (
            <Notice title="New evidence or a newer assessment is available">
              This saved version keeps its original findings.{" "}
              {owner && (
                <Button
                  kind="text"
                  onClick={() => go("request", opportunity.id)}
                >
                  Request an updated assessment
                </Button>
              )}
            </Notice>
          )}
          {report?.review?.state === "changes-requested" && (
            <Notice title="Corrections requested">
              Read the reviewer feedback before relying on this assessment.
            </Notice>
          )}
          {report ? (
            <div className="report-layout connected-report-layout">
              <aside className="report-outline">
                <span className="eyebrow">IN THIS REPORT</span>
                {!report.payload.deliverable && (
                  <>
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
                    <nav
                      className="package-navigation"
                      aria-label="Report sections"
                    >
                      {sections.map(([label, id]) => (
                        <a
                          key={id}
                          href={"#assessment-" + id}
                          onClick={(event) => {
                            event.preventDefault();
                            jumpTo("assessment-" + id);
                          }}
                        >
                          {label}
                        </a>
                      ))}
                    </nav>
                  </>
                )}
                <label>
                  Saved version
                  <select
                    aria-label="Assessment version"
                    value={report.id}
                    onChange={(event) =>
                      go("report", opportunity.id, event.target.value)
                    }
                  >
                    {detail.reports.map((item) => (
                      <option key={item.id} value={item.id}>
                        {kindLabel[item.kind]} · {date(item.created_at)} ·{" "}
                        {new Date(item.created_at).toLocaleTimeString("en-NZ")}
                      </option>
                    ))}
                  </select>
                </label>
                <dl className="report-version-facts">
                  <div>
                    <dt>Assessment basis</dt>
                    <dd>{reportMaturity(report)}</dd>
                  </div>
                  <div>
                    <dt>Cutoff</dt>
                    <dd>{date(report.payload.cutoff)}</dd>
                  </div>
                  <div>
                    <dt>Frozen sources</dt>
                    <dd>{report.payload.sourceInventory.length}</dd>
                  </div>
                </dl>
                <Badge
                  tone={
                    report.review?.state === "approved" ? "success" : "info"
                  }
                >
                  {report.review?.state === "approved"
                    ? "Internally reviewed"
                    : report.review?.state === "changes-requested"
                      ? "Corrections requested"
                      : "Analyst review required"}
                </Badge>
                <Button
                  kind="text"
                  onClick={() => go("pursuit", opportunity.id)}
                >
                  Return to pursuit <I.ArrowRight size={16} />
                </Button>
                <Button
                  kind="text"
                  onClick={() => go("sources", opportunity.id)}
                >
                  Inspect source library
                </Button>
              </aside>
              <article className="connected-assessment report-body">
                {report.payload.deliverable ? (
                  <div className="connected-deliverable">
                    <EnrichedSections
                      data={report.payload.deliverable}
                      comparison={report.comparison || undefined}
                      renderClaim={(id) => companionClaim!(id, "this report")}
                    />
                    {report.payload.sourcePursuitId && (
                      <Button
                        kind="secondary"
                        onClick={() =>
                          go(
                            "report",
                            opportunity.id,
                            report.payload.sourcePursuitId,
                          )
                        }
                      >
                        Read the underlying pursuit <I.ArrowRight size={16} />
                      </Button>
                    )}
                  </div>
                ) : (
                  <AssessmentBody
                    report={report}
                    client={client}
                    onEvidence={onEvidence}
                    noticeUrl={noticeUrl}
                  />
                )}
              </article>
            </div>
          ) : (
            <Empty
              title="No saved report available"
              description="Choose an assessment from the report library."
              action={
                <Button onClick={() => go("reports")}>Open reports</Button>
              }
            />
          )}
        </>
      ) : (
        <>
          <PursuitOverview
            detail={detail}
            report={report}
            owner={owner}
            busy={busy}
            go={go}
            onEvidence={onEvidence}
            onDerive={onDerive}
          />
          {owner && /^\d+$/.test(opportunity.notice_id) && (
            <section className="connected-panel firm-link-panel pursuit-firm-link">
              <h2>Firm profile for future assessments</h2>
              {detail.firmLink ? (
                <p className="small">
                  Linked {detail.firmLink.legal_name} · effective{" "}
                  {date(detail.firmLink.effective_date)} · source{" "}
                  {detail.firmLink.source}. Saved reports keep their earlier
                  frozen profile.
                </p>
              ) : (
                <p className="small">
                  No firm profile linked. Firm fit and eligibility remain
                  unknown.
                </p>
              )}
              <form
                className="firm-link-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!selectedFirm) return;
                  setFirmError("");
                  setSavingFirm(true);
                  void request(`/opportunities/${opportunity.id}/firm`, {
                    clientId: selectedFirm,
                  })
                    .then(() => onRefresh?.())
                    .catch((error: Error) => setFirmError(error.message))
                    .finally(() => setSavingFirm(false));
                }}
              >
                <label>
                  Existing firm profile{" "}
                  <select
                    value={selectedFirm}
                    onChange={(event) => setSelectedFirm(event.target.value)}
                    required
                  >
                    <option value="">Choose a profile</option>
                    {clients.map((firm) => (
                      <option key={firm.id} value={firm.id}>
                        {firm.legal_name} · effective{" "}
                        {firm.context.effectiveDate}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="submit"
                  disabled={
                    !selectedFirm ||
                    selectedFirm === opportunity.client_id ||
                    savingFirm
                  }
                >
                  {savingFirm ? "Linking…" : "Link profile"}
                </Button>
              </form>
              {firmError && <p role="alert">{firmError}</p>}
            </section>
          )}
        </>
      )}
    </>
  );
}
