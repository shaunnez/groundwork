import test from "node:test";
import assert from "node:assert/strict";
import {
  AwardSchema,
  buildAwardMetrics,
  resolveIncumbent,
  type Award,
  type IncumbentObservation,
} from "../../server/domain/intelligence.ts";

function award(overrides: Partial<Award> & { id: string }): Award {
  const base: Award = {
    id: overrides.id,
    buyer: "Buyer B",
    supplier: "Acme Corp",
    category: "Cat C",
    scope: "Scope S",
    awardDate: "2024-01-01",
    startDate: null,
    endDate: null,
    sourceId: "source-1",
    predecessorId: null,
    outcome: "awarded",
  };
  return { ...base, ...overrides };
}

test("A7 AwardSchema dates use real calendar semantics, not just YYYY-MM-DD shape", () => {
  // Correctly shaped but calendar-impossible dates must be rejected.
  assert.throws(() =>
    AwardSchema.parse(award({ id: "a1", awardDate: "2023-02-30" })),
  );
  assert.throws(() =>
    AwardSchema.parse(award({ id: "a1", awardDate: "2023-04-31" })),
  );
  // Non-leap year February 29th is invalid.
  assert.throws(() =>
    AwardSchema.parse(award({ id: "a1", awardDate: "2023-02-29" })),
  );
  // Leap year February 29th is valid.
  assert.doesNotThrow(() =>
    AwardSchema.parse(award({ id: "a1", awardDate: "2024-02-29" })),
  );
  // Ordinary valid dates, including nullable start/end, still parse.
  assert.doesNotThrow(() =>
    AwardSchema.parse(
      award({ id: "a1", startDate: "2024-01-01", endDate: "2024-12-31" }),
    ),
  );
});

test("A19 supplier win counts exclude cancelled, unknown, and unnamed suppliers from repeat-supplier stats", () => {
  const awards: Award[] = [
    award({ id: "a1", supplier: "Acme Corp", awardDate: "2024-01-01" }),
    // Same supplier, different casing/spacing -> a genuine repeat win.
    award({ id: "a2", supplier: "  ACME   corp ", awardDate: "2024-02-01" }),
    // Cancelled: must not count as a Widgets Ltd win.
    award({
      id: "a3",
      supplier: "Widgets Ltd",
      outcome: "cancelled",
      awardDate: "2024-03-01",
    }),
    // The only real award to Widgets Ltd; must not be flagged as a repeat.
    award({
      id: "a4",
      supplier: "Widgets Ltd",
      outcome: "awarded",
      awardDate: "2024-03-15",
    }),
    // Blank supplier name on an "awarded" record must not create a phantom supplier.
    award({ id: "a5", supplier: "   ", awardDate: "2024-04-01" }),
    // Unknown outcome must not count as a win for Ghost Co.
    award({
      id: "a6",
      supplier: "Ghost Co",
      outcome: "unknown",
      awardDate: "2024-05-01",
    }),
  ];

  const metrics = buildAwardMetrics(awards, {
    buyer: "Buyer B",
    category: "Cat C",
    cutoff: "2025-01-01",
  });

  // Population/outcome counts stay honest: every record is still in the population.
  assert.equal(metrics.awardCount, 6);
  assert.equal(metrics.populationIds.length, 6);

  // Only Acme Corp (2 real awarded records) and Widgets Ltd (1 real awarded
  // record) are real named winners; Ghost Co and the blank-name record are not.
  assert.equal(metrics.supplierCount, 2);
  assert.equal(metrics.repeatSupplierCount, 1);
  assert.equal(metrics.repeatSupplierRate, 0.5);
});

