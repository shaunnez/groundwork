import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCoverage,
  completeCoverage,
  quoteState,
  searchUnits,
  calendarDaysBetween,
  compareFindings,
  enumerateCandidates,
} from "../../server/domain/evidence.ts";
const coverage = {
  total: 2,
  read: 1,
  unread: 1,
  unit: "page" as const,
  failures: ["Page 2 needs OCR"],
};
const units = [
  {
    id: "u",
    sourceId: "s",
    ordinal: 1,
    text: "Every supplier must submit Form X.",
    location: "Page 1",
  },
];
test("A3 incomplete coverage cannot disappear", () => {
  assertCoverage(coverage);
  assert.equal(completeCoverage(coverage), false);
  assert.throws(() => assertCoverage({ ...coverage, unread: 0 }));
  assert.equal(completeCoverage({ ...coverage, total: null }), false);
});
test("A4 absence records the actual visited scope", () => {
  assert.equal(searchUnits(units, "absent", coverage).state, "not_searched");
  assert.equal(
    searchUnits(units, "absent", {
      ...coverage,
      total: 1,
      unread: 0,
      failures: [],
    }).state,
    "not_found",
  );
  assert.equal(searchUnits(units, "must", coverage).state, "found");
  assert.equal(
    searchUnits([], "absent", {
      ...coverage,
      total: 1,
      unread: 0,
      failures: [],
    }).state,
    "not_searched",
  );
});
test("A5 exact quote and spacing only", () => {
  assert.equal(quoteState("£20.00", "Cost £20.00."), "VERBATIM");
  assert.equal(quoteState("a b", "a\n b"), "VERBATIM_MODULO_SPACING");
  assert.equal(quoteState("20,00", "20.00"), "NOT_FOUND");
  assert.equal(quoteState("", "text"), "NOT_FOUND");
  assert.equal(quoteState("a...b", "a...b"), "VERBATIM");
});
test("A18 calendar arithmetic and invalid dates", () => {
  assert.equal(calendarDaysBetween("2026-06-19", "2026-06-26"), 7);
  assert.throws(() => calendarDaysBetween("2026-02-29", "2026-03-01"));
});
test("A11 duplicates retained; disappeared is not resolved", () => {
  const old = [
    { id: "a", key: "same", text: "one", evidenceIds: [] },
    { id: "b", key: "same", text: "two", evidenceIds: [] },
  ];
  const rows = compareFindings(old, [
    { id: "c", key: "same", text: "one", evidenceIds: [] },
  ]);
  assert.deepEqual(
    rows.map((r) => r.status),
    ["NEW", "ABSENT_FROM_THIS_RUN", "ABSENT_FROM_THIS_RUN"],
  );
});
test("A8 enumerate every nonempty unit, including distant clauses", () => {
  const corpus = Array.from({ length: 100 }, (_, i) => ({
    ...units[0],
    id: `u${i}`,
    ordinal: i,
  }));
  assert.equal(enumerateCandidates(corpus).length, 100);
});
