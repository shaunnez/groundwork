export type ReviewOutcome = "unresolved" | "met" | "not-met" | "clarify";
export type RequestStage =
  | "queued"
  | "reading"
  | "assessing"
  | "preparing"
  | "ready"
  | "failed"
  | "cancelled";
export type Decision = {
  outcome: string;
  reason: string;
  version: number;
  at: string;
  snapshot?: {
    noticeRevision: number;
    noticeClose: string;
    firmVersion: number;
    certification: string;
  };
};
export type DemoState = {
  schema: number;
  firm: string;
  services: string;
  region: string;
  reviews: Record<
    string,
    { outcome: ReviewOutcome; reason: string; evidence: string }
  >;
  coverageComplete: boolean;
  capabilityReviewed: boolean;
  changed: boolean;
  decisions: Decision[];
  request: {
    id: number;
    kind: string;
    stage: RequestStage;
    published: boolean;
    inputRevision: number;
    targetId: string;
  } | null;
  reportVersion: number;
  reportHistory: {
    version: number;
    kind: string;
    reviewed: boolean;
    coverageComplete: boolean;
  }[];
  competitorReportReady: boolean;
  saved: string[];
  files: string[];
  share: "none" | "active" | "revoked";
  shareExpires: string;
  shareVersion: number;
  emailFailed: boolean;
  preferences: { brief: boolean; deadlines: boolean; reports: boolean };
};
export const initialDemo = (): DemoState => ({
  schema: 1,
  firm: "Koru Advisory",
  services: "Digital advisory, service design and programme assurance",
  region: "Auckland",
  reviews: {
    security: { outcome: "unresolved", reason: "", evidence: "" },
    insurance: {
      outcome: "met",
      reason: "Current schedule reviewed.",
      evidence: "Insurance schedule.pdf",
    },
    references: {
      outcome: "met",
      reason: "Two comparable programmes reviewed.",
      evidence: "Koru capability statement.pdf",
    },
  },
  coverageComplete: false,
  capabilityReviewed: false,
  changed: false,
  decisions: [],
  request: null,
  reportVersion: 1,
  reportHistory: [
    {
      version: 1,
      kind: "Notice-only assessment",
      reviewed: false,
      coverageComplete: false,
    },
  ],
  competitorReportReady: false,
  saved: [],
  files: [],
  share: "none",
  shareExpires: "2026-09-16",
  shareVersion: 1,
  emailFailed: false,
  preferences: { brief: true, deadlines: true, reports: true },
});
export function blockers(d: DemoState): string[] {
  const list: string[] = [];
  if (
    ["security", "insurance", "references"].some(
      (id) => d.reviews[id]?.outcome !== "met",
    )
  )
    list.push("Mandatory requirements still need review.");
  if (!d.coverageComplete)
    list.push("Two required pages have not been reviewed.");
  if (!d.capabilityReviewed)
    list.push("Delivery capability has not been reviewed.");
  if (d.changed)
    list.push("The notice changed. Review the latest input version.");
  return list;
}
export function eligible(d: DemoState) {
  return blockers(d).length === 0;
}
export function acceptRequest(
  d: DemoState,
  kind: string,
  targetId = "0",
): DemoState {
  if (d.request && !["ready", "failed", "cancelled"].includes(d.request.stage))
    return d;
  return {
    ...d,
    request: {
      id: (d.request?.id || 0) + 1,
      kind,
      stage: "queued",
      published: false,
      inputRevision: d.changed ? 3 : 2,
      targetId,
    },
  };
}
export function advanceRequest(d: DemoState): DemoState {
  if (!d.request || ["ready", "failed", "cancelled"].includes(d.request.stage))
    return d;
  const order: RequestStage[] = [
    "queued",
    "reading",
    "assessing",
    "preparing",
    "ready",
  ];
  const next = order[order.indexOf(d.request.stage) + 1];
  if (
    (next === "assessing" &&
      d.request.kind === "Document assessment" &&
      !d.coverageComplete) ||
    (next === "ready" && d.request.inputRevision !== (d.changed ? 3 : 2))
  )
    return {
      ...d,
      request: { ...d.request, stage: "failed", published: false },
    };
  return {
    ...d,
    request: { ...d.request, stage: next, published: next === "ready" },
    reportVersion:
      next === "ready" && d.request.kind !== "Competitor profile"
        ? d.reportVersion + 1
        : d.reportVersion,
    competitorReportReady:
      d.competitorReportReady ||
      (next === "ready" && d.request.kind === "Competitor profile"),
    reportHistory:
      next === "ready" && d.request.kind !== "Competitor profile"
        ? [
            ...d.reportHistory,
            {
              version: d.reportVersion + 1,
              kind: d.request.kind,
              reviewed: d.request.kind === "Document assessment" && eligible(d),
              coverageComplete:
                d.request.kind === "Document assessment" && d.coverageComplete,
            },
          ]
        : d.reportHistory,
  };
}
export function completeFixture(d: DemoState): DemoState {
  return {
    ...d,
    coverageComplete: true,
    capabilityReviewed: true,
    changed: false,
    reviews: {
      ...d.reviews,
      security: {
        outcome: "met",
        reason: "Current sample certificate reviewed.",
        evidence: "Sample certificate.pdf",
      },
    },
  };
}
export function recordDecision(
  d: DemoState,
  outcome: string,
  reason: string,
): DemoState {
  if (!reason.trim()) throw new Error("Add a reason for this decision.");
  if (outcome === "Pursue" && !eligible(d)) throw new Error(blockers(d)[0]);
  return {
    ...d,
    decisions: [
      {
        outcome,
        reason: reason.trim(),
        version: d.changed ? 3 : 2,
        at: "9 Sep 2026 · 10:24 NZST",
        snapshot: {
          noticeRevision: 3,
          noticeClose: "24 Sep 2026",
          firmVersion: d.changed ? 2 : 1,
          certification: d.reviews.security?.evidence || "Not confirmed",
        },
      },
      ...d.decisions,
    ],
  };
}
