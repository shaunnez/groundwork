import type { Assessment } from "../../shared/contracts.ts";
import type { DeliverableInput } from "../../server/deliverables.ts";
export function assessmentFixture(): Assessment {
  return {
    schemaVersion: "1",
    evidence: [
      {
        id: "e1",
        unitId: "11111111-1111-4111-8111-111111111111",
        kind: "quote",
        excerpt: "The buyer invites proposals for assessment services.",
      },
      {
        id: "e2",
        unitId: "22222222-2222-4222-8222-222222222222",
        kind: "quote",
        excerpt:
          "Acme Corp holds a current regional supply agreement covering this scope.",
      },
    ],
    claims: [
      {
        id: "c1",
        key: "scope",
        text: "The buyer invites proposals for assessment services.",
        kind: "fact",
        provenance: "sourced",
        evidenceIds: ["e1"],
        premiseIds: [],
        assumptions: [],
        duplicateOf: null,
        adverseEntity: null,
      },
      {
        id: "c2",
        key: "action",
        text: "Check the participation requirements before investing bid effort.",
        kind: "advice",
        provenance: "assessed",
        evidenceIds: ["e1"],
        premiseIds: ["c1"],
        assumptions: ["The client may be interested"],
        duplicateOf: null,
        adverseEntity: null,
      },
      {
        id: "c3",
        key: "gap",
        text: "Client capabilities have not been supplied for this assessment.",
        kind: "gap",
        provenance: "gap",
        evidenceIds: [],
        premiseIds: [],
        assumptions: [],
        duplicateOf: null,
        adverseEntity: null,
      },
      {
        id: "c4",
        key: "competitor-note",
        text: "Acme Corp holds a current regional supply agreement covering this scope.",
        kind: "fact",
        provenance: "sourced",
        evidenceIds: ["e2"],
        premiseIds: [],
        assumptions: [],
        duplicateOf: null,
        adverseEntity: "Acme Corp",
      },
    ],
    verdict: {
      recommendation: "Provisional",
      rationaleClaimIds: ["c1"],
      disqualifier: null,
      disqualifierEvidenceIds: [],
      clientEvidenceIds: [],
      posture: "unknown",
      nextActionClaimId: "c2",
      uncertainty: {
        event: null,
        timeframe: null,
        conditions: [],
        gap: "Outcome policy pending",
      },
    },
    summary: {
      what: "c1",
      decidingFactor: "c3",
      nextAction: "c2",
      biggestGap: "c3",
    },
    centreOfGravity: {
      factorClaimId: "c3",
      implicationClaimId: "c3",
      actionClaimId: "c2",
    },
    scenarios: ["Win", "Lose", "No award"].map((name) => ({
      name,
      outcomeClaimId: "c3",
      assumptions: ["Hypothetical"],
      indicators: ["Buyer announcement"],
    })),
    hypotheses: {
      event: "Outcome of this procurement",
      timeframe: "Unknown",
      conditions: [],
      exclusivityRationale: "Distinct award outcomes",
      exhaustivenessRationale: "Includes no award",
      alternatives: ["Client wins", "Other supplier wins", "No award"].map(
        (statement, i) => ({
          id: `h${i}`,
          statement,
          supportingEvidenceIds: [],
          contradictingEvidenceIds: [],
          diagnosticRationale: "No differentiating evidence yet",
        }),
      ),
      nextCollection: "Find the eligibility criteria",
      numericalPolicy: "pending",
    },
    risks: [
      {
        id: "r1",
        claimId: "c3",
        likelihood: "unassessed",
        likelihoodRationale: "Client context missing",
        impact: "Wasted effort",
        trigger: "Incompatible mandatory requirements",
        mitigationClaimId: "c2",
      },
    ],
    limitations: ["Synthetic fixture for contract tests only"],
  };
}

export function intelligenceFixture() {
  return {
    cutoff: "2026-09-01",
    sourceIds: ["src-1", "src-2"],
    entities: [
      {
        name: "Acme Corp",
        status: "unresolved_name",
        evidenceSourceIds: ["src-2"],
      },
      {
        // Present in the intelligence snapshot but never cited by any claim:
        // an intentionally sparse entity to exercise the "explicit gap, not
        // a negative finding" behaviour.
        name: "Ghost Co",
        status: "unresolved_name",
        evidenceSourceIds: [],
      },
    ],
    incumbent: {
      status: "assessed_candidate" as const,
      entityName: "Acme Corp",
      clientRelationship: "unknown" as const,
      posture: "unknown" as const,
      evidenceSourceIds: ["src-2"],
      reviewReasons: [
        "Tier 3/4 evidence covers the cutoff date for this scope but has not been confirmed against a scope or legal-entity source of record; treat as a candidate pending review.",
      ],
      limitations: [
        "Confirmation requires tier 1 or 2 evidence that explicitly asserts current status, covers the cutoff date, and matches the scope exactly.",
      ],
    },
    metrics: {
      populationIds: ["a1"],
      awardCount: 1,
      supplierCount: 1,
      repeatSupplierCount: 0,
      repeatSupplierRate: 0,
      retention: {
        retained: 0,
        known: 0,
        unknown: 0,
        excluded: 0,
        rate: null,
        policy: "pending" as const,
        observations: [],
      },
      limitations: [
        "Award population is limited to exact buyer and category matches on or before the cutoff date.",
      ],
    },
    limitations: [
      "No normalized award population available; retention and supplier counts are not market-wide claims",
    ],
    researchScope:
      "Admitted source snapshots only; bounded external research receipts remain separate",
  };
}

export function sourceInventoryFixture() {
  return [
    {
      id: "src-1",
      name: "Notice.pdf",
      purpose: "notice",
      provenance: "public",
      publishedAt: "2026-08-01",
    },
    {
      id: "src-2",
      name: "Awards register.csv",
      purpose: "awards",
      provenance: "public",
      publishedAt: null,
    },
  ];
}

export function payloadFixture(assessment: Assessment) {
  return {
    assessment,
    support: assessment.claims.map((c) => ({
      claimId: c.id,
      support: "supported" as const,
      factualIntegrity: "no_unsupported_fact_identified" as const,
      rationale: "Fixed test result, not a model evaluation",
    })),
    quoteStates: {},
    summarySentences: [
      "The buyer invites proposals for assessment services.",
      "Assessment: Provisional; likelihood and confidence policy pending.",
      "Client capabilities have not been supplied for this assessment.",
      "Check the participation requirements before investing bid effort.",
      "Client capabilities have not been supplied for this assessment.",
    ],
    limitations: [
      "Internal draft; probability, confidence and release policies remain pending.",
      "Model support review is an analytical check, not mechanical proof of entailment.",
    ],
    requirements: null,
    method: {
      schema: "1",
      prompt: "pursuit-v1",
      transport: "claude-subscription",
    },
    evaluation: "fixture" as const,
    intelligence: intelligenceFixture(),
    sourceInventory: sourceInventoryFixture(),
    cutoff: "2026-09-01",
  };
}

export function baseInput(): DeliverableInput {
  const assessment = assessmentFixture();
  return {
    reportId: "report-1",
    intelligenceId: "intel-1",
    opportunity: {
      id: "opp-1",
      title: "Digital advisory services",
      buyer: "Harbour Regional Council",
      noticeId: "GETS-1234",
      closingAt: "2026-09-24T00:00:00Z",
    },
    payload: payloadFixture(assessment),
    previous: null,
    generatedAt: "2026-09-22T08:00:00Z",
  };
}

// ---------------------------------------------------------------------------
// Shared reference / provenance behaviour across all three kinds
// ---------------------------------------------------------------------------
