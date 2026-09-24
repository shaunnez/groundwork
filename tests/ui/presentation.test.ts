import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import {
  AssessmentBody,
  Citation,
  PursuitView,
} from "../../src/workspace/Assessment.tsx";
import { PursuitOverview } from "../../src/workspace/PursuitOverview.tsx";
import { SourceContent } from "../../src/workspace/SourceContent.tsx";
import type { Detail, SavedReport } from "../../src/workspace/data.ts";
import { assessmentFixture, payloadFixture } from "../backend/fixtures.ts";
import { baseInput } from "../backend/fixtures.ts";
import { compileDeliverable } from "../../server/deliverables.ts";

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

function detailFixture(report: SavedReport | null = null): Detail {
  return {
    opportunity: {
      id: "opportunity-fixture",
      title: "Digital advisory services",
      buyer: "Example Council",
      notice_id: "12345678",
      cutoff: "2026-09-22",
      client_id: null,
      created_at: "2026-09-22T00:00:00Z",
      metadata: {
        category: "Professional services",
        noticeUrl: null,
        closingAt: null,
        dateStatus: "unknown",
        provenance: "public",
      },
    },
    sources: [],
    runs: [],
    reports: report ? [report] : [],
  };
}

function pursuitMarkup(detail: Detail, report: SavedReport | null) {
  return load(
    renderToStaticMarkup(
      createElement(PursuitOverview, {
        detail,
        report,
        owner: true,
        busy: false,
        go: () => {},
        onEvidence: () => {},
        onDerive: () => {},
      }),
    ),
  );
}

test("pursuit starts with the latest saved read and links to the full report", () => {
  const report = reportFixture();
  const $ = pursuitMarkup(detailFixture(report), report);
  assert.equal(
    $(".pursuit-overview > section").first().find("h2").text(),
    "Latest read",
  );
  assert.match($(".pursuit-latest").text(), /Provisional/);
  assert.match($(".pursuit-latest").text(), /Analyst review required/);
  assert.match($(".pursuit-latest button").text(), /Read full report/);
  assert.equal($("#assessment-summary").length, 0);
  assert.equal(
    $(".pursuit-report-history option[value='report-fixture']").length,
    1,
  );
});

test("notice-only and no-source states do not imply a completed pursuit assessment", () => {
  const detail = detailFixture();
  let $ = pursuitMarkup(detail, null);
  assert.match($(".pursuit-latest").text(), /No saved pursuit assessment/);
  assert.match($(".pursuit-next-primary").text(), /Add source evidence/);
  assert.equal($(".pursuit-latest button").length, 0);

  detail.opportunity.notice_brief = {
    summary: {
      text: "The notice describes an advisory scope.",
      unitId: "u1",
      quote: "advisory scope",
    },
    whyItMayMatter: {
      text: "Potential fit",
      unitId: "u1",
      quote: "advisory scope",
    },
    redFlags: [],
    actions: [1, 2, 3].map((n) => ({
      text: `Check ${n}`,
      unitId: "u1",
      quote: "advisory scope",
    })) as NonNullable<Detail["opportunity"]["notice_brief"]>["actions"],
  };
  $ = pursuitMarkup(detail, null);
  assert.match($(".pursuit-latest").text(), /Notice-only quick read/);
  assert.match($(".pursuit-latest").text(), /not a full pursuit assessment/);
});

