import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createApi } from "../../server/api.ts";
import { loadConfig } from "../../server/config.ts";
import { database } from "../../server/db.ts";
import { hash } from "../../server/storage.ts";
import { nativePdf, wordDocument, workbook } from "./document-fixtures.ts";

const config = loadConfig();
const db = database(config);
const account = randomUUID(),
  user = randomUUID(),
  token = randomBytes(32).toString("hex");
const opportunity = randomUUID(),
  notice = randomUUID(),
  revision = randomUUID();
const app = await createApi(config, db);
const headers = {
  cookie: `groundwork_session=${token}`,
  "x-groundwork-request": "local",
  host: "127.0.0.1:4318",
};
const post = (path: string, payload: unknown) =>
  app.inject({
    method: "POST",
    url: path,
    headers,
    payload: payload as object,
  });
const get = (path: string) => app.inject({ method: "GET", url: path, headers });
const put = (path: string, payload: Buffer) =>
  app.inject({
    method: "PUT",
    url: path,
    headers: { ...headers, "content-type": "application/octet-stream" },
    payload,
  });

test("selected tender pack verifies originals and keeps missing files named", async () => {
  await db.query(
    "INSERT INTO accounts(id,name) VALUES($1,'Tender pack fixture')",
    [account],
  );
  await db.query(
    "INSERT INTO memberships(user_id,account_id,role) VALUES($1,$2,'owner')",
    [user, account],
  );
  await db.query(
    "INSERT INTO sessions(token_hash,user_id,account_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
    [hash(token), user, account],
  );
  await db.query(
    "INSERT INTO opportunities(id,account_id,title,buyer,notice_id,cutoff,metadata) VALUES($1,$2,'Bridge works','Test buyer','34995788','2026-09-23',$3)",
    [
      opportunity,
      account,
      {
        title: "Bridge works",
        buyer: "Test buyer",
        noticeUrl:
          "https://www.gets.govt.nz/DCC/ExternalTenderDetails.htm?id=34995788",
      },
    ],
  );
  const source = randomUUID();
  await db.query(
    "INSERT INTO sources(id,account_id,opportunity_id,name,media_type,purpose,required,hash,object_ref,reader,state,coverage,provenance) VALUES($1,$2,$3,'GETS notice','text/html','notice',true,$4,$5,'html-structure-v1','read',$6,'synthetic')",
    [
      source,
      account,
      opportunity,
      hash("notice"),
      `${account}/${randomUUID()}`,
      { total: 1, read: 1, unread: 0, unit: "section", failures: [] },
    ],
  );
  await db.query(
    "INSERT INTO gets_notices(id,account_id,rfx_id,opportunity_id) VALUES($1,$2,'34995788',$3)",
    [notice, account, opportunity],
  );
  await db.query(
    "INSERT INTO gets_notice_revisions(id,account_id,notice_id,semantic_hash,raw_hash,raw_ref,source_id,fields,parser_version) VALUES($1,$2,$3,$4,$5,$6,$7,'{}','fixture-v1')",
    [
      revision,
      account,
      notice,
      hash("semantic"),
      hash("raw"),
      `${account}/${randomUUID()}`,
      source,
    ],
  );
  await db.query("UPDATE gets_notices SET current_revision_id=$2 WHERE id=$1", [
    notice,
    revision,
  ]);

  const drawing = Buffer.alloc(58_516_246);
  nativePdf().copy(drawing);
  const fileInputs = [
    { fileId: "1", name: "Drawings.pdf", kind: "attachment", data: drawing },
    {
      fileId: "2",
      name: "Response.docx",
      kind: "attachment",
      data: wordDocument(),
    },
    { fileId: "3", name: "Prices.xlsx", kind: "attachment", data: workbook() },
  ] as const;
  const files = fileInputs.map((f) => ({
    ...f,
    bytes: f.data.length,
    sha256: hash(f.data),
  }));
  const declared = await post(
    `/api/opportunities/${opportunity}/tender-packs`,
    {
      rfxId: "34995788",
      observedAt: "2026-09-23T00:00:00+12:00",
      files: files.map(({ data, ...file }) => file),
    },
  );
  assert.equal(declared.statusCode, 200, declared.body);
  const packId = declared.json().id;
  const before = (await get(`/api/tender-packs/${packId}`)).json();
  assert.equal(before.counts.expected, 3);
  assert.equal(before.complete, false);
  assert.deepEqual(
    before.files.map((f: { state: string }) => f.state),
    ["missing", "missing", "missing"],
  );
  const blocked = await post(`/api/opportunities/${opportunity}/runs`, {});
  assert.equal(blocked.statusCode, 400);
  assert.match(blocked.body, /Tender pack.*incomplete/);

  const wrong = await put(
    `/api/tender-packs/${packId}/files/3`,
    Buffer.from("wrong"),
  );
  assert.equal(wrong.statusCode, 400);
  assert.equal(
    (await get(`/api/tender-packs/${packId}`)).json().files[2].state,
    "rejected",
  );
  for (const f of files) {
    const result = await put(
      `/api/tender-packs/${packId}/files/${f.fileId}`,
      f.data,
    );
    assert.equal(result.statusCode, 200, result.body);
  }
  const after = (await get(`/api/tender-packs/${packId}`)).json();
  assert.equal(
    after.complete,
    true,
    "All declared originals with complete reader coverage reconcile the pack",
  );
  assert.equal(after.counts.received, 3);
  for (const f of after.files) {
    assert.equal(f.actualSha256, f.sha256);
    assert.equal(f.coverage.unread, 0);
    assert.equal(
      (
        await db.query("SELECT provenance FROM sources WHERE id=$1", [
          f.sourceId,
        ])
      ).rows[0].provenance,
      "authenticated",
    );
    const download = await get(`/api/sources/${f.sourceId}/download`);
    assert.equal(download.statusCode, 200);
    assert.equal(hash(download.rawPayload), f.sha256);
  }
  const review = await post(
    `/api/tender-packs/${packId}/files/1/drawing-review`,
    {
      note: "Reviewed the one fixture drawing page against its extracted source text.",
    },
  );
  assert.equal(review.statusCode, 200, review.body);
  assert.equal(
    (await get(`/api/tender-packs/${packId}`)).json().complete,
    true,
  );
});

test.after(async () => {
  await app.close();
  await db.query("DELETE FROM accounts WHERE id=$1", [account]);
  await db.end();
});
