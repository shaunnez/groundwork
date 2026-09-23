import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import type pg from "pg";
import type { Config } from "../config.ts";
import { transaction, type Database } from "../db.ts";
import { ObjectStore } from "../storage.ts";
import {
  importTenderFile,
  packDetail,
  PackDeclaration,
  type PackDeclaration as Manifest,
} from "../tender-packs.ts";
import {
  GetsCollectionBlocked,
  HostedGetsSession,
  type GetsCollectionSession,
} from "./hosted-session.ts";

type Job = {
  id: string;
  account_id: string;
  intake_run_id: string;
  notice_revision_id: string;
  opportunity_id: string;
  actor_id: string;
  rfx_id: string;
  state: string;
  pack_id: string | null;
  inventory: Manifest | null;
};
const pending = ["discovered", "access_needed", "downloading", "downloaded"];
const sameFile = (a: Manifest["files"][number], b: Manifest["files"][number]) =>
  a.fileId === b.fileId &&
  a.kind === b.kind &&
  a.name === b.name &&
  a.bytes === b.bytes &&
  a.sha256.toLowerCase() === b.sha256.toLowerCase();
const safeError = (error: unknown) => {
  if (error instanceof GetsCollectionBlocked)
    return error.message.slice(0, 500);
  const message =
    error instanceof Error ? error.message : "Unknown collection error";
  if (/^(GETS |Tender pack |Current GETS |RFx \d+:)/.test(message))
    return message.slice(0, 500);
  return "GETS collection failed; check network, source inventory and storage before continuing";
};

export async function getsCollectionStatus(db: Database, accountId: string) {
  const [counts, jobs] = await Promise.all([
    db.query(
      "SELECT state,count(*)::int AS count FROM gets_pack_jobs WHERE account_id=$1 GROUP BY state",
      [accountId],
    ),
    db.query(
      `SELECT id,rfx_id,opportunity_id,state,pack_id,error,attempts,login_retries,created_at,updated_at,finished_at
      FROM gets_pack_jobs WHERE account_id=$1 ORDER BY created_at DESC LIMIT 40`,
      [accountId],
    ),
  ]);
  const byState = Object.fromEntries(
    counts.rows.map((r) => [r.state, r.count]),
  );
  return {
    queueSize: pending.reduce((n, state) => n + (byState[state] ?? 0), 0),
    currentTender:
      jobs.rows.find(
        (r) => r.state === "access_needed" || r.state === "downloading",
      )?.rfx_id ?? null,
    completed: (byState.admitted ?? 0) + (byState.unchanged ?? 0),
    failed: byState.failed ?? 0,
    blocked: byState.blocked ?? 0,
    jobs: jobs.rows,
  };
}

export async function getsCollectionDetail(
  db: Database,
  accountId: string,
  id: string,
) {
  const result = await db.query(
    "SELECT id,rfx_id,opportunity_id,notice_revision_id,state,pack_id,error,attempts,login_retries,created_at,updated_at,finished_at FROM gets_pack_jobs WHERE id=$1 AND account_id=$2",
    [id, accountId],
  );
  if (!result.rowCount)
    throw Object.assign(new Error("GETS collection not found"), {
      statusCode: 404,
    });
  const job = result.rows[0];
  const pack = job.pack_id
    ? await packDetail(db, accountId, job.pack_id)
    : null;
  const archived = job.pack_id
    ? await db.query(
        `SELECT f.file_id FROM tender_pack_files f JOIN source_lifecycle l
        ON l.source_id=f.source_id AND l.account_id=f.account_id
        WHERE f.pack_id=$1 AND f.account_id=$2 AND l.status='archived'`,
        [job.pack_id, accountId],
      )
    : { rows: [] };
  const archivedIds = new Set(
    archived.rows.map((row) => row.file_id as string),
  );
  return {
    ...job,
    packReady:
      ["admitted", "unchanged"].includes(job.state) &&
      !!pack &&
      pack.counts.received === pack.counts.expected &&
      archivedIds.size === 0,
    pack,
    gaps:
      pack?.files
        .filter(
          (file) =>
            file.status === "current" &&
            (!file.sourceId ||
              file.state !== "read" ||
              file.coverage?.failures?.length ||
              archivedIds.has(file.fileId)),
        )
        .map((file) => ({
          fileId: file.fileId,
          name: file.name,
          state: file.state,
          problem: archivedIds.has(file.fileId)
            ? "Source archived by owner"
            : file.problem,
        })) ?? [],
  };
}

