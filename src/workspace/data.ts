import type { UnitGeometry } from "../../shared/source-geometry";
import type { VerifiedReport, Assessment } from "../../shared/contracts";
import type { Deliverable } from "../../server/deliverables";
export type Kind = "pursuit" | "watchlist" | "competitor" | "weekly";
export type Page =
  | "home"
  | "watchlist"
  | "pursuit"
  | "sources"
  | "upload"
  | "request"
  | "processing"
  | "requirements"
  | "decisions"
  | "reports"
  | "report"
  | "market"
  | "brief"
  | "firm"
  | "ops"
  | "delivery"
  | "mapping"
  | "sectors"
  | "settings";
export type Navigate = (
  page: Page,
  opportunityId?: string,
  reportId?: string,
) => void;
export interface Client {
  id: string;
  legal_name: string;
  context: {
    capabilities: string;
    certifications: string;
    currentContracts: string;
    effectiveDate: string;
  };
}
export interface Opportunity {
  id: string;
  title: string;
  buyer: string;
  notice_id: string;
  cutoff: string;
  client_id: string | null;
  groundwork_sector_id?: string | null;
  groundwork_sector_name?: string;
  groundwork_sector_method?: string;
  notice_brief?: {
    summary: { text: string; unitId: string; quote: string };
    whyItMayMatter: { text: string; unitId: string; quote: string };
    redFlags: { text: string; unitId: string; quote: string }[];
    actions: [
      { text: string; unitId: string; quote: string },
      { text: string; unitId: string; quote: string },
      { text: string; unitId: string; quote: string },
    ];
  } | null;
  notice_brief_source_id?: string | null;
  created_at: string;
  metadata: {
    category: string;
    noticeUrl: string | null;
    closingAt: string | null;
    dateStatus: string;
    provenance: "public" | "synthetic";
    origin?: string;
    provider?: string;
    noticeType?: string | null;
    status?: string | null;
    categories?: string[];
    regions?: string[];
    overview?: string | null;
  };
}
export interface Review {
  id: string;
  report_id: string;
  opportunity_id: string;
  title: string;
  kind: Kind;
  state: string;
  reasons: string[];
  created_at: string;
}
export interface Bootstrap {
  researchEnabled?: boolean;
  role?: "owner" | "reviewer";
  opportunities: Opportunity[];
  clients: Client[];
  reviews: Review[];
  budget: { spent: string; allowance: string; reserved: string };
}
export interface ReportSummary {
  id: string;
  opportunity_id: string;
  kind: Kind;
  created_at: string;
  parent_report_id: string | null;
  cutoff: string;
  verdict: Assessment["verdict"];
  summary: string[];
  entities: { name: string; status: string; evidenceSourceIds?: string[] }[];
  evaluation: string;
  review_state: string;
}
export interface Source {
  required: boolean;
  status?: "active" | "archived" | "superseded";
  successor_id?: string | null;
  reason?: string;
  id: string;
  name: string;
  purpose: string;
  media_type: string;
  published_at: string | null;
  provenance: string;
  state: string;
  reader: string;
  coverage: {
    total: number | null;
    read: number;
    unread: number;
    unit: string;
    failures: string[];
  };
}
export interface Unit {
  geometry?: UnitGeometry | null;
  id: string;
  sourceId: string;
  ordinal: number;
  location: string;
  text: string;
}
export interface EvidenceSource extends Source {
  units: Unit[];
}
export interface Run {
  id: string;
  state: string;
  stage: string;
  error: string | null;
  created_at: string;
  started_at?: string | null;
  updated_at?: string;
  progress?: {
    stages: {
      name: string;
      state: string;
      started_at: string;
      finished_at: string | null;
      error: string | null;
    }[];
    workerAttempts: number;
    leaseUntil: string | null;
    modelCalls: number;
    apiEquivalentUsd: number;
    readinessIssues: string[];
    modelEnabled: boolean;
    resumable: boolean;
  };
}
export interface Intelligence {
  entities: { name: string; status: string; evidenceSourceIds: string[] }[];
  incumbent: {
    entityName: string | null;
    status: string;
    posture: string;
    clientRelationship: string;
    reviewReasons: string[];
  };
  metrics: {
    awardCount: number;
    supplierCount: number;
    repeatSupplierCount: number;
    limitations: string[];
  };
  limitations: string[];
  entityEvidence?: {
    observations: {
      id: string;
      entityName: string;
      kind: string;
      quote: string;
      unitId: string;
    }[];
  };
}
export interface Requirements {
  status: string;
  distinctRequirements?: number;
  occurrences?: number;
  previewLimit?: number;
  ledgerRunId?: string;
  limitation?: string;
  unitsEnumerated?: number;
  candidatesProduced?: number;
  candidatesJudged?: number;
  judgments?: {
    candidateId: string;
    requirements: {
      text: string;
      quote: string;
      mandatory: boolean;
      rationale: string;
    }[];
  }[];
}
export interface SavedReport {
  id: string;
  opportunity_id: string;
  kind: Kind;
  created_at: string;
  parent_report_id: string | null;
  citationLocations?: Record<
    string,
    {
      id: string;
      location: string;
      source_id: string;
      source_name: string;
    } | null
  >;
  payload: VerifiedReport & {
    sourcePursuitId?: string;
    cutoff: string;
    intelligence: Intelligence;
    sourceInventory: Source[];
    requirements: Requirements;
    analysis?: {
      ledgerRunId: string;
      selectedFindings: number;
      omittedFindings: number;
      readerGaps: { sourceId: string; name: string; failures: string[] }[];
    } | null;
    tenderPack?: TenderPack | null;
    frozenClient?: Client | null;
    deliverable?: Deliverable;
  };
  review: { state: string; reasons: string[] } | null;
  freshness: {
    stale: boolean;
    reviewState: string;
    upstreamReviewState: string;
  };
  comparison:
    | {
        status: string;
        previousText: string | null;
        currentText: string | null;
        rationale: string;
      }[]
    | null;
  decisions: {
    id: string;
    choice: string;
    reason: string;
    created_at: string;
  }[];
  feedback: {
    id: string;
    target: string;
    disposition: string;
    reason: string;
    before_text: string | null;
    after_text: string | null;
  }[];
  reviewHistory: {
    id: string;
    state: string;
    reason: string;
    created_at: string;
  }[];
  outcomes: {
    id: string;
    event: string;
    outcome: string;
    observed_at: string;
    unit_id: string;
  }[];
}
export interface Detail {
  sourceHistory?: Source[];
  opportunity: Opportunity;
  sources: Source[];
  runs: Run[];
  reports: SavedReport[];
  tenderPacks?: TenderPack[];
  firmLink?: {
    client_id: string;
    effective_date: string;
    source: string;
    created_at: string;
    legal_name: string;
  } | null;
}
export interface TenderPack {
  id: string;
  rfxId: string;
  noticeRevisionId: string;
  observedAt: string;
  complete: boolean;
  counts: { expected: number; received: number; readable: number };
  files: {
    fileId: string;
    name: string;
    bytes: number;
    sha256: string;
    kind: "attachment" | "addendum";
    status: "current" | "withdrawn";
    sourceId: string | null;
    actualBytes: number | null;
    actualSha256: string | null;
    reader: string;
    coverage: Source["coverage"] | null;
    state: string;
    problem: string | null;
    technicalReviewRequired: boolean;
    technicalReview: { note: string; reviewedAt: string } | null;
  }[];
}
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch("/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body instanceof FormData
        ? { "x-groundwork-request": "local" }
        : {
            "content-type": "application/json",
            "x-groundwork-request": "local",
          },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new RequestError(
      data.error || "We could not complete this request.",
      response.status,
    );
  return data;
}
export async function uploadTenderFile(
  packId: string,
  fileId: string,
  file: File,
): Promise<void> {
  const response = await fetch(`/api/tender-packs/${packId}/files/${fileId}`, {
    method: "PUT",
    headers: {
      "content-type": "application/octet-stream",
      "x-groundwork-request": "local",
    },
    body: file,
  });
  const data = await response.json();
  if (!response.ok)
    throw new RequestError(
      data.error || "Tender file could not be admitted",
      response.status,
    );
}
export const kindLabel: Record<Kind, string> = {
  pursuit: "Pursuit package",
  watchlist: "Opportunity watchlist entry",
  competitor: "Notice-linked supplier profile",
  weekly: "Opportunity weekly update",
};
export const date = (s: string) =>
  new Date(s.length === 10 ? s + "T12:00:00" : s).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export const provenance = (o: Opportunity) =>
  o.metadata.provenance === "synthetic"
    ? "Synthetic evaluation"
    : "Public evidence";
