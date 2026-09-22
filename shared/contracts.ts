import { z } from "zod";
export const id = z.string().uuid();
export const OpportunityInput = z
  .object({
    title: z.string().min(3).max(300),
    buyer: z.string().min(2).max(200),
    noticeId: z.string().min(1).max(150),
    category: z.string().max(200).default("unspecified"),
    cutoff: z.string().date(),
    clientId: id.nullable().default(null),
    noticeUrl: z.string().url().nullable().default(null),
    closingAt: z.string().datetime({ offset: true }).nullable().default(null),
    dateStatus: z
      .enum(["known", "not_published", "not_applicable"])
      .default("not_published"),
    provenance: z.enum(["public", "synthetic"]).default("public"),
  })
  .strict()
  .refine(
    (x) => x.dateStatus !== "known" || x.closingAt !== null,
    "Known deadline needs a source timestamp and timezone",
  );
export const ClientInput = z
  .object({
    legalName: z.string().min(2).max(200),
    capabilities: z.string().max(10000),
    certifications: z.string().max(5000).default(""),
    currentContracts: z.string().max(5000).default(""),
    effectiveDate: z.string().date(),
  })
  .strict();
export const SourceInput = z
  .object({
    name: z.string().min(1).max(250),
    mediaType: z.string().max(150),
    text: z
      .string()
      .max(20 * 1024 * 1024)
      .optional(),
    url: z.string().url().optional(),
    purpose: z.enum([
      "notice",
      "context",
      "awards",
      "rfp",
      "addendum",
      "client",
    ]),
    required: z.boolean().default(true),
    publishedAt: z.string().date().nullable().default(null),
    provenance: z.enum(["public", "synthetic"]),
    rightsConfirmed: z.literal(true),
  })
  .strict();
const Evidence = z
  .object({
    id: z.string().min(1),
    unitId: id,
    kind: z.enum(["quote", "value", "description"]),
    excerpt: z.string().min(1).max(2500),
  })
  .strict();
const Claim = z
  .object({
    id: z.string().min(1),
    key: z.string().min(1),
    text: z.string().min(1).max(2000),
    kind: z.enum(["fact", "inference", "advice", "gap"]),
    provenance: z.enum(["sourced", "derived", "assessed", "gap"]),
    evidenceIds: z.array(z.string()),
    premiseIds: z.array(z.string()),
    assumptions: z.array(z.string()),
    duplicateOf: z.string().nullable(),
    adverseEntity: z.string().nullable(),
  })
  .strict();
const ContextualUncertainty = z
  .object({
    event: z.string().nullable(),
    timeframe: z.string().nullable(),
    conditions: z.array(z.string()),
    gap: z.string(),
  })
  .strict();
export const AssessmentSchema = z
  .object({
    schemaVersion: z.literal("1"),
    evidence: z.array(Evidence).max(100),
    claims: z.array(Claim).min(1).max(60),
    verdict: z
      .object({
        recommendation: z.enum([
          "Favourable",
          "Provisional",
          "Unfavourable",
          "NO-GO",
        ]),
        rationaleClaimIds: z.array(z.string()).min(1),
        disqualifier: z
          .enum([
            "closed",
            "cancelled",
            "mandatory_failure",
            "outside_declared_scope",
          ])
          .nullable(),
        disqualifierEvidenceIds: z.array(z.string()),
        clientEvidenceIds: z.array(z.string()),
        posture: z.enum(["defend", "challenge", "explore", "unknown"]),
        nextActionClaimId: z.string(),
        uncertainty: ContextualUncertainty,
      })
      .strict(),
    summary: z
      .object({
        what: z.string(),
        decidingFactor: z.string(),
        nextAction: z.string(),
        biggestGap: z.string(),
      })
      .strict(),
    centreOfGravity: z
      .object({
        factorClaimId: z.string(),
        implicationClaimId: z.string(),
        actionClaimId: z.string(),
      })
      .strict(),
    scenarios: z
      .array(
        z
          .object({
            name: z.string(),
            outcomeClaimId: z.string(),
            assumptions: z.array(z.string()),
            indicators: z.array(z.string()).min(1),
          })
          .strict(),
      )
      .length(3),
    hypotheses: z
      .object({
        event: z.string(),
        timeframe: z.string(),
        conditions: z.array(z.string()),
        exclusivityRationale: z.string(),
        exhaustivenessRationale: z.string(),
        alternatives: z
          .array(
            z
              .object({
                id: z.string(),
                statement: z.string(),
                supportingEvidenceIds: z.array(z.string()),
                contradictingEvidenceIds: z.array(z.string()),
                diagnosticRationale: z.string(),
              })
              .strict(),
          )
          .min(2)
          .max(5),
        nextCollection: z.string(),
        numericalPolicy: z.literal("pending"),
      })
      .strict(),
    risks: z
      .array(
        z
          .object({
            id: z.string(),
            claimId: z.string(),
            likelihood: z.enum([
              "unassessed",
              "possible",
              "likely",
              "unlikely",
            ]),
            likelihoodRationale: z.string(),
            impact: z.string(),
            trigger: z.string(),
            mitigationClaimId: z.string(),
          })
          .strict(),
      )
      .min(1)
      .max(10),
    limitations: z.array(z.string()).min(1),
  })
  .strict();
export type Assessment = z.infer<typeof AssessmentSchema>;
export const SupportSchema = z
  .object({
    sectionIssues: z.array(z.string()),
    checks: z.array(
      z
        .object({
          claimId: z.string(),
          support: z.enum([
            "supported",
            "partly_supported",
            "unsupported",
            "contradicted",
          ]),
          rationale: z.string(),
          factualIntegrity: z.enum([
            "no_unsupported_fact_identified",
            "unsupported_fact_present",
          ]),
        })
        .strict(),
    ),
  })
  .strict();
export type SupportCheck = z.infer<typeof SupportSchema>["checks"][number];
export const RequirementsSchema = z
  .object({
    judgments: z.array(
      z
        .object({
          candidateId: z.string(),
          requirements: z.array(
            z
              .object({
                text: z.string(),
                quote: z.string(),
                mandatory: z.boolean(),
                rationale: z.string(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();
export type VerifiedReport = {
  assessment: Assessment;
  support: SupportCheck[];
  quoteStates: Record<string, string>;
  summarySentences: string[];
  limitations: string[];
  requirements: unknown;
  method: { schema: string; prompt: string; transport: string };
  evaluation: "live" | "fixture";
};