export async function changeCollectionJob(
  db: Database,
  accountId: string,
  id: string,
  action: "cancel" | "continue",
) {
  return transaction(db, async (c) => {
    const result = await c.query(
      "SELECT state FROM gets_pack_jobs WHERE id=$1 AND account_id=$2 FOR UPDATE",
      [id, accountId],
    );
    if (!result.rowCount)
      throw Object.assign(new Error("GETS collection not found"), {
        statusCode: 404,
      });
    const state = result.rows[0].state as string;
    if (action === "cancel") {
      if (!pending.includes(state))
        throw new Error("Only active collection can be cancelled");
      await c.query(
        "UPDATE gets_pack_jobs SET state='cancelled',error='Cancelled by owner',lease_owner=null,lease_until=null,finished_at=now(),updated_at=now() WHERE id=$1",
        [id],
      );
    } else {
      if (!(["failed", "blocked", "cancelled"] as string[]).includes(state))
        throw new Error("Only a stopped collection can be continued");
      await c.query(
        "UPDATE gets_pack_jobs SET state='discovered',error=null,lease_owner=null,lease_until=null,finished_at=null,updated_at=now() WHERE id=$1",
        [id],
      );
    }
    return { ok: true };
  });
}

export class GetsPackWorker {
  readonly owner = randomUUID();
  private session: GetsCollectionSession | null = null;
  private batchAccessBlock: string | null = null;
  private store: ObjectStore;
  constructor(
    readonly config: Config,
    readonly db: Database,
    readonly sessionFactory: () => GetsCollectionSession = () =>
      new HostedGetsSession(),
  ) {
    this.store = new ObjectStore(config.storageRoot);
  }

  private async claim(): Promise<Job | null> {
    return transaction(this.db, async (c) => {
      const result = await c.query(
        `SELECT * FROM gets_pack_jobs WHERE state = ANY($1::text[])
        AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at
        FOR UPDATE SKIP LOCKED LIMIT 1`,
        [pending],
      );
      if (!result.rowCount) return null;
      const job = result.rows[0] as Job;
      await c.query(
        `UPDATE gets_pack_jobs SET state='access_needed',lease_owner=$2,
        lease_until=now()+interval '45 seconds',attempts=attempts+1,updated_at=now() WHERE id=$1`,
        [job.id, this.owner],
      );
      return job;
    });
  }

  private async stage(
    job: Job,
    state: string,
    values: { packId?: string; inventory?: Manifest } = {},
  ) {
    const result = await this.db.query(
      `UPDATE gets_pack_jobs SET state=$3,
      pack_id=coalesce($4,pack_id),inventory=coalesce($5,inventory),
      login_retries=$6,updated_at=now() WHERE id=$1 AND lease_owner=$2
      AND state<>'cancelled' RETURNING id`,
      [
        job.id,
        this.owner,
        state,
        values.packId ?? null,
        values.inventory ?? null,
        this.session?.loginRetries ?? 0,
      ],
    );
    if (!result.rowCount)
      throw new Error("GETS collection cancelled or lease lost");
  }

