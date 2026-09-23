import { randomUUID } from "node:crypto";
import type pg from "pg";
import { z } from "zod";
import type { Config } from "../config.ts";
import { transaction, type Database } from "../db.ts";
import { extract } from "../extract.ts";
import { recordSourceEvent, supersede } from "../source-management.ts";
import { ObjectStore, hash } from "../storage.ts";
import { classifyOpportunity } from "../sectors.ts";
import { getsAccess } from "./access.ts";
import { carryForwardOverrides, saveInitialMapping } from "./mapping.ts";
import { createNoticeBrief } from "./brief.ts";
import {
  canonicalGetsDetail,
  GETS_PARSER_VERSION,
  parseGetsDetail,
  parseGetsListing,
  semanticNoticeHash,
  type GetsScope,
  type GetsNoticeFields,
} from "./parser.ts";
import {
  ApprovedPublicGetsTransport,
  firstListingUrl,
  validateListingUrl,
  type GetsTransport,
} from "./transport.ts";

const Scope = z.enum(["current", "future", "single"]);
export const GetsRunInput = z
  .object({
    scope: Scope,
    url: z.string().url().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.scope === "single" && !value.url)
      ctx.addIssue({
        code: "custom",
        message: "Enter the public GETS notice URL",
      });
    if (value.scope !== "single" && value.url)
      ctx.addIssue({
        code: "custom",
        message: "A URL is only used for one notice",
      });
  });
type Run = {
  id: string;
  account_id: string;
  actor_id: string;
  scope: GetsScope;
  requested_rfx_id: string | null;
  requested_url: string | null;
  state: string;
  mode: "live" | "fixture";
  cursor: string | null;
  listings_done: boolean;
  pages_read: number;
  pages_attempted: number;
  unique_discovered: number;
  details_read: number;
  details_failed: number;
  attempts: number;
  brief_attempts: number;
  started_at: Date;
  lease_owner: string | null;
};
const fail = (message: string, statusCode = 409) =>
  Object.assign(new Error(message), { statusCode });
const nzToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export async function startGetsRun(
  db: Database,
  config: Config,
  accountId: string,
  actorId: string,
  raw: unknown,
) {
  const input = GetsRunInput.parse(raw);
  const access = getsAccess(config, accountId, input.scope);
  if (!access.enabled) throw fail(access.reason);
  const target = input.url ? canonicalGetsDetail(input.url) : null;
  return transaction(db, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${accountId}:GETS:${input.scope}:${target?.rfxId ?? ""}`,
    ]);
    const existing = await c.query(
      "SELECT id FROM gets_intake_runs WHERE account_id=$1 AND scope=$2 AND coalesce(requested_rfx_id,'')=$3 AND state IN ('queued','running') ORDER BY started_at LIMIT 1 FOR UPDATE",
      [accountId, input.scope, target?.rfxId ?? ""],
    );
    if (existing.rowCount) return { id: existing.rows[0].id, reused: true };
    const id = randomUUID();
    await c.query(
      "INSERT INTO gets_intake_runs(id,account_id,actor_id,scope,requested_rfx_id,requested_url,state,mode,cursor,listings_done) VALUES($1,$2,$3,$4,$5,$6,'queued','live',$7,$8)",
      [
        id,
        accountId,
        actorId,
        input.scope,
        target?.rfxId ?? null,
        target?.url ?? null,
        firstListingUrl(input.scope, target?.rfxId),
        input.scope === "single",
      ],
    );
    if (target)
      await c.query(
        "INSERT INTO gets_intake_items(run_id,account_id,rfx_id,detail_url,sightings) VALUES($1,$2,$3,$4,$5)",
        [
          id,
          accountId,
          target.rfxId,
          target.url,
          JSON.stringify([{ listingUrl: null, title: null }]),
        ],
      );
    if (target)
      await c.query(
        "UPDATE gets_intake_runs SET unique_discovered=1 WHERE id=$1",
        [id],
      );
    return { id, reused: false };
  });
}
export async function getsStatus(
  db: Database,
  config: Config,
  accountId: string,
) {
  const [runs, notices] = await Promise.all([
    db.query(
      "SELECT id,scope,requested_rfx_id,state,mode,pages_attempted,pages_read,rows_observed,unique_discovered,duplicate_sightings,details_read,details_failed,new_count,changed_count,unchanged_count,brief_attempts,advertised_total,error,started_at,updated_at,finished_at FROM gets_intake_runs WHERE account_id=$1 ORDER BY started_at DESC LIMIT 12",
      [accountId],
    ),
    db.query(
      "SELECT n.rfx_id,n.opportunity_id,n.first_seen_at,n.last_checked_at,r.fields,r.retrieved_at,r.semantic_hash,b.payload AS brief,b.source_id AS brief_source_id FROM gets_notices n JOIN gets_notice_revisions r ON r.id=n.current_revision_id AND r.account_id=n.account_id LEFT JOIN LATERAL (SELECT payload,source_id FROM gets_notice_briefs WHERE account_id=n.account_id AND revision_id=r.id ORDER BY created_at DESC LIMIT 1) b ON true WHERE n.account_id=$1 ORDER BY n.last_checked_at DESC LIMIT 500",
      [accountId],
    ),
  ]);
  const items = runs.rows[0]
    ? await db.query(
        "SELECT rfx_id,detail_url,state,error,attempts FROM gets_intake_items WHERE run_id=$1 AND account_id=$2 AND state<>'read' ORDER BY rfx_id LIMIT 100",
        [runs.rows[0].id, accountId],
      )
    : { rows: [] };
  const briefs = runs.rows[0]
    ? await db.query(
        "SELECT state,count(*)::int AS count FROM gets_brief_items WHERE run_id=$1 AND account_id=$2 GROUP BY state",
        [runs.rows[0].id, accountId],
      )
    : { rows: [] };
  return {
    access: getsAccess(config, accountId),
    briefsPerAttempt: config.getsBriefsPerAttempt,
    runs: runs.rows,
    notices: notices.rows,
    items: items.rows,
    briefCounts: Object.fromEntries(briefs.rows.map((r) => [r.state, r.count])),
  };
}
export async function cancelGetsRun(
  db: Database,
  accountId: string,
  id: string,
) {
  const result = await db.query(
    "UPDATE gets_intake_runs SET state='cancelled',finished_at=now(),updated_at=now(),lease_owner=null,lease_until=null WHERE id=$1 AND account_id=$2 AND state IN ('queued','running') RETURNING id",
    [id, accountId],
  );
  if (!result.rowCount) throw fail("Active GETS check not found", 404);
  return { ok: true };
}
export async function retryGetsRun(
  db: Database,
  config: Config,
  accountId: string,
  id: string,
) {
  return transaction(db, async (c) => {
    const result = await c.query(
      "SELECT * FROM gets_intake_runs WHERE id=$1 AND account_id=$2 FOR UPDATE",
      [id, accountId],
    );
    const run = result.rows[0] as Run | undefined;
    if (!run || run.state !== "partial")
      throw fail("Only a partial GETS check can be retried");
    const access = getsAccess(config, accountId, run.scope);
    if (!access.enabled) throw fail(access.reason);
    await c.query(
      "UPDATE gets_intake_items SET state='pending',attempts=0,error=null WHERE run_id=$1 AND state='failed'",
      [id],
    );
    await c.query(
      "UPDATE gets_brief_items SET state='pending',attempts=0,error=null WHERE run_id=$1 AND state='failed'",
      [id],
    );
    await c.query(
      "UPDATE gets_intake_runs SET state='queued',details_failed=0,pages_attempted=pages_read,attempts=0,brief_attempts=0,started_at=now(),error=null,lease_owner=null,lease_until=null,updated_at=now(),finished_at=null WHERE id=$1",
      [id],
    );
    return { id };
  });
}
async function fenced(c: pg.PoolClient, run: Run, owner: string) {
  const active = await c.query(
    "SELECT state,lease_owner,lease_until FROM gets_intake_runs WHERE id=$1 FOR UPDATE",
    [run.id],
  );
  if (
    active.rows[0]?.state !== "running" ||
    active.rows[0]?.lease_owner !== owner ||
    new Date(active.rows[0]?.lease_until).getTime() <= Date.now()
  )
    throw new Error("GETS intake lease lost or run cancelled");
}
function opportunityMetadata(
  fields: GetsNoticeFields,
  cutoff: string,
  mode: "live" | "fixture",
) {
  return {
    title: fields.title,
    buyer: fields.buyer,
    noticeId: fields.rfxId,
    category: fields.categories[0] || "unspecified",
    cutoff,
    clientId: null,
    noticeUrl: fields.url,
    closingAt: fields.closesAt,
    dateStatus: fields.closesAt ? "known" : "not_published",
    provenance: mode === "fixture" ? "synthetic" : "public",
    origin: mode === "fixture" ? "gets-fixture" : "gets-intake",
    provider: "GETS",
    noticeType: fields.noticeType,
    status: fields.status,
    categories: fields.categories,
    regions: fields.regions,
    overview: fields.overview,
    accessState: fields.accessState,
  };
}
async function saveDetail(
  c: pg.PoolClient,
  store: ObjectStore,
  run: Run,
  owner: string,
  item: { rfx_id: string; detail_url: string },
  html: string,
) {
  const fields = parseGetsDetail(html, item.detail_url);
  if (
    fields.rfxId !== item.rfx_id ||
    !fields.title ||
    !fields.buyer ||
    !fields.overview
  )
    throw new Error(
      "GETS detail identity or essential fields did not reconcile",
    );
  const raw = Buffer.from(html, "utf8");
  const rawHash = hash(raw),
    semanticHash = semanticNoticeHash(fields);
  const sourceId = randomUUID();
  const extraction = await extract(sourceId, "text/html", raw);
  if (extraction.state !== "read" || !extraction.units.length)
    throw new Error("GETS detail did not produce readable source sections");
  const rawRef = await store.put(run.account_id, raw);
  const extractionRef = await store.put(
    run.account_id,
    JSON.stringify(extraction),
  );
  await fenced(c, run, owner);
  await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `${run.account_id}:GETS:${fields.rfxId}`,
  ]);
  let notice = await c.query(
    "SELECT * FROM gets_notices WHERE account_id=$1 AND rfx_id=$2 FOR UPDATE",
    [run.account_id, fields.rfxId],
  );
  let noticeId = notice.rows[0]?.id as string | undefined;
  let opportunityId = notice.rows[0]?.opportunity_id as string | undefined;
  if (!noticeId) {
    const matches = await c.query(
      "SELECT id FROM opportunities WHERE account_id=$1 AND notice_id=$2 AND metadata->>'provenance'='public' AND (metadata->>'provider'='GETS' OR metadata->>'noticeUrl'=$3)",
      [run.account_id, fields.rfxId, fields.url],
    );
    if ((matches.rowCount ?? 0) > 1)
      throw new Error(
        "Multiple existing opportunities match this GETS RFx; resolve mapping explicitly",
      );
    opportunityId = matches.rows[0]?.id ?? randomUUID();
    if (!matches.rowCount)
      await c.query(
        "INSERT INTO opportunities(id,account_id,title,buyer,notice_id,cutoff,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          opportunityId,
          run.account_id,
          fields.title,
          fields.buyer,
          fields.rfxId,
          nzToday(),
          opportunityMetadata(fields, nzToday(), run.mode),
        ],
      );
    noticeId = randomUUID();
    await c.query(
      "INSERT INTO gets_notices(id,account_id,rfx_id,opportunity_id) VALUES($1,$2,$3,$4)",
      [noticeId, run.account_id, fields.rfxId, opportunityId],
    );
    notice = await c.query(
      "SELECT * FROM gets_notices WHERE id=$1 FOR UPDATE",
      [noticeId],
    );
  }
  const previous = notice.rows[0]?.current_revision_id as string | null;
  const same = previous
    ? await c.query(
        "SELECT id FROM gets_notice_revisions WHERE id=$1 AND semantic_hash=$2",
        [previous, semanticHash],
      )
    : { rowCount: 0 };
  if (same.rowCount) {
    await c.query("UPDATE gets_notices SET last_checked_at=now() WHERE id=$1", [
      noticeId,
    ]);
    return { revisionId: previous!, outcome: "unchanged" as const };
  }
  await c.query(
    "INSERT INTO sources(id,account_id,opportunity_id,name,media_type,origin,published_at,purpose,required,hash,object_ref,reader,state,coverage,extraction_ref,provenance) VALUES($1,$2,$3,$4,'text/html',$5,$6,'notice',true,$7,$8,$9,$10,$11,$12,$13)",
    [
      sourceId,
      run.account_id,
      opportunityId,
      `GETS RFx ${fields.rfxId} public notice`,
      fields.url,
      fields.openedAt?.slice(0, 10) ?? null,
      rawHash,
      rawRef,
      extraction.reader,
      extraction.state,
      extraction.coverage,
      extractionRef,
      run.mode === "fixture" ? "synthetic" : "public",
    ],
  );
  for (const unit of extraction.units)
    await c.query(
      "INSERT INTO units(id,account_id,source_id,ordinal,location,text_content,geometry) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        unit.id,
        run.account_id,
        sourceId,
        unit.ordinal,
        unit.location,
        unit.text,
        unit.geometry ?? null,
      ],
    );
  const revisionId = randomUUID();
  await c.query(
    "INSERT INTO gets_notice_revisions(id,account_id,notice_id,semantic_hash,raw_hash,raw_ref,source_id,fields,parser_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      revisionId,
      run.account_id,
      noticeId,
      semanticHash,
      rawHash,
      rawRef,
      sourceId,
      fields,
      GETS_PARSER_VERSION,
    ],
  );
  await saveInitialMapping(
    c,
    run.account_id,
    noticeId,
    revisionId,
    html,
    fields,
  );
  const mapped = await carryForwardOverrides(
    c,
    run.account_id,
    previous,
    revisionId,
  );
  await c.query(
    "UPDATE gets_notices SET current_revision_id=$2,last_checked_at=now() WHERE id=$1",
    [noticeId, revisionId],
  );
  if (previous) {
    const old = await c.query(
      "SELECT source_id FROM gets_notice_revisions WHERE id=$1",
      [previous],
    );
    await supersede(
      c,
      run.account_id,
      old.rows[0].source_id,
      sourceId,
      run.actor_id,
      "GETS public notice changed",
    );
  }
  await recordSourceEvent(
    c,
    run.account_id,
    sourceId,
    run.actor_id,
    "admitted",
    { provider: "GETS", rfxId: fields.rfxId, revisionId },
  );
  const current = await c.query(
    "SELECT metadata FROM opportunities WHERE id=$1 AND account_id=$2 FOR UPDATE",
    [opportunityId, run.account_id],
  );
  if (
    ["gets-intake", "gets-fixture"].includes(current.rows[0]?.metadata?.origin)
  )
    await c.query(
      "UPDATE opportunities SET title=$2,buyer=$3,cutoff=$4,metadata=$5 WHERE id=$1",
      [
        opportunityId,
        mapped.title ?? fields.title,
        mapped.buyer ?? fields.buyer,
        nzToday(),
        {
          ...opportunityMetadata(fields, nzToday(), run.mode),
          title: mapped.title ?? fields.title,
          buyer: mapped.buyer ?? fields.buyer,
          category: mapped.category ?? "unspecified",
          regions: mapped.region ? [mapped.region] : fields.regions,
          closingAt: mapped.closesAt,
          dateStatus: mapped.closesAt ? "known" : "not_published",
          noticeType: mapped.noticeType,
          status: mapped.status,
          overview: mapped.overview,
        },
      ],
    );
  await classifyOpportunity(
    c,
    run.account_id,
    opportunityId!,
    revisionId,
    mapped.title ?? fields.title,
    mapped.overview,
  );
  return {
    revisionId,
    outcome: previous ? ("changed" as const) : ("new" as const),
  };
}

export class GetsIntakeWorker {
  readonly owner = randomUUID();
  readonly store: ObjectStore;
  constructor(
    readonly config: Config,
    readonly db: Database,
    readonly transport: GetsTransport = new ApprovedPublicGetsTransport(),
  ) {
    this.store = new ObjectStore(config.storageRoot);
  }
  private async claim(): Promise<Run | null> {
    return transaction(this.db, async (c) => {
      const result = await c.query(
        "SELECT * FROM gets_intake_runs WHERE state IN ('queued','running') AND (lease_until IS NULL OR lease_until<now()) ORDER BY started_at FOR UPDATE SKIP LOCKED LIMIT 1",
      );
      if (!result.rowCount) return null;
      const run = result.rows[0] as Run;
      await c.query(
        "UPDATE gets_intake_runs SET state='running',lease_owner=$2,lease_until=now()+interval '45 seconds',updated_at=now() WHERE id=$1",
        [run.id, this.owner],
      );
      return run;
    });
  }
  private async release(run: Run) {
    await this.db.query(
      "UPDATE gets_intake_runs SET state=CASE WHEN state='running' THEN 'queued' ELSE state END,lease_owner=null,lease_until=null,updated_at=now() WHERE id=$1 AND lease_owner=$2",
      [run.id, this.owner],
    );
  }
  async tick() {
    const run = await this.claim();
    if (!run) return false;
    const heartbeat = setInterval(() => {
      void this.db
        .query(
          "UPDATE gets_intake_runs SET lease_until=now()+interval '45 seconds' WHERE id=$1 AND lease_owner=$2 AND state='running'",
          [run.id, this.owner],
        )
        .catch(() => {});
    }, 10000);
    try {
      if (
        run.mode === "live" &&
        !getsAccess(this.config, run.account_id, run.scope).enabled
      )
        throw fail("GETS access arrangement is unavailable or expired");
      if (
        Date.now() - new Date(run.started_at).getTime() > 15 * 60 * 1000 ||
        run.attempts >= 650
      ) {
        await this.terminal(
          run,
          "partial",
          "GETS check reached its time or request bound",
        );
        return true;
      }
      if (!run.listings_done) await this.listPage(run);
      else {
        const pending = await this.db.query(
          "SELECT rfx_id,detail_url,attempts FROM gets_intake_items WHERE run_id=$1 AND state='pending' ORDER BY rfx_id LIMIT 1",
          [run.id],
        );
        if (pending.rowCount) await this.readDetail(run, pending.rows[0]);
        else {
          const brief = await this.db.query(
            "SELECT rfx_id,revision_id,attempts FROM gets_brief_items WHERE run_id=$1 AND state='pending' ORDER BY rfx_id LIMIT 1",
            [run.id],
          );
          if (brief.rowCount) await this.readBrief(run, brief.rows[0]);
          else await this.finish(run);
        }
      }
    } catch (error) {
      await this.terminal(run, "partial", (error as Error).message);
    } finally {
      clearInterval(heartbeat);
      await this.release(run);
    }
    return true;
  }
  private async terminal(
    run: Run,
    state: "partial" | "blocked",
    error: string,
  ) {
    await this.db.query(
      "UPDATE gets_intake_runs SET state=$3,error=$4,finished_at=now(),updated_at=now() WHERE id=$1 AND lease_owner=$2 AND state='running'",
      [run.id, this.owner, state, error],
    );
  }
  private async listPage(run: Run) {
    if (run.scope === "single" || !run.cursor)
      throw new Error("GETS listing cursor missing");
    if (run.pages_read >= 40 || run.unique_discovered >= 500) {
      await this.terminal(run, "partial", "GETS listing/detail bound reached");
      return;
    }
    const url = validateListingUrl(run.cursor, run.scope);
    let html: string;
    try {
      html = await this.transport.listing(url);
    } catch (error) {
      await transaction(this.db, async (c) => {
        await fenced(c, run, this.owner);
        await c.query(
          "UPDATE gets_intake_runs SET pages_attempted=greatest(pages_attempted,pages_read+1),attempts=attempts+1,error=$2,updated_at=now() WHERE id=$1",
          [run.id, (error as Error).message],
        );
      });
      if (
        /GETS (?:returned HTTP (?:401|403|429)\b|access challenge)/.test(
          (error as Error).message,
        ) ||
        run.pages_attempted > run.pages_read
      )
        await this.terminal(
          run,
          "partial",
          `GETS listing ${url} unread: ${(error as Error).message}`,
        );
      return;
    }
    const parsed = parseGetsListing(html, url);
    if (parsed.warnings.length) {
      await transaction(this.db, async (c) => {
        await fenced(c, run, this.owner);
        await c.query(
          "UPDATE gets_intake_runs SET pages_attempted=greatest(pages_attempted,pages_read+1),attempts=attempts+1 WHERE id=$1",
          [run.id],
        );
      });
      throw new Error(
        `GETS listing ${url} was not fully parsed: ${parsed.warnings.join("; ")}`,
      );
    }
    if (!parsed.sightings.length)
      throw new Error(
        `GETS listing ${url} contained no parseable notice rows; coverage is incomplete`,
      );
    const next = parsed.nextUrl
      ? validateListingUrl(parsed.nextUrl, run.scope)
      : null;
    if (next === url)
      throw new Error("GETS pagination pointed to the same page");
    const rawRef = await this.store.put(run.account_id, html);
    await transaction(this.db, async (c) => {
      await fenced(c, run, this.owner);
      const seen = await c.query(
        "SELECT id FROM gets_intake_pages WHERE run_id=$1 AND url=$2",
        [run.id, url],
      );
      if (seen.rowCount)
        throw new Error("GETS listing pagination loop detected");
      await c.query(
        "INSERT INTO gets_intake_pages(id,account_id,run_id,url,page_number,raw_hash,raw_ref,rows_observed) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          randomUUID(),
          run.account_id,
          run.id,
          url,
          run.pages_read + 1,
          hash(html),
          rawRef,
          parsed.sightings.length,
        ],
      );
      for (const sighting of parsed.sightings) {
        await c.query(
          "INSERT INTO gets_intake_items(run_id,account_id,rfx_id,detail_url,sightings) VALUES($1,$2,$3,$4,$5) ON CONFLICT(run_id,rfx_id) DO UPDATE SET sightings=gets_intake_items.sightings || EXCLUDED.sightings",
          [
            run.id,
            run.account_id,
            sighting.rfxId,
            sighting.url,
            JSON.stringify([sighting]),
          ],
        );
      }
      const count = await c.query(
        "SELECT count(*)::int AS n FROM gets_intake_items WHERE run_id=$1",
        [run.id],
      );
      const unique = count.rows[0].n as number;
      await c.query(
        "UPDATE gets_intake_runs SET pages_attempted=greatest(pages_attempted,pages_read+1),pages_read=pages_read+1,rows_observed=rows_observed+$2,unique_discovered=$3,duplicate_sightings=rows_observed+$2-$3,advertised_total=coalesce($4,advertised_total),cursor=$5,listings_done=$6,attempts=attempts+1,error=$7,updated_at=now() WHERE id=$1",
        [
          run.id,
          parsed.sightings.length,
          unique,
          parsed.advertisedTotal,
          next,
          !next,
          parsed.warnings.join("; ") || null,
        ],
      );
      if (unique > 500)
        await c.query(
          "UPDATE gets_intake_runs SET state='partial',error='GETS detail bound reached',finished_at=now() WHERE id=$1",
          [run.id],
        );
    });
  }
  private async readDetail(
    run: Run,
    item: { rfx_id: string; detail_url: string; attempts: number },
  ) {
    let html: string;
    try {
      html = await this.transport.detail(item.detail_url);
    } catch (error) {
      await this.detailFailure(run, item, (error as Error).message);
      return;
    }
    try {
      await transaction(this.db, async (c) => {
        await fenced(c, run, this.owner);
        const saved = await saveDetail(
          c,
          this.store,
          run,
          this.owner,
          item,
          html,
        );
        await c.query(
          "UPDATE gets_intake_items SET state='read',attempts=attempts+1,error=null,revision_id=$3 WHERE run_id=$1 AND rfx_id=$2",
          [run.id, item.rfx_id, saved.revisionId],
        );
        if (saved.outcome !== "unchanged")
          await c.query(
            "INSERT INTO gets_brief_items(run_id,account_id,rfx_id,revision_id,state) VALUES($1,$2,$3,$4,'pending') ON CONFLICT(run_id,rfx_id) DO UPDATE SET revision_id=EXCLUDED.revision_id,state='pending',error=null",
            [run.id, run.account_id, item.rfx_id, saved.revisionId],
          );
        await c.query(
          `UPDATE gets_intake_runs SET details_read=details_read+1,attempts=attempts+1,
          new_count=new_count+($2='new')::int,changed_count=changed_count+($2='changed')::int,
          unchanged_count=unchanged_count+($2='unchanged')::int,updated_at=now() WHERE id=$1`,
          [run.id, saved.outcome],
        );
      });
    } catch (error) {
      await this.detailFailure(run, item, (error as Error).message);
    }
  }
  private async detailFailure(
    run: Run,
    item: { rfx_id: string; attempts: number },
    message: string,
  ) {
    await transaction(this.db, async (c) => {
      await fenced(c, run, this.owner);
      const accessBlocked =
        /GETS (?:returned HTTP (?:401|403|429)\b|access challenge)/.test(
          message,
        );
      const terminal = item.attempts >= 1 || accessBlocked;
      await c.query(
        "UPDATE gets_intake_items SET state=$3,attempts=attempts+1,error=$4 WHERE run_id=$1 AND rfx_id=$2",
        [run.id, item.rfx_id, terminal ? "failed" : "pending", message],
      );
      await c.query(
        "UPDATE gets_intake_runs SET details_failed=details_failed+$2,attempts=attempts+1,error=$3,updated_at=now() WHERE id=$1",
        [run.id, terminal ? 1 : 0, `RFx ${item.rfx_id}: ${message}`],
      );
      if (accessBlocked)
        await c.query(
          "UPDATE gets_intake_runs SET state='partial',finished_at=now(),error=$2 WHERE id=$1",
          [
            run.id,
            `GETS access or rate limit stopped the check at RFx ${item.rfx_id}: ${message}`,
          ],
        );
    });
  }
  private async readBrief(
    run: Run,
    item: { rfx_id: string; revision_id: string; attempts: number },
  ) {
    if (run.brief_attempts >= this.config.getsBriefsPerAttempt) {
      await this.terminal(
        run,
        "partial",
        `Notice brief limit reached (${this.config.getsBriefsPerAttempt} per manual attempt); continue this check to resume pending briefs`,
      );
      return;
    }
    await this.db.query(
      "UPDATE gets_intake_runs SET brief_attempts=brief_attempts+1,updated_at=now() WHERE id=$1 AND lease_owner=$2 AND state='running'",
      [run.id, this.owner],
    );
    try {
      const id = await createNoticeBrief(
        this.db,
        this.config,
        this.store,
        run.account_id,
        run.id,
        item.rfx_id,
        item.revision_id,
        run.mode,
      );
      await transaction(this.db, async (c) => {
        await fenced(c, run, this.owner);
        await c.query(
          "UPDATE gets_brief_items SET state='complete',brief_id=$3,attempts=attempts+1,error=null,updated_at=now() WHERE run_id=$1 AND rfx_id=$2",
          [run.id, item.rfx_id, id],
        );
      });
    } catch (error) {
      await transaction(this.db, async (c) => {
        await fenced(c, run, this.owner);
        await c.query(
          "UPDATE gets_brief_items SET state='failed',attempts=attempts+1,error=$3,updated_at=now() WHERE run_id=$1 AND rfx_id=$2",
          [run.id, item.rfx_id, (error as Error).message],
        );
        await c.query(
          "UPDATE gets_intake_runs SET error=$2,updated_at=now() WHERE id=$1",
          [run.id, `RFx ${item.rfx_id} brief: ${(error as Error).message}`],
        );
      });
    }
  }
  private async finish(run: Run) {
    await transaction(this.db, async (c) => {
      await fenced(c, run, this.owner);
      const count = await c.query(
        "SELECT count(*)::int AS total,count(*) FILTER (WHERE state='read')::int AS read,count(*) FILTER (WHERE state='failed')::int AS failed FROM gets_intake_items WHERE run_id=$1",
        [run.id],
      );
      const row = count.rows[0];
      const briefs = await c.query(
        "SELECT count(*)::int AS total,count(*) FILTER (WHERE state='complete')::int AS complete,count(*) FILTER (WHERE state='failed')::int AS failed FROM gets_brief_items WHERE run_id=$1",
        [run.id],
      );
      const brief = briefs.rows[0];
      const current = await c.query(
        "SELECT pages_attempted,pages_read,unique_discovered,details_read,details_failed,listings_done,advertised_total FROM gets_intake_runs WHERE id=$1",
        [run.id],
      );
      const r = current.rows[0];
      const reconciles =
        r.listings_done &&
        r.pages_attempted === r.pages_read &&
        (r.advertised_total === null ||
          r.unique_discovered >= r.advertised_total) &&
        r.unique_discovered === row.total &&
        r.details_read === row.read &&
        r.details_failed === row.failed &&
        row.read + row.failed === row.total;
      await c.query(
        "UPDATE gets_intake_runs SET state=$2,error=$3,finished_at=now(),updated_at=now() WHERE id=$1",
        [
          run.id,
          reconciles &&
          !row.failed &&
          !brief.failed &&
          brief.complete === brief.total
            ? "complete"
            : "partial",
          reconciles &&
          !row.failed &&
          !brief.failed &&
          brief.complete === brief.total
            ? null
            : "GETS check incomplete: unread listing, failed detail or failed notice brief remains",
        ],
      );
    });
  }
}
