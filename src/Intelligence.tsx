import { useState } from "react";
import { useDemo } from "./context";
import {
  assessmentChanges,
  candidates,
  incumbent,
  listingId,
  recommendation,
} from "./intelligence-data";
import {
  Badge,
  Button,
  I,
  KeyFacts,
  Modal,
  Notice,
  PageHeader,
  StateBoundary,
} from "./ui";

export function CompetitiveField({
  rfp = false,
  shared = false,
}: {
  rfp?: boolean;
  shared?: boolean;
}) {
  const { go } = useDemo();
  const [selected, setSelected] = useState<string | null>(null);
  const candidate = candidates.find((c) => c.id === selected);
  return (
    <section className="competitive-field">
      <div className="section-heading">
        <h2>Who could compete?</h2>
        <Badge>Qualitative assessment</Badge>
      </div>
      <p className="muted small">
        Candidates found in captured web sources, corroborated against held
        award records, then compared using Analysis of Competing Hypotheses
        (ACH). Bid intention is unconfirmed.
      </p>
      {candidates.map((c) => (
        <article className="candidate-row" key={c.id}>
          <div className="candidate-identity">
            <h3>{c.name}</h3>
            <Badge>{c.position}</Badge>
          </div>
          <div>
            <p>
              {rfp
                ? c.hypothesis
                : c.id === "0"
                  ? "Its agency relationship makes it a relevant candidate. The public evidence does not establish whether it holds this advisory scope."
                  : c.hypothesis}
            </p>
            <small className="muted">{c.gap}</small>
            <Button kind="text" onClick={() => setSelected(c.id)}>
              Inspect reasoning <I.ArrowRight size={15} />
            </Button>
          </div>
        </article>
      ))}
      {candidate && (
        <Modal
          title={candidate.name + " · reasoning"}
          onClose={() => setSelected(null)}
        >
          <h3>1. Candidate discovery</h3>
          <p>
            {candidate.discovery}. Identity matched to sample entity DEMO-ORG-
            {Number(candidate.id) + 1}; not a live registry verification.
          </p>
          <h3>2. Historical corroboration</h3>
          <p>{candidate.history}</p>
          <h3>3. Competing explanations</h3>
          <p>
            {!rfp && candidate.id === "0"
              ? "Its agency relationship makes it a plausible candidate. The public sources do not establish whether it holds this advisory scope."
              : candidate.hypothesis}
          </p>
          <p>
            <strong>Alternative:</strong> relevant experience may not translate
            into a bid; capacity and commercial priorities are not known.
          </p>
          <Notice title="Confidence is limited by coverage">
            {candidate.gap} This example does not assign a win probability.
          </Notice>
          {!shared && (
            <Button
              onClick={() =>
                go("competitor", "normal", {
                  id: candidate.id,
                  listing: listingId,
                })
              }
            >
              Open listing-specific profile
            </Button>
          )}
        </Modal>
      )}
    </section>
  );
}

