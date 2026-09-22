import test from "node:test";
import assert from "node:assert/strict";
import { watchlistPreview } from "../../src/workspace/watchlist-preview.ts";
import type { Opportunity, ReportSummary } from "../../src/workspace/data.ts";

const notice: Opportunity = {
  id: "notice-1",
  title: "Regional assessment services",
  buyer: "Regional Council",
  notice_id: "12345678",
  cutoff: "2026-09-23T00:00:00Z",
  client_id: null,
  created_at: "2026-09-23T00:00:00Z",
  metadata: {
    category: "assessment services",
    noticeUrl:
      "https://www.gets.govt.nz/Test/ExternalTenderDetails.htm?id=12345678",
    closingAt: "2026-09-25T03:00:00+12:00",
    dateStatus: "known",
    provenance: "public",
    origin: "gets-intake",
    noticeType: "Request for Proposal (RFP)",
    overview:
      "The council seeks regional assessment services across three districts. The supplier will provide qualified staff and monthly reporting.",
  },
};

test("public GETS quick read stays within notice facts and gives three checks", () => {
  const view = watchlistPreview(
    notice,
    undefined,
    new Date("2026-09-23T00:00:00Z"),
  );
  assert.match(view.summary, /council seeks regional assessment services/);
  assert.match(view.framing, /Potential work in assessment services/);
  assert.match(view.deadline, /Closes 25 Sept? 2026/);
  assert.match(view.deadline, /NZ time/);
  assert.equal(view.actions.length, 3);
  assert.equal(view.competitors.length, 0);
  assert.ok(
    view.flags.some((flag) =>
      /Contract value has not been independently checked/.test(flag),
    ),
  );
  assert.ok(view.flags.some((flag) => /attachments or addenda/.test(flag)));
  assert.match(view.basis, /not yet assessed/);
});

test("information-stage and missing-date notices are not presented as live bids", () => {
  const view = watchlistPreview(
    {
      ...notice,
      metadata: {
        ...notice.metadata,
        noticeType: "ROI",
        closingAt: null,
      },
    },
    undefined,
    new Date("2026-09-23T00:00:00Z"),
  );
  assert.match(
    view.framing,
    /does not yet establish a contract award or full bid invitation/,
  );
  assert.match(view.deadline, /not recorded/);
  assert.ok(
    view.flags.some((flag) =>
      /interest, information or advance-notice stage/.test(flag),
    ),
  );
  assert.match(view.actions[0], /registration, eligibility/);
});

test("GETS placeholder overview and advance notice stay visibly incomplete", () => {
  const view = watchlistPreview({
    ...notice,
    metadata: {
      ...notice.metadata,
      overview: "No Overview",
      noticeType: "Notice of Information (Advance Notice) (NOI)",
      category: "72000000 - Building and Facility Construction",
    },
  });
  assert.match(view.summary, /no public overview/i);
  assert.match(
    view.framing,
    /does not establish scope, firm fit or commercial value/,
  );
  assert.ok(view.flags.some((flag) => /public scope is missing/.test(flag)));
  assert.match(view.actions[2], /next procurement stage/);
});

