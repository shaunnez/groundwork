import { randomUUID, createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, mkdir, open, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import type { Database } from "./db.ts";
import { transaction } from "./db.ts";
import { completeCoverage } from "./domain/evidence.ts";
import { DOCX, XLSX } from "./readers/office.ts";
import { ingest } from "./sources.ts";
import type { ObjectStore } from "./storage.ts";

export const TENDER_FILE_LIMIT = 64 * 1024 * 1024;
export const TENDER_PACK_LIMIT = 128 * 1024 * 1024;
const PackFile = z.object({
  fileId: z.string().regex(/^\d{1,20}$/),
  name: z
    .string()
    .trim()
    .min(1)
    .max(250)
    .refine(
      (name) => !/[\\/\x00-\x1f]/.test(name),
      "GETS filename contains a path separator or control character",
    ),
  bytes: z.number().int().positive().max(TENDER_FILE_LIMIT),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  kind: z.enum(["attachment", "addendum"]),
  status: z.enum(["current", "withdrawn"]).default("current"),
});
export const PackDeclaration = z
  .object({
    rfxId: z.string().regex(/^\d{1,20}$/),
    observedAt: z.string().datetime({ offset: true }),
    files: z.array(PackFile).min(1).max(20),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.files.map((f) => f.fileId)).size !== v.files.length)
      ctx.addIssue({
        code: "custom",
        message: "GETS file identifiers must be unique",
      });
    const current = v.files.filter((f) => f.status === "current");
    if (
      new Set(current.map((f) => `${f.kind}:${f.name}`)).size !== current.length
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Current GETS filenames must be unique within each kind for bulk archive matching",
      });
    if (current.reduce((n, f) => n + f.bytes, 0) > TENDER_PACK_LIMIT)
      ctx.addIssue({ code: "custom", message: "Tender pack exceeds 128 MiB" });
  });
export type PackDeclaration = z.infer<typeof PackDeclaration>;

export async function declareTenderPack(
  db: Database,
  accountId: string,
  opportunityId: string,
  actorId: string,
  input: unknown,
) {
  const manifest = PackDeclaration.parse(input);
  return transaction(db, async (c) => {
    const notice = await c.query(
      `SELECT n.current_revision_id,o.notice_id FROM opportunities o
       JOIN gets_notices n ON n.opportunity_id=o.id AND n.account_id=o.account_id
       WHERE o.id=$1 AND o.account_id=$2 AND n.rfx_id=$3 FOR UPDATE OF o`,
      [opportunityId, accountId, manifest.rfxId],
    );
    if (
      !notice.rowCount ||
      notice.rows[0].notice_id !== manifest.rfxId ||
      !notice.rows[0].current_revision_id
    )
      throw new Error(
        "A saved GETS notice revision for this RFx is required before declaring its tender pack",
      );
    const id = randomUUID();
    await c.query(
      "INSERT INTO tender_packs(id,account_id,opportunity_id,rfx_id,notice_revision_id,manifest,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        id,
        accountId,
        opportunityId,
        manifest.rfxId,
        notice.rows[0].current_revision_id,
        manifest,
        actorId,
      ],
    );
    return { id };
  });
}

