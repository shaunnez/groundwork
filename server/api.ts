import {
  createCollection,
  readCollection,
  deliverCollection,
} from "./collections.ts";
import {
  DeliverableKind,
  materialise,
  reportFreshness,
  recordReview,
  deliverLocal,
} from "./operations.ts";
import { research } from "./research.ts";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import type { Readable } from "node:stream";
import staticFiles from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import { randomUUID, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { loadConfig, type Config } from "./config.ts";
import { database, transaction, type Database } from "./db.ts";
import { ObjectStore, hash } from "./storage.ts";
import {
  OpportunityInput,
  ClientInput,
  SourceInput,
  id,
} from "../shared/contracts.ts";
import {
  SourceMetadata,
  editSource,
  setSourceArchived,
} from "./source-management.ts";
import { ingest } from "./sources.ts";
import {
  declareTenderPack,
  importTenderFile,
  packDetail,
  reviewTenderDrawing,
} from "./tender-packs.ts";
import { fetchSource } from "./fetch-source.ts";
import {
  completeCoverage,
  searchUnits,
  type Coverage,
  type SourceUnit,
} from "./domain/evidence.ts";
import { compareReports } from "./comparison.ts";
import {
  startGetsRun,
  getsStatus,
  cancelGetsRun,
  retryGetsRun,
} from "./gets/intake.ts";
import {
  backfillMappings,
  correctMapping,
  mappingQueue,
  markMappingReviewed,
} from "./gets/mapping.ts";
import {
  backfillSectors,
  classifyOpportunity,
  correctSector,
  createSector,
  editSector,
  sectorSettings,
} from "./sectors.ts";
import {
  hasUnmarkedLegacyRevisions,
  runReadinessIssues,
} from "./run-readiness.ts";
import { preflightAnalysisAsync } from "./analysis-pipeline.ts";
import { streamSourceUnits } from "./analysis-engine.ts";
declare module "fastify" {
  interface FastifyRequest {
    accountId: string;
    userId: string;
    role: "owner" | "reviewer";
  }
}
const params = z.object({ id });
const asId = (value: unknown) => params.parse(value).id;
export async function createApi(config: Config, db: Database) {
  const app = Fastify({ logger: false, bodyLimit: 21 * 1024 * 1024 });
  const store = new ObjectStore(config.storageRoot);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(multipart, {
    limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  });
  app.addContentTypeParser("application/octet-stream", (req, payload, done) =>
    done(null, payload),
  );
  app.decorateRequest("accountId", "");
  app.decorateRequest("userId", "");
  app.decorateRequest("role", "reviewer");
  app.setErrorHandler((error, _req, reply) => {
    const e = error as Error;
    const status =
      e instanceof z.ZodError
        ? 400
        : "statusCode" in e
          ? Number(e.statusCode)
          : 400;
    reply.code(status >= 400 && status < 600 ? status : 400).send({
      error:
        e instanceof z.ZodError
          ? e.issues.map((i) => i.message).join("; ")
          : e.message,
    });
  });
  app.addHook("onRequest", async (req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "same-origin");
    reply.header("X-Frame-Options", "DENY");
    if (req.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
    if (req.url === "/api/health" && req.method === "GET") return;
    const host = req.headers.host;
    if (
      config.publicOrigin
        ? host !== new URL(config.publicOrigin).host
        : host && !["127.0.0.1", "localhost"].includes(host.split(":")[0])
    ) {
      return reply.code(403).send({ error: "Host denied" });
    }
    const origin = req.headers.origin;
    if (origin) {
      let u: URL;
      try {
        u = new URL(origin);
      } catch {
        return reply.code(403).send({ error: "Origin denied" });
      }
      if (
        config.publicOrigin
          ? origin !== config.publicOrigin
          : !["127.0.0.1", "localhost"].includes(u.hostname) ||
            ![String(config.port), "4318", "5178"].includes(u.port)
      )
        return reply.code(403).send({ error: "Origin denied" });
    }
    if (
      config.publicOrigin &&
      !["GET", "HEAD"].includes(req.method) &&
      origin !== config.publicOrigin
    )
      return reply.code(403).send({ error: "Origin required" });
    if (!req.url.startsWith("/api/")) return;
    if (req.method !== "GET" && req.headers["x-groundwork-request"] !== "local")
      return reply.code(403).send({ error: "Missing request protection" });
    if (req.url === "/api/health" || req.url === "/api/session") return;
    const token = req.cookies.groundwork_session;
    if (!token)
      return reply
        .code(401)
        .send({ error: "Sign in to your evaluation workspace first" });
    const r = await db.query(
      "SELECT s.account_id,s.user_id,m.role FROM sessions s JOIN memberships m ON m.user_id=s.user_id AND m.account_id=s.account_id WHERE token_hash=$1 AND expires_at>now()",
      [hash(token)],
    );
    if (!r.rowCount) return reply.code(401).send({ error: "Session expired" });
    req.accountId = r.rows[0].account_id;
    req.userId = r.rows[0].user_id;
    req.role = r.rows[0].role;
    if (
      req.method !== "GET" &&
      req.role !== "owner" &&
      req.url !== "/api/sign-out" &&
      !/^\/api\/reports\/[a-f0-9-]+\/(feedback|review|decision|outcomes)$/.test(
        req.url,
      ) &&
      !/^\/api\/opportunities\/[a-f0-9-]+\/search$/.test(req.url)
    )
      return reply.code(403).send({
        error:
          "Review access cannot start generation, research or administration. Ask the workspace owner.",
      });
  });
  app.get("/api/health", async () => ({
    ok: true,
    mode: config.publicOrigin ? "hosted-private-pilot" : "local-internal",
    modelEnabled: config.claudeSubscriptionApproved,
  }));
  app.post(
    "/api/session",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const input = z.object({ key: z.string() }).strict().parse(req.body);
      const matches = (key: string | undefined) => {
        if (!key) return false;
        const a = Buffer.from(input.key),
          b = Buffer.from(key);
        return a.length === b.length && timingSafeEqual(a, b);
      };
      const owner = matches(config.sessionSecret);
      if (!owner && !matches(config.reviewerSecret))
        return reply.code(403).send({ error: "Invalid access key" });
      const token = randomBytes(32).toString("hex");
      const accountId = "11111111-1111-4111-8111-111111111111",
        userId = owner
          ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
          : "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
      await db.query(
        "INSERT INTO sessions(token_hash,user_id,account_id,expires_at) VALUES($1,$2,$3,now()+interval '12 hours')",
        [hash(token), userId, accountId],
      );
      reply.setCookie("groundwork_session", token, {
        httpOnly: true,
        sameSite: "strict",
        secure: !!config.publicOrigin,
        path: "/",
        maxAge: 43200,
      });
      return { accountId };
    },
  );
  app.get("/api/bootstrap", async (req) => {
    const [opportunities, clients, reviews, budget] = await Promise.all([
      db.query(
        `SELECT o.*,a.sector_id AS groundwork_sector_id,coalesce(g.name,'Unknown') AS groundwork_sector_name,
                coalesce(a.method,'unrecorded') AS groundwork_sector_method,
                b.payload AS notice_brief,b.source_id AS notice_brief_source_id
         FROM opportunities o LEFT JOIN opportunity_sectors a ON a.opportunity_id=o.id AND a.account_id=o.account_id
         LEFT JOIN groundwork_sectors g ON g.id=a.sector_id AND g.account_id=a.account_id
         LEFT JOIN gets_notices n ON n.opportunity_id=o.id AND n.account_id=o.account_id
         LEFT JOIN LATERAL (SELECT payload,source_id FROM gets_notice_briefs WHERE account_id=o.account_id AND revision_id=n.current_revision_id ORDER BY created_at DESC LIMIT 1) b ON true
         WHERE o.account_id=$1 AND o.archived_at IS NULL ORDER BY o.created_at DESC`,
        [req.accountId],
      ),
      db.query("SELECT * FROM clients WHERE account_id=$1", [req.accountId]),
      db.query(
        "SELECT v.*,r.kind,r.opportunity_id,o.title,o.metadata FROM reviews v JOIN reports r ON r.id=v.report_id JOIN opportunities o ON o.id=r.opportunity_id WHERE v.account_id=$1 AND o.archived_at IS NULL ORDER BY v.created_at DESC",
        [req.accountId],
      ),
      db.query(
        "SELECT allowance,reserved,spent FROM budgets WHERE id='goal-firecrawl'",
      ),
    ]);
    return {
      opportunities: opportunities.rows,
      clients: clients.rows,
      reviews: reviews.rows,
      budget: budget.rows[0],
      mode: "local-internal",
      role: req.role,
      modelEnabled: config.claudeSubscriptionApproved,
      researchEnabled:
        config.firecrawlIncludedConfirmed && !!config.firecrawlCredentialFile,
    };
  });
  app.get("/api/gets/status", async (req) =>
    getsStatus(db, config, req.accountId),
  );
  app.post("/api/gets/runs", async (req) =>
    startGetsRun(db, req.accountId, req.userId, req.body),
  );
  app.post("/api/gets/runs/:id/cancel", async (req) =>
    cancelGetsRun(db, req.accountId, asId(req.params)),
  );
  app.post("/api/gets/runs/:id/retry", async (req) =>
    retryGetsRun(db, req.accountId, asId(req.params)),
  );
  app.get("/api/gets/mappings", async (req) => {
    const { filter, page } = z
      .object({
        filter: z
          .enum([
            "all",
            "missing",
            "changed",
            "conflicting",
            "unusual",
            "unknown-sector",
            "reviewed",
          ])
          .default("all"),
        page: z.coerce.number().int().min(1).max(100).default(1),
      })
      .parse(req.query);
    return mappingQueue(db, req.accountId, filter, page);
  });
  app.post("/api/gets/mappings/backfill", async (req) => {
    const { limit } = z
      .object({ limit: z.number().int().min(1).max(25).default(25) })
      .parse(req.body ?? {});
    return backfillMappings(db, store, req.accountId, limit);
  });
  app.post("/api/gets/mappings/:id/correct", async (req) =>
    correctMapping(db, req.accountId, asId(req.params), req.userId, req.body),
  );
  app.post("/api/gets/mappings/:id/review", async (req) => {
    const { reason } = z
      .object({ reason: z.string() })
      .strict()
      .parse(req.body);
    return markMappingReviewed(
      db,
      req.accountId,
      asId(req.params),
      req.userId,
      reason,
    );
  });
  app.get("/api/sectors", async (req) => sectorSettings(db, req.accountId));
  app.post("/api/sectors", async (req) =>
    createSector(db, req.accountId, req.body),
  );
  app.post("/api/sectors/:id", async (req) =>
    editSector(db, req.accountId, asId(req.params), req.body),
  );
  app.post("/api/sectors/backfill", async (req) => {
    const { limit } = z
      .object({ limit: z.number().int().min(1).max(25).default(25) })
      .parse(req.body ?? {});
    return backfillSectors(db, req.accountId, limit);
  });
  app.post("/api/opportunities/:id/sector", async (req) =>
    correctSector(db, req.accountId, asId(req.params), req.userId, req.body),
  );
  app.post("/api/clients", async (req) => {
    const x = ClientInput.parse(req.body),
      clientId = randomUUID();
    await db.query(
      "INSERT INTO clients(id,account_id,legal_name,context) VALUES($1,$2,$3,$4)",
      [clientId, req.accountId, x.legalName, { ...x, origin: "user-declared" }],
    );
    return { id: clientId };
  });
  app.post("/api/sign-out", async (req, reply) => {
    await db.query("DELETE FROM sessions WHERE token_hash=$1", [
      hash(req.cookies.groundwork_session!),
    ]);
    reply.clearCookie("groundwork_session", { path: "/" });
    return { ok: true };
  });
  app.get("/api/report-library", async (req) => ({
    reports: (
      await db.query(
        `SELECT r.id,r.opportunity_id,r.kind,r.created_at,r.parent_report_id,
       r.payload->>'cutoff' AS cutoff,r.payload->'assessment'->'verdict' AS verdict,
       r.payload->'summarySentences' AS summary,r.payload->'intelligence'->'entities' AS entities,
       r.payload->>'evaluation' AS evaluation,v.state AS review_state
       FROM reports r JOIN opportunities o ON o.id=r.opportunity_id AND o.account_id=r.account_id
       LEFT JOIN reviews v ON v.report_id=r.id AND v.account_id=r.account_id
       WHERE r.account_id=$1 AND o.archived_at IS NULL ORDER BY r.created_at DESC,r.id`,
        [req.accountId],
      )
    ).rows,
  }));
  app.post("/api/opportunities", async (req) => {
    const x = OpportunityInput.parse(req.body),
      opportunityId = randomUUID();
    await transaction(db, async (c) => {
      await c.query(
        "INSERT INTO opportunities(id,account_id,client_id,title,buyer,notice_id,cutoff,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          opportunityId,
          req.accountId,
          x.clientId,
          x.title,
          x.buyer,
          x.noticeId,
          x.cutoff,
          x,
        ],
      );
      await classifyOpportunity(
        c,
        req.accountId,
        opportunityId,
        null,
        x.title,
        null,
      );
    });
    return { id: opportunityId };
  });
  const owned = async (accountId: string, opportunityId: string) => {
    const r = await db.query(
      "SELECT * FROM opportunities WHERE id=$1 AND account_id=$2",
      [opportunityId, accountId],
    );
    if (!r.rowCount)
      throw Object.assign(new Error("Not found"), { statusCode: 404 });
    return r.rows[0];
  };
  app.get("/api/runs/:id/analysis-items", async (req) => {
    const runId = asId(req.params);
    const query = z
      .object({
        kind: z.enum(["fact", "requirement"]).default("requirement"),
        after: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
      })
      .parse(req.query);
    const result = await db.query(
      `SELECT i.item_id AS "itemId",i.unit_id AS "unitId",i.source_id AS "sourceId",i.location,
              i.text_content AS text,i.quote,i.mandatory,i.contradiction
       FROM analysis_items i JOIN runs r ON r.id=i.run_id AND r.account_id=i.account_id
       WHERE i.run_id=$1 AND i.account_id=$2 AND i.kind=$3 AND i.item_id>coalesce($4,'')
       ORDER BY i.item_id LIMIT 101`,
      [runId, req.accountId, query.kind, query.after ?? null],
    );
    const page = result.rows.slice(0, 100);
    return {
      items: page,
      next: result.rows.length > 100 ? page.at(-1)!.itemId : null,
    };
  });
  app.get("/api/opportunities/:id/analysis-preflight", async (req) => {
    const opportunityId = asId(req.params);
    await owned(req.accountId, opportunityId);
    const [sources, usage] = await Promise.all([
      db.query(
        "SELECT id,name,reader,required,coverage,hash FROM active_sources WHERE account_id=$1 AND opportunity_id=$2 ORDER BY id",
        [req.accountId, opportunityId],
      ),
      db.query(
        "SELECT avg((usage->>'apiEquivalentUsd')::numeric) AS average FROM provider_calls WHERE provider='claude-subscription' AND status='succeeded' AND usage->>'apiEquivalentUsd' ~ '^[0-9]+(\\.[0-9]+)?$'",
      ),
    ]);
    const plan = await preflightAnalysisAsync(
      streamSourceUnits(
        db,
        req.accountId,
        sources.rows.map((source) => source.id),
      ),
    );
    const characters = plan.characters;
    const gaps = sources.rows
      .filter((source) => source.required && !completeCoverage(source.coverage))
      .map((source) => ({
        sourceId: source.id,
        name: source.name,
        reader: source.reader,
        coverage: source.coverage,
      }));
    const average =
      usage.rows[0]?.average === null ? null : Number(usage.rows[0].average);
    return {
      ...plan,
      sourceCount: sources.rows.length,
      unitCount: plan.unitCount,
      characters,
      readerGaps: gaps,
      callAllowance: config.analysisMaxModelCalls,
      estimatedApiEquivalentUsd:
        average === null
          ? null
          : Number((average * plan.estimatedCalls).toFixed(2)),
      estimateBasis:
        "Historical successful Claude subscription receipts; API equivalent only, not actual subscription billing",
      canRunFull:
        gaps.length === 0 &&
        plan.estimatedCalls <= config.analysisMaxModelCalls &&
        config.claudeSubscriptionApproved,
    };
  });
  app.get("/api/opportunities/:id", async (req) => {
    const opportunityId = asId(req.params),
      opportunity = await owned(req.accountId, opportunityId);
    const [sources, runs, reports, history, packs, firmLink] =
      await Promise.all([
        db.query(
          "SELECT id,name,media_type,origin,published_at,purpose,required,hash,reader,state,coverage,provenance,created_at FROM active_sources WHERE account_id=$1 AND opportunity_id=$2 ORDER BY created_at",
          [req.accountId, opportunityId],
        ),
        db.query(
          "SELECT * FROM runs WHERE account_id=$1 AND opportunity_id=$2 ORDER BY created_at DESC",
          [req.accountId, opportunityId],
        ),
        db.query(
          "SELECT id,kind,created_at,parent_report_id,intelligence_id,payload FROM reports WHERE account_id=$1 AND opportunity_id=$2 ORDER BY created_at DESC",
          [req.accountId, opportunityId],
        ),
        db.query(
          "SELECT s.id,s.name,s.media_type,s.coverage,s.state,s.purpose,s.provenance,s.published_at,s.required,l.status,l.successor_id,l.reason,l.updated_at FROM sources s JOIN source_lifecycle l ON l.source_id=s.id AND l.account_id=s.account_id WHERE s.account_id=$1 AND s.opportunity_id=$2 AND l.status<>'active' ORDER BY l.updated_at DESC",
          [req.accountId, opportunityId],
        ),
        db.query(
          "SELECT id FROM tender_packs WHERE opportunity_id=$1 AND account_id=$2 ORDER BY created_at DESC LIMIT 5",
          [opportunityId, req.accountId],
        ),
        db.query(
          "SELECT l.client_id,l.effective_date,l.source,l.created_at,c.legal_name FROM opportunity_firm_links l JOIN clients c ON c.id=l.client_id AND c.account_id=l.account_id WHERE l.opportunity_id=$1 AND l.account_id=$2 ORDER BY l.created_at DESC LIMIT 1",
          [opportunityId, req.accountId],
        ),
      ]);
    const latestRun = runs.rows[0];
    if (latestRun) {
      const sourceIds = latestRun.manifest?.sourceIds as string[] | undefined;
      const [
        stageRows,
        callRows,
        dispatchRow,
        frozenSources,
        characters,
        analysisRows,
      ] = await Promise.all([
        db.query(
          "SELECT name,state,started_at,finished_at,error FROM stages WHERE run_id=$1 AND account_id=$2 ORDER BY started_at",
          [latestRun.id, req.accountId],
        ),
        db.query(
          "SELECT status,usage FROM provider_calls WHERE run_id=$1 AND account_id=$2 ORDER BY created_at",
          [latestRun.id, req.accountId],
        ),
        db.query("SELECT attempts,lease_until FROM dispatch WHERE run_id=$1", [
          latestRun.id,
        ]),
        sourceIds?.length
          ? db.query(
              "SELECT name,reader,required,coverage,published_at FROM sources WHERE account_id=$1 AND id=ANY($2::uuid[])",
              [req.accountId, sourceIds],
            )
          : Promise.resolve({ rows: [] }),
        sourceIds?.length
          ? db.query(
              "SELECT coalesce(sum(length(text_content)),0)::int AS count FROM units WHERE account_id=$1 AND source_id=ANY($2::uuid[])",
              [req.accountId, sourceIds],
            )
          : Promise.resolve({ rows: [{ count: 0 }] }),
        db.query(
          "SELECT state,count(*)::int AS count FROM analysis_segments WHERE run_id=$1 AND account_id=$2 GROUP BY state",
          [latestRun.id, req.accountId],
        ),
      ]);
      const usages = callRows.rows.map((row) =>
        Number(row.usage?.apiEquivalentUsd),
      );
      latestRun.progress = {
        stages: stageRows.rows,
        workerAttempts: dispatchRow.rows[0]?.attempts ?? 0,
        leaseUntil: dispatchRow.rows[0]?.lease_until ?? null,
        modelCalls: callRows.rowCount,
        preflight: latestRun.manifest.analysisPreflight ?? null,
        analysisCoverage: Object.fromEntries(
          analysisRows.rows.map((r) => [r.state, r.count]),
        ),
        apiEquivalentUsd: usages.reduce(
          (total, value) => total + (Number.isFinite(value) ? value : 0),
          0,
        ),
        readinessIssues: sourceIds?.length
          ? runReadinessIssues(
              frozenSources.rows,
              latestRun.manifest.cutoff,
              Number(characters.rows[0].count),
              { allowPartial: latestRun.manifest.tenderPack?.narrowOverride },
            )
          : [],
        modelEnabled: config.claudeSubscriptionApproved,
        resumable:
          ["failed", "budget-blocked"].includes(latestRun.state) &&
          config.claudeSubscriptionApproved &&
          !callRows.rows.some((row) =>
            ["failed", "reserved", "uncertain"].includes(row.status),
          ),
      };
    }
    return {
      sourceHistory: history.rows,
      opportunity,
      sources: sources.rows,
      runs: runs.rows,
      reports: reports.rows,
      tenderPacks: await Promise.all(
        packs.rows.map((p) => packDetail(db, req.accountId, p.id)),
      ),
      firmLink: firmLink.rows[0] ?? null,
    };
  });
  app.post("/api/opportunities/:id/firm", async (req) => {
    const opportunityId = asId(req.params);
    const { clientId } = z.object({ clientId: id }).strict().parse(req.body);
    return transaction(db, async (c) => {
      const opportunity = await c.query(
        "SELECT client_id FROM opportunities WHERE id=$1 AND account_id=$2 FOR UPDATE",
        [opportunityId, req.accountId],
      );
      if (!opportunity.rowCount) throw new Error("Opportunity not found");
      const client = await c.query(
        "SELECT id,context FROM clients WHERE id=$1 AND account_id=$2",
        [clientId, req.accountId],
      );
      if (!client.rowCount)
        throw new Error("Firm profile not found in this account");
      if (opportunity.rows[0].client_id === clientId)
        return { clientId, unchanged: true };
      const effectiveDate = z
        .string()
        .date()
        .parse(client.rows[0].context.effectiveDate);
      const source = z
        .string()
        .trim()
        .min(1)
        .max(200)
        .parse(client.rows[0].context.origin ?? "user-declared");
      await c.query(
        "UPDATE opportunities SET client_id=$3 WHERE id=$1 AND account_id=$2",
        [opportunityId, req.accountId, clientId],
      );
      await c.query(
        "INSERT INTO opportunity_firm_links(id,account_id,opportunity_id,client_id,actor_id,effective_date,source) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          randomUUID(),
          req.accountId,
          opportunityId,
          clientId,
          req.userId,
          effectiveDate,
          source,
        ],
      );
      return { clientId, effectiveDate, source };
    });
  });
  app.post("/api/opportunities/:id/tender-packs", async (req) =>
    declareTenderPack(
      db,
      req.accountId,
      asId(req.params),
      req.userId,
      req.body,
    ),
  );
  app.get("/api/tender-packs/:id", async (req) =>
    packDetail(db, req.accountId, asId(req.params)),
  );
  app.put("/api/tender-packs/:id/files/:fileId", async (req) => {
    const fileId = z
      .string()
      .regex(/^\d{1,20}$/)
      .parse((req.params as { fileId: string }).fileId);
    return importTenderFile(
      db,
      store,
      req.accountId,
      asId(req.params),
      fileId,
      req.userId,
      req.body as Readable,
    );
  });
  app.post(
    "/api/tender-packs/:id/files/:fileId/drawing-review",
    async (req) => {
      const fileId = z
        .string()
        .regex(/^\d{1,20}$/)
        .parse((req.params as { fileId: string }).fileId);
      const { note } = z.object({ note: z.string() }).strict().parse(req.body);
      return reviewTenderDrawing(
        db,
        req.accountId,
        asId(req.params),
        fileId,
        req.userId,
        note,
      );
    },
  );
  app.post("/api/opportunities/:id/sources", async (req) => {
    const opportunityId = asId(req.params);
    await owned(req.accountId, opportunityId);
    const x = SourceInput.parse(req.body);
    if (!x.text && !x.url) throw new Error("Text or permitted URL required");
    const acquired = x.url
      ? await fetchSource(x.url)
      : {
          body: Buffer.from(x.text!, "utf8"),
          mediaType: x.mediaType,
          url: undefined,
        };
    return ingest(db, store, req.accountId, opportunityId, {
      ...x,
      body: acquired.body,
      mediaType: acquired.mediaType,
      origin: acquired.url,
      actorId: req.userId,
    });
  });
  app.post("/api/opportunities/:id/upload", async (req) => {
    const opportunityId = asId(req.params);
    await owned(req.accountId, opportunityId);
    const file = await req.file();
    if (!file) throw new Error("Choose a file");
    const body = await file.toBuffer();
    const field = (name: string) => {
      const f = file.fields[name];
      return f && !Array.isArray(f) && f.type === "field" ? f.value : undefined;
    };
    const x = SourceInput.parse({
      name: file.filename,
      mediaType: file.mimetype,
      purpose: field("purpose"),
      required: field("required") !== "false",
      publishedAt: field("publishedAt") || null,
      provenance: field("provenance"),
      rightsConfirmed: field("rightsConfirmed") === "true",
    });
    const replacesId = field("replacesId")
      ? id.parse(field("replacesId"))
      : undefined;
    const reason = replacesId
      ? z.string().trim().min(3).max(1000).parse(field("reason"))
      : undefined;
    return ingest(db, store, req.accountId, opportunityId, {
      ...x,
      body,
      replacesId,
      reason,
      actorId: req.userId,
    });
  });
  app.post("/api/sources/:id/edit", async (req) =>
    editSource(
      db,
      store,
      req.accountId,
      asId(req.params),
      req.userId,
      SourceMetadata.parse(req.body),
    ),
  );
  app.post("/api/sources/:id/archive", async (req) => {
    const x = z
      .object({
        archived: z.boolean(),
        reason: z.string().trim().min(3).max(1000),
      })
      .strict()
      .parse(req.body);
    return setSourceArchived(
      db,
      req.accountId,
      asId(req.params),
      req.userId,
      x.archived,
      x.reason,
    );
  });
  app.get("/api/units/:id", async (req, reply) => {
    const r = await db.query(
      'SELECT id,source_id AS "sourceId" FROM units WHERE id=$1 AND account_id=$2',
      [asId(req.params), req.accountId],
    );
    if (!r.rowCount) return reply.code(404).send({ error: "Not found" });
    return r.rows[0];
  });
  app.get("/api/sources/:id", async (req, reply) => {
    const sourceId = asId(req.params);
    const r = await db.query(
      "SELECT id,name,media_type,origin,reader,state,coverage,provenance,purpose,published_at,required FROM sources WHERE id=$1 AND account_id=$2",
      [sourceId, req.accountId],
    );
    if (!r.rowCount) return reply.code(404).send({ error: "Not found" });
    const units = await db.query(
      'SELECT id,source_id AS "sourceId",ordinal,location,text_content AS text,geometry FROM units WHERE source_id=$1 AND account_id=$2 ORDER BY ordinal',
      [sourceId, req.accountId],
    );
    return { ...r.rows[0], units: units.rows };
  });
  app.get("/api/sources/:id/download", async (req, reply) => {
    const r = await db.query(
      "SELECT object_ref,name,hash FROM sources WHERE id=$1 AND account_id=$2",
      [asId(req.params), req.accountId],
    );
    if (!r.rowCount) return reply.code(404).send({ error: "Not found" });
    reply
      .header(
        "Content-Disposition",
        `attachment; filename="${r.rows[0].name.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
      )
      .header("X-Content-Type-Options", "nosniff")
      .type("application/octet-stream");
    return reply.send(
      await store.verifiedStream(
        req.accountId,
        r.rows[0].object_ref,
        r.rows[0].hash,
      ),
    );
  });
  app.post("/api/opportunities/:id/search", async (req) => {
    const opportunityId = asId(req.params);
    await owned(req.accountId, opportunityId);
    const { query } = z
      .object({ query: z.string().min(1).max(200) })
      .parse(req.body);
    const src = await db.query(
      "SELECT id,coverage FROM active_sources WHERE opportunity_id=$1 AND account_id=$2",
      [opportunityId, req.accountId],
    );
    const result = [];
    for (const s of src.rows) {
      const u = await db.query(
        'SELECT id,source_id AS "sourceId",ordinal,location,text_content AS text FROM units WHERE source_id=$1 AND account_id=$2 ORDER BY ordinal',
        [s.id, req.accountId],
      );
      result.push({
        sourceId: s.id,
        ...searchUnits(u.rows as SourceUnit[], query, s.coverage as Coverage),
      });
    }
    const state = result.some((s) => s.state === "found")
      ? "found"
      : result.length && result.every((s) => s.state === "not_found")
        ? "not_found"
        : "not_searched";
    const record = {
      state,
      sources: result,
      scope:
        "All currently admitted source units; literal case-insensitive search",
    };
    await db.query(
      "INSERT INTO searches(id,account_id,opportunity_id,query,result) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), req.accountId, opportunityId, query, record],
    );
    return record;
  });
  app.post("/api/opportunities/:id/research", async (req) => {
    const opportunityId = asId(req.params);
    const opportunity = await owned(req.accountId, opportunityId);
    const x = z
      .object({ query: z.string().min(3).max(300) })
      .strict()
      .parse(req.body);
    const result = await research(db, store, req.accountId, x.query, {
      includedConfirmed: config.firecrawlIncludedConfirmed,
      credentialFile: config.firecrawlCredentialFile,
    });
    await db.query(
      "INSERT INTO searches(id,account_id,opportunity_id,query,result) VALUES($1,$2,$3,$4,$5)",
      [
        randomUUID(),
        req.accountId,
        opportunity.id,
        x.query,
        {
          scope: "bounded-public-web-five-results",
          result,
          limitation:
            "Search leads only; acquire and verify permitted source documents before citing. Zero hits is not evidence of absence.",
        },
      ],
    );
    return result;
  });
  app.post("/api/opportunities/:id/runs", async (req) => {
    if (
      !config.claudeSubscriptionApproved &&
      process.env.GROUNDWORK_TEST_MODE !== "1"
    )
      throw new Error("Report generation is not enabled in this workspace");
    const opportunityId = asId(req.params);
    const input = z
      .object({
        parentReportId: id.nullable().default(null),
        cutoff: z.string().date().optional(),
        excludedSourceIds: z.array(id).max(20).default([]),
        scopeNote: z.string().max(2000).default(""),
        allowIncompleteTenderPack: z.boolean().default(false),
        localWorkerOwner: id.optional(),
      })
      .strict()
      .parse(req.body ?? {});
    if (input.localWorkerOwner && config.publicOrigin)
      throw Object.assign(
        new Error(
          "Local worker ownership is unavailable on the hosted service",
        ),
        {
          statusCode: 403,
        },
      );
    return transaction(db, async (c) => {
      const opp = await c.query(
        "SELECT * FROM opportunities WHERE id=$1 AND account_id=$2 FOR UPDATE",
        [opportunityId, req.accountId],
      );
      if (!opp.rowCount) throw new Error("Not found");
      const latestPackRow = await c.query(
        "SELECT id FROM tender_packs WHERE opportunity_id=$1 AND account_id=$2 ORDER BY created_at DESC LIMIT 1",
        [opportunityId, req.accountId],
      );
      const tenderPack = latestPackRow.rowCount
        ? await packDetail(db, req.accountId, latestPackRow.rows[0].id)
        : null;
      const currentPackFiles =
        tenderPack?.files.filter((file) => file.status === "current") ?? [];
      const allOriginalsReadableInPart =
        currentPackFiles.length > 0 &&
        currentPackFiles.every(
          (file) => file.sourceId && ["read", "partial"].includes(file.state),
        );
      const textOnlyPartial = Boolean(
        tenderPack && !tenderPack.complete && allOriginalsReadableInPart,
      );
      const allowPartial = input.allowIncompleteTenderPack || textOnlyPartial;
      if (tenderPack && !tenderPack.complete && !allowPartial)
        throw new Error(
          `Tender pack ${tenderPack.rfxId} is incomplete (${tenderPack.counts.received}/${tenderPack.counts.expected} originals, ${tenderPack.counts.readable} readable); upload or resolve every named file before an exhaustive reassessment`,
        );
      if (
        input.allowIncompleteTenderPack &&
        (!tenderPack ||
          tenderPack.complete ||
          input.scopeNote.trim().length < 30)
      )
        throw new Error(
          "A narrow incomplete-pack override requires a specific scope reason of at least 30 characters",
        );
      if (input.parentReportId) {
        const p = await c.query(
          "SELECT r.id,i.cutoff FROM reports r JOIN intelligence i ON i.id=r.intelligence_id WHERE r.id=$1 AND r.account_id=$2 AND r.opportunity_id=$3 AND r.kind='pursuit'",
          [input.parentReportId, req.accountId, opportunityId],
        );
        if (!p.rowCount) throw new Error("Parent report not found");
        if (p.rows[0].cutoff > (input.cutoff ?? opp.rows[0].cutoff))
          throw new Error(
            "A historical assessment cannot use a later report as its parent; start an independent historical assessment",
          );
      }
      const allSources = await c.query(
        "SELECT id,name,hash,required,state,published_at,purpose,reader,coverage FROM active_sources WHERE opportunity_id=$1 AND account_id=$2 ORDER BY id",
        [opportunityId, req.accountId],
      );
      if (input.excludedSourceIds.length && input.scopeNote.trim().length < 10)
        throw new Error(
          "Explain the narrower assessment scope and the exclusions",
        );
      if (
        input.excludedSourceIds.some(
          (id) => !allSources.rows.some((s) => s.id === id),
        )
      )
        throw new Error("Excluded source not found in this opportunity");
      const legacyExcludedIds = allSources.rows
        .filter(hasUnmarkedLegacyRevisions)
        .map((source) => source.id as string);
      const excludedSourceIds = [
        ...new Set([...input.excludedSourceIds, ...legacyExcludedIds]),
      ];
      const scopeNote =
        input.scopeNote.trim() ||
        (textOnlyPartial || legacyExcludedIds.length
          ? "High-level text-based assessment of readable saved content; unread visual material and unsafe legacy DOCX extraction are outside scope."
          : "");
      const sources = {
        rows: allSources.rows.filter((s) => !excludedSourceIds.includes(s.id)),
      };
      const selectedSources = await c.query(
        "SELECT name,reader,required,coverage,published_at FROM sources WHERE account_id=$1 AND id=ANY($2::uuid[])",
        [req.accountId, sources.rows.map((s) => s.id)],
      );
      const characters = await c.query(
        "SELECT coalesce(sum(length(text_content)),0)::int AS count FROM units WHERE account_id=$1 AND source_id=ANY($2::uuid[])",
        [req.accountId, sources.rows.map((s) => s.id)],
      );
      const readinessIssues = runReadinessIssues(
        selectedSources.rows,
        input.cutoff ?? opp.rows[0].cutoff,
        Number(characters.rows[0].count),
        { allowPartial },
      );
      if (readinessIssues.length)
        throw Object.assign(new Error(readinessIssues.join(" | ")), {
          statusCode: 409,
        });
      const batchEstimate = await preflightAnalysisAsync(
        streamSourceUnits(
          db,
          req.accountId,
          sources.rows.map((s) => s.id),
        ),
      );
      const segmented =
        allowPartial ||
        batchEstimate.characters > 100_000 ||
        batchEstimate.unitCount > 500;
      const candidateCount = segmented
        ? null
        : await c.query(
            "SELECT count(*)::int AS count FROM units WHERE account_id=$1 AND source_id=ANY($2::uuid[]) AND length(btrim(text_content))>0",
            [req.accountId, sources.rows.map((s) => s.id)],
          );
      const estimatedCalls = segmented
        ? batchEstimate.estimatedCalls
        : Math.ceil(candidateCount!.rows[0].count / 8) + 8;
      const historicalUsage = await c.query(
        "SELECT avg((usage->>'apiEquivalentUsd')::numeric) AS average FROM provider_calls WHERE provider='claude-subscription' AND status='succeeded' AND usage->>'apiEquivalentUsd' ~ '^[0-9]+(\\.[0-9]+)?$'",
      );
      const perCallEstimate =
        historicalUsage.rows[0]?.average === null
          ? null
          : Number(historicalUsage.rows[0].average);
      const preflight = {
        ...batchEstimate,
        estimatedCalls,
        segmented,
        callAllowance: config.analysisMaxModelCalls,
        estimatedApiEquivalentUsd:
          perCallEstimate === null
            ? null
            : Number((perCallEstimate * estimatedCalls).toFixed(2)),
        estimateBasis:
          "Historical successful Claude subscription receipts; API equivalent only, not actual subscription billing",
      };
      if (estimatedCalls > config.analysisMaxModelCalls)
        throw Object.assign(
          new Error(
            `Analysis preflight estimates ${estimatedCalls} model calls above the configured ${config.analysisMaxModelCalls}-call allowance; narrow scope or change the explicit local allowance`,
          ),
          { statusCode: 409 },
        );
      if (
        !sources.rows.some((s) => s.purpose === "notice" && s.state === "read")
      )
        throw new Error("A readable notice is required");
      const clientRow = opp.rows[0].client_id
        ? await c.query("SELECT * FROM clients WHERE id=$1 AND account_id=$2", [
            opp.rows[0].client_id,
            req.accountId,
          ])
        : { rows: [] };
      const reviewFeedback = input.parentReportId
        ? (
            await c.query(
              "SELECT target,disposition,reason FROM feedback WHERE report_id=$1 AND account_id=$2 ORDER BY created_at",
              [input.parentReportId, req.accountId],
            )
          ).rows
        : [];
      const manifest = {
        allSourceIds: allSources.rows.map((s) => s.id),
        allSourceHashes: allSources.rows.map((s) => s.hash),
        excludedSources: allSources.rows
          .filter((s) => excludedSourceIds.includes(s.id))
          .map((s) => ({
            ...s,
            exclusionReason: legacyExcludedIds.includes(s.id)
              ? "Legacy DOCX extraction cannot separate proposed wording"
              : "Owner-selected scope",
          })),
        scopeNote,
        tenderPack: tenderPack
          ? {
              id: tenderPack.id,
              rfxId: tenderPack.rfxId,
              noticeRevisionId: tenderPack.noticeRevisionId,
              observedAt: tenderPack.observedAt,
              complete: tenderPack.complete,
              files: tenderPack.files,
              narrowOverride: allowPartial,
              textOnlyPartial,
            }
          : null,
        reviewFeedback,
        client: clientRow.rows[0] ?? null,
        sourceIds: sources.rows.map((s) => s.id),
        sourceHashes: sources.rows.map((s) => s.hash),
        cutoff: input.cutoff ?? opp.rows[0].cutoff,
        metadata: {
          ...opp.rows[0].metadata,
          title: opp.rows[0].title,
          buyer: opp.rows[0].buyer,
          cutoff: input.cutoff ?? opp.rows[0].cutoff,
        },
        clientId: opp.rows[0].client_id,
        parentReportId: input.parentReportId,
        method: segmented ? "groundwork-segmented-v1" : "groundwork-v1",
        analysisPreflight: preflight,
      };
      // Usage history and operator allowance are frozen for observability, not run identity.
      const inputHash = hash(
        JSON.stringify({ ...manifest, analysisPreflight: undefined }),
      );
      const active = await c.query(
        "SELECT id FROM runs WHERE account_id=$1 AND opportunity_id=$2 AND input_hash=$3 AND state IN ('queued','running')",
        [req.accountId, opportunityId, inputHash],
      );
      if (active.rowCount) return { id: active.rows[0].id, reused: true };
      const runId = randomUUID();
      await c.query(
        "INSERT INTO runs(id,account_id,opportunity_id,input_hash,manifest,state,parent_report_id,started_at) VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $8::uuid IS NULL THEN NULL ELSE now() END)",
        [
          runId,
          req.accountId,
          opportunityId,
          inputHash,
          manifest,
          input.localWorkerOwner ? "running" : "queued",
          input.parentReportId,
          input.localWorkerOwner ?? null,
        ],
      );
      await c.query(
        "INSERT INTO dispatch(run_id,lease_owner,lease_until,attempts) VALUES($1,$2,CASE WHEN $2::uuid IS NULL THEN NULL ELSE now()+interval '45 seconds' END,CASE WHEN $2::uuid IS NULL THEN 0 ELSE 1 END)",
        [runId, input.localWorkerOwner ?? null],
      );
      return { id: runId, reused: false, preflight };
    });
  });
  app.post("/api/runs/:id/cancel", async (req) => {
    await db.query(
      "UPDATE runs SET state='cancelled',updated_at=now() WHERE id=$1 AND account_id=$2 AND state IN ('queued','running')",
      [asId(req.params), req.accountId],
    );
    return { ok: true };
  });
  app.post("/api/runs/:id/resume", async (req) => {
    const runId = asId(req.params);
    const input = z
      .object({ localWorkerOwner: id.optional() })
      .strict()
      .parse(req.body ?? {});
    if (input.localWorkerOwner && config.publicOrigin)
      throw Object.assign(
        new Error(
          "Local worker ownership is unavailable on the hosted service",
        ),
        {
          statusCode: 403,
        },
      );
    return transaction(db, async (c) => {
      const r = await c.query(
        "SELECT * FROM runs WHERE id=$1 AND account_id=$2 FOR UPDATE",
        [runId, req.accountId],
      );
      if (!r.rowCount) throw new Error("Run not found");
      const calls = await c.query(
        "SELECT id FROM provider_calls WHERE run_id=$1 AND status IN ('reserved','uncertain')",
        [runId],
      );
      if (calls.rowCount)
        throw new Error(
          "External call outcome unresolved; inspect and reconcile before resuming",
        );
      const failedCalls = await c.query(
        "SELECT id FROM provider_calls WHERE run_id=$1 AND status='failed'",
        [runId],
      );
      if (failedCalls.rowCount)
        throw new Error(
          "A provider call failed with a terminal receipt. Inspect and correct its cause, then create a new assessment; safe resume will not replay it.",
        );
      if (!["failed", "budget-blocked"].includes(r.rows[0].state))
        throw new Error("Only a failed or blocked run can resume");
      if (!config.claudeSubscriptionApproved)
        throw Object.assign(
          new Error("Claude subscription report generation is disabled here"),
          { statusCode: 409 },
        );
      const sourceIds = r.rows[0].manifest.sourceIds as string[];
      const [sources, characters] = await Promise.all([
        c.query(
          "SELECT name,reader,required,coverage,published_at FROM sources WHERE account_id=$1 AND id=ANY($2::uuid[])",
          [req.accountId, sourceIds],
        ),
        c.query(
          "SELECT coalesce(sum(length(text_content)),0)::int AS count FROM units WHERE account_id=$1 AND source_id=ANY($2::uuid[])",
          [req.accountId, sourceIds],
        ),
      ]);
      const readinessIssues = runReadinessIssues(
        sources.rows,
        r.rows[0].manifest.cutoff,
        Number(characters.rows[0].count),
        { allowPartial: r.rows[0].manifest.tenderPack?.narrowOverride },
      );
      if (readinessIssues.length)
        throw Object.assign(new Error(readinessIssues.join(" | ")), {
          statusCode: 409,
        });
      await c.query(
        "UPDATE runs SET state=$2,started_at=now(),error=null,updated_at=now() WHERE id=$1",
        [runId, input.localWorkerOwner ? "running" : "queued"],
      );
      await c.query(
        "UPDATE dispatch SET lease_owner=$2,lease_until=CASE WHEN $2::uuid IS NULL THEN NULL ELSE now()+interval '45 seconds' END,attempts=attempts+CASE WHEN $2::uuid IS NULL THEN 0 ELSE 1 END WHERE run_id=$1",
        [runId, input.localWorkerOwner ?? null],
      );
      return { ok: true };
    });
  });
  app.get("/api/reports/:id", async (req, reply) => {
    const reportId = asId(req.params);
    const r = await db.query(
      "SELECT * FROM reports WHERE id=$1 AND account_id=$2",
      [reportId, req.accountId],
    );
    if (!r.rowCount) return reply.code(404).send({ error: "Not found" });
    const report = r.rows[0];
    const cited = (report.payload.assessment?.evidence ?? []) as {
      id: string;
      unitId: string;
    }[];
    const locations = cited.length
      ? await db.query(
          `SELECT u.id,u.location,s.id AS source_id,s.name AS source_name
       FROM units u JOIN sources s ON s.id=u.source_id AND s.account_id=u.account_id
       WHERE u.id=ANY($1::uuid[]) AND u.account_id=$2`,
          [cited.map((e) => e.unitId), req.accountId],
        )
      : { rows: [] };
    const byUnit = new Map(locations.rows.map((row) => [row.id, row]));
    const citationLocations = Object.fromEntries(
      cited.map((e) => [e.id, byUnit.get(e.unitId) ?? null]),
    );
    let comparison = null;
    const parentId =
      report.parent_report_id ??
      (report.payload.sourcePursuitId
        ? (
            await db.query(
              "SELECT parent_report_id FROM reports WHERE id=$1 AND account_id=$2",
              [report.payload.sourcePursuitId, req.accountId],
            )
          ).rows[0]?.parent_report_id
        : null);
    if (parentId) {
      const old = await db.query(
        "SELECT payload FROM reports WHERE id=$1 AND account_id=$2",
        [parentId, req.accountId],
      );
      if (old.rowCount)
        comparison = compareReports(
          old.rows[0].payload.assessment,
          report.payload.assessment,
        );
    }
    const feedback = await db.query(
      "SELECT * FROM feedback WHERE report_id=$1 AND account_id=$2 ORDER BY created_at",
      [reportId, req.accountId],
    );
    const decisions = await db.query(
      "SELECT * FROM decisions WHERE report_id=$1 AND account_id=$2 ORDER BY created_at",
      [reportId, req.accountId],
    );
    const review = await db.query(
      "SELECT state,reasons,reviewer FROM reviews WHERE report_id=$1 AND account_id=$2 ORDER BY created_at DESC LIMIT 1",
      [reportId, req.accountId],
    );
    return {
      ...report,
      citationLocations,
      outcomes: (
        await db.query(
          "SELECT * FROM outcomes WHERE report_id=$1 AND account_id=$2 ORDER BY created_at",
          [reportId, req.accountId],
        )
      ).rows,
      freshness: await reportFreshness(db, req.accountId, reportId),
      reviewHistory: (
        await db.query(
          "SELECT * FROM review_events WHERE report_id=$1 AND account_id=$2 ORDER BY created_at",
          [reportId, req.accountId],
        )
      ).rows,
      review: review.rows[0] ?? null,
      comparison,
      feedback: feedback.rows,
      decisions: decisions.rows,
    };
  });
  app.post("/api/reports/:id/feedback", async (req) => {
    const x = z
      .object({
        target: z.string(),
        disposition: z.enum(["accept", "reject", "correction", "unclear"]),
        reason: z.string().min(1),
        beforeText: z.string().nullable().default(null),
        afterText: z.string().nullable().default(null),
      })
      .strict()
      .parse(req.body);
    const reportId = asId(req.params);
    await transaction(db, async (c) => {
      const r = await c.query(
        "SELECT r.payload FROM reports r JOIN opportunities o ON o.id=r.opportunity_id WHERE r.id=$1 AND r.account_id=$2 FOR UPDATE OF o",
        [reportId, req.accountId],
      );
      if (!r.rowCount) throw new Error("Report not found");
      const claim = r.rows[0].payload.assessment?.claims.find(
        (claim: { id: string }) => claim.id === x.target,
      );
      if (
        !claim &&
        ![
          "report",
          "hypotheses",
          "scenarios",
          "risks",
          "summary",
          "centreOfGravity",
        ].includes(x.target)
      )
        throw new Error("Feedback target not found in this report");
      await c.query(
        "INSERT INTO feedback(id,account_id,report_id,target,disposition,reason,before_text,after_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          randomUUID(),
          req.accountId,
          reportId,
          x.target,
          x.disposition,
          x.reason,
          claim?.text ?? null,
          x.afterText,
        ],
      );
      if (["reject", "correction"].includes(x.disposition)) {
        await c.query(
          "UPDATE reviews SET state='changes-requested' WHERE report_id=$1 AND account_id=$2",
          [reportId, req.accountId],
        );
        await c.query(
          "INSERT INTO review_events(id,account_id,report_id,actor_id,state,reason) VALUES($1,$2,$3,$4,'changes-requested',$5)",
          [randomUUID(), req.accountId, reportId, req.userId, x.reason],
        );
      }
    });
    return { ok: true };
  });
  app.post("/api/reports/:id/decision", async (req) => {
    const x = z
      .object({
        choice: z.enum(["pursue", "watch", "pass"]),
        reason: z.string().min(1),
      })
      .strict()
      .parse(req.body);
    await db.query(
      "INSERT INTO decisions(id,account_id,report_id,choice,reason) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), req.accountId, asId(req.params), x.choice, x.reason],
    );
    return { ok: true };
  });

  app.post("/api/reports/:id/outcomes", async (req) => {
    const x = z
        .object({
          event: z.string().min(3).max(1000),
          outcome: z.string().min(3).max(3000),
          observedAt: z.string().date(),
          unitId: id,
        })
        .strict()
        .parse(req.body),
      reportId = asId(req.params);
    const evidence = await db.query(
      "SELECT u.id FROM reports r JOIN units u ON u.account_id=r.account_id JOIN sources s ON s.id=u.source_id AND s.opportunity_id=r.opportunity_id WHERE r.id=$1 AND r.account_id=$2 AND u.id=$3",
      [reportId, req.accountId, x.unitId],
    );
    if (!evidence.rowCount)
      throw new Error(
        "Outcome evidence must belong to this opportunity and account",
      );
    await db.query(
      "INSERT INTO outcomes(id,account_id,report_id,event,outcome,observed_at,unit_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        randomUUID(),
        req.accountId,
        reportId,
        x.event,
        x.outcome,
        x.observedAt,
        x.unitId,
      ],
    );
    return { ok: true };
  });
  app.post("/api/reports/:id/derive", async (req) => {
    const x = z.object({ kind: DeliverableKind }).strict().parse(req.body);
    return materialise(db, req.accountId, asId(req.params), x.kind);
  });
  app.post("/api/reports/:id/review", async (req) => {
    const x = z
      .object({
        state: z.enum(["approved", "changes-requested"]),
        reason: z.string().min(3).max(5000),
      })
      .strict()
      .parse(req.body);
    return recordReview(
      db,
      req.accountId,
      req.userId,
      asId(req.params),
      x.state,
      x.reason,
    );
  });
  app.post("/api/reports/:id/deliver-local", async (req) =>
    deliverLocal(db, req.accountId, asId(req.params)),
  );
  app.get("/api/operations", async (req) => {
    const [schedules, deliveries, samples, leads] = await Promise.all([
      db.query(
        "SELECT s.*,o.title FROM schedules s JOIN opportunities o ON o.id=s.opportunity_id WHERE s.account_id=$1 ORDER BY next_at",
        [req.accountId],
      ),
      db.query(
        "SELECT d.*,r.kind,o.title FROM deliveries d JOIN reports r ON r.id=d.report_id JOIN opportunities o ON o.id=r.opportunity_id WHERE d.account_id=$1 ORDER BY d.created_at DESC",
        [req.accountId],
      ),
      db.query(
        "SELECT s.*,r.kind,o.title FROM review_samples s JOIN reports r ON r.id=s.report_id JOIN opportunities o ON o.id=r.opportunity_id WHERE s.account_id=$1 ORDER BY week_start DESC",
        [req.accountId],
      ),
      db.query(
        "SELECT s.id,s.opportunity_id,s.query,s.result,s.created_at,o.title FROM searches s JOIN opportunities o ON o.id=s.opportunity_id WHERE s.account_id=$1 AND s.result ? 'result' ORDER BY s.created_at DESC LIMIT 30",
        [req.accountId],
      ),
    ]);
    return {
      schedules: schedules.rows,
      deliveries: deliveries.rows,
      samples: samples.rows,
      leads: leads.rows,
      channel: "local",
      publication: "disabled",
      usage: (
        await db.query(
          "SELECT provider,status,count(*)::int AS calls,sum((usage->>'apiEquivalentUsd')::numeric) AS api_equivalent_usd,sum(settled) AS units_settled FROM provider_calls WHERE account_id=$1 GROUP BY provider,status",
          [req.accountId],
        )
      ).rows,
    };
  });
  app.post("/api/opportunities/:id/schedules", async (req) => {
    const opportunityId = asId(req.params);
    await owned(req.accountId, opportunityId);
    const x = z
      .object({
        kind: DeliverableKind,
        intervalHours: z.union([z.literal(24), z.literal(168)]),
        researchQuery: z.string().min(3).max(300).nullable().default(null),
      })
      .strict()
      .parse(req.body);
    const existing = await db.query(
      "SELECT id FROM schedules WHERE account_id=$1 AND opportunity_id=$2 AND kind=$3 AND enabled",
      [req.accountId, opportunityId, x.kind],
    );
    if (existing.rowCount)
      throw new Error(
        "This deliverable already has an active schedule; pause it before replacing",
      );
    const scheduleId = randomUUID();
    await db.query(
      "INSERT INTO schedules(id,account_id,opportunity_id,kind,next_at,interval_hours,research_query) VALUES($1,$2,$3,$4,now(),$5,$6)",
      [
        scheduleId,
        req.accountId,
        opportunityId,
        x.kind,
        x.intervalHours,
        x.researchQuery,
      ],
    );
    return { id: scheduleId };
  });
  app.post("/api/schedules/:id/pause", async (req) => {
    const r = await db.query(
      "UPDATE schedules SET enabled=false WHERE id=$1 AND account_id=$2 RETURNING id",
      [asId(req.params), req.accountId],
    );
    if (!r.rowCount) throw new Error("Schedule not found");
    return { ok: true };
  });

  app.get("/api/collections", async (req) => ({
    collections: (
      await db.query(
        "SELECT id,kind,client_id,period_start,created_at FROM collections WHERE account_id=$1 ORDER BY created_at DESC",
        [req.accountId],
      )
    ).rows,
    deliveries: (
      await db.query(
        "SELECT * FROM collection_deliveries WHERE account_id=$1 ORDER BY created_at DESC",
        [req.accountId],
      )
    ).rows,
  }));
  app.post("/api/collections", async (req) => {
    const x = z
      .object({
        kind: z.enum(["watchlist", "weekly"]),
        clientId: id.nullable().default(null),
      })
      .strict()
      .parse(req.body);
    return createCollection(db, req.accountId, x.kind, x.clientId);
  });
  app.get("/api/collections/:id", async (req, reply) => {
    const owned = (
      await db.query(
        "SELECT id FROM collections WHERE id=$1 AND account_id=$2",
        [asId(req.params), req.accountId],
      )
    ).rowCount;
    if (!owned) return reply.code(404).send({ error: "Not found" });
    return readCollection(db, req.accountId, asId(req.params));
  });
  app.post("/api/collections/:id/deliver-local", async (req) =>
    deliverCollection(db, req.accountId, asId(req.params)),
  );
  if (config.staticRoot) {
    await app.register(staticFiles, { root: config.staticRoot });
    app.setNotFoundHandler((req, reply) => {
      if (
        req.method === "GET" &&
        !req.url.startsWith("/api/") &&
        !req.url.startsWith("/assets/")
      )
        return reply.type("text/html").sendFile("index.html");
      return reply.code(404).send({ error: "Not found" });
    });
  }
  return app;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const db = database(config);
  const app = await createApi(config, db);
  await app.listen({
    host: config.publicOrigin ? "0.0.0.0" : "127.0.0.1",
    port: config.port,
  });
  console.log(`Groundwork API http://127.0.0.1:${config.port}`);
  for (const s of ["SIGINT", "SIGTERM"] as const)
    process.on(s, () => {
      void app.close().then(() => db.end());
    });
}