export function RfpComparison({ shared = false }: { shared?: boolean }) {
  const { go, notify } = useDemo();
  return (
    <section className="rfp-comparison">
      <div className="section-heading">
        <h2>What changed after the RFP?</h2>
        <Badge tone="success">Reassessed</Badge>
      </div>
      <div className="verdict-comparison">
        <div>
          <span className="eyebrow">PUBLIC-DATA ASSESSMENT</span>
          <h3>{recommendation(false)}</h3>
          <p>
            Resolve the possible bundled scope and incumbent advantage before
            committing bid effort.
          </p>
        </div>
        <I.ArrowRight size={24} />
        <div>
          <span className="eyebrow">AFTER TENDER DOCUMENTS</span>
          <h3 className="green">{recommendation(true)}</h3>
          <p>
            The advisory package is accessible to a specialist team. Confirm
            firm eligibility and capacity before committing.
          </p>
        </div>
      </div>
      <p className="small muted">
        Illustrative recommendation change for Bobby’s review. The previous
        version remains available; its findings have not been overwritten.
      </p>
      {assessmentChanges.map((change) => (
        <article className="change-row" key={change.topic}>
          <div className="section-heading">
            <h3>{change.topic}</h3>
            <Badge
              tone={
                change.status === "Retracted"
                  ? "warning"
                  : change.status === "Confirmed"
                    ? "neutral"
                    : "success"
              }
            >
              {change.status}
            </Badge>
          </div>
          <div className="change-columns">
            <div>
              <small className="eyebrow">PREVIOUS FINDING</small>
              <p
                className={
                  change.status === "Retracted" ? "retracted-finding" : "muted"
                }
              >
                {change.before}
              </p>
            </div>
            <div>
              <small className="eyebrow">CURRENT FINDING</small>
              <p>{change.after}</p>
            </div>
          </div>
          <p className="small">
            <strong>Commercial implication:</strong> {change.impact}
          </p>
          <button
            className="citation"
            onClick={() =>
              shared
                ? notify("Private tender pages are outside this report share.")
                : go("document", "complete", {
                    source: "0",
                    page: String(change.page),
                  })
            }
          >
            Tender requirements.pdf · v2 · p. {change.page}
            {shared ? " · firm access required" : ""}
          </button>
        </article>
      ))}
    </section>
  );
}

export function AssessmentBody({
  rfp = false,
  shared = false,
}: {
  rfp?: boolean;
  shared?: boolean;
}) {
  const { demo, go } = useDemo();
  return (
    <>
      <section id="section-0" className="assessment-summary commercial-summary">
        <span className="eyebrow">
          {rfp ? "STAGE 2 · RFP REASSESSMENT" : "STAGE 1 · PUBLIC-DATA PURSUIT"}
        </span>
        <h2 className="assessment-verdict">{recommendation(rfp)}</h2>
        <p className="lead">
          {rfp
            ? "A focused advisory opportunity with room for a specialist challenger."
            : "A relevant advisory opportunity. Establish the scope and competitive position before committing a bid team."}
        </p>
        <Badge tone={rfp ? "success" : "warning"}>
          {rfp
            ? "Scope clarified · firm checks remain"
            : "Provisional · material gaps"}
        </Badge>
      </section>
      <section id="section-1">
        <h2>The opportunity and competitive structure</h2>
        <p>
          Harbour Regional Council is procuring digital service transformation
          support.{" "}
          {rfp
            ? "The RFP defines a separate advisory package and excludes platform implementation."
            : "The public notice leaves the boundary between advisory and platform delivery unclear."}
        </p>
        <KeyFacts
          items={[
            ["Listing", listingId],
            ["Close", "24 Sep 2026 · 5pm NZST"],
            ["Value", "Not disclosed"],
            [
              "Evaluation",
              rfp
                ? "Method 40 · team 30 · experience 20 · price 10%"
                : "Weights not published",
            ],
          ]}
        />
        <div className="incumbent-panel">
          <span className="eyebrow">INCUMBENT POSITION</span>
          <h3>{rfp ? incumbent.rfp : incumbent.public}</h3>
          <p>{rfp ? assessmentChanges[0].after : incumbent.evidence}</p>
          <p className="small muted">
            Agency retention rate: not calculated. Comparable re-awards,
            continuity of scope and a defensible denominator have not been
            established.
          </p>
        </div>
        <CompetitiveField rfp={rfp} shared={shared} />
      </section>
      {rfp && <RfpComparison shared={shared} />}
      <section id="section-2" className="client-layer">
        <span className="eyebrow">YOUR FIRM · SEPARATE CLIENT CONTEXT</span>
        <h2>What this means for {demo.firm}</h2>
        <p>
          Your supplied capability statement describes two comparable
          transformation programmes.{" "}
          {rfp
            ? "The emphasis on methodology and team experience creates a credible route to differentiate."
            : "The advisory fit is promising; the public scope is too broad to establish a delivery position."}
        </p>
        <Notice title="No matching MBIE history held for your firm" tone="info">
          This does not establish a lack of capability. The two firm-supplied
          references remain relevant evidence and require their own review.
        </Notice>
        <p>
          <strong>Open firm checks:</strong> current security certification,
          available team capacity and reference suitability.{" "}
          {rfp
            ? "The RFP confirms a certification requirement on page 12."
            : "Tender-specific mandatory conditions are outside this public-data assessment."}
        </p>
        {!shared && (
          <div className="inline">
            <Button kind="text" onClick={() => go("firm")}>
              Review firm evidence
            </Button>
            <Button kind="text" onClick={() => go("requirements")}>
              Review tender requirements <I.ArrowRight size={15} />
            </Button>
          </div>
        )}
      </section>
      <section id="section-3" className="section-gap">
        <h2>Intelligence gaps and next steps</h2>
        <ul className="gap-list">
          <li>
            <strong>Not found:</strong> public statements of bid intention from
            the candidate firms.
          </li>
          <li>
            <strong>Not accessible:</strong> client-only tender material{" "}
            {rfp ? "beyond the supplied RFP" : "without a client upload"}.
          </li>
          <li>
            <strong>Not established:</strong> comparable agency retention
            history or competitors’ available teams.
          </li>
        </ul>
        <p>
          {rfp
            ? "Confirm the firm’s outstanding conditions and capacity, then decide whether the defined advisory scope warrants a response."
            : "Obtain the RFP, confirm scope and evaluation criteria, then rerun the competitive assessment."}
        </p>
        {!shared && (
          <Button onClick={() => go(rfp ? "decisions" : "upload")}>
            {rfp ? "Record your decision" : "Add RFP for reassessment"}{" "}
            <I.ArrowRight size={17} />
          </Button>
        )}
      </section>
    </>
  );
}