export async function packDetail(
  db: Database,
  accountId: string,
  packId: string,
) {
  const pack = await db.query(
    "SELECT * FROM tender_packs WHERE id=$1 AND account_id=$2",
    [packId, accountId],
  );
  if (!pack.rowCount)
    throw Object.assign(new Error("Tender pack not found"), {
      statusCode: 404,
    });
  const receipts = await db.query(
    `SELECT f.file_id,f.source_id,f.actual_bytes,f.actual_sha256,f.admitted_at,
            s.reader,s.state,s.coverage,s.hash
     FROM tender_pack_files f JOIN sources s ON s.id=f.source_id AND s.account_id=f.account_id
     WHERE f.pack_id=$1 AND f.account_id=$2`,
    [packId, accountId],
  );
  const attempts = await db.query(
    "SELECT DISTINCT ON (file_id) file_id,outcome,detail,actual_bytes,actual_sha256,created_at FROM tender_pack_attempts WHERE pack_id=$1 AND account_id=$2 ORDER BY file_id,created_at DESC",
    [packId, accountId],
  );
  const reviews = await db.query(
    "SELECT file_id,source_id,note,reviewed_at FROM tender_pack_reviews WHERE pack_id=$1 AND account_id=$2",
    [packId, accountId],
  );
  const byFile = new Map(receipts.rows.map((r) => [r.file_id, r]));
  const byAttempt = new Map(attempts.rows.map((r) => [r.file_id, r]));
  const byReview = new Map(reviews.rows.map((r) => [r.file_id, r]));
  const files = (pack.rows[0].manifest as PackDeclaration).files.map(
    (expected) => {
      const received = byFile.get(expected.fileId);
      const attempt = byAttempt.get(expected.fileId);
      const review = byReview.get(expected.fileId);
      const technicalReviewRequired =
        /\.pdf$/i.test(expected.name) &&
        /drawing|plan set|schematic/i.test(expected.name);
      return {
        ...expected,
        sourceId: received?.source_id ?? null,
        actualBytes: received ? Number(received.actual_bytes) : null,
        actualSha256: received?.actual_sha256 ?? null,
        reader: received?.reader ?? readerFor(expected.name),
        coverage: received?.coverage ?? null,
        state:
          expected.status === "withdrawn"
            ? "withdrawn"
            : received
              ? received.state
              : attempt?.outcome === "rejected"
                ? "rejected"
                : "missing",
        problem:
          received?.coverage?.failures?.join("; ") ||
          (attempt?.outcome === "rejected" ? attempt.detail : null),
        technicalReviewRequired,
        technicalReview:
          review && review.source_id === received?.source_id
            ? { note: review.note, reviewedAt: review.reviewed_at }
            : null,
      };
    },
  );
  const current = files.filter((f) => f.status === "current");
  return {
    id: pack.rows[0].id as string,
    opportunityId: pack.rows[0].opportunity_id as string,
    rfxId: pack.rows[0].rfx_id as string,
    noticeRevisionId: pack.rows[0].notice_revision_id as string,
    observedAt: (pack.rows[0].manifest as PackDeclaration).observedAt,
    createdAt: pack.rows[0].created_at as string,
    files,
    complete: current.every(
      (f) => f.sourceId && f.state === "read" && completeCoverage(f.coverage),
    ),
    counts: {
      expected: current.length,
      received: current.filter((f) => f.sourceId).length,
      readable: current.filter((f) => f.state === "read").length,
    },
  };
}

export async function reviewTenderDrawing(
  db: Database,
  accountId: string,
  packId: string,
  fileId: string,
  actorId: string,
  note: string,
) {
  const pack = await packDetail(db, accountId, packId);
  const file = pack.files.find((f) => f.fileId === fileId);
  if (!file?.sourceId || !file.technicalReviewRequired)
    throw new Error("An admitted drawing PDF is required");
  if (file.state !== "read" || !completeCoverage(file.coverage!))
    throw new Error("Reader coverage must be resolved before drawing review");
  await db.query(
    "INSERT INTO tender_pack_reviews(id,account_id,pack_id,file_id,source_id,actor_id,note) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      randomUUID(),
      accountId,
      packId,
      fileId,
      file.sourceId,
      actorId,
      z.string().trim().min(30).max(2000).parse(note),
    ],
  );
  return { ok: true };
}

export function readerFor(name: string) {
  const ext = name.toLowerCase().split(".").at(-1);
  return ext === "pdf"
    ? "PDF text/OCR reader"
    : ext === "docx"
      ? "DOCX paragraph/table reader"
      : ext === "xlsx"
        ? "XLSX worksheet/cell/formula reader"
        : "unsupported format reader";
}

