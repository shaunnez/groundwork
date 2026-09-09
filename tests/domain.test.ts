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
} from "../src/model.ts";

test("promising fit cannot bypass independent eligibility, coverage and capability gaps", () => {
  const d = initialDemo();
  assert.equal(eligible(d), false);
  assert.equal(blockers(d).length, 3);
  assert.throws(
    () => recordDecision(d, "Pursue", "Commercially attractive"),
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
    () => recordDecision(d, "Pursue", "Previous review"),
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
  for (let i = 0; i < 8; i++) d = advanceRequest(d);
  assert.equal(d.reportVersion, 2);
  assert.equal(d.request?.published, true);
  assert.equal(d.reportHistory[1].kind, "Document assessment");
  assert.equal(d.reportHistory[1].coverageComplete, true);
  assert.equal(d.reportHistory[0].kind, "Notice-only assessment");
});

test("competitor completion does not replace pursuit report versions", () => {
  let d = acceptRequest(initialDemo(), "Competitor profile");
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
