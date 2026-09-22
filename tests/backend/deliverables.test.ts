import test from "node:test";
import assert from "node:assert/strict";
import type { Assessment } from "../../shared/contracts.ts";
import {
  compileDeliverable,
  type DeliverableInput,
  type WatchlistDeliverable,
  type CompetitorDeliverable,
  type WeeklyDeliverable,
} from "../../server/deliverables.ts";

// ---------------------------------------------------------------------------
// Small, representative, fully typed fixture. All organisations and
// documents below are fictional test data, not real entities.
// ---------------------------------------------------------------------------

import {
  assessmentFixture,
  intelligenceFixture,
  sourceInventoryFixture,
  payloadFixture,
  baseInput,
} from "./fixtures.ts";
test("all three deliverables share the same intelligence reference and canonical verdict", () => {
  const input = baseInput();
  const watchlist = compileDeliverable(
    "watchlist",
    input,
  ) as WatchlistDeliverable;
  const competitor = compileDeliverable(
    "competitor",
    input,
  ) as CompetitorDeliverable;
  const weekly = compileDeliverable("weekly", input) as WeeklyDeliverable;

  for (const d of [watchlist, competitor, weekly]) {
    assert.equal(d.intelligenceId, "intel-1");
    assert.equal(d.reportId, "report-1");
    assert.equal(d.evaluation, "fixture");
  }
  assert.deepEqual(watchlist.canonicalVerdict, competitor.canonicalVerdict);
  assert.deepEqual(competitor.canonicalVerdict, weekly.canonicalVerdict);
  assert.equal(watchlist.canonicalVerdict.recommendation, "Provisional");
});

test("adverse-entity and incumbent review reasons are inherited identically by every kind; publication is always internal-pending", () => {
  const input = baseInput();
  const watchlist = compileDeliverable("watchlist", input);
  const competitor = compileDeliverable("competitor", input);
  const weekly = compileDeliverable("weekly", input);

  for (const d of [watchlist, competitor, weekly]) {
    assert.equal(d.reviewTriggers.publicationStatus, "internal_pending");
    assert.ok(d.reviewTriggers.reasons.includes("Adverse competitor claim"));
    assert.ok(
      d.reviewTriggers.reasons.some((r) => /Tier 3\/4 evidence/.test(r)),
    );
    assert.ok(
      d.reviewTriggers.reasons.includes(
        "Internal draft: publication policy pending",
      ),
    );
  }
});

test("no deliverable authors new facts: every carried claim keeps the canonical claim's exact text", () => {
  const input = baseInput();
  const assessment = input.payload.assessment;
  const originalText = new Map(assessment.claims.map((c) => [c.id, c.text]));

  const watchlist = compileDeliverable(
    "watchlist",
    input,
  ) as WatchlistDeliverable;
  for (const item of watchlist.intelligenceSummary)
    assert.equal(item.text, originalText.get(item.claimId));
  for (const item of watchlist.recommendedActions)
    assert.equal(item.text, originalText.get(item.claimId));

  const competitor = compileDeliverable(
    "competitor",
    input,
  ) as CompetitorDeliverable;
  const acme = competitor.entities.find((e) => e.name === "Acme Corp")!;
  for (const fact of acme.sourcedFacts)
    assert.equal(fact.text, originalText.get(fact.id));

  const weekly = compileDeliverable("weekly", input) as WeeklyDeliverable;
  for (const item of weekly.priorities)
    assert.equal(item.text, originalText.get(item.claimId));
  for (const item of weekly.actions)
    assert.equal(item.text, originalText.get(item.claimId));

  // Base claims/evidence are carried byte-for-byte, not re-authored.
  for (const d of [watchlist, competitor, weekly]) {
    assert.deepEqual(
      d.claims.map((c) => c.text),
      assessment.claims.map((c) => c.text),
    );
    assert.deepEqual(
      d.evidence.map((e) => e.excerpt),
      assessment.evidence.map((e) => e.excerpt),
    );
  }
});

// ---------------------------------------------------------------------------
// Competitor dossier: real entity vs sparse/gap entity
// ---------------------------------------------------------------------------

test("competitor dossier carries a sourced entity's cited facts and its identity limitation", () => {
  const input = baseInput();
  const competitor = compileDeliverable(
    "competitor",
    input,
  ) as CompetitorDeliverable;
  const acme = competitor.entities.find((e) => e.name === "Acme Corp");
  assert.ok(acme);
  assert.equal(acme!.sourcedFacts.length, 1);
  assert.equal(acme!.sourcedFacts[0].id, "c4");
  assert.deepEqual(acme!.sameScopeAwardFootprint.evidenceSourceIds, ["src-2"]);
  assert.ok(acme!.identityLimitations.some((l) => /unresolved_name/.test(l)));
  assert.equal(competitor.noEntitiesGap, null);
});

test("a sparse profile (no sourced claims) states an explicit gap instead of inventing strengths or weaknesses", () => {
  const input = baseInput();
  const competitor = compileDeliverable(
    "competitor",
    input,
  ) as CompetitorDeliverable;
  const ghost = competitor.entities.find((e) => e.name === "Ghost Co");
  assert.ok(ghost);
  assert.equal(ghost!.sourcedFacts.length, 0);
  assert.equal(ghost!.strengthsWeaknesses.evidenced.length, 0);
  assert.match(ghost!.strengthsWeaknesses.gap, /No sourced fact/);
  assert.equal(ghost!.positioningActions.length, 0);
  assert.equal(ghost!.sameScopeAwardFootprint.evidenceSourceIds.length, 0);
  assert.ok(ghost!.verificationQuestions.length > 0);
});

