import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../server/config.ts";
import { database, transaction } from "../server/db.ts";
import {
  parseGetsDetail,
  semanticNoticeHash,
  GETS_PARSER_VERSION,
} from "../server/gets/parser.ts";
import { saveInitialMapping } from "../server/gets/mapping.ts";
import { classifyOpportunity } from "../server/sectors.ts";
import { ingest } from "../server/sources.ts";
import { ObjectStore, hash } from "../server/storage.ts";
import {
  PackDeclaration,
  declareTenderPack,
  importTenderFile,
  packDetail,
} from "../server/tender-packs.ts";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, "").split("=");
    return [key, value.join("=")];
  }),
);
if (
  !args.account ||
  !args.notice ||
  !args.manifest ||
  !args.originals ||
  !args.receipt
)
  throw new Error(
    "Usage: admit-gets-pack --account=<uuid> --notice=<saved.html> --manifest=<manifest.json> --originals=<dir> --receipt=<private.json>",
  );
const config = loadConfig();
const db = database(config);
const store = new ObjectStore(config.storageRoot);
try {
  const actor = (
    await db.query(
      "SELECT user_id FROM memberships WHERE account_id=$1 AND role='owner' ORDER BY user_id LIMIT 1",
      [args.account],
    )
  ).rows[0]?.user_id as string | undefined;
  if (!actor) throw new Error("Owner membership required");
  const html = await readFile(args.notice, "utf8");
  const manifest = PackDeclaration.parse(
    JSON.parse(await readFile(args.manifest, "utf8")),
  );
  const noticeUrl = `https://www.gets.govt.nz/DCC/ExternalTenderDetails.htm?id=${manifest.rfxId}`;
  const fields = parseGetsDetail(html, noticeUrl);
  if (
    fields.rfxId !== manifest.rfxId ||
    !fields.title ||
    !fields.buyer ||
    !fields.overview
  )
    throw new Error(
      "Saved GETS notice does not reconcile to the declared RFx and essential fields",
    );
  let saved = await db.query(
    "SELECT n.opportunity_id,n.current_revision_id FROM gets_notices n WHERE n.account_id=$1 AND n.rfx_id=$2",
    [args.account, manifest.rfxId],
  );
  let opportunityId = saved.rows[0]?.opportunity_id as string | undefined;
  if (!opportunityId) {
    opportunityId = randomUUID();
    await db.query(
      "INSERT INTO opportunities(id,account_id,title,buyer,notice_id,cutoff,metadata) VALUES($1,$2,$3,$4,$5,current_date,$6)",
      [
        opportunityId,
        args.account,
        fields.title,
        fields.buyer,
        fields.rfxId,
        {
          origin: "owner-browser-import",
          provider: "GETS",
          provenance: "authenticated",
          noticeUrl,
          overview: fields.overview,
          categories: fields.categories,
          noticeType: fields.noticeType,
          closingAt: fields.closesAt,
        },
      ],
    );
    const raw = Buffer.from(html);
    const admitted = await ingest(db, store, args.account, opportunityId, {
      name: `GETS RFx ${fields.rfxId} subscribed notice`,
      mediaType: "text/html",
      body: raw,
      origin: noticeUrl,
      publishedAt: fields.openedAt?.slice(0, 10) ?? null,
      purpose: "notice",
      required: true,
      provenance: "authenticated",
      actorId: actor,
    });
    if (admitted.state !== "read")
      throw new Error("Saved notice was not readable");
    const source = await db.query(
      "SELECT object_ref FROM sources WHERE id=$1",
      [admitted.id],
    );
    const noticeId = randomUUID(),
      revisionId = randomUUID();
    await transaction(db, async (c) => {
      await c.query(
        "INSERT INTO gets_notices(id,account_id,rfx_id,opportunity_id,current_revision_id) VALUES($1,$2,$3,$4,$5)",
        [noticeId, args.account, fields.rfxId, opportunityId, null],
      );
      await c.query(
        "INSERT INTO gets_notice_revisions(id,account_id,notice_id,semantic_hash,raw_hash,raw_ref,source_id,fields,parser_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          revisionId,
          args.account,
          noticeId,
          semanticNoticeHash(fields),
          hash(raw),
          source.rows[0].object_ref,
          admitted.id,
          fields,
          GETS_PARSER_VERSION,
        ],
      );
      await saveInitialMapping(
        c,
        args.account!,
        noticeId,
        revisionId,
        html,
        fields,
      );
      await c.query(
        "UPDATE gets_notices SET current_revision_id=$2 WHERE id=$1",
        [noticeId, revisionId],
      );
      await classifyOpportunity(
        c,
        args.account!,
        opportunityId!,
        revisionId,
        fields.title!,
        fields.overview,
      );
    });
    saved = await db.query(
      "SELECT opportunity_id,current_revision_id FROM gets_notices WHERE id=$1",
      [noticeId],
    );
  }
  let receipt: { packId: string } | undefined;
  try {
    receipt = JSON.parse(await readFile(args.receipt, "utf8"));
  } catch {
    /* first admission */
  }
  const packId =
    receipt?.packId ??
    (await declareTenderPack(db, args.account, opportunityId, actor, manifest))
      .id;
  await writeFile(
    args.receipt,
    JSON.stringify({ packId, opportunityId, rfxId: manifest.rfxId }, null, 2),
    { mode: 0o600 },
  );
  for (const file of manifest.files.filter((f) => f.status === "current")) {
    const state = await packDetail(db, args.account, packId);
    if (state.files.find((f) => f.fileId === file.fileId)?.sourceId) continue;
    const path = join(args.originals, `${file.fileId}-${file.name}`);
    try {
      await importTenderFile(
        db,
        store,
        args.account,
        packId,
        file.fileId,
        actor,
        createReadStream(path),
      );
      console.log(`Admitted ${file.fileId}: ${file.name}`);
    } catch (error) {
      console.error(`Failed ${file.fileId}: ${(error as Error).message}`);
    }
  }
  const state = await packDetail(db, args.account, packId);
  console.log(
    JSON.stringify(
      {
        packId,
        expected: state.counts.expected,
        received: state.counts.received,
        readable: state.counts.readable,
        complete: state.complete,
        unresolved: state.files
          .filter((f) => f.status === "current" && f.state !== "read")
          .map((f) => ({ name: f.name, state: f.state, problem: f.problem })),
      },
      null,
      2,
    ),
  );
} finally {
  await db.end();
}
