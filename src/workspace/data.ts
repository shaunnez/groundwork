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
  | "delivery";
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
  payload: VerifiedReport & {
    sourcePursuitId?: string;
    cutoff: string;
    intelligence: Intelligence;
    sourceInventory: Source[];
    requirements: Requirements;
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
export const kindLabel: Record<Kind, string> = {
  pursuit: "Pursuit package",
  watchlist: "Daily watchlist",
  competitor: "Competitor profile",
  weekly: "Weekly brief",
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