test("queued, running and stopped requests retain the previous saved report", () => {
  const report = reportFixture();
  const detail = detailFixture(report);
  detail.runs = [
    {
      id: "run-1",
      state: "queued",
      stage: "admit",
      error: null,
      created_at: "2026-09-23T00:00:00Z",
      started_at: null,
    },
  ];
  let $ = pursuitMarkup(detail, report);
  assert.match($(".pursuit-latest").text(), /new request is queued/);
  assert.match(
    $(".pursuit-overview > .notice").text(),
    /No worker has started/,
  );
  assert.match($(".pursuit-next-primary").text(), /View analysis progress/);

  detail.runs[0].state = "running";
  detail.runs[0].started_at = "2026-09-23T00:01:00Z";
  detail.runs[0].stage = "verify";
  $ = pursuitMarkup(detail, report);
  assert.match($(".pursuit-latest").text(), /previous saved read/);
  assert.match(
    $(".pursuit-overview > .notice").text(),
    /Recorded stage: verify/,
  );

  detail.runs[0].state = "failed";
  detail.runs[0].error = "Source coverage failed";
  $ = pursuitMarkup(detail, report);
  assert.match(
    $(".pursuit-overview > .notice").text(),
    /Source coverage failed/,
  );
  assert.match(
    $(".pursuit-next-primary").text(),
    /Inspect the stopped request/,
  );
  assert.doesNotMatch(
    $(".pursuit-next-primary").text(),
    /Request reassessment/,
  );
});

test("blocked and cancelled requests show their recorded cause without offering a repeat request", () => {
  const detail = detailFixture();
  detail.sources = [
    {
      id: "source-1",
      name: "Tender.pdf",
      purpose: "rfp",
      media_type: "application/pdf",
      published_at: null,
      provenance: "private",
      state: "failed",
      reader: "pdf",
      required: true,
      coverage: {
        total: 4,
        read: 0,
        unread: 4,
        unit: "page",
        failures: ["OCR unavailable"],
      },
    },
  ];
  detail.runs = [
    {
      id: "run-1",
      state: "budget-blocked",
      stage: "verify",
      error: "Usage limit reached",
      created_at: "2026-09-23T00:00:00Z",
      started_at: "2026-09-23T00:01:00Z",
      progress: {
        stages: [],
        workerAttempts: 1,
        leaseUntil: null,
        modelCalls: 2,
        apiEquivalentUsd: 0.25,
        readinessIssues: ["Tender.pdf: OCR unavailable"],
        modelEnabled: true,
        resumable: false,
      },
    },
  ];
  let $ = pursuitMarkup(detail, null);
  assert.match(
    $(".pursuit-overview > .notice").text(),
    /Assessment blocked by usage limit/,
  );
  assert.match($(".pursuit-overview > .notice").text(), /Usage limit reached/);
  assert.match(
    $(".pursuit-overview > .notice").text(),
    /Tender.pdf: OCR unavailable/,
  );
  assert.match(
    $(".pursuit-next-primary").text(),
    /Inspect the stopped request/,
  );
  assert.match($(".pursuit-source-list").text(), /Needs attention/);

  detail.runs[0].state = "cancelled";
  detail.runs[0].error = null;
  $ = pursuitMarkup(detail, null);
  assert.match($(".pursuit-overview > .notice").text(), /Assessment cancelled/);
  assert.doesNotMatch($(".pursuit-next-primary").text(), /Request assessment/);
});

test("incomplete tender pack and partial source coverage remain explicit", () => {
  const detail = detailFixture();
  detail.sources = [
    {
      id: "source-1",
      name: "Tender.pdf",
      purpose: "rfp",
      media_type: "application/pdf",
      published_at: null,
      provenance: "private",
      state: "partial",
      reader: "pdf",
      required: true,
      coverage: {
        total: 10,
        read: 7,
        unread: 3,
        unit: "page",
        failures: ["Pages 8-10 unread"],
      },
    },
  ];
  detail.tenderPacks = [
    {
      id: "pack-1",
      rfxId: "12345678",
      noticeRevisionId: "rev-1",
      observedAt: "2026-09-23T00:00:00Z",
      complete: false,
      counts: { expected: 13, received: 12, readable: 11 },
      files: [],
    },
  ];
  const $ = pursuitMarkup(detail, null);
  assert.match($(".pursuit-next-primary").text(), /Complete tender pack/);
  assert.match($(".pursuit-pack-status").text(), /12\/13 originals admitted/);
  assert.match($(".pursuit-source-list").text(), /7\/10 pages read/);
  assert.match($(".pursuit-source-list").text(), /Partly read/);
});

