import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extract } from "../server/extract.ts";
import { DOCX, XLSX } from "../server/readers/office.ts";
import { PackDeclaration } from "../server/tender-packs.ts";

const [manifestPath, originalsPath, outputPath, onlyFileId] =
  process.argv.slice(2);
if (!manifestPath || !originalsPath || !outputPath)
  throw new Error(
    "Usage: check-gets-pack <manifest.json> <originals-dir> <private-report.json>",
  );

const manifest = PackDeclaration.parse(
  JSON.parse(await readFile(manifestPath, "utf8")),
);
const results = [];
for (const file of manifest.files.filter(
  (f) => !onlyFileId || f.fileId === onlyFileId,
)) {
  const path = join(originalsPath, `${file.fileId}-${file.name}`);
  try {
    const digest = createHash("sha256");
    let bytes = 0;
    for await (const chunk of createReadStream(path)) {
      bytes += chunk.length;
      if (bytes > file.bytes) throw new Error("Exceeded declared byte size");
      digest.update(chunk);
    }
    const actualSha256 = digest.digest("hex");
    if (bytes !== file.bytes || actualSha256 !== file.sha256)
      throw new Error(`Integrity mismatch: ${bytes} bytes, ${actualSha256}`);
    const mediaType = file.name.endsWith(".pdf")
      ? "application/pdf"
      : file.name.endsWith(".docx")
        ? DOCX
        : file.name.endsWith(".xlsx")
          ? XLSX
          : "application/octet-stream";
    const extraction = await extract(
      randomUUID(),
      mediaType,
      await readFile(path),
    );
    results.push({
      fileId: file.fileId,
      name: file.name,
      bytes,
      sha256: actualSha256,
      reader: extraction.reader,
      state: extraction.state,
      coverage: extraction.coverage,
      units: extraction.units.length,
    });
    console.log(
      `${file.fileId} ${extraction.state} ${extraction.coverage.read}/${extraction.coverage.total ?? "?"} ${file.name}`,
    );
  } catch (error) {
    results.push({
      fileId: file.fileId,
      name: file.name,
      state: "unread",
      error: (error as Error).message,
    });
    console.error(`${file.fileId} unread ${(error as Error).message}`);
  }
}
const report = {
  rfxId: manifest.rfxId,
  checkedAt: new Date().toISOString(),
  expected: manifest.files.length,
  results,
  reconciled:
    results.length === manifest.files.length &&
    results.every((r) => r.state === "read"),
};
await writeFile(outputPath, JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(
  `Reader reconciliation ${results.filter((r) => r.state === "read").length}/${manifest.files.length}`,
);
