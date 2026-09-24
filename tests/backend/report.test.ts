import test from "node:test";
import assert from "node:assert/strict";
import { AssessmentSchema, type Assessment } from "../../shared/contracts.ts";
import {
  validateAssessment,
  validateCommercialPricing,
  composeReport,
  assessmentCorrectionPrompt,
  alignAssessmentEvidence,
  reviseChangedClaimIds,
  supportPrompt,
  removeModelProcessingLimitations,
} from "../../server/report.ts";
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
    {
      id: "c4",
      key: "outcome",
      text: "The buyer could award the work after evaluation.",
      kind: "inference",
      provenance: "assessed",
      evidenceIds: ["e1"],
      premiseIds: ["c1"],
      assumptions: ["A compliant bidder responds"],
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
    outcomeClaimId: "c4",
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
test("correction prompt carries cited evidence and verifier issues without the full pack", () => {
  const assessment = fixture();
  const pricingUnit = {
    ...unit,
    id: "33333333-3333-4333-8333-333333333333",
    text: "Dayworks rates must be entered in the pricing schedule.",
  };
  const timingUnit = {
    ...unit,
    id: "44444444-4444-4444-8444-444444444444",
    text: "Close Date: 6 October 2026 at 4:00 PM.",
  };
  const prompt = assessmentCorrectionPrompt(
    {
      opportunity: { title: "Synthetic test" },
      units: [
        unit,
        pricingUnit,
        timingUnit,
        { ...unit, id: "another-unit", text: "x".repeat(40_000) },
      ],
      analysisSelection: { selected: 2, omitted: 1 },
      commercialPricingLeads: [
        {
          unitId: pricingUnit.id,
          sourceName: "Prices.xlsx",
          quote: pricingUnit.text,
        },
      ],
      tenderTimingLeads: [{ unitId: timingUnit.id, quote: timingUnit.text }],
    },
    assessment,
    { checks: checks(assessment), sectionIssues: ["Correct the risk wording"] },
    "The risk section overstates the source",
    1,
  );
  assert.ok(Buffer.byteLength(prompt, "utf8") < 48_000);
  assert.ok(prompt.includes(unit.text));
  assert.ok(prompt.includes(pricingUnit.text));
  assert.ok(prompt.includes(timingUnit.text));
  assert.ok(prompt.includes("Correct the risk wording"));
  assert.ok(!prompt.includes("x".repeat(100)));
  const finalPrompt = assessmentCorrectionPrompt(
    {
      units: [unit],
      sourceInventory: [{ name: "Synthetic RFT", state: "read" }],
      excludedSources: [],
    },
    assessment,
    {
      checks: checks(assessment),
      sectionIssues: ["Scenario outcome mismatch"],
    },
    "Scenario cites the wrong outcome claim",
    3,
  );
  assert.match(
    finalPrompt,
    /outcomeClaimId must point to a claim actually describing that outcome/,
  );
  assert.match(
    finalPrompt,
    /"sourceInventory":\[\{"name":"Synthetic RFT","state":"read"\}\]/,
  );
});
test("selected workbook leads require a substantive cited pricing claim", () => {
  const a = fixture();
  const leads = [{ unitId: unit.id }];
  assert.throws(
    () => validateCommercialPricing(a, leads),
    /substantive workbook-cited commercial claim/,
  );
  a.claims[0].text = "The pricing schedule requires dayworks rates.";
  validateCommercialPricing(a, leads);
  a.claims[0].text = "The pricing reader coverage is partial.";
  assert.throws(
    () => validateCommercialPricing(a, leads),
    /substantive workbook-cited commercial claim/,
  );
  a.claims[0].text = "The pricing schedule requires dayworks rates.";
  a.evidence[0].kind = "value";
  validateCommercialPricing(a, leads);
  a.evidence[0].kind = "description";
  assert.throws(
    () => validateCommercialPricing(a, leads),
    /substantive workbook-cited commercial claim/,
  );
});
test("assessment quote alignment uses only a verified excerpt from the same unit", () => {
  const assessment = fixture();
  assessment.evidence[0].excerpt =
    "The buyer is inviting proposals for assessment services.";
  const aligned = alignAssessmentEvidence(
    assessment,
    [unit],
    [
      { unitId: unit.id, quote: unit.text },
      { unitId: "another-unit", quote: "Different document wording" },
    ],
  );
  assert.deepEqual(aligned.alignedEvidenceIds, ["e1"]);
  assert.equal(aligned.assessment.evidence[0].excerpt, unit.text);
  validateAssessment(aligned.assessment, [unit]);
  assert.equal(
    assessment.evidence[0].excerpt,
    "The buyer is inviting proposals for assessment services.",
  );
  const unavailable = alignAssessmentEvidence(
    assessment,
    [unit],
    [{ unitId: "another-unit", quote: "Different document wording" }],
  );
  assert.deepEqual(unavailable.alignedEvidenceIds, []);
  assert.equal(
    unavailable.assessment.evidence[0].excerpt,
    assessment.evidence[0].excerpt,
  );
  assessment.evidence[0].excerpt = "Unrelated contract price and delivery date";
  const unrelated = alignAssessmentEvidence(
    assessment,
    [unit],
    [{ unitId: unit.id, quote: unit.text }],
  );
  assert.deepEqual(unrelated.alignedEvidenceIds, []);
});
test("changed claim revisions update every claim reference before support review", () => {
  const previous = fixture();
  const changed = fixture();
  changed.claims[0].text = "The buyer requests assessment services.";
  changed.claims[2].duplicateOf = "c1";
  changed.summary.decidingFactor = "c1";
  changed.summary.biggestGap = "c1";
  changed.centreOfGravity.factorClaimId = "c1";
  changed.centreOfGravity.implicationClaimId = "c1";
  changed.risks[0].claimId = "c1";
  const result = reviseChangedClaimIds(previous, changed, 2);
  assert.deepEqual(result.revisedClaimIds, ["c1-r2"]);
  const revised = validateAssessment(result.assessment, [unit]);
  assert.deepEqual(
    revised.claims.map((claim) => claim.id),
    ["c1-r2", "c2", "c3", "c4"],
  );
  assert.deepEqual(revised.claims[1].premiseIds, ["c1-r2"]);
  assert.equal(revised.claims[2].duplicateOf, "c1-r2");
  assert.deepEqual(revised.verdict.rationaleClaimIds, ["c1-r2"]);
  assert.equal(revised.summary.what, "c1-r2");
  assert.equal(revised.summary.decidingFactor, "c1-r2");
  assert.equal(revised.summary.biggestGap, "c1-r2");
  assert.equal(revised.centreOfGravity.factorClaimId, "c1-r2");
  assert.equal(revised.centreOfGravity.implicationClaimId, "c1-r2");
  assert.equal(revised.risks[0].claimId, "c1-r2");
  assert.equal(previous.claims[0].id, "c1");
  assert.equal(changed.claims[0].id, "c1");
  const next = fixture();
  next.claims[0].id = "c1-r2";
  next.claims[0].text = "The buyer also requests assessment services.";
  next.claims[1].premiseIds = ["c1-r2"];
  const third = reviseChangedClaimIds(revised, next, 3);
  assert.deepEqual(third.revisedClaimIds, ["c1-r3"]);
  assert.equal(third.assessment.claims[0].id, "c1-r3");
  next.claims[0].id = "c1-r3";
  next.claims[0].text = "The buyer additionally requests assessment services.";
  const fourth = reviseChangedClaimIds(third.assessment, next, 4);
  assert.deepEqual(fourth.revisedClaimIds, ["c1-r4"]);
  const scenarioChanged = fixture();
  scenarioChanged.claims[3].text = "The buyer could instead decline to award.";
  const scenarioRevision = reviseChangedClaimIds(fixture(), scenarioChanged, 2);
  assert.equal(
    scenarioRevision.assessment.scenarios[0].outcomeClaimId,
    "c4-r2",
  );
});
test("support review receives trusted run metadata separately from tender units", () => {
  const prompt = supportPrompt(fixture(), [unit], {
    analysisSelection: { selected: 3, omitted: 7 },
    sourceReaders: [{ name: "Draft", state: "partial" }],
  });
  assert.match(
    prompt,
    /operational facts do not require tender-unit citations/,
  );
  assert.match(prompt, /"selected":3,"omitted":7/);
  assert.match(prompt, /"name":"Draft","state":"partial"/);
  assert.match(prompt, /Tender facts still require their cited source units/);
  assert.match(prompt, /linked evidence excerpt, not only in another excerpt/);
  assert.match(
    prompt,
    /compare its name and indicators with the linked outcomeClaimId text/,
  );
  assert.match(
    prompt,
    /centre-of-gravity factor, implication and action claim texts as a causal chain/,
  );
  assert.match(
    prompt,
    /pre-award amendment can coexist with eventual award or no award/,
  );
  assert.match(prompt, /Check each risk mitigation against its linked risk/);
  assert.match(prompt, /Do not put successful checks, praise/);
});
test("scenario outcomes must be inference claims and model processing limits are replaced", () => {
  const a = fixture();
  a.scenarios[0].outcomeClaimId = "c3";
  assert.throws(
    () => validateAssessment(a, [unit]),
    /needs an inference claim/,
  );
  a.scenarios[0].outcomeClaimId = "c4";
  a.limitations.push(
    "Unsafe legacy DOCX extraction is outside this reader scope.",
    "XLSX Schedule of Prices cells were read at sheet level only; no cell-level pricing values were extracted.",
    "This assessment covers only 36 of 1447 selected source-linked findings.",
    "Findings are drawn from a bounded selection of 33 verified extraction leads out of 1,483 total enumerated units (1,450 omitted).",
    "Requirements extraction covered 1,076 of a larger candidate set.",
  );
  const cleaned = removeModelProcessingLimitations(a);
  assert.equal(cleaned.removed, 5);
  assert.equal(cleaned.assessment.limitations.length, 1);
  assert.equal(a.limitations.length, 6);
  validateAssessment(cleaned.assessment, [unit]);
});
test("factual dates must be present in the linked quote", () => {
  const datedUnit = {
    ...unit,
    text: `${unit.text} Work starts 4 January 2026.`,
  };
  const a = fixture();
  a.claims[0].text = "Work starts 4 January 2026.";
  assert.throws(
    () => validateAssessment(a, [datedUnit]),
    /date absent from its cited exact source excerpt/,
  );
  a.evidence[0].excerpt = "Work starts 4 January 2026.";
  validateAssessment(a, [datedUnit]);
  a.evidence[0].kind = "value";
  validateAssessment(a, [datedUnit]);
  a.evidence[0].excerpt = "Work starts 5 January 2026.";
  assert.throws(
    () => validateAssessment(a, [datedUnit]),
    /date absent from its cited exact source excerpt/,
  );
});
test("a risk cannot reuse its own finding as the mitigation", () => {
  const a = fixture();
  a.risks[0].mitigationClaimId = a.risks[0].claimId;
  assert.throws(
    () => validateAssessment(a, [unit]),
    /cannot use its own claim as mitigation/,
  );
});
test("a cutoff snapshot cannot compete with later award outcomes", () => {
  const a = fixture();
  a.claims[3].text = "A contract could be awarded after the tender close.";
  a.claims.push({
    ...a.claims[3],
    id: "c5",
    key: "pending",
    text: "No award decision is visible at the assessment cutoff.",
  });
  a.scenarios[0].outcomeClaimId = "c5";
  assert.throws(
    () => validateAssessment(a, [unit]),
    /Pending at the assessment snapshot cannot be an alternative/,
  );
  a.claims[4].text =
    "The tender remains pending with no decision at time of reassessment.";
  assert.throws(
    () => validateAssessment(a, [unit]),
    /Pending at the assessment snapshot cannot be an alternative/,
  );
});
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