test("competitor dossier reports an explicit gap when no entity is named at all", () => {
  const input = baseInput();
  const assessment = {
    ...input.payload.assessment,
    claims: input.payload.assessment.claims.map((c) => ({
      ...c,
      adverseEntity: null,
    })),
  };
  const noEntityInput: DeliverableInput = {
    ...input,
    payload: {
      ...input.payload,
      assessment,
      intelligence: { ...intelligenceFixture(), entities: [] },
    },
  };
  const competitor = compileDeliverable(
    "competitor",
    noEntityInput,
  ) as CompetitorDeliverable;
  assert.equal(competitor.entities.length, 0);
  assert.match(competitor.noEntitiesGap ?? "", /No competitor entity/);
});

// ---------------------------------------------------------------------------
// Weekly brief: compareReports-driven change detection
// ---------------------------------------------------------------------------

test("weekly brief with no previous report states nothing is compared, not that nothing changed", () => {
  const input = baseInput();
  const weekly = compileDeliverable("weekly", input) as WeeklyDeliverable;
  assert.equal(weekly.changesSincePrevious.hasPrevious, false);
  assert.equal(weekly.changesSincePrevious.rows.length, 0);
  assert.match(
    weekly.changesSincePrevious.note,
    /No previous saved report was supplied/,
  );
});

test("weekly brief never treats a stale/absent finding as closed, and never invents a trend from one comparison", () => {
  const input = baseInput();
  const previousAssessment: Assessment = {
    ...assessmentFixture(),
    claims: [
      ...assessmentFixture().claims,
      {
        id: "c-stale",
        key: "stale-thing",
        text: "A regional partnership was rumoured but never confirmed.",
        kind: "gap",
        provenance: "gap",
        evidenceIds: [],
        premiseIds: [],
        assumptions: [],
        duplicateOf: null,
        adverseEntity: null,
      },
    ],
  };
  const inputWithPrevious: DeliverableInput = {
    ...input,
    previous: { reportId: "prev-report", assessment: previousAssessment },
  };
  const weekly = compileDeliverable(
    "weekly",
    inputWithPrevious,
  ) as WeeklyDeliverable;

  assert.equal(weekly.changesSincePrevious.hasPrevious, true);
  assert.equal(weekly.changesSincePrevious.previousReportId, "prev-report");
  const staleRow = weekly.changesSincePrevious.rows.find(
    (r) => r.previousId === "c-stale",
  );
  assert.ok(staleRow);
  assert.equal(staleRow!.status, "ABSENT_FROM_THIS_RUN");
  assert.match(staleRow!.rationale, /not evidence of closure/i);
  assert.match(weekly.trendCaveat, /not a market or sector trend/);
});

test("weekly brief carries priorities, actions, the same review triggers, and a collection agenda from the gap claim", () => {
  const input = baseInput();
  const weekly = compileDeliverable("weekly", input) as WeeklyDeliverable;
  assert.deepEqual(
    weekly.priorities.map((p) => p.claimId).sort(),
    ["c1", "c2"].sort(),
  );
  assert.deepEqual(weekly.actions, [
    {
      claimId: "c2",
      text: "Check the participation requirements before investing bid effort.",
    },
  ]);
  assert.ok(
    weekly.collectionAgenda.includes(
      "Client capabilities have not been supplied for this assessment.",
    ),
  );
  assert.ok(weekly.collectionAgenda.includes("Find the eligibility criteria"));
});

// ---------------------------------------------------------------------------
// Watchlist specifics
// ---------------------------------------------------------------------------

test("watchlist distinguishes a confirmed closing date from an unconfirmed one and never invents a numeric forecast", () => {
  const input = baseInput();
  const watchlist = compileDeliverable(
    "watchlist",
    input,
  ) as WatchlistDeliverable;
  assert.equal(watchlist.listingContext.dateStatus, "user_supplied_unverified");
  assert.equal(watchlist.incumbent.status, "assessed_candidate");
  assert.equal(watchlist.awardForecast.metrics.retention.rate, null);
  assert.match(
    watchlist.awardForecast.forecastNote,
    /no numeric renewal forecast/,
  );

  const noDateInput: DeliverableInput = {
    ...input,
    opportunity: { ...input.opportunity, closingAt: null },
  };
  const watchlist2 = compileDeliverable(
    "watchlist",
    noDateInput,
  ) as WatchlistDeliverable;
  assert.equal(watchlist2.listingContext.dateStatus, "not_confirmed");
});

// ---------------------------------------------------------------------------
// Boundary validation: malformed saved data must fail loudly, not silently
// ---------------------------------------------------------------------------

test("a malformed saved intelligence snapshot is rejected rather than fabricated into structure", () => {
  const input = baseInput();
  const bad: DeliverableInput = {
    ...input,
    payload: { ...input.payload, intelligence: { unexpected: true } },
  };
  assert.throws(
    () => compileDeliverable("watchlist", bad),
    /intelligence snapshot/,
  );
});

test("a malformed saved source inventory entry is rejected", () => {
  const input = baseInput();
  const bad: DeliverableInput = {
    ...input,
    payload: {
      ...input.payload,
      sourceInventory: [{ id: "src-1" }],
    },
  };
  assert.throws(() => compileDeliverable("weekly", bad), /source inventory/);
});

test("an assessment that fails the shared AssessmentSchema is rejected at the boundary", () => {
  const input = baseInput();
  const bad = {
    ...input,
    payload: {
      ...input.payload,
      assessment: { ...input.payload.assessment, schemaVersion: "2" },
    },
  } as unknown as DeliverableInput;
  assert.throws(() => compileDeliverable("competitor", bad));
});