export function reportMaturity(report: SavedReport): string {
  if (
    report.payload.tenderPack?.complete &&
    report.payload.requirements.status === "complete"
  )
    return "RFP reassessment";
  if (
    report.payload.sourceInventory.some(
      (source) => source.purpose === "rfp" || source.purpose === "addendum",
    )
  )
    return "Tender evidence partly assessed";
  return report.payload.sourceInventory.every(
    (source) => source.purpose === "notice",
  )
    ? "Notice-only pursuit"
    : "Enriched public pursuit";
}
export const activeRun = (d: Detail) =>
  d.runs.find((r) => ["queued", "running"].includes(r.state));
export const latestPursuit = (d: Detail) =>
  d.reports.find((r) => r.kind === "pursuit");
export function claimText(r: SavedReport, id: string) {
  return (
    r.payload.assessment.claims.find((c) => c.id === id)?.text ||
    "Not established in this assessment."
  );
}
export function evidenceIds(
  a: Assessment,
  id: string,
  seen = new Set<string>(),
): string[] {
  if (seen.has(id)) return [];
  seen.add(id);
  const c = a.claims.find((x) => x.id === id);
  return c
    ? [
        ...new Set([
          ...c.evidenceIds,
          ...c.premiseIds.flatMap((p) => evidenceIds(a, p, seen)),
        ]),
      ]
    : [];
}
