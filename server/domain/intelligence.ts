import { z } from "zod";

const dateString = z.iso.date("expected a valid YYYY-MM-DD calendar date");

export const AwardSchema = z
  .object({
    id: z.string(),
    buyer: z.string(),
    supplier: z.string(),
    category: z.string(),
    scope: z.string(),
    awardDate: dateString,
    startDate: dateString.nullable(),
    endDate: dateString.nullable(),
    sourceId: z.string(),
    predecessorId: z.string().nullable(),
    outcome: z.enum(["awarded", "unknown", "cancelled"]),
  })
  .strict();

export type Award = z.infer<typeof AwardSchema>;

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function sameAward(a: Award, b: Award): boolean {
  return (
    a.buyer === b.buyer &&
    a.supplier === b.supplier &&
    a.category === b.category &&
    a.scope === b.scope &&
    a.awardDate === b.awardDate &&
    a.startDate === b.startDate &&
    a.endDate === b.endDate &&
    a.sourceId === b.sourceId &&
    a.predecessorId === b.predecessorId &&
    a.outcome === b.outcome
  );
}

function dedupSourceIds(items: { sourceId: string }[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (!seen.has(item.sourceId)) {
      seen.add(item.sourceId);
      result.push(item.sourceId);
    }
  }
  return result;
}

export interface RetentionObservation {
  predecessorId: string;
  followOnId: string;
  state: "retained" | "lost" | "unknown" | "excluded";
  reason: string;
}

export interface AwardMetrics {
  populationIds: string[];
  awardCount: number;
  supplierCount: number;
  repeatSupplierCount: number;
  repeatSupplierRate: number | null;
  retention: {
    retained: number;
    known: number;
    unknown: number;
    excluded: number;
    rate: null;
    policy: "pending";
    observations: RetentionObservation[];
  };
  limitations: string[];
}

