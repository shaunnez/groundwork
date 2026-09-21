import test from "node:test";
import assert from "node:assert/strict";
import {
  initialDemo,
  completeFixture,
  eligible,
  blockers,
  recordDecision,
  acceptRequest,
  advanceRequest,
  resolveAnalyticalReview,
} from "../src/model.ts";

test("promising fit cannot bypass independent eligibility, coverage and capability gaps", () => {
  const d = initialDemo();
  assert.equal(eligible(d), false);
  assert.equal(blockers(d).length, 3);
  assert.throws(
    () => recordDecision(d, "Pursue", "Commercially attractive", true),
    /Mandatory/,
  );
});
test("an empty or incomplete requirements inventory does not establish eligibility", () => {
  const d = completeFixture(initialDemo());
  assert.equal(eligible({ ...d, reviews: {} }), false);
  const { insurance, ...reviews } = d.reviews;
  assert.equal(eligible({ ...d, reviews }), false);
});
test("reviewed conditions do not erase missing coverage or capability work", () => {
  const d = completeFixture(initialDemo());
  assert.equal(eligible({ ...d, coverageComplete: false }), false);
  assert.equal(eligible({ ...d, capabilityReviewed: false }), false);
});
test("changed inputs require renewed review", () => {
  const d = { ...completeFixture(initialDemo()), changed: true };
  assert.throws(
    () => recordDecision(d, "Pursue", "Previous review", true),
    /changed/,
  );
});
test("a firm may record Hold while gaps remain; rationale is required", () => {
  assert.throws(() => recordDecision(initialDemo(), "Hold", "  "), /reason/);
  const d = recordDecision(initialDemo(), "Hold", "  Await certification.  ");
  assert.equal(d.decisions[0].reason, "Await certification.");
  assert.equal(eligible(d), false);
});
test("a reviewed fixture supports a deliberate decision with a preserved snapshot", () => {
  const d = recordDecision(
    completeFixture(initialDemo()),
    "Pursue",
    "Evidence reviewed.",
  );
  assert.equal(d.decisions.length, 1);
  assert.equal(d.decisions[0].snapshot?.noticeRevision, 3);
  const changed = { ...d, changed: true };
  assert.equal(changed.decisions[0].snapshot?.noticeClose, "24 Sep 2026");
});
test("repeated active request submission reuses the accepted request", () => {
  const d = acceptRequest(initialDemo(), "Notice-only assessment");
  assert.equal(acceptRequest(d, "Document assessment"), d);
  assert.equal(d.request?.id, 1);
});
test("notice-only publication can finish while eligibility remains unresolved", () => {
  let d = acceptRequest(initialDemo(), "Notice-only assessment");
  for (let i = 0; i < 4; i++) d = advanceRequest(d);
  assert.equal(d.request?.stage, "ready");
  assert.equal(d.reportVersion, 2);
  assert.equal(eligible(d), false);
  assert.equal(advanceRequest(d), d);
});
test("required document extraction failure blocks later stages and retains the previous report", () => {
  let d = acceptRequest(initialDemo(), "Document assessment");
  d = advanceRequest(advanceRequest(d));
  assert.equal(d.request?.stage, "failed");
  assert.equal(d.request?.published, false);
  assert.equal(d.reportVersion, 1);
  assert.equal(advanceRequest(d), d);
});
test("covered documents can publish only once", () => {
  let d = acceptRequest(completeFixture(initialDemo()), "Document assessment");
  for (let i = 0; i < 3; i++) d = advanceRequest(d);
  assert.equal(d.request?.stage, "review");
  d = resolveAnalyticalReview(
    d,
    "RFP pages 4 and 6 separate the advisory scope.",
  );
  for (let i = 0; i < 8; i++) d = advanceRequest(d);
  assert.equal(d.reportVersion, 2);
  assert.equal(d.request?.published, true);
  assert.equal(d.reportHistory[1].kind, "Document assessment");
  assert.equal(d.reportHistory[1].coverageComplete, true);
  assert.equal(d.reportHistory[0].kind, "Notice-only assessment");
});

