import { useDemo } from "./context";
import { opportunities } from "./catalogue";
import { recommendation } from "./intelligence-data";
import { Badge, Button, I } from "./ui";

export const clientJourney = [
  {
    title: "Discover",
    screen: "watchlist",
    body: "Scan relevant opportunities, read the assessment and save work worth investigating.",
  },
  {
    title: "Investigate",
    screen: "pursuit",
    body: "Open a pursuit to understand scope, possible competitors and the evidence behind the recommendation.",
  },
  {
    title: "Reassess",
    screen: "upload",
    body: "Add tender documents to test the public-data findings against the actual RFP. Compare what changed.",
  },
  {
    title: "Decide",
    screen: "decisions",
    body: "Review requirements and your firm’s capacity, then record a decision and its rationale.",
  },
];

export function Home() {
  const { demo, go } = useDemo();
  const rfp = demo.reportHistory.at(-1)?.kind === "Document assessment";
  const request = demo.request;
  const requestOpen =
    request && !["ready", "cancelled"].includes(request.stage);
  return (
    <>
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">
            GROUNDWORK BY BIDEDGE · YOUR FIRM WORKSPACE
          </span>
          <h1>A clearer view of your next bid.</h1>
          <p className="lead">
            Welcome back, {demo.firm}. Start with what deserves attention,
            understand the competition, and decide where to commit your team.
          </p>
          <Button onClick={() => go("watchlist")}>
            Explore your watchlist <I.ArrowRight size={18} />
          </Button>
        </div>
        <aside>
          <span className="eyebrow">WHAT IS GROUNDWORK?</span>
          <h2>Procurement intelligence from BidEdge.</h2>
          <p>
            Groundwork brings opportunities, buyer and competitor research, and
            your firm’s evidence into one place. Each pursuit explains why an
            opportunity may matter and what you still need to check.
          </p>
          <span className="small">Your team owns the bid decision.</span>
        </aside>
      </section>
      <p className="dashboard-asof">
        Sample workspace · snapshot 9 September 2026 · all opportunities and
        analysis are fictional
      </p>
      <div className="dashboard-metrics">
        {[
          {
            label: "Open opportunities",
            value: opportunities.filter((o) => o.type === "Open tender").length,
            screen: "watchlist",
            detail: "Plus one indicative planning signal",
          },
          {
            label: "Saved by your firm",
            value: demo.saved.length,
            screen: "watchlist",
            detail: "Your shortlist for closer review",
            params: { filter: "saved" },
          },
          {
            label: "Pursuit report versions",
            value: demo.reportHistory.length,
            screen: "reports",
            detail: "Original findings stay available",
          },
        ].map((metric) => (
          <button
            className="dashboard-metric"
            key={metric.label}
            onClick={() => go(metric.screen, "normal", metric.params)}
          >
            <span>
              {metric.label}
              <I.ArrowRight size={18} />
            </span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </button>
        ))}
      </div>
      <section className="dashboard-attention">
        <div>
          <span className="eyebrow">YOUR NEXT STEP</span>
          <h2>Digital service transformation</h2>
          <p className="muted">Harbour Regional Council · closes 24 Sep 2026</p>
          <Badge tone={rfp ? "success" : "warning"}>
            {recommendation(rfp)}
          </Badge>
          <p>
            {rfp
              ? "The RFP clarifies the advisory scope. Review your firm’s outstanding evidence and capacity before recording a decision."
              : "The deadline has moved. Advisory fit is promising, but the public notice leaves delivery scope and evaluation criteria unclear."}
          </p>
          <Button onClick={() => go("pursuit")}>
            Continue this pursuit <I.ArrowRight size={17} />
          </Button>
        </div>
        <div>
          <span className="eyebrow">IN YOUR WORKSPACE</span>
          <h3>
            {requestOpen ? "Your assessment request" : "Your latest assessment"}
          </h3>
          <p>
            {requestOpen
              ? `${request.kind} · ${request.stage === "failed" ? "needs attention after a failed stage" : request.stage === "review" ? "awaiting analyst review" : request.stage}`
              : `Version ${demo.reportVersion} · ${rfp ? "RFP reassessment" : "Public-data pursuit"}`}
          </p>
          <Button
            kind="text"
            onClick={() => go(requestOpen ? "processing" : "report")}
          >
            {requestOpen ? "View request progress" : "Read the report"}{" "}
            <I.ArrowRight size={16} />
          </Button>
          <hr />
          <h3>Your weekly brief</h3>
          <p>
            A concise view of new opportunities, changed deadlines and market
            signals.
          </p>
          <Button kind="text" onClick={() => go("brief")}>
            Read the sample brief <I.ArrowRight size={16} />
          </Button>
        </div>
      </section>
      <section className="section-gap">
        <span className="eyebrow">FROM OPPORTUNITY TO DECISION</span>
        <h2>How to use your workspace</h2>
        <div className="journey-grid">
          {clientJourney.map((step, index) => (
            <article key={step.title}>
              <span className="journey-number">0{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <Button kind="text" onClick={() => go(step.screen)}>
                Open {step.title.toLowerCase()} step <I.ArrowRight size={16} />
              </Button>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