  private async ensurePack(job: Job, manifest: Manifest) {
    return transaction(this.db, async (c) => {
      const locked = await c.query(
        "SELECT pack_id,inventory FROM gets_pack_jobs WHERE id=$1 AND lease_owner=$2 AND state<>'cancelled' FOR UPDATE",
        [job.id, this.owner],
      );
      if (!locked.rowCount)
        throw new Error("GETS collection cancelled or lease lost");
      if (locked.rows[0].pack_id) {
        const saved = PackDeclaration.parse(locked.rows[0].inventory);
        if (
          saved.files.length !== manifest.files.length ||
          !saved.files.every((file) =>
            manifest.files.some((f) => sameFile(file, f)),
          )
        )
          throw new GetsCollectionBlocked(
            `RFx ${job.rfx_id}: attachment inventory changed during collection; run Check GETS now again`,
          );
        return locked.rows[0].pack_id as string;
      }
      const packId = randomUUID();
      await c.query(
        `INSERT INTO tender_packs(id,account_id,opportunity_id,rfx_id,notice_revision_id,manifest,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          packId,
          job.account_id,
          job.opportunity_id,
          job.rfx_id,
          job.notice_revision_id,
          manifest,
          job.actor_id,
        ],
      );
      const previous = await c.query(
        `SELECT id,manifest FROM tender_packs WHERE account_id=$1 AND opportunity_id=$2
        AND id<>$3 ORDER BY created_at DESC LIMIT 1`,
        [job.account_id, job.opportunity_id, packId],
      );
      if (previous.rowCount) {
        const old = PackDeclaration.parse(previous.rows[0].manifest);
        for (const file of manifest.files) {
          if (!old.files.some((candidate) => sameFile(candidate, file)))
            continue;
          const priorState = await c.query(
            `SELECT coalesce(l.status,'active') AS status FROM tender_pack_files f
             LEFT JOIN source_lifecycle l ON l.source_id=f.source_id AND l.account_id=f.account_id
             WHERE f.pack_id=$1 AND f.account_id=$2 AND f.file_id=$3`,
            [previous.rows[0].id, job.account_id, file.fileId],
          );
          if (priorState.rows[0]?.status === "archived")
            throw new GetsCollectionBlocked(
              `RFx ${job.rfx_id}: file ${file.fileId} was archived by the owner; review before new admission`,
            );
          if (priorState.rows[0]?.status !== "active") continue;
          await c.query(
            `INSERT INTO tender_pack_files(pack_id,account_id,file_id,source_id,actual_bytes,actual_sha256)
            SELECT $1,account_id,file_id,source_id,actual_bytes,actual_sha256 FROM tender_pack_files
            WHERE pack_id=$2 AND account_id=$3 AND file_id=$4 ON CONFLICT DO NOTHING`,
            [packId, previous.rows[0].id, job.account_id, file.fileId],
          );
        }
      }
      await c.query(
        "UPDATE gets_pack_jobs SET pack_id=$2,inventory=$3,updated_at=now() WHERE id=$1",
        [job.id, packId, manifest],
      );
      return packId;
    });
  }

  private async process(job: Job) {
    if (this.batchAccessBlock)
      throw new GetsCollectionBlocked(this.batchAccessBlock);
    const current = await this.db.query(
      `SELECT n.current_revision_id FROM gets_notices n
      JOIN gets_notice_revisions r ON r.notice_id=n.id AND r.account_id=n.account_id
      WHERE r.id=$1 AND r.account_id=$2`,
      [job.notice_revision_id, job.account_id],
    );
    if (current.rows[0]?.current_revision_id !== job.notice_revision_id)
      throw new GetsCollectionBlocked(
        `RFx ${job.rfx_id}: queued notice revision was superseded; run Check GETS now again`,
      );
    this.session ??= this.sessionFactory();
    const manifest = PackDeclaration.parse(
      await this.session.inventory(job.rfx_id),
    );
    const packId = await this.ensurePack(job, manifest);
    await this.stage(job, "downloading", { packId, inventory: manifest });
    const existing = await packDetail(this.db, job.account_id, packId);
    const needed = manifest.files.filter(
      (file) =>
        !existing.files.some(
          (saved) => saved.fileId === file.fileId && saved.sourceId,
        ),
    );
    if (needed.length) {
      const scratchRoot = join(this.config.storageRoot, ".scratch");
      await mkdir(scratchRoot, { recursive: true, mode: 0o700 });
      const directory = await mkdtemp(join(scratchRoot, "gets-"));
      try {
        await this.session.download(job.rfx_id, manifest, needed, directory);
        await this.stage(job, "downloaded");
        for (const file of needed) {
          await this.stage(job, "downloaded");
          await importTenderFile(
            this.db,
            this.store,
            job.account_id,
            packId,
            file.fileId,
            job.actor_id,
            createReadStream(join(directory, file.fileId)),
          );
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
    const detail = await packDetail(this.db, job.account_id, packId);
    if (detail.counts.received !== detail.counts.expected)
      throw new Error(
        "Tender pack admission left one or more current files missing",
      );
    const archived = await this.db.query(
      `SELECT count(*)::int AS count FROM tender_pack_files f
       JOIN source_lifecycle l ON l.source_id=f.source_id AND l.account_id=f.account_id
       WHERE f.pack_id=$1 AND f.account_id=$2 AND l.status='archived'`,
      [packId, job.account_id],
    );
    if (archived.rows[0].count)
      throw new GetsCollectionBlocked(
        `RFx ${job.rfx_id}: an admitted source was archived; review the pack before using it`,
      );
    await this.stage(job, needed.length ? "admitted" : "unchanged");
    await this.db.query(
      `UPDATE gets_pack_jobs SET finished_at=now(),lease_owner=null,lease_until=null,
      updated_at=now() WHERE id=$1 AND lease_owner=$2`,
      [job.id, this.owner],
    );
  }

  async tick() {
    const job = await this.claim();
    if (!job) {
      if (this.session) {
        await this.session.close();
        this.session = null;
      }
      this.batchAccessBlock = null;
      return false;
    }
    const heartbeat = setInterval(() => {
      void this.db
        .query(
          `UPDATE gets_pack_jobs SET lease_until=now()+interval '45 seconds'
        WHERE id=$1 AND lease_owner=$2 AND state<>'cancelled'`,
          [job.id, this.owner],
        )
        .catch(() => {});
    }, 10000);
    try {
      await this.process(job);
    } catch (error) {
      const state =
        error instanceof GetsCollectionBlocked ? "blocked" : "failed";
      if (
        error instanceof GetsCollectionBlocked &&
        /RealMe|credential|interactive challenge|session expired/i.test(
          error.message,
        )
      )
        this.batchAccessBlock = safeError(error);
      await this.db.query(
        `UPDATE gets_pack_jobs SET state=$3,error=$4,login_retries=$5,
        finished_at=now(),lease_owner=null,lease_until=null,updated_at=now()
        WHERE id=$1 AND lease_owner=$2 AND state<>'cancelled'`,
        [
          job.id,
          this.owner,
          state,
          safeError(error),
          this.session?.loginRetries ?? 0,
        ],
      );
    } finally {
      clearInterval(heartbeat);
    }
    return true;
  }

  async close() {
    await this.session?.close();
    this.session = null;
  }
}