test("competitor completion does not replace pursuit report versions", () => {
  let d = acceptRequest(
    initialDemo(),
    "Competitor profile",
    "0",
    "HRC-2026-041",
  );
  for (let i = 0; i < 4; i++) d = advanceRequest(d);
  assert.equal(d.request?.stage, "ready");
  assert.equal(d.competitorReportReady, true);
  assert.equal(d.reportVersion, 1);
  assert.equal(d.reportHistory.length, 1);
});
test("late input changes prevent accepting output against the wrong manifest", () => {
  let d = acceptRequest(initialDemo(), "Notice-only assessment");
  d = { ...d, changed: true };
  for (let i = 0; i < 4; i++) d = advanceRequest(d);
  assert.equal(d.request?.stage, "failed");
  assert.equal(d.reportVersion, 1);
});
test("cancelled work cannot advance or replace accepted reports", () => {
  const d = acceptRequest(initialDemo(), "Notice-only assessment");
  const cancelled = {
    ...d,
    request: { ...d.request!, stage: "cancelled" as const },
  };
  assert.equal(advanceRequest(cancelled), cancelled);
  assert.equal(acceptRequest(cancelled, "Document assessment").request?.id, 2);
});

test("a firm decision can acknowledge gaps without changing analytical eligibility", () => {
  const d = recordDecision(
    initialDemo(),
    "Pursue",
    "Will resolve conditions before submission.",
  );
  assert.equal(d.decisions[0].outcome, "Pursue");
  assert.equal(eligible(d), false);
});
test("RFP reassessment waits for attributed review and preserves the public version", () => {
  const before = initialDemo().reportHistory[0];
  let d = acceptRequest(
    { ...initialDemo(), coverageComplete: true },
    "Document assessment",
  );
  for (let i = 0; i < 8; i++) d = advanceRequest(d);
  assert.equal(d.request?.stage, "review");
  assert.equal(d.request?.published, false);
  assert.equal(d.reportVersion, 1);
  assert.throws(() => resolveAnalyticalReview(d, "  "), /Record why/);
  d = advanceRequest(
    resolveAnalyticalReview(d, "The RFP defines a separate advisory scope."),
  );
  assert.equal(d.request?.published, true);
  assert.equal(d.reportHistory[1].kind, "Document assessment");
  assert.deepEqual(d.reportHistory[0], before);
  assert.equal(eligible(d), false);
});
test("a source change after analyst review still blocks stale publication", () => {
  let d = acceptRequest(
    { ...initialDemo(), coverageComplete: true },
    "Document assessment",
  );
  for (let i = 0; i < 3; i++) d = advanceRequest(d);
  d = resolveAnalyticalReview(d, "RFP scope checked.");
  d = advanceRequest({ ...d, changed: true });
  assert.equal(d.request?.stage, "failed");
  assert.equal(d.reportVersion, 1);
});
test("competitor requests require listing context and keep firm-specific results", () => {
  assert.throws(
    () => acceptRequest(initialDemo(), "Competitor profile"),
    /listing/,
  );
  assert.throws(
    () =>
      acceptRequest(initialDemo(), "Competitor profile", "99", "HRC-2026-041"),
    /listing/,
  );
  let d = acceptRequest(
    initialDemo(),
    "Competitor profile",
    "2",
    "HRC-2026-041",
  );
  for (let i = 0; i < 4; i++) d = advanceRequest(d);
  assert.deepEqual(d.competitorReports, [
    { targetId: "2", listingId: "HRC-2026-041" },
  ]);
  assert.equal(d.reportVersion, 1);
});

