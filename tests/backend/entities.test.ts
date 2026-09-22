import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveEntityEvidence,
  validateEntityQuotes,
  type EntityObservation,
} from "../../server/entity-observations.ts";
const unit = {
  id: "11111111-1111-4111-8111-111111111111",
  sourceId: "s1",
  ordinal: 1,
  location: "Section 1",
  text: "Example Ltd is the current supplier of assessment services from 2026-01-01 to 2026-12-31.",
};
const observation: EntityObservation = {
  id: "o1",
  unitId: unit.id,
  entityName: "Example Ltd",
  productName: null,
  kind: "current_supplier",
  sameScope: true,
  scopeRationale: "Exact assessment services scope",
  effectiveFrom: "2026-01-01",
  effectiveTo: "2026-12-31",
  quote: unit.text,
};
const input = () => ({
  observations: [observation],
  checks: [
    {
      id: "o1",
      state: "supported" as const,
      reason: "Fixed fixture support; not model evidence",
    },
  ],
  units: [unit],
  sources: [{ id: "s1", purpose: "notice", published_at: "2026-01-01" }],
  cutoff: "2026-09-22",
  scope: "Assessment services",
  clientName: "Example Ltd",
  awardObservations: [],
});
test("A22 explicitly supported notice incumbent reaches shared defend posture and review reasons", () => {
  const r = resolveEntityEvidence(input());
  assert.equal(r.incumbent.status, "confirmed");
  assert.equal(r.incumbent.posture, "defend");
  assert.equal(r.incumbent.clientRelationship, "incumbent");
  assert.ok(r.incumbent.reviewReasons.length);
  assert.equal(r.entities[0].name, "Example Ltd");
});
test("A21 old product use and unverified source relations cannot become current incumbency", () => {
  const x = input();
  x.observations = [{ ...observation, kind: "product_use" }];
  assert.equal(resolveEntityEvidence(x).incumbent.status, "unknown");
  assert.equal(resolveEntityEvidence(x).entities.length, 0);
  const rejected = resolveEntityEvidence({
    ...input(),
    checks: [
      { id: "o1", state: "unsupported", reason: "Relation is not established" },
    ],
  });
  assert.equal(rejected.incumbent.status, "unknown");
  assert.equal(rejected.rejectedObservations.length, 1);
});
test("Undated current claims do not establish current status forever; exact quotes and support cardinality required", () => {
  const x = input();
  x.observations = [{ ...observation, effectiveFrom: null, effectiveTo: null }];
  assert.equal(resolveEntityEvidence(x).incumbent.status, "unknown");
  assert.throws(
    () =>
      validateEntityQuotes(
        [{ ...observation, quote: "Invented quote" }],
        [unit],
      ),
    /does not match/,
  );
  assert.throws(
    () => resolveEntityEvidence({ ...input(), checks: [] }),
    /reconcile/,
  );
});
