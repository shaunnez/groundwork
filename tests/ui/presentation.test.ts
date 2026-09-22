import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { AssessmentBody } from "../../src/workspace/Assessment.tsx";
import { SourceContent } from "../../src/workspace/SourceContent.tsx";
import type { SavedReport } from "../../src/workspace/data.ts";
import { assessmentFixture, payloadFixture } from "../backend/fixtures.ts";

function reportFixture(): SavedReport {
  return {
    id: "report-fixture",
    opportunity_id: "opportunity-fixture",
    kind: "pursuit",
    created_at: "2026-09-22T00:00:00Z",
    parent_report_id: null,
    payload: {
      ...payloadFixture(assessmentFixture()),
      sourceInventory: [],
      requirements: {
        status: "not_requested",
        candidatesProduced: 0,
        candidatesJudged: 0,
      },
    },
    review: null,
    freshness: {
      stale: false,
      reviewState: "pending",
      upstreamReviewState: "pending",
    },
    comparison: null,
    decisions: [],
    feedback: [],
    reviewHistory: [],
    outcomes: [],
  };
}

test("each saved finding renders once and repeated placements link to existing findings", () => {
  const report = reportFixture();
  const before = structuredClone(report);
  const $ = load(
    renderToStaticMarkup(
      createElement(AssessmentBody, { report, onEvidence: () => {} }),
    ),
  );
  for (const claim of report.payload.assessment.claims) {
    assert.equal(
      $(".connected-claim > p").filter((_, el) => $(el).text() === claim.text)
        .length,
      1,
    );
  }
  assert.ok($("a.finding-reference").length > 4);
  $("a.finding-reference").each((_, el) => {
    const target = $(el).attr("href")!.slice(1);
    assert.equal($(`[id="${target}"]`).length, 1);
  });
  assert.ok($(".citation").length > 0);
  assert.deepEqual(report, before);
});

test("separate findings marked duplicate retain their own identity and disclosure", () => {
  const report = reportFixture();
  const original = report.payload.assessment.claims[0];
  report.payload.assessment.claims.push({
    ...original,
    id: "duplicate-finding",
    duplicateOf: original.id,
  });
  const $ = load(
    renderToStaticMarkup(
      createElement(AssessmentBody, { report, onEvidence: () => {} }),
    ),
  );
  assert.equal(
    $(".connected-claim > p").filter((_, el) => $(el).text() === original.text)
      .length,
    2,
  );
  assert.match(
    $("#finding-report-fixture-duplicate-finding").text(),
    /duplicate retained/,
  );
});

test("structured source view preserves zero, false, null, keys and untrusted strings", () => {
  const text = JSON.stringify({
    amount: 0,
    active: false,
    missing: null,
    original_key: "<script>untrusted</script>",
    rows: [{ name: "Buyer" }],
  });
  const $ = load(
    renderToStaticMarkup(
      createElement(SourceContent, { text, mediaType: "application/json" }),
    ),
  );
  assert.equal($("script").length, 0);
  assert.deepEqual(
    $("dt")
      .map((_, el) => $(el).text())
      .get(),
    ["amount", "active", "missing", "original_key", "rows", "name"],
  );
  for (const value of [
    "0",
    "false",
    "null",
    "<script>untrusted</script>",
    "Buyer",
  ])
    assert.ok($("dd").text().includes(value));
  assert.match($("button").text(), /View exact source text/);
});

test("partial structured data and ordinary source text retain their exact characters", () => {
  for (const mediaType of ["application/json", "text/plain"]) {
    const text = '  {"partial":\n <script>source</script>\n';
    const $ = load(
      renderToStaticMarkup(createElement(SourceContent, { text, mediaType })),
    );
    assert.equal($(".connected-source-text").text(), text);
    assert.equal($("script").length, 0);
  }
});