test("requesting more evidence retains the review hold and its attributed rationale", () => {
  let d = acceptRequest(
    { ...initialDemo(), coverageComplete: true },
    "Document assessment",
  );
  for (let i = 0; i < 3; i++) d = advanceRequest(d);
  d = resolveAnalyticalReview(
    d,
    "Need the current agency scope schedule.",
    "research",
  );
  assert.equal(d.request?.stage, "review");
  assert.equal(advanceRequest(d), d);
  assert.equal(d.analystReviews[0].action, "research");
  assert.equal(
    d.analystReviews[0].reason,
    "Need the current agency scope schedule.",
  );
  assert.equal(d.reportVersion, 1);
});

import { pursuitDetail, watchAssessment } from "../src/intelligence-data.ts";

test("public-data detail does not acquire evaluation weights from the RFP", () => {
  const publicDetail = pursuitDetail(false);
  assert.deepEqual(publicDetail.criteria, []);
  assert.match(publicDetail.risks[0].detail, /does not resolve/);
  const rfpDetail = pursuitDetail(true);
  assert.equal(
    rfpDetail.criteria.reduce((total, row) => total + parseInt(row.weight), 0),
    100,
  );
  assert.match(rfpDetail.risks[0].detail, /retracted/);
  assert.deepEqual(pursuitDetail(false), publicDetail);
});

test("watchlist assessment changes only with a published RFP version", () => {
  let d = acceptRequest(
    { ...initialDemo(), coverageComplete: true },
    "Document assessment",
  );
  const assessment = () =>
    watchAssessment(
      "Digital service transformation",
      d.reportHistory.at(-1)?.kind === "Document assessment",
    );
  const original = assessment();
  assert.match(original.basis, /Public-data/);
  for (let i = 0; i < 3; i++) d = advanceRequest(d);
  assert.deepEqual(assessment(), original);
  d = resolveAnalyticalReview(
    d,
    "Confirm adjacent platform support is outside this advisory package.",
  );
  for (let i = 0; i < 3; i++) d = advanceRequest(d);
  assert.match(assessment().basis, /RFP/);
  assert.match(
    assessment().summary.join(" "),
    /platform implementation is excluded/,
  );
  assert.match(
    assessment().summary.join(" "),
    /eligibility and capacity still need review/,
  );
});

test("pending, planned and unassessed notices retain their uncertainty", () => {
  assert.match(
    watchAssessment("Data governance advisory", true).summary.join(" "),
    /no completed assessment/,
  );
  assert.match(
    watchAssessment("Service design panel").summary.join(" "),
    /not an open tender/,
  );
  assert.equal(watchAssessment("Unknown opportunity").basis, "Not assessed");
});

import { pursuitPackage } from "../src/pursuit-package.ts";

test("RFP analysis retracts the bundled-delivery hypothesis without altering the public snapshot", () => {
  const publicPackage = pursuitPackage(false);
  const publicSnapshot = structuredClone(publicPackage);
  const revised = pursuitPackage(true);
  assert.match(
    publicPackage.hypotheses.find((h) => h.id === "H3")!.judgement,
    /Unresolved/,
  );
  assert.match(
    revised.hypotheses.find((h) => h.id === "H3")!.judgement,
    /Retracted/,
  );
  assert.match(
    revised.hypotheses.find((h) => h.id === "H3")!.against,
    /excludes platform implementation/,
  );
  assert.doesNotMatch(JSON.stringify(publicPackage), /\d+%/);
  assert.match(revised.summary, /70%/);
  assert.deepEqual(pursuitPackage(false), publicSnapshot);
});

test("closing the bundled-scope risk preserves unresolved eligibility and commercial risks", () => {
  const publicRisks = pursuitDetail(false).risks;
  const revisedRisks = pursuitDetail(true).risks;
  assert.equal(publicRisks.find((r) => r.id === "R1")!.status, "Open");
  assert.equal(
    revisedRisks.find((r) => r.id === "R1")!.status,
    "Bundling risk retracted",
  );
  for (const id of ["R2", "R3"]) {
    const risk = revisedRisks.find((r) => r.id === id)!;
    assert.equal(risk.likelihood, "Unknown");
    assert.equal(risk.impact, "High");
    assert.notEqual(risk.status, "Bundling risk retracted");
  }
});