export async function importTenderFile(
  db: Database,
  store: ObjectStore,
  accountId: string,
  packId: string,
  fileId: string,
  actorId: string,
  body: Readable,
) {
  const declared = await packDetail(db, accountId, packId);
  const expected = declared.files.find((f) => f.fileId === fileId);
  if (!expected || expected.status !== "current")
    throw new Error("Current GETS file not declared in this pack");
  if (expected.sourceId)
    throw Object.assign(new Error("This pack file was already admitted"), {
      statusCode: 409,
    });
  const scratchRoot = join(store.root, ".scratch");
  await mkdir(scratchRoot, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(scratchRoot, "tender-"));
  const path = join(directory, "incoming");
  let actualBytes = 0;
  const digest = createHash("sha256");
  try {
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        actualBytes += chunk.length;
        if (actualBytes > TENDER_FILE_LIMIT || actualBytes > expected.bytes)
          callback(
            new Error(
              `${expected.name}: upload exceeds declared size or 64 MiB limit`,
            ),
          );
        else {
          digest.update(chunk);
          callback(null, chunk);
        }
      },
    });
    await pipeline(
      body,
      meter,
      createWriteStream(path, { flags: "wx", mode: 0o600 }),
      { signal: AbortSignal.timeout(180000) },
    );
    const actualSha256 = digest.digest("hex");
    if (
      actualBytes !== expected.bytes ||
      actualSha256 !== expected.sha256.toLowerCase()
    )
      throw new Error(
        `${expected.name}: received ${actualBytes} bytes / ${actualSha256}; expected ${expected.bytes} bytes / ${expected.sha256}`,
      );
    const header = Buffer.alloc(5);
    const file = await open(path, "r");
    try {
      await file.read(header, 0, 5, 0);
    } finally {
      await file.close();
    }
    const ext = expected.name.toLowerCase().split(".").at(-1);
    if (
      (ext === "pdf" && header.toString() !== "%PDF-") ||
      (["docx", "xlsx"].includes(ext ?? "") &&
        header.subarray(0, 2).toString() !== "PK")
    )
      throw new Error(
        `${expected.name}: file signature does not match declared format`,
      );
    const input = await readFile(path);
    const mediaType =
      ext === "pdf"
        ? "application/pdf"
        : ext === "docx"
          ? DOCX
          : ext === "xlsx"
            ? XLSX
            : "application/octet-stream";
    const previous = await db.query(
      `SELECT f.source_id,s.hash,s.name,coalesce(l.status,'active') AS lifecycle_status FROM tender_pack_files f
       JOIN tender_packs p ON p.id=f.pack_id AND p.account_id=f.account_id
       JOIN sources s ON s.id=f.source_id AND s.account_id=f.account_id
       LEFT JOIN source_lifecycle l ON l.source_id=s.id AND l.account_id=s.account_id
       WHERE p.opportunity_id=$1 AND p.account_id=$2 AND f.file_id=$3 ORDER BY p.created_at DESC LIMIT 1`,
      [declared.opportunityId, accountId, fileId],
    );
    const origin = `https://www.gets.govt.nz/DCC/${expected.kind === "addendum" ? "ExternalGetAddendumFile" : "ExternalGetProjectFile"}.htm?projectID=${declared.rfxId}&fileID=${fileId}`;
    const recovered = await db.query(
      `SELECT s.id FROM active_sources s WHERE s.account_id=$1 AND s.opportunity_id=$2
       AND s.origin=$3 AND s.hash=$4 AND s.name=$5 ORDER BY s.created_at DESC LIMIT 1`,
      [accountId, declared.opportunityId, origin, actualSha256, expected.name],
    );
    let sourceId: string;
    let result: { reader: string; state: string; coverage: unknown } | null =
      null;
    if (recovered.rowCount) {
      sourceId = recovered.rows[0].id;
    } else if (
      previous.rowCount &&
      previous.rows[0].hash === actualSha256 &&
      previous.rows[0].name === expected.name &&
      previous.rows[0].lifecycle_status === "active"
    ) {
      sourceId = previous.rows[0].source_id;
    } else {
      const admitted = await ingest(
        db,
        store,
        accountId,
        declared.opportunityId,
        {
          name: expected.name,
          mediaType,
          body: input,
          origin,
          publishedAt: null,
          purpose: expected.kind === "addendum" ? "addendum" : "rfp",
          required: true,
          provenance: "authenticated",
          actorId,
          maxFileBytes: TENDER_FILE_LIMIT,
          skipPackPageLimit: true,
          originalPath: path,
          ...(previous.rowCount &&
          previous.rows[0].lifecycle_status === "active"
            ? {
                replacesId: previous.rows[0].source_id,
                reason: "GETS file version changed",
              }
            : {}),
        },
      );
      sourceId = admitted.id;
      result = admitted;
    }
    await transaction(db, async (c) => {
      await c.query(
        "INSERT INTO tender_pack_files(pack_id,account_id,file_id,source_id,actual_bytes,actual_sha256) VALUES($1,$2,$3,$4,$5,$6)",
        [packId, accountId, fileId, sourceId, actualBytes, actualSha256],
      );
      await c.query(
        "INSERT INTO tender_pack_attempts(id,account_id,pack_id,file_id,outcome,actual_bytes,actual_sha256,detail) VALUES($1,$2,$3,$4,'admitted',$5,$6,$7)",
        [
          randomUUID(),
          accountId,
          packId,
          fileId,
          actualBytes,
          actualSha256,
          "Original verified and admitted",
        ],
      );
    });
    return {
      sourceId,
      actualBytes,
      actualSha256,
      reader: result?.reader ?? null,
      state: result?.state ?? null,
    };
  } catch (error) {
    await db
      .query(
        "INSERT INTO tender_pack_attempts(id,account_id,pack_id,file_id,outcome,actual_bytes,detail) VALUES($1,$2,$3,$4,'rejected',$5,$6)",
        [
          randomUUID(),
          accountId,
          packId,
          fileId,
          actualBytes,
          (error as Error).message.slice(0, 1000),
        ],
      )
      .catch(() => {});
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