export function buildAwardMetrics(
  awards: Award[],
  filter: { buyer: string; category: string; cutoff: string },
): AwardMetrics {
  const byId = new Map<string, Award>();
  const populationOrder: string[] = [];

  for (const award of awards) {
    if (award.buyer !== filter.buyer) continue;
    if (award.category !== filter.category) continue;
    if (award.awardDate > filter.cutoff) continue;

    const existing = byId.get(award.id);
    if (existing) {
      if (!sameAward(existing, award)) {
        throw new Error(
          `Conflicting award records share id "${award.id}" with different data; ` +
            "duplicate ids must represent identical records.",
        );
      }
      continue;
    }
    byId.set(award.id, award);
    populationOrder.push(award.id);
  }

  const population = populationOrder.map((id) => byId.get(id)!);
  const populationIds = [...populationOrder];
  const awardCount = population.length;

  // Supplier win frequency must only reflect awards that actually went to a
  // named supplier. Cancelled and unknown-outcome records did not result in
  // an award, and an empty/blank supplier name is not an identified winner;
  // counting either as a "win" would fabricate repeat-supplier evidence.
  const namedAwardedPopulation = population.filter(
    (award) =>
      award.outcome === "awarded" && normalizeName(award.supplier).length > 0,
  );
  const supplierCounts = new Map<string, number>();
  for (const award of namedAwardedPopulation) {
    const key = normalizeName(award.supplier);
    supplierCounts.set(key, (supplierCounts.get(key) ?? 0) + 1);
  }
  const supplierCount = supplierCounts.size;
  let repeatSupplierCount = 0;
  for (const count of supplierCounts.values()) {
    if (count > 1) repeatSupplierCount += 1;
  }
  const repeatSupplierRate =
    supplierCount === 0 ? null : repeatSupplierCount / supplierCount;

  const observations: RetentionObservation[] = [];
  let retained = 0;
  let known = 0;
  let unknownCount = 0;
  let excludedCount = 0;

  for (const award of population) {
    if (!award.predecessorId) continue;

    let state: RetentionObservation["state"];
    let reason: string;

    if (award.predecessorId === award.id) {
      state = "excluded";
      reason =
        "An award cannot be its own predecessor; a self-referencing predecessor link is invalid.";
    } else {
      // Resolve the predecessor against the full (unfiltered) award list so a
      // predecessor outside this buyer/category population can still be
      // found, but guard against an id that resolves to more than one
      // distinct record: silently picking the first match would let an
      // ambiguous link masquerade as a real predecessor.
      const matches = awards.filter((a) => a.id === award.predecessorId);
      const distinctMatches: Award[] = [];
      for (const match of matches) {
        if (!distinctMatches.some((m) => sameAward(m, match))) {
          distinctMatches.push(match);
        }
      }

      if (distinctMatches.length === 0) {
        state = "unknown";
        reason = "Linked predecessor award was not found in the supplied data.";
      } else if (distinctMatches.length > 1) {
        state = "excluded";
        reason =
          "Multiple non-identical award records share the linked predecessor id; the predecessor could not be uniquely identified.";
      } else {
        const predecessor = distinctMatches[0];

        if (
          predecessor.buyer !== award.buyer ||
          predecessor.category !== award.category
        ) {
          state = "excluded";
          reason =
            "Linked predecessor belongs to a different buyer or category; retention comparison requires the same buyer and category.";
        } else if (predecessor.awardDate >= award.awardDate) {
          state = "excluded";
          reason =
            "Linked predecessor award date is not before the follow-on award date; a future or same-date predecessor cannot establish retention.";
        } else if (
          predecessor.outcome === "cancelled" ||
          award.outcome === "cancelled"
        ) {
          state = "excluded";
          reason =
            "A cancelled award in the linkage is excluded from retention comparison.";
        } else if (predecessor.scope !== award.scope) {
          state = "excluded";
          reason =
            "Predecessor and follow-on scopes differ; retention comparison requires an exact scope match.";
        } else if (
          predecessor.outcome === "unknown" ||
          award.outcome === "unknown"
        ) {
          state = "unknown";
          reason =
            "An unknown outcome in the linkage prevents a retention determination.";
        } else if (
          normalizeName(predecessor.supplier) === normalizeName(award.supplier)
        ) {
          state = "retained";
          reason =
            "Same normalized supplier name across the linked awards; legal entity identity is not verified.";
        } else {
          state = "lost";
          reason =
            "Different normalized supplier name across the linked awards.";
        }
      }
    }

    if (state === "retained") {
      retained += 1;
      known += 1;
    } else if (state === "lost") {
      known += 1;
    } else if (state === "unknown") {
      unknownCount += 1;
    } else {
      excludedCount += 1;
    }

    observations.push({
      predecessorId: award.predecessorId,
      followOnId: award.id,
      state,
      reason,
    });
  }

  return {
    populationIds,
    awardCount,
    supplierCount,
    repeatSupplierCount,
    repeatSupplierRate,
    retention: {
      retained,
      known,
      unknown: unknownCount,
      excluded: excludedCount,
      rate: null,
      policy: "pending",
      observations,
    },
    limitations: [
      "Award population is limited to exact buyer and category matches on or before the cutoff date.",
      "Supplier win counts and repeat-supplier statistics include only records with an 'awarded' outcome and a non-empty supplier name; cancelled, unknown-outcome, and unnamed-supplier records are excluded from those statistics even though they remain in the population count.",
      "Supplier comparisons use normalized display names only; legal entity identity is not verified.",
      "Retention is assessed only for awards with an explicit predecessorId link and an exact scope match; unlinked awards are not assessed for retention.",
      "Retention rate is left null because the eligibility population and comparison policy have not been resolved.",
      "Current incumbency cannot be inferred from award history alone.",
    ],
  };
}

export interface IncumbentObservation {
  entityName: string;
  productName: string | null;
  scope: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  tier: 1 | 2 | 3 | 4 | 5;
  sourceId: string;
  explicitCurrent: boolean;
}

export interface IncumbentResolution {
  status: "confirmed" | "assessed_candidate" | "unknown";
  entityName: string | null;
  clientRelationship: "incumbent" | "challenger" | "unknown";
  posture: "defend" | "challenge" | "unknown";
  evidenceSourceIds: string[];
  reviewReasons: string[];
  limitations: string[];
}

const INCUMBENT_LIMITATIONS: string[] = [
  "Confirmation requires tier 1 or 2 evidence that explicitly asserts current status, covers the cutoff date, and matches the scope exactly.",
  "Incumbency is never inferred from historical product usage alone.",
  "Client relationship is determined only from an exact normalized name match and is not independent legal-entity verification.",
];

function incumbentDateContainsCutoff(
  observation: IncumbentObservation,
  cutoff: string,
): boolean {
  if (observation.effectiveFrom === null) return false;
  if (observation.effectiveFrom > cutoff) return false;
  if (observation.effectiveTo === null) {
    // The absence of an end date does not by itself mean the engagement is
    // still current at the cutoff (e.g. stale evidence of old product use
    // with no recorded end). Only an explicit current-status assertion can
    // extend coverage indefinitely.
    return observation.explicitCurrent;
  }
  return observation.effectiveTo >= cutoff;
}