test("A20 retention predecessor links reject self, future, cross buyer/category, and ambiguous duplicate ids", () => {
  const awards: Award[] = [
    // Self-referencing predecessor.
    award({
      id: "x1",
      supplier: "Acme",
      awardDate: "2024-06-01",
      predecessorId: "x1",
    }),
    // Predecessor (y1) is dated AFTER its follow-on (y2): chronologically impossible.
    award({ id: "y1", supplier: "Beta Inc", awardDate: "2024-06-01" }),
    award({
      id: "y2",
      supplier: "Beta Inc",
      awardDate: "2024-01-01",
      predecessorId: "y1",
    }),
    // Predecessor (z1) belongs to a different buyer entirely.
    award({
      id: "z1",
      buyer: "Other Buyer",
      supplier: "Gamma",
      awardDate: "2023-01-01",
    }),
    award({
      id: "z2",
      supplier: "Gamma",
      awardDate: "2024-03-01",
      predecessorId: "z1",
    }),
    // Two non-identical records both claim id "w1": the link is ambiguous.
    award({
      id: "w1",
      buyer: "Other Buyer X",
      supplier: "Delta",
      awardDate: "2023-01-01",
      sourceId: "sA",
    }),
    award({
      id: "w1",
      buyer: "Other Buyer Y",
      supplier: "Delta",
      awardDate: "2023-02-01",
      sourceId: "sB",
    }),
    award({
      id: "w2",
      supplier: "Delta",
      awardDate: "2024-04-01",
      predecessorId: "w1",
    }),
  ];

  const metrics = buildAwardMetrics(awards, {
    buyer: "Buyer B",
    category: "Cat C",
    cutoff: "2025-01-01",
  });

  const byFollowOn = new Map(
    metrics.retention.observations.map((o) => [o.followOnId, o]),
  );

  assert.equal(byFollowOn.get("x1")?.state, "excluded");
  assert.match(byFollowOn.get("x1")!.reason, /own predecessor|self-referenc/i);

  assert.equal(byFollowOn.get("y2")?.state, "excluded");
  assert.match(byFollowOn.get("y2")!.reason, /future|not before/i);

  assert.equal(byFollowOn.get("z2")?.state, "excluded");
  assert.match(byFollowOn.get("z2")!.reason, /different buyer or category/i);

  assert.equal(byFollowOn.get("w2")?.state, "excluded");
  assert.match(byFollowOn.get("w2")!.reason, /uniquely identified|ambiguous/i);

  assert.equal(metrics.retention.retained, 0);
  assert.equal(metrics.retention.known, 0);
  assert.equal(metrics.retention.unknown, 0);
  assert.equal(metrics.retention.excluded, 4);
});

test("A21 retention: different scopes are excluded, unknown outcomes are unknown, and linked observations are preserved despite the pending rate policy", () => {
  const awards: Award[] = [
    // Different scope on the predecessor: excluded, not silently retained/lost.
    award({
      id: "p1",
      scope: "Scope A",
      supplier: "Acme",
      awardDate: "2024-01-01",
    }),
    award({
      id: "p2",
      scope: "Scope B",
      supplier: "Acme",
      awardDate: "2024-05-01",
      predecessorId: "p1",
    }),
    // Unknown outcome on the follow-on prevents a determination.
    award({
      id: "q1",
      scope: "Scope A",
      supplier: "Acme",
      awardDate: "2024-01-01",
    }),
    award({
      id: "q2",
      scope: "Scope A",
      supplier: "Acme",
      outcome: "unknown",
      awardDate: "2024-05-01",
      predecessorId: "q1",
    }),
  ];

  const metrics = buildAwardMetrics(awards, {
    buyer: "Buyer B",
    category: "Cat C",
    cutoff: "2025-01-01",
  });

  // Rate/policy remain honestly unresolved...
  assert.equal(metrics.retention.rate, null);
  assert.equal(metrics.retention.policy, "pending");

  // ...but the individual linked observations are not dropped because of that.
  assert.equal(metrics.retention.observations.length, 2);

  const byFollowOn = new Map(
    metrics.retention.observations.map((o) => [o.followOnId, o]),
  );

  assert.equal(byFollowOn.get("p2")?.state, "excluded");
  assert.match(byFollowOn.get("p2")!.reason, /scope/i);

  assert.equal(byFollowOn.get("q2")?.state, "unknown");
  assert.match(byFollowOn.get("q2")!.reason, /unknown outcome/i);

  assert.equal(metrics.retention.known, 0);
  assert.equal(metrics.retention.unknown, 1);
  assert.equal(metrics.retention.excluded, 1);
});

