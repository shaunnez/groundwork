import type { Deliverable } from "../server/deliverables.ts";
import { Badge } from "./ui.tsx";
export function EnrichedSections({
  data,
  renderClaim,
  comparison,
  showValidation = true,
}: {
  data: Deliverable;
  comparison?: Array<{
    status: string;
    previousText?: string | null;
    currentText?: string | null;
    rationale: string;
  }>;
  renderClaim: (id: string, repeated: boolean) => React.ReactNode;
  showValidation?: boolean;
}) {
  const metrics = data.kind === "watchlist" ? data.awardForecast.metrics : null;
  const shown = new Set<string>();
  const claim = (id: string) => {
    const repeated = shown.has(id);
    shown.add(id);
    return renderClaim(id, repeated);
  };
  return (
    <>
      <section id="deliverable-overview">
        <h2>
          {data.kind === "watchlist"
            ? "Opportunity watchlist entry"
            : data.kind === "competitor"
              ? "Notice-linked supplier profile"
              : "Opportunity weekly update"}
        </h2>
        <p>
          {data.opportunity.title} · {data.opportunity.buyer} · As at{" "}
          {data.cutoff}
        </p>
        <Badge>{data.canonicalVerdict.recommendation}</Badge>
        <p>
          Same intelligence snapshot and evidence as the linked pursuit package.
        </p>
        <p className="small muted">
          This saved page covers one opportunity. The portfolio weekly brief
          brings tracked opportunities together.
        </p>
      </section>
      {data.kind === "watchlist" && (
        <>
          <section id="deliverable-intelligence">
            <h2>Intelligence summary</h2>
            {data.intelligenceSummary.map((c) => (
              <div className="deliverable-finding" key={c.claimId}>
                {claim(c.claimId)}
              </div>
            ))}
          </section>
          <section id="deliverable-actions">
            <h2>Recommended actions</h2>
            {data.recommendedActions.map((c) => (
              <div className="deliverable-finding" key={c.claimId}>
                {claim(c.claimId)}
              </div>
            ))}
          </section>
          <section id="deliverable-competition">
            <h2>Competitive context and award history</h2>
            <p>
              Incumbent: {data.incumbent.entityName ?? "Unknown"} ·{" "}
              {data.incumbent.status.replaceAll("_", " ")}
            </p>
            <p>
              {metrics?.awardCount}{" "}
              {metrics?.awardCount === 1 ? "award" : "awards"} /{" "}
              {metrics?.supplierCount}{" "}
              {metrics?.supplierCount === 1 ? "supplier" : "suppliers"} in the
              admitted population. Repeat-supplier count:{" "}
              {metrics?.repeatSupplierCount}. Retention policy pending.
            </p>
            <p>{data.awardForecast.forecastNote}</p>
            <p>
              Originally supplied deadline:{" "}
              {data.listingContext.closingAt ?? "Not supplied"}. Check the
              current cited assessment for applicable amendments.
            </p>
            {metrics?.limitations.map((t) => (
              <p className="muted" key={t}>
                {t}
              </p>
            ))}
          </section>
        </>
      )}
      {data.kind === "competitor" && (
        <>
          <section id="deliverable-suppliers">
            <h2>Supplier observations</h2>
            <p className="muted">
              Names are observations in this opportunity's saved sources;
              identity and bidding intentions require verification.
            </p>
            {data.noEntitiesGap && <p>{data.noEntitiesGap}</p>}
            {data.entities.map((entity) => (
              <article className="deliverable-supplier" key={entity.name}>
                <h3>{entity.name}</h3>
                <h4>Identity and relationship</h4>
                {entity.identityLimitations.map((t) => (
                  <p key={t}>{t}</p>
                ))}
                <h4>Relevant award footprint</h4>
                <p>
                  {entity.sameScopeAwardFootprint.populationSummary.awardCount}{" "}
                  {entity.sameScopeAwardFootprint.populationSummary
                    .awardCount === 1
                    ? "award"
                    : "awards"}{" "}
                  in the buyer/category population.
                </p>
                <p>{entity.sameScopeAwardFootprint.limitation}</p>
                <h4>Sourced position</h4>
                {entity.sourcedFacts.length ? (
                  entity.sourcedFacts.map((c) => (
                    <div className="deliverable-finding" key={c.id}>
                      {claim(c.id)}
                    </div>
                  ))
                ) : (
                  <p>No entity-specific claim supported in this snapshot.</p>
                )}
                <h4>Strengths, weaknesses and positioning</h4>
                <p>{entity.strengthsWeaknesses.gap}</p>
                {entity.positioningActions.map((c) => (
                  <div className="deliverable-finding" key={c.claimId}>
                    {claim(c.claimId)}
                  </div>
                ))}
                <h4>Next verification questions</h4>
                <ul>
                  {entity.verificationQuestions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </article>
            ))}
          </section>
        </>
      )}
      {data.kind === "weekly" && (
        <>
          <section id="deliverable-changes">
            <h2>What changed</h2>
            <p>{data.changesSincePrevious.note}</p>
            {(comparison ?? data.changesSincePrevious.rows)
              .filter((row) => showValidation || row.status !== "UNCHANGED")
              .map((r, i) => (
                <p key={i}>
                  <Badge>{r.status.replaceAll("_", " ")}</Badge>
                  {r.previousText && (
                    <>
                      <br />
                      Before: {r.previousText}
                    </>
                  )}
                  {r.currentText && (
                    <>
                      <br />
                      Now: {r.currentText}
                    </>
                  )}
                  {r.status === "ABSENT_FROM_THIS_RUN" && (
                    <>
                      <br />
                      Not repeated in this assessment; closure is not
                      established.
                    </>
                  )}
                </p>
              ))}
            <p className="muted">{data.trendCaveat}</p>
          </section>
          <section id="deliverable-priorities">
            <h2>Priorities and actions</h2>
            {data.priorities.map((c) => (
              <div className="deliverable-finding" key={c.claimId}>
                {claim(c.claimId)}
              </div>
            ))}
            {data.actions.map((c) => (
              <div className="deliverable-finding" key={c.claimId}>
                {claim(c.claimId)}
              </div>
            ))}
          </section>
          <section id="deliverable-competition">
            <h2>Competitive picture</h2>
            <p>
              Incumbent:{" "}
              {data.competitiveContext.incumbent.entityName ?? "Unknown"}
            </p>
            <p>
              Recorded supplier names (identity unverified):{" "}
              {data.competitiveContext.entities.map((e) => e.name).join(", ") ||
                "No resolved supplier evidence"}
            </p>
            {data.awardsAndRetentionLimitations.map((t) => (
              <p key={t}>{t}</p>
            ))}
          </section>
          <section id="deliverable-collection">
            <h2>Collection agenda</h2>
            <ul>
              {data.collectionAgenda.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
        </>
      )}
      <section id="deliverable-coverage">
        <h2>Enrichment coverage</h2>
        {data.missingEnrichment.map((t) => (
          <p key={t}>{t}</p>
        ))}
        {showValidation && (
          <p>
            Evidence inventory:{" "}
            {data.sourceInventory
              .map((s) => `${s.name} (${s.purpose})`)
              .join("; ")}
            .
          </p>
        )}
      </section>
    </>
  );
}
