import test from "node:test";
import assert from "node:assert/strict";
import { AssessmentSchema, type Assessment } from "../../shared/contracts.ts";
import { validateAssessment, composeReport } from "../../server/report.ts";
import { z } from "zod";
const unit = {
  id: "11111111-1111-4111-8111-111111111111",
  sourceId: "22222222-2222-4222-8222-222222222222",
  ordinal: 1,
  location: "Section 1",
  text: "The buyer invites proposals for assessment services.",
};
const fixture = (): Assessment => ({
  schemaVersion: "1",
  evidence: [{ id: "e1", unitId: unit.id, kind: "quote", excerpt: unit.text }],
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
});
const checks = (a: Assessment) =>
  a.claims.map((c) => ({
    claimId: c.id,
    support: "supported" as const,
    factualIntegrity: "no_unsupported_fact_identified" as const,
    rationale: "Fixed test result, not a model evaluation",
  }));
test("A17 summary cannot introduce unaccepted prose", () => {
  const a = fixture();
  a.summary.what = "An invented fact";
  assert.throws(() => validateAssessment(a, [unit]), /unknown claim/);
});
test("A6 quote match does not establish claim support", () => {
  const a = fixture();
  a.claims[0].text = "The buyer requires a certified supplier.";
  validateAssessment(a, [unit]);
  const s = checks(a).map((c) =>
    c.claimId === "c1"
      ? {
          ...c,
          support: "unsupported" as const,
          rationale: "The quote does not mention certification",
        }
      : c,
  );
  assert.throws(
    () => composeReport(a, s, [unit], null, "fixture"),
    /failed support/,
  );
});
test("A24 one canonical next action and no competing verdict", () => {
  const a = fixture();
  a.summary.nextAction = "c1";
  assert.throws(() => validateAssessment(a, [unit]), /canonical verdict/);
});
test("A25 five sentence summary, exactly three scenarios", () => {
  const a = fixture();
  assert.equal(
    composeReport(
      validateAssessment(a, [unit]),
      checks(a),
      [unit],
      null,
      "fixture",
    ).summarySentences.length,
    5,
  );
  a.claims[0].text += " A new sentence.";
  assert.throws(
    () => composeReport(a, checks(a), [unit], null, "fixture"),
    /five sentences/,
  );
});
test("A26 undeclared probability and confidence arithmetic rejected at boundary", () => {
  const a = fixture();
  assert.equal(
    AssessmentSchema.safeParse({ ...a, confidence: 0.8 }).success,
    false,
  );
  assert.equal(
    AssessmentSchema.safeParse({
      ...a,
      verdict: { ...a.verdict, probability: 80 },
    }).success,
    false,
  );
  assert.equal(
    z.toJSONSchema(AssessmentSchema, { target: "draft-7" }).$schema,
    "http://json-schema.org/draft-07/schema#",
  );
});
test("A27 missing client evidence cannot become mandatory-failure NO-GO", () => {
  const a = fixture();
  a.verdict.recommendation = "NO-GO";
  a.verdict.disqualifier = "mandatory_failure";
  a.verdict.disqualifierEvidenceIds = ["e1"];
  assert.throws(() => validateAssessment(a, [unit]), /client evidence/);
});
test("A32 assessed label cannot make a fact sourced", () => {
  const a = fixture();
  a.claims[0].provenance = "assessed";
  assert.throws(() => validateAssessment(a, [unit]), /Assessment labels/);
});

test("NO-GO cannot be based only on background context", () => {
  const a = fixture();
  a.verdict.recommendation = "NO-GO";
  a.verdict.disqualifier = "closed";
  a.verdict.disqualifierEvidenceIds = ["e1"];
  assert.throws(
    () =>
      validateAssessment(
        a,
        [unit],
        [{ id: unit.sourceId, purpose: "context" }],
      ),
    /primary tender/,
  );
  validateAssessment(a, [unit], [{ id: unit.sourceId, purpose: "notice" }]);
});
test("Strategic advice needs an inspectable premise", () => {
  const a = fixture();
  a.claims[1].evidenceIds = [];
  a.claims[1].premiseIds = [];
  assert.throws(() => validateAssessment(a, [unit]), /explicit premise/);
});

test("Circular reasoning cannot stand in for evidence", () => {
  const a = fixture();
  a.claims[1].premiseIds = ["c3"];
  a.claims[2].premiseIds = ["c2"];
  assert.throws(() => validateAssessment(a, [unit]), /Circular claim/);
});

test("A32 an inference label cannot smuggle an unsupported completion fact", () => {
  const a = fixture();
  a.claims[1].text = "The contract is fully performed.";
  const checked = checks(a).map((c) =>
    c.claimId === "c2"
      ? {
          ...c,
          support: "partly_supported" as const,
          factualIntegrity: "unsupported_fact_present" as const,
          rationale: "Scheduled end is not actual delivery completion",
        }
      : c,
  );
  assert.throws(
    () => composeReport(a, checked, [unit], null, "fixture"),
    /unsupported factual assertion/,
  );
});