test("saved report keeps the full analysis and version metadata", () => {
  const report = reportFixture();
  const detail = detailFixture(report);
  const $ = load(
    renderToStaticMarkup(
      createElement(PursuitView, {
        detail,
        report,
        owner: true,
        go: () => {},
        onEvidence: () => {},
        busy: false,
        onDerive: () => {},
        fixed: true,
        mode: "validate",
      }),
    ),
  );
  assert.equal($(".pursuit-latest").length, 0);
  assert.equal($("#assessment-summary").length, 1);
  assert.match($(".report-outline").text(), /Saved version/);
  assert.match($(".report-outline").text(), /Frozen sources/);
  assert.equal(
    $(".report-outline a[aria-current='location']").text(),
    "Executive summary",
  );
  assert.equal(
    $("#assessment-gaps .assessment-limitations li").length,
    report.payload.limitations.length,
  );
  assert.match($("#assessment-gaps").text(), /Known limitations/);
});

test("saved report renders a frozen GETS pack without derived counts", () => {
  const report = reportFixture();
  report.payload.tenderPack = {
    id: "pack-1",
    rfxId: "12345678",
    noticeRevisionId: "revision-1",
    observedAt: "2026-09-23T00:00:00Z",
    complete: false,
    files: [
      {
        fileId: "file-1",
        name: "Tender.docx",
        bytes: 128,
        sha256: "abc",
        kind: "attachment",
        status: "current",
        sourceId: "source-1",
        actualBytes: 128,
        actualSha256: "abc",
        reader: "docx",
        coverage: {
          total: 1,
          read: 1,
          unread: 0,
          unit: "section",
          failures: ["Embedded visual content not read"],
        },
        state: "partial",
        problem: null,
        technicalReviewRequired: false,
        technicalReview: null,
      },
    ],
  };
  const render = () =>
    load(
      renderToStaticMarkup(
        createElement(AssessmentBody, { report, onEvidence: () => {} }),
      ),
    );
  assert.match(
    render()("#assessment-summary").text(),
    /all declared originals admitted; analytical coverage incomplete/,
  );
  report.payload.tenderPack.files[0].sourceId = null;
  assert.match(
    render()("#assessment-summary").text(),
    /incomplete pack; see named file states/,
  );
});

test("companion reports have matching outlines and full first findings", () => {
  for (const [kind, expectedSection] of [
    ["watchlist", "deliverable-intelligence"],
    ["competitor", "deliverable-suppliers"],
    ["weekly", "deliverable-changes"],
  ] as const) {
    const report = reportFixture();
    report.kind = kind;
    report.payload.deliverable = compileDeliverable(kind, baseInput());
    const $ = load(
      renderToStaticMarkup(
        createElement(PursuitView, {
          detail: detailFixture(report),
          report,
          owner: true,
          go: () => {},
          onEvidence: () => {},
          busy: false,
          onDerive: () => {},
          fixed: true,
        }),
      ),
    );
    assert.equal(
      $(".report-outline a[href='#" + expectedSection + "']").length,
      1,
    );
    assert.equal($("#" + expectedSection).length, 1);
    assert.ok($(".connected-deliverable .connected-claim[id]").length > 0);
    for (const reference of $(
      ".connected-deliverable .finding-reference",
    ).toArray()) {
      const target = $(reference).attr("href");
      assert.equal($(target!).length, 1);
    }
  }
});

test("citation preview softens decorative source banners without changing the exact quote", () => {
  const report = reportFixture();
  const exact =
    "***** THIS IS A CONTRACT DETAILS NOTICE ***** This procurement is concluded.";
  report.payload.assessment.evidence[0].excerpt = exact;
  report.payload.quoteStates.e1 = "VERBATIM";
  const $ = load(
    renderToStaticMarkup(
      createElement(Citation, {
        report,
        id: "e1",
        onEvidence: () => {},
      }),
    ),
  );
  assert.match(
    $(".citation-quote").text(),
    /THIS IS A CONTRACT DETAILS NOTICE/,
  );
  assert.doesNotMatch($(".citation-quote").text(), /\*{3,}/);
  assert.match($(".citation").text(), /Exact wording verified/);
  assert.equal(report.payload.assessment.evidence[0].excerpt, exact);
});

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
