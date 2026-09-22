import type { Deliverable } from "../server/deliverables.ts";
import { Badge } from "./ui.tsx";
export function EnrichedSections({
  data,
  renderClaim,
  comparison,
}: {
  data: Deliverable;
  comparison?: Array<{
    status: string;
    previousText?: string | null;
    currentText?: string | null;
    rationale: string;
  }>;
  renderClaim: (id: string) => React.ReactNode;
}) {
  const metrics = data.kind === "watchlist" ? data.awardForecast.metrics : null;
  return (
    <>
      <section>
        <h3>
          {data.kind === "watchlist"
            ? "Daily watchlist"
            : data.kind === "competitor"
              ? "Notice-linked competitor profile"
              : "Weekly watch brief"}
        </h3>
        <p>
          {data.opportunity.title} · {data.opportunity.buyer} · As at{" "}
          {data.cutoff}
        </p>
        <Badge>{data.canonicalVerdict.recommendation}</Badge>
        <p>
          Same intelligence snapshot and evidence as the linked pursuit package.
        </p>
      </section>
      {data.kind === "watchlist" && (
        <>
          <section>
            <h3>Intelligence summary</h3>
            {data.intelligenceSummary.map((c) => (
              <div key={c.claimId}>{renderClaim(c.claimId)}</div>
            ))}
          </section>
          <section>
            <h3>Recommended actions</h3>
            {data.recommendedActions.map((c) => (
              <div key={c.claimId}>{renderClaim(c.claimId)}</div>
            ))}
          </section>
          <section>
            <h3>Competitive context and award history</h3>
            <p>
              Incumbent: {data.incumbent.entityName ?? "Unknown"} ·{" "}
              {data.incumbent.status.replaceAll("_", " ")}
            </p>
            <p>
              {metrics?.awardCount} awards / {metrics?.supplierCount} suppliers
              in the admitted population. Repeat-supplier count:{" "}
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
          {data.noEntitiesGap && (
            <section>
              <p>{data.noEntitiesGap}</p>
            </section>
          )}
          {data.entities.map((entity) => (
            <section key={entity.name}>
              <h3>{entity.name}</h3>
              <h4>Identity and relationship</h4>
              {entity.identityLimitations.map((t) => (
                <p key={t}>{t}</p>
              ))}
              <h4>Relevant award footprint</h4>
              <p>
                {entity.sameScopeAwardFootprint.populationSummary.awardCount}{" "}
                awards in the buyer/category population.
              </p>
              <p>{entity.sameScopeAwardFootprint.limitation}</p>
              <h4>Sourced position</h4>
              {entity.sourcedFacts.length ? (
                entity.sourcedFacts.map((c) => (
                  <div key={c.id}>{renderClaim(c.id)}</div>
                ))
              ) : (
                <p>No entity-specific claim supported in this snapshot.</p>
              )}
              <h4>Strengths, weaknesses and positioning</h4>
              <p>{entity.strengthsWeaknesses.gap}</p>
              {entity.positioningActions.map((c) => (
                <div key={c.claimId}>{renderClaim(c.claimId)}</div>
              ))}
              <h4>Next verification questions</h4>
              <ul>
                {entity.verificationQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
      {data.kind === "weekly" && (
        <>
          <section>
            <h3>What changed</h3>
            <p>{data.changesSincePrevious.note}</p>
            {(comparison ?? data.changesSincePrevious.rows).map((r, i) => (
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
                    Not repeated in this assessment; closure is not established.
                  </>
                )}
              </p>
            ))}
            <p className="muted">{data.trendCaveat}</p>
          </section>
          <section>
            <h3>Priorities and actions</h3>
            {data.priorities.map((c) => (
              <div key={c.claimId}>{renderClaim(c.claimId)}</div>
            ))}
            {data.actions.map((c) => (
              <div key={c.claimId}>{renderClaim(c.claimId)}</div>
            ))}
          </section>
          <section>
            <h3>Competitive picture</h3>
            <p>
              Incumbent:{" "}
              {data.competitiveContext.incumbent.entityName ?? "Unknown"}
            </p>
            <p>
              Recorded suppliers:{" "}
              {data.competitiveContext.entities.map((e) => e.name).join(", ") ||
                "No resolved supplier evidence"}
            </p>
            {data.awardsAndRetentionLimitations.map((t) => (
              <p key={t}>{t}</p>
            ))}
          </section>
          <section>
            <h3>Collection agenda</h3>
            <ul>
              {data.collectionAgenda.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
        </>
      )}
      <section>
        <h3>Enrichment coverage</h3>
        {data.missingEnrichment.map((t) => (
          <p key={t}>{t}</p>
        ))}
        <p>
          Evidence inventory:{" "}
          {data.sourceInventory
            .map((s) => `${s.name} (${s.purpose})`)
            .join("; ")}
          .
        </p>
      </section>
    </>
  );
}
