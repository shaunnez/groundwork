import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { parseSubscribedPack } from "../../server/gets/subscribed-pack.ts";

const sha = createHash("sha256").update("fixture").digest("hex");
const row = (kind: "Project" | "Addendum", id: string, project = "34995788") =>
  `<tr class="file"><td><a href="ExternalGet${kind}File.htm?projectID=${project}&amp;fileID=${id}">fixture-${id}.pdf</a></td><td>100</td><td>${sha}</td><td>Pass</td></tr>`;

test("subscribed GETS file table declares current originals and addenda", () => {
  const withdrawnWithLink = row("Project", "13").replace(
    "<td>Pass</td>",
    "<td>File Withdrawn</td>",
  );
  const html = `<table>${row("Project", "11")}<tr><td><del>withdrawn.pdf</del></td><td>10</td><td>${sha}</td></tr>${withdrawnWithLink}${row("Addendum", "12")}</table>`;
  const manifest = parseSubscribedPack(html, "34995788");
  assert.equal(manifest.files.length, 2);
  assert.deepEqual(
    manifest.files.map((file) => file.kind),
    ["attachment", "addendum"],
  );
  assert.deepEqual(
    manifest.files.map((file) => file.fileId),
    ["11", "12"],
  );
});

test("subscribed file links cannot point to another project", () => {
  assert.throws(
    () =>
      parseSubscribedPack(
        `<table>${row("Project", "11", "123")}</table>`,
        "34995788",
      ),
    /outside the selected RFx/,
  );
});
