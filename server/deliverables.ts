import { z } from "zod";
import {
  AssessmentSchema,
  type Assessment,
  type VerifiedReport,
} from "../shared/contracts.ts";
import { compareReports } from "./comparison.ts";

/**
 * This module compiles the three OTHER enriched internal outputs (daily
 * watchlist, notice-linked competitor dossier, weekly brief) from a single
 * ALREADY VALIDATED saved pursuit report and its saved intelligence
 * snapshot. It never re-derives or invents a commercial finding: every
 * claim, evidence excerpt and canonical verdict field is carried by
 * reference to the source report, unchanged. Sections that this module
 * cannot fill from the underlying report explicitly say so instead of
 * silently omitting them.
 */

// ---------------------------------------------------------------------------
// Narrow, validated views of the two "unknown" payload fields.
//
// `payload.intelligence` and `payload.sourceInventory` are typed `unknown`
// at the boundary because this module does not own the worker/report
// schemas. They are validated here (not trusted) against the shape the
// worker actually saves (see server/worker.ts), so a malformed saved
// snapshot fails loudly instead of silently fabricating structure.
// ---------------------------------------------------------------------------

const RetentionObservationSchema = z
  .object({
    predecessorId: z.string(),
    followOnId: z.string(),
    state: z.enum(["retained", "lost", "unknown", "excluded"]),
    reason: z.string(),
  })
  .strict();

const AwardMetricsSchema = z
  .object({
    populationIds: z.array(z.string()),
    awardCount: z.number(),
    supplierCount: z.number(),
    repeatSupplierCount: z.number(),
    repeatSupplierRate: z.number().nullable(),
    retention: z
      .object({
        retained: z.number(),
        known: z.number(),
        unknown: z.number(),
        excluded: z.number(),
        rate: z.null(),
        policy: z.literal("pending"),
        observations: z.array(RetentionObservationSchema),
      })
      .strict(),
    limitations: z.array(z.string()),
  })
  .strict();

const IncumbentResolutionSchema = z
  .object({
    status: z.enum(["confirmed", "assessed_candidate", "unknown"]),
    entityName: z.string().nullable(),
    clientRelationship: z.enum(["incumbent", "challenger", "unknown"]),
    posture: z.enum(["defend", "challenge", "unknown"]),
    evidenceSourceIds: z.array(z.string()),
    reviewReasons: z.array(z.string()),
    limitations: z.array(z.string()),
  })
  .strict();

const IntelligenceEntitySchema = z
  .object({
    name: z.string(),
    status: z.string(),
    evidenceSourceIds: z.array(z.string()),
  })
  .strict();

const IntelligenceSnapshotSchema = z
  .object({
    cutoff: z.string(),
    sourceIds: z.array(z.string()),
    entities: z.array(IntelligenceEntitySchema),
    incumbent: IncumbentResolutionSchema,
    metrics: AwardMetricsSchema,
    limitations: z.array(z.string()),
    researchScope: z.string(),
    entityEvidence: z.unknown().optional(),
  })
  .strict();

export type IntelligenceSnapshot = z.infer<typeof IntelligenceSnapshotSchema>;

const SourceInventoryItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    purpose: z.string(),
    provenance: z.string(),
    publishedAt: z.string().nullable(),
  })
  .strict();

export type SourceInventoryItem = z.infer<typeof SourceInventoryItemSchema>;

function parseIntelligence(raw: unknown): IntelligenceSnapshot {
  const parsed = IntelligenceSnapshotSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      "Saved intelligence snapshot does not match the expected shape; refusing to fabricate a deliverable from it",
    );
  return parsed.data;
}

function parseSourceInventory(raw: unknown[]): SourceInventoryItem[] {
  return raw.map((item, index) => {
    const parsed = SourceInventoryItemSchema.safeParse(item);
    if (!parsed.success)
      throw new Error(
        `Saved source inventory entry ${index} does not match the expected shape`,
      );
    return parsed.data;
  });
}

// ---------------------------------------------------------------------------
// Input boundary
// ---------------------------------------------------------------------------

export interface DeliverableOpportunity {
  id: string;
  title: string;
  buyer: string;
  noticeId: string;
  closingAt: string | null;
}

export interface DeliverablePreviousReport {
  reportId: string;
  assessment: Assessment;
}