export function CompetitorProfile() {
  const { demo, scene, params, go } = useDemo();
  const id = String(Math.max(0, Math.min(2, Number(params.get("id")) || 0)));
  const c = candidates[Number(id)];
  const [listing, setListing] = useState(
    params.get("listing") === listingId ? listingId : "",
  );
  const [method, setMethod] = useState("CI Battle Card");
  const sections: Record<
    string,
    { title: string; body: string; evidence: string; limit: string }
  > = {
    "CI Battle Card": {
      title: "Compete on the defined advisory outcome",
      body:
        c.id === "0"
          ? "Aster’s agency familiarity could help it mobilise. A challenger can emphasise independent advice and a named specialist team aligned to the methodology criteria."
          : "Test the candidate’s demonstrated advisory role against the listing’s method and team criteria. Relevant delivery work alone does not establish advisory strength.",
      evidence: c.history,
      limit: "No proposed bid team or response has been seen.",
    },
    "Centre of Gravity": {
      title:
        c.id === "0"
          ? "Agency familiarity is a potential source of strength"
          : "Relevant specialist experience is the working hypothesis",
      body: "The hypothesis depends on current staff, relevant knowledge and their availability. Test those dependencies before treating the strength as durable.",
      evidence: c.discovery + "; RFP scope p. 4.",
      limit:
        "Relationships, key-person dependence and staffing are not independently confirmed.",
    },
    "Exploitable Commercial Behaviours": {
      title: "Separate observed behaviour from assumptions",
      body: "The held examples show participation in related work. They do not establish a repeatable discounting, partnering or bidding pattern. Use this gap to guide further research.",
      evidence: c.history,
      limit:
        "Award totals do not reveal unit rates, margin or pricing strategy.",
    },
    "Competitive Threat": {
      title: "A relevant candidate, with unconfirmed intent",
      body: c.hypothesis,
      evidence:
        "ACH compares scope fit, historical corroboration and plausible alternative explanations.",
      limit:
        "No composite threat score or calibrated win probability is assigned.",
    },
    "Intelligence Gaps": {
      title: "What would change this assessment?",
      body:
        c.gap +
        " Seek named staff evidence, comparable advisory references and a current signal of intent.",
      evidence:
        "No bid-intention statement found in captured sources. Client-only bid material was not accessible.",
      limit: "Missing historical data is not evidence of no capability.",
    },
  };
  const detail = sections[method];
  const published = demo.competitorReports.some(
    (r) => r.targetId === id && r.listingId === listing,
  );
  return (
    <>
      <PageHeader
        eyebrow="LISTING-SPECIFIC COMPETITIVE INTELLIGENCE"
        title={c.name}
        description="Assess this firm in the context of an actual opportunity."
        breadcrumb="Market"
      />
      <StateBoundary>
        <div className="listing-context">
          <label>
            Opportunity context
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
          <Badge>
            {published
              ? "Sample profile published"
              : "Identity matched · demo entity"}
          </Badge>
          <Button
            disabled={!listing}
            onClick={() =>
              go("request", "normal", { kind: "competitor", id, listing })
            }
          >
            Request this profile
          </Button>
        </div>
        {!listing ? (
          <Notice
            title="Select a listing to see the competitive assessment"
            tone="info"
          >
            Firm identity and history are shown below. Competitive conclusions
            require the opportunity’s scope, buyer and criteria.
          </Notice>
        ) : (
          <Notice
            title="Digital service transformation · Harbour Regional Council"
            tone="info"
          >
            This profile uses the sample RFP scope. Findings apply to this
            listing. All firms, identity matches and records are fictional.
          </Notice>
        )}
        {scene === "processing" && (
          <Notice title="Profile preparation is in progress" tone="info">
            The last available evidence remains readable.
            <Button kind="text" onClick={() => go("processing", "processing")}>
              View progress
            </Button>
          </Notice>
        )}
        {scene === "partial" && (
          <Notice title="Historical coverage is incomplete">
            Some source records could not be accessed. Totals below apply only
            to held, attributable award records.
          </Notice>
        )}
        <KeyFacts
          items={[
            ["Held award records", c.wins],
            ["Attributed total", c.total],
            ["Mean per held award", c.average],
            ["Sector", "Digital advisory"],
            [
              "Data quality",
              c.id === "2" ? "History not found" : "Limited coverage · sample",
            ],
          ]}
        />
        <p className="small muted">
          Figures use distinct, singly attributed fictional awards from
          2023–2025. Multi-supplier totals are excluded. These are historical
          observations, not an estimate of market share.
        </p>
        {listing && (
          <div className="method-layout">
            <div
              className="method-nav"
              role="group"
              aria-label="Analytical methods"
            >
              {Object.keys(sections).map((name) => (
                <button
                  key={name}
                  id={"method-" + name.replaceAll(" ", "-")}
                  aria-pressed={name === method}
                  aria-controls="method-panel"
                  onClick={() => setMethod(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            <article
              id="method-panel"
              role="region"
              aria-labelledby={"method-" + method.replaceAll(" ", "-")}
              className="method-panel"
            >
              <span className="eyebrow">{method}</span>
              <h2>{detail.title}</h2>
              <p className="lead">{detail.body}</p>
              <h3>Basis and reasoning</h3>
              <p>{detail.evidence}</p>
              <Notice title="Limit of this conclusion">{detail.limit}</Notice>
              <Button kind="text" onClick={() => go("pursuit", "reassessed")}>
                Read the opportunity assessment <I.ArrowRight size={16} />
              </Button>
            </article>
          </div>
        )}
        <section className="section-gap">
          <h2>History, agencies and distribution</h2>
          <p>{c.history}</p>
          <p className="small muted">
            The sample record set is too small to establish concentration or
            market share. No incumbent-retention statistic is inferred from
            award counts.
          </p>
          <Button kind="text" onClick={() => go("awards")}>
            Inspect held award records <I.ArrowRight size={16} />
          </Button>
        </section>
      </StateBoundary>
    </>
  );
}