export function resolveIncumbent(input: {
  cutoff: string;
  scope: string;
  clientName: string | null;
  observations: IncumbentObservation[];
}): IncumbentResolution {
  const relevant = input.observations.filter((o) => o.scope === input.scope);

  const confirmable = relevant.filter(
    (o) =>
      (o.tier === 1 || o.tier === 2) &&
      o.explicitCurrent &&
      incumbentDateContainsCutoff(o, input.cutoff) &&
      o.entityName.trim().length > 0,
  );

  const reviewReasons: string[] = [];

  if (confirmable.length > 0) {
    const names = new Set(confirmable.map((o) => normalizeName(o.entityName)));

    if (names.size > 1) {
      reviewReasons.push(
        "Tier 1/2 sources report conflicting current-supplier entity names for this scope; resolve before confirming incumbency.",
      );
      return {
        status: "unknown",
        entityName: null,
        clientRelationship: "unknown",
        posture: "unknown",
        evidenceSourceIds: dedupSourceIds(confirmable),
        reviewReasons,
        limitations: INCUMBENT_LIMITATIONS,
      };
    }

    const entityName = confirmable[0].entityName;
    const evidenceSourceIds = dedupSourceIds(confirmable);
    let clientRelationship: IncumbentResolution["clientRelationship"] =
      "unknown";
    let posture: IncumbentResolution["posture"] = "unknown";

    if (input.clientName !== null) {
      if (normalizeName(entityName) === normalizeName(input.clientName)) {
        clientRelationship = "incumbent";
        posture = "defend";
        reviewReasons.push(
          "Client match relies on an exact normalized name comparison; legal entity identity is not independently verified.",
        );
      } else {
        clientRelationship = "challenger";
        posture = "challenge";
      }
    } else {
      reviewReasons.push(
        "Client name was not provided; incumbent/challenger relationship could not be determined.",
      );
    }

    return {
      status: "confirmed",
      entityName,
      clientRelationship,
      posture,
      evidenceSourceIds,
      reviewReasons,
      limitations: INCUMBENT_LIMITATIONS,
    };
  }

  const tierMidCandidates = relevant.filter(
    (o) =>
      (o.tier === 3 || o.tier === 4) &&
      incumbentDateContainsCutoff(o, input.cutoff),
  );
  const tier5Candidates = relevant.filter((o) => o.tier === 5);
  const candidates = [...tierMidCandidates, ...tier5Candidates];

  if (candidates.length > 0) {
    const candidateNames = new Set(
      candidates.map((o) => normalizeName(o.entityName)),
    );

    if (candidateNames.size > 1) {
      reviewReasons.push(
        "Tier 3-5 sources report conflicting supplier entity names for this scope; a single candidate could not be identified.",
      );
      return {
        status: "unknown",
        entityName: null,
        clientRelationship: "unknown",
        posture: "unknown",
        evidenceSourceIds: dedupSourceIds(candidates),
        reviewReasons,
        limitations: INCUMBENT_LIMITATIONS,
      };
    }

    const primary = tierMidCandidates[0] ?? tier5Candidates[0];

    if (tierMidCandidates.length > 0) {
      reviewReasons.push(
        "Tier 3/4 evidence covers the cutoff date for this scope but has not been confirmed against a scope or legal-entity source of record; treat as a candidate pending review.",
      );
    }
    if (tier5Candidates.length > 0) {
      reviewReasons.push(
        "Tier 5 evidence is present and always requires manual review before use.",
      );
    }

    return {
      status: "assessed_candidate",
      entityName: primary.entityName,
      clientRelationship: "unknown",
      posture: "unknown",
      evidenceSourceIds: dedupSourceIds(candidates),
      reviewReasons,
      limitations: INCUMBENT_LIMITATIONS,
    };
  }

  reviewReasons.push(
    "No tier 1-5 evidence establishes current incumbency for this scope as of the cutoff date.",
  );

  return {
    status: "unknown",
    entityName: null,
    clientRelationship: "unknown",
    posture: "unknown",
    evidenceSourceIds: [],
    reviewReasons,
    limitations: INCUMBENT_LIMITATIONS,
  };
}