test("briefing schedule prefix does not obscure the scope or its separate deadline", () => {
  const view = watchlistPreview({
    ...notice,
    metadata: {
      ...notice.metadata,
      overview:
        "Deadline to register for Briefing Session 28 09 2026Briefing Session 30 09 2026UC's lifts provide essential transport. The assets require maintenance to remain safe.",
    },
  });
  assert.match(view.summary, /^UC's lifts provide essential transport/);
  assert.ok(
    view.flags.some((flag) => /separate briefing registration date/.test(flag)),
  );
  assert.match(view.actions[1], /briefing registration/);
});

test("planning notices ask for monitoring rather than a bid response", () => {
  const view = watchlistPreview(
    {
      ...notice,
      metadata: {
        ...notice.metadata,
        noticeType: "Future Procurement Opportunity",
        closingAt: null,
      },
    },
    undefined,
    new Date("2026-09-23T00:00:00Z"),
  );
  assert.match(view.deadline, /not yet confirmed/);
  assert.match(view.actions[0], /monitor for a live tender/);
});

test("assessed cards use saved report and show only evidence-linked market names", () => {
  const report: ReportSummary = {
    id: "report-1",
    opportunity_id: notice.id,
    kind: "pursuit",
    created_at: "2026-09-23T00:00:00Z",
    parent_report_id: null,
    cutoff: "2026-09-23T00:00:00Z",
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
        gap: "Unknown",
      },
    },
    summary: [
      "Assessed scope sentence.",
      "Assessment: Provisional.",
      "Specialist team is material.",
      "Check qualification requirements.",
      "Commercial value remains unknown.",
    ],
    entities: [
      {
        name: "Supported Supplier",
        status: "unresolved_name",
        evidenceSourceIds: ["s1"],
      },
      {
        name: "Unsupported Supplier",
        status: "unresolved_name",
        evidenceSourceIds: [],
      },
      {
        name: "Regional Council",
        status: "unresolved_name",
        evidenceSourceIds: ["s2"],
      },
    ],
    evaluation: "live",
    review_state: "pending",
  };
  const view = watchlistPreview(
    notice,
    report,
    new Date("2026-09-23T00:00:00Z"),
  );
  assert.equal(view.summary, report.summary[0]);
  assert.equal(view.framing, report.summary[2]);
  assert.equal(view.actions[0], report.summary[3]);
  assert.deepEqual(view.competitors, ["Supported Supplier"]);
  assert.ok(view.flags.includes(report.summary[4]));
});

test("a saved no-bid assessment never gets generic bid advice or competitor cards", () => {
  const report: ReportSummary = {
    id: "report-closed",
    opportunity_id: notice.id,
    kind: "pursuit",
    created_at: "2026-09-23T00:00:00Z",
    parent_report_id: null,
    cutoff: "2026-09-23T00:00:00Z",
    verdict: {
      recommendation: "NO-GO",
      rationaleClaimIds: ["c1"],
      disqualifier: "closed",
      disqualifierEvidenceIds: ["e1"],
      clientEvidenceIds: [],
      posture: "unknown",
      nextActionClaimId: "c2",
      uncertainty: {
        event: null,
        timeframe: null,
        conditions: [],
        gap: "Unknown",
      },
    },
    summary: [
      "This is a direct award.",
      "NO-GO.",
      "No open bid exists.",
      "Monitor future tenders.",
      "Buyer relationship unknown.",
    ],
    entities: [
      {
        name: "Supplier Ltd",
        status: "unresolved_name",
        evidenceSourceIds: ["s1"],
      },
      {
        name: "SUPPLIER LTD",
        status: "unresolved_name",
        evidenceSourceIds: ["s1"],
      },
    ],
    evaluation: "live",
    review_state: "pending",
  };
  const view = watchlistPreview(
    {
      ...notice,
      metadata: { ...notice.metadata, overview: null, closingAt: null },
    },
    report,
  );
  assert.deepEqual(view.competitors, []);
  assert.equal(view.actions[0], "Monitor future tenders.");
  assert.ok(
    view.actions.every(
      (action) => !/prepare a credible submission/.test(action),
    ),
  );
  assert.ok(view.flags.every((flag) => !/public scope is missing/.test(flag)));
});

test("revised deadline is labelled as notice-record date rather than authoritative latest date", () => {
  const report: ReportSummary = {
    id: "report-revised",
    opportunity_id: notice.id,
    kind: "pursuit",
    created_at: "2026-09-23T00:00:00Z",
    parent_report_id: null,
    cutoff: "2026-09-23T00:00:00Z",
    summary: [
      "Scope.",
      "Assessment.",
      "Extended deadline matters.",
      "Check response by revised deadline.",
      "Dates require confirmation.",
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
        gap: "Unknown",
      },
    },
    entities: [],
    evaluation: "live",
    review_state: "pending",
  };
  const view = watchlistPreview(
    notice,
    report,
    new Date("2026-09-23T00:00:00Z"),
  );
  assert.match(view.deadline, /Notice record closes/);
  assert.ok(
    view.flags.some((flag) =>
      /assessment refers to a revised deadline/.test(flag),
    ),
  );
});