test("A22 resolveIncumbent: stale evidence with no end date, and conflicting candidate names, do not yield a false current status", () => {
  // Old product-use evidence with no end date and no explicit current
  // assertion must not silently become "the current entity".
  const staleOnly: IncumbentObservation[] = [
    {
      entityName: "Acme Corp",
      productName: "LegacyWidget",
      scope: "Scope A",
      effectiveFrom: "2015-01-01",
      effectiveTo: null,
      tier: 3,
      sourceId: "s1",
      explicitCurrent: false,
    },
  ];
  const staleResult = resolveIncumbent({
    cutoff: "2024-01-01",
    scope: "Scope A",
    clientName: null,
    observations: staleOnly,
  });
  assert.equal(staleResult.status, "unknown");
  assert.equal(staleResult.entityName, null);

  // Two tier 3/4 sources naming different suppliers for the same scope must
  // resolve to "unknown", not an arbitrarily chosen candidate.
  const conflicting: IncumbentObservation[] = [
    {
      entityName: "Acme Corp",
      productName: null,
      scope: "Scope A",
      effectiveFrom: "2023-01-01",
      effectiveTo: "2025-01-01",
      tier: 3,
      sourceId: "s1",
      explicitCurrent: false,
    },
    {
      entityName: "Beta Inc",
      productName: null,
      scope: "Scope A",
      effectiveFrom: "2023-01-01",
      effectiveTo: "2025-01-01",
      tier: 4,
      sourceId: "s2",
      explicitCurrent: false,
    },
  ];
  const conflictResult = resolveIncumbent({
    cutoff: "2024-01-01",
    scope: "Scope A",
    clientName: null,
    observations: conflicting,
  });
  assert.equal(conflictResult.status, "unknown");
  assert.equal(conflictResult.entityName, null);
  assert.ok(conflictResult.reviewReasons.some((r) => /conflicting/i.test(r)));
  assert.deepEqual([...conflictResult.evidenceSourceIds].sort(), ["s1", "s2"]);

  // Contrast: an explicit current assertion is still sufficient to confirm,
  // even with no end date, once it's actually stated.
  const explicitCurrentNoEnd: IncumbentObservation[] = [
    {
      entityName: "Acme Corp",
      productName: null,
      scope: "Scope A",
      effectiveFrom: "2020-01-01",
      effectiveTo: null,
      tier: 1,
      sourceId: "s1",
      explicitCurrent: true,
    },
  ];
  const confirmedResult = resolveIncumbent({
    cutoff: "2024-01-01",
    scope: "Scope A",
    clientName: null,
    observations: explicitCurrentNoEnd,
  });
  assert.equal(confirmedResult.status, "confirmed");
  assert.equal(confirmedResult.entityName, "Acme Corp");
});

test("A23 resolveIncumbent: explicit same-scope interval bounding the cutoff confirms incumbency and flags the client match for review", () => {
  const observations: IncumbentObservation[] = [
    {
      entityName: "Acme Corp",
      productName: null,
      scope: "Scope A",
      effectiveFrom: "2023-01-01",
      effectiveTo: "2025-01-01",
      tier: 2,
      sourceId: "s1",
      explicitCurrent: true,
    },
    // Different scope: must be excluded from consideration entirely, even
    // though it names a conflicting supplier.
    {
      entityName: "Beta Inc",
      productName: null,
      scope: "Scope B",
      effectiveFrom: "2023-01-01",
      effectiveTo: "2025-01-01",
      tier: 1,
      sourceId: "s2",
      explicitCurrent: true,
    },
  ];

  const result = resolveIncumbent({
    cutoff: "2024-06-01",
    scope: "Scope A",
    clientName: "Acme Corp",
    observations,
  });

  assert.equal(result.status, "confirmed");
  assert.equal(result.entityName, "Acme Corp");
  assert.equal(result.clientRelationship, "incumbent");
  assert.equal(result.posture, "defend");
  assert.deepEqual(result.evidenceSourceIds, ["s1"]);
  assert.ok(
    result.reviewReasons.some((r) =>
      /exact normalized name comparison/i.test(r),
    ),
  );
});
