import { packageSections, pursuitPackage } from "./pursuit-package";
import { Badge } from "./ui";

export function PackageNavigation() {
  return (
    <nav className="package-navigation" aria-label="Pursuit package sections">
      {packageSections.map(([name, id]) => (
        <a
          href={"#section-" + id}
          key={id}
          onClick={(event) => {
            event.preventDefault();
            const section = document.getElementById("section-" + id);
            section?.scrollIntoView({
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                .matches
                ? "auto"
                : "smooth",
            });
            section?.focus({ preventScroll: true });
          }}
        >
          {name}
        </a>
      ))}
    </nav>
  );
}

export function CentreOfGravity({ rfp }: { rfp: boolean }) {
  const { gravity } = pursuitPackage(rfp);
  return (
    <section id="section-gravity" tabIndex={-1} className="section-gap">
      <span className="eyebrow">THE DECISIVE FACTOR</span>
      <h2>Centre of gravity analysis</h2>
      <div className="gravity-panel">
        <h3>{gravity.factor}</h3>
        <p>{gravity.reasoning}</p>
        <p className="small">
          <strong>Evidence basis:</strong> {gravity.basis}
        </p>
        <p className="small">
          <strong>Confidence:</strong> {gravity.confidence}
        </p>
        <div className="gravity-implication">
          <strong>Strategic implication</strong>
          <p>{gravity.implication}</p>
        </div>
      </div>
      <p className="small muted package-caveat">
        <strong>What would change this view?</strong> {gravity.challenge}
      </p>
    </section>
  );
}

export function ScenarioAnalysis({ rfp }: { rfp: boolean }) {
  const { scenarios, hypotheses } = pursuitPackage(rfp);
  return (
    <>
      <section id="section-cone" tabIndex={-1} className="section-gap">
        <span className="eyebrow">TEST THE RANGE OF OUTCOMES</span>
        <h2>Cone of plausibility</h2>
        <p className="muted small">
          Three planning scenarios, from downside to upside. The working case is
          a provisional planning assumption, not a measured probability.
          {rfp
            ? " Disclosed RFP criteria stay fixed across these scenarios; remaining uncertainty concerns delivery readiness and competition."
            : " Evaluation criteria remain unknown. These scenarios do not invent weights or predict an award."}
        </p>
        <div className="scenario-grid">
          {scenarios.map((scenario, index) => (
            <article
              className={index === 1 ? "scenario-working" : ""}
              key={scenario.name}
            >
              <span className="eyebrow">{scenario.name}</span>
              <h3>{scenario.title}</h3>
              <p>{scenario.premise}</p>
              <dl>
                <dt>Signal to watch</dt>
                <dd>{scenario.signal}</dd>
                <dt>Response</dt>
                <dd>{scenario.action}</dd>
              </dl>
            </article>
          ))}
        </div>
      </section>
      <section id="section-hypotheses" tabIndex={-1} className="section-gap">
        <span className="eyebrow">CHALLENGE THE COMPETITIVE READ</span>
        <h2>Analysis of competing hypotheses</h2>
        <p className="small muted">
          Compare alternative explanations against supporting and contradictory
          evidence. These fictional ACH examples are qualitative; no win
          probability is assigned.
        </p>
        <div className="hypothesis-list">
          {hypotheses.map((hypothesis) => (
            <article key={hypothesis.id}>
              <div className="section-heading">
                <span className="eyebrow">{hypothesis.id}</span>
                <Badge
                  tone={rfp && hypothesis.id === "H3" ? "warning" : "info"}
                >
                  {hypothesis.judgement}
                </Badge>
              </div>
              <h3>{hypothesis.title}</h3>
              <div className="hypothesis-evidence">
                <div>
                  <h4>Evidence for</h4>
                  <p>{hypothesis.supporting}</p>
                </div>
                <div>
                  <h4>Evidence against / limitations</h4>
                  <p>{hypothesis.against}</p>
                </div>
              </div>
              <p className="hypothesis-test">
                <strong>Next test:</strong> {hypothesis.test}
              </p>
            </article>
          ))}
        </div>
        <p className="small muted package-caveat">
          <strong>Assessment:</strong>{" "}
          {rfp
            ? "H2 has the strongest support in the supplied scope and criteria; it does not establish which firm will win. H3 is retracted rather than carried into the current recommendation."
            : "The evidence does not yet distinguish a leading explanation. Resolve the scope first; an agency relationship and a capability claim are not proof of competitive advantage."}
        </p>
      </section>
    </>
  );
}