export interface DeliverableInput {
  reportId: string;
  intelligenceId: string;
  opportunity: DeliverableOpportunity;
  payload: VerifiedReport & {
    intelligence: unknown;
    sourceInventory: unknown[];
    cutoff: string;
  };
  previous?: DeliverablePreviousReport | null;
  generatedAt: string;
}

const OpportunityRefSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    buyer: z.string().min(1),
    noticeId: z.string().min(1),
    closingAt: z.string().nullable(),
  })
  .strict();

const DeliverableInputSchema = z
  .object({
    reportId: z.string().min(1),
    intelligenceId: z.string().min(1),
    opportunity: OpportunityRefSchema,
    payload: z
      .object({
        assessment: AssessmentSchema,
        limitations: z.array(z.string()),
        evaluation: z.enum(["live", "fixture"]),
        cutoff: z.string().min(1),
        intelligence: z.unknown(),
        sourceInventory: z.array(z.unknown()),
      })
      .passthrough(),
    previous: z
      .object({ reportId: z.string().min(1), assessment: AssessmentSchema })
      .strict()
      .nullable()
      .optional(),
    generatedAt: z.string().min(1),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Shared reference shapes carried into every deliverable, unchanged from the
// canonical saved report.
// ---------------------------------------------------------------------------

export interface ClaimRef {
  id: string;
  key: string;
  text: string;
  kind: Assessment["claims"][number]["kind"];
  provenance: Assessment["claims"][number]["provenance"];
  evidenceIds: string[];
  adverseEntity: string | null;
}

export interface EvidenceRef {
  id: string;
  unitId: string;
  kind: Assessment["evidence"][number]["kind"];
  excerpt: string;
}

export interface CanonicalVerdictRef {
  recommendation: Assessment["verdict"]["recommendation"];
  posture: Assessment["verdict"]["posture"];
  disqualifier: Assessment["verdict"]["disqualifier"];
  rationaleClaimIds: string[];
  nextActionClaimId: string;
  summary: Assessment["summary"];
}

export interface ReviewTriggers {
  publicationStatus: "internal_pending";
  reasons: string[];
}

function claimRefs(assessment: Assessment): ClaimRef[] {
  return assessment.claims.map((c) => ({
    id: c.id,
    key: c.key,
    text: c.text,
    kind: c.kind,
    provenance: c.provenance,
    evidenceIds: c.evidenceIds,
    adverseEntity: c.adverseEntity,
  }));
}

function evidenceRefs(assessment: Assessment): EvidenceRef[] {
  return assessment.evidence.map((e) => ({
    id: e.id,
    unitId: e.unitId,
    kind: e.kind,
    excerpt: e.excerpt,
  }));
}

function canonicalVerdict(assessment: Assessment): CanonicalVerdictRef {
  return {
    recommendation: assessment.verdict.recommendation,
    posture: assessment.verdict.posture,
    disqualifier: assessment.verdict.disqualifier,
    rationaleClaimIds: assessment.verdict.rationaleClaimIds,
    nextActionClaimId: assessment.verdict.nextActionClaimId,
    summary: assessment.summary,
  };
}

// Review triggers are inherited identically by every deliverable kind: the
// canonical verdict, any adverse-entity claim and the incumbent resolution's
// own review reasons. Internal publication is always pending regardless of
// which deliverable is compiled.
function reviewTriggers(
  assessment: Assessment,
  incumbent: IntelligenceSnapshot["incumbent"],
): ReviewTriggers {
  return {
    publicationStatus: "internal_pending",
    reasons: [
      "Internal draft: publication policy pending",
      ...incumbent.reviewReasons,
      ...(assessment.verdict.recommendation === "NO-GO" ? ["Firm NO-GO"] : []),
      ...(assessment.claims.some((c) => c.adverseEntity)
        ? ["Adverse competitor claim"]
        : []),
    ],
  };
}

function claimText(assessment: Assessment, claimId: string): string {
  const claim = assessment.claims.find((c) => c.id === claimId);
  if (!claim)
    throw new Error(`Deliverable references unknown claim ${claimId}`);
  return claim.text;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

interface DeliverableCommon {
  reportId: string;
  intelligenceId: string;
  generatedAt: string;
  opportunity: DeliverableOpportunity;
  cutoff: string;
  evaluation: VerifiedReport["evaluation"];
  canonicalVerdict: CanonicalVerdictRef;
  reviewTriggers: ReviewTriggers;
  evidence: EvidenceRef[];
  claims: ClaimRef[];
  limitations: string[];
  sourceInventory: SourceInventoryItem[];
  /** Explicit list of facets this deliverable does NOT fully cover. */
  missingEnrichment: string[];
}

// ---------------------------------------------------------------------------
// Watchlist: daily intelligence summary / actions / listing context /
// incumbent / award metrics & forecasts, framed against confirmed notices.
// ---------------------------------------------------------------------------

export interface WatchlistDeliverable extends DeliverableCommon {
  kind: "watchlist";
  intelligenceSummary: {
    claimId: string;
    text: string;
    kind: Assessment["claims"][number]["kind"];
    provenance: Assessment["claims"][number]["provenance"];
  }[];
  recommendedActions: { claimId: string; text: string }[];
  listingContext: {
    title: string;
    buyer: string;
    noticeId: string;
    closingAt: string | null;
    dateStatus: "user_supplied_unverified" | "not_confirmed";
  };
  incumbent: IntelligenceSnapshot["incumbent"];
  awardForecast: {
    metrics: IntelligenceSnapshot["metrics"];
    forecastNote: string;
  };
}

function compileWatchlist(
  base: DeliverableCommon,
  assessment: Assessment,
  intelligence: IntelligenceSnapshot,
): WatchlistDeliverable {
  const selected = new Set([
    assessment.summary.what,
    assessment.summary.decidingFactor,
    assessment.summary.biggestGap,
  ]);
  const summaryClaims = assessment.claims.filter((c) => selected.has(c.id));
  const adviceClaims = assessment.claims.filter(
    (c) => c.id === assessment.verdict.nextActionClaimId,
  );
  return {
    ...base,
    kind: "watchlist",
    missingEnrichment: [
      "This is a daily intelligence summary, not the full pursuit assessment or a competitor dossier; open the saved report for complete reasoning, scenarios and risks.",
      "Award metrics below describe the recorded buyer/category population only; no win probability, renewal date or market-wide claim is asserted.",
    ],
    intelligenceSummary: summaryClaims.map((c) => ({
      claimId: c.id,
      text: c.text,
      kind: c.kind,
      provenance: c.provenance,
    })),
    recommendedActions: adviceClaims.map((c) => ({
      claimId: c.id,
      text: c.text,
    })),
    listingContext: {
      title: base.opportunity.title,
      buyer: base.opportunity.buyer,
      noticeId: base.opportunity.noticeId,
      closingAt: base.opportunity.closingAt,
      dateStatus: base.opportunity.closingAt
        ? "user_supplied_unverified"
        : "not_confirmed",
    },
    incumbent: intelligence.incumbent,
    awardForecast: {
      metrics: intelligence.metrics,
      forecastNote:
        "Retention rate policy remains pending and no numeric renewal forecast is asserted beyond the recorded award population and linked observations above.",
    },
  };
}

// ---------------------------------------------------------------------------
// Competitor dossier: one section per actual entity already present in the
// report's claims (adverseEntity) or the saved intelligence snapshot.
// ---------------------------------------------------------------------------

export interface CompetitorEntityDossier {
  name: string;
  identityLimitations: string[];
  sameScopeAwardFootprint: {
    evidenceSourceIds: string[];
    populationSummary: {
      awardCount: number;
      supplierCount: number;
      repeatSupplierCount: number;
      repeatSupplierRate: number | null;
      retention: IntelligenceSnapshot["metrics"]["retention"];
    };
    limitation: string;
  };
  sourcedFacts: ClaimRef[];
  strengthsWeaknesses: { evidenced: ClaimRef[]; gap: string };
  positioningActions: { claimId: string; text: string }[];
  verificationQuestions: string[];
}

export interface CompetitorDeliverable extends DeliverableCommon {
  kind: "competitor";
  entities: CompetitorEntityDossier[];
  noEntitiesGap: string | null;
}

function buildVerificationQuestions(
  name: string,
  entityMeta: IntelligenceSnapshot["entities"][number] | null,
  incumbent: IntelligenceSnapshot["incumbent"],
): string[] {
  const questions: string[] = [];
  if (!entityMeta)
    questions.push(
      `Has "${name}" been matched against a verified legal-entity register, since no award-population record in this report links to it?`,
    );
  else if (entityMeta.status === "unresolved_name")
    questions.push(
      `Is "${name}" a single legal entity, or could this normalized display name mask more than one distinct supplier?`,
    );
  if (incumbent.entityName && incumbent.entityName === name)
    for (const reason of incumbent.reviewReasons)
      questions.push(`Incumbency review: ${reason}`);
  if (!questions.length)
    questions.push(
      `No further verification gap is recorded for "${name}" beyond the standard identity-matching limitation above.`,
    );
  return questions;
}

function compileCompetitor(
  base: DeliverableCommon,
  assessment: Assessment,
  intelligence: IntelligenceSnapshot,
): CompetitorDeliverable {
  const allClaims = claimRefs(assessment);
  const namesFromEntities = intelligence.entities.map((e) => e.name);
  const namesFromClaims = allClaims
    .map((c) => c.adverseEntity)
    .filter((n): n is string => !!n);
  const names = dedupe([...namesFromEntities, ...namesFromClaims]);

  const entities: CompetitorEntityDossier[] = names.map((name) => {
    const entityMeta =
      intelligence.entities.find((e) => e.name === name) ?? null;
    const sourcedFacts = allClaims.filter(
      (c) =>
        c.adverseEntity === name ||
        c.text.toLocaleLowerCase().includes(name.toLocaleLowerCase()),
    );
    const positioningActions = sourcedFacts
      .filter((c) => c.kind === "advice")
      .map((c) => ({ claimId: c.id, text: c.text }));
    const evidenced = sourcedFacts.filter(
      (c) => c.kind === "fact" || c.kind === "inference",
    );
    return {
      name,
      identityLimitations: [
        entityMeta
          ? `Entity resolution status: ${entityMeta.status}; legal-entity identity is not independently verified.`
          : "This entity is named only in an adverse claim in the assessment; no award-population record exists for it in this report's intelligence snapshot.",
        "Supplier name matching in the award population uses normalized display names only, never independent legal-entity verification.",
      ],
      sameScopeAwardFootprint: {
        evidenceSourceIds: entityMeta?.evidenceSourceIds ?? [],
        populationSummary: {
          awardCount: intelligence.metrics.awardCount,
          supplierCount: intelligence.metrics.supplierCount,
          repeatSupplierCount: intelligence.metrics.repeatSupplierCount,
          repeatSupplierRate: intelligence.metrics.repeatSupplierRate,
          retention: intelligence.metrics.retention,
        },
        limitation:
          "This population summary describes the whole matching buyer/category footprint on or before the cutoff; it is not broken out to this entity's individual share.",
      },
      sourcedFacts,
      strengthsWeaknesses: {
        evidenced,
        gap: evidenced.length
          ? "The canonical assessment does not label individual claims as strengths or weaknesses; the sourced facts above are carried forward as-is, not re-categorized."
          : "No sourced fact or inference mentions this entity in the canonical assessment; strengths and weaknesses cannot be inferred from this report.",
      },
      positioningActions,
      verificationQuestions: buildVerificationQuestions(
        name,
        entityMeta,
        intelligence.incumbent,
      ),
    };
  });

  return {
    ...base,
    kind: "competitor",
    missingEnrichment: [
      "This dossier only carries entities and facts already present in the canonical assessment and saved intelligence snapshot; no new commercial research was performed to compile it.",
      entities.length
        ? "Some sections may be sparse where the underlying report captured limited entity-specific evidence; a sparse section is a coverage gap, not a negative finding."
        : "No adverse entity is named in the canonical assessment claims or the award-derived entity list for this report.",
    ],
    entities,
    noEntitiesGap: entities.length
      ? null
      : "No competitor entity is named in the canonical assessment claims or the award-derived entity list for this report.",
  };
}

// ---------------------------------------------------------------------------
// Weekly brief: changes vs previous snapshot (via compareReports),
// priorities/actions/deadlines, competitive context, award/retention
// limitations, source gaps and a collection agenda.
// ---------------------------------------------------------------------------

type ComparisonRow = ReturnType<typeof compareReports>[number];

export interface WeeklyDeliverable extends DeliverableCommon {
  kind: "weekly";
  changesSincePrevious: {
    hasPrevious: boolean;
    previousReportId: string | null;
    rows: ComparisonRow[];
    note: string;
  };
  priorities: { claimId: string; text: string }[];
  actions: { claimId: string; text: string }[];
  deadlines: { title: string; buyer: string; closingAt: string | null }[];
  competitiveContext: {
    incumbent: IntelligenceSnapshot["incumbent"];
    entities: IntelligenceSnapshot["entities"];
  };
  awardsAndRetentionLimitations: string[];
  sourceGaps: string[];
  collectionAgenda: string[];
  trendCaveat: string;
}

function compileWeekly(
  base: DeliverableCommon,
  assessment: Assessment,
  intelligence: IntelligenceSnapshot,
  previousAssessment: Assessment | null,
  previousRef: DeliverablePreviousReport | null,
): WeeklyDeliverable {
  const rows = previousAssessment
    ? compareReports(previousAssessment, assessment)
    : [];
  const changedOrNew = rows.filter((r) => r.status !== "UNCHANGED");
  const gapClaims = assessment.claims.filter((c) => c.kind === "gap");
  const adviceClaims = assessment.claims.filter((c) => c.kind === "advice");
  const priorityIds = dedupe([
    assessment.verdict.nextActionClaimId,
    ...assessment.verdict.rationaleClaimIds,
  ]);

  return {
    ...base,
    kind: "weekly",
    missingEnrichment: [
      "This brief summarizes the same canonical assessment and intelligence snapshot as the saved report; it does not add new research or a wider market view.",
    ],
    changesSincePrevious: {
      hasPrevious: !!previousAssessment,
      previousReportId: previousRef?.reportId ?? null,
      rows,
      note: previousAssessment
        ? changedOrNew.length
          ? "Rows below list every finding that is new, changed, or absent versus the previous saved report; a single absence is not evidence of closure."
          : "No finding is new, changed, or absent versus the previous saved report."
        : "No previous saved report was supplied for this opportunity; nothing is compared and no earlier state is implied.",
    },
    priorities: priorityIds.map((id) => ({
      claimId: id,
      text: claimText(assessment, id),
    })),
    actions: adviceClaims.map((c) => ({ claimId: c.id, text: c.text })),
    deadlines: [
      {
        title: base.opportunity.title,
        buyer: base.opportunity.buyer,
        closingAt: base.opportunity.closingAt,
      },
    ],
    competitiveContext: {
      incumbent: intelligence.incumbent,
      entities: intelligence.entities,
    },
    awardsAndRetentionLimitations: intelligence.metrics.limitations,
    sourceGaps: [...base.limitations],
    collectionAgenda: dedupe([
      assessment.hypotheses.nextCollection,
      ...gapClaims.map((c) => c.text),
    ]),
    trendCaveat:
      "A comparison against a single previous report on one opportunity is not a market or sector trend; treat every row and finding here as a single-opportunity observation.",
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export type DeliverableKind = "watchlist" | "competitor" | "weekly";
export type Deliverable =
  WatchlistDeliverable | CompetitorDeliverable | WeeklyDeliverable;

export function compileDeliverable(
  kind: DeliverableKind,
  input: DeliverableInput,
): Deliverable {
  const parsed = DeliverableInputSchema.parse(input);
  const assessment = parsed.payload.assessment;
  const intelligence = parseIntelligence(input.payload.intelligence);
  const sourceInventory = parseSourceInventory(input.payload.sourceInventory);
  const previousAssessment = input.previous
    ? AssessmentSchema.parse(input.previous.assessment)
    : null;

  const base: DeliverableCommon = {
    reportId: input.reportId,
    intelligenceId: input.intelligenceId,
    generatedAt: input.generatedAt,
    opportunity: input.opportunity,
    cutoff: input.payload.cutoff,
    evaluation: input.payload.evaluation,
    canonicalVerdict: canonicalVerdict(assessment),
    reviewTriggers: reviewTriggers(assessment, intelligence.incumbent),
    evidence: evidenceRefs(assessment),
    claims: claimRefs(assessment),
    limitations: [...input.payload.limitations, ...intelligence.limitations],
    sourceInventory,
    missingEnrichment: [],
  };

  if (kind === "watchlist")
    return compileWatchlist(base, assessment, intelligence);
  if (kind === "competitor")
    return compileCompetitor(base, assessment, intelligence);
  return compileWeekly(
    base,
    assessment,
    intelligence,
    previousAssessment,
    input.previous ?? null,
  );
}
