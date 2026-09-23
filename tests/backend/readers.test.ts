import test from "node:test";
import assert from "node:assert/strict";
import { extract } from "../../server/extract.ts";
import { DOCX, XLSX, officeParts } from "../../server/readers/office.ts";
import { parseOcrTsv } from "../../server/readers/pdf.ts";
import {
  assertCoverage,
  completeCoverage,
} from "../../server/domain/evidence.ts";
import { quoteRegions } from "../../shared/source-geometry.ts";
import {
  nativePdf,
  scannedPdf,
  wordDocument,
  workbook,
  zipParts,
} from "./document-fixtures.ts";
test("DOCX preserves paragraphs, table contents and headers with locations", async () => {
  const r = await extract("word", DOCX, wordDocument());
  assert.equal(r.state, "read");
  assertCoverage(r.coverage);
  const text = r.units.map((u) => u.text).join("\n");
  for (const value of [
    "Submit Form X.",
    "Insurance",
    "Required",
    "Synthetic tender",
  ])
    assert.ok(text.includes(value));
  assert.ok(r.units.every((u) => u.location.includes("Paragraph")));
});
test("DOCX embedded and tracked content cannot silently count as complete", async () => {
  for (const content of [
    "<w:p><w:drawing/></w:p>",
    "<w:ins><w:p><w:r><w:t>New clause</w:t></w:r></w:p></w:ins>",
  ]) {
    const r = await extract("word", DOCX, wordDocument(content));
    assert.equal(r.state, "partial");
    assert.equal(completeCoverage(r.coverage), false);
    assertCoverage(r.coverage);
  }
});
test("DOCX retains both tracked wording alternatives without selecting an operative version", async () => {
  const r = await extract(
    "word",
    DOCX,
    wordDocument(
      '<w:p><w:r><w:t>The limit is </w:t></w:r><w:del w:author="Buyer" w:date="2026-09-20"><w:r><w:delText>20 days</w:delText></w:r></w:del><w:ins w:author="Buyer" w:date="2026-09-21"><w:r><w:t>30 days</w:t></w:r></w:ins></w:p>',
    ),
  );
  const extracted = r.units.map((unit) => unit.text).join("\n");
  assert.match(extracted, /proposed deletion \(Buyer, 2026-09-20\): 20 days/);
  assert.match(extracted, /proposed insertion \(Buyer, 2026-09-21\): 30 days/);
  assert.equal(r.reader, "docx-structure-v2");
  assert.equal(r.state, "partial");
  assert.equal(r.coverage.unread, 0);
  assert.match(r.coverage.failures.join(" "), /revision acceptance unresolved/);
});
test("XLSX reads hidden sheets, cells, zero/false and formula cached values", async () => {
  const r = await extract("excel", XLSX, workbook());
  assert.equal(r.state, "read");
  assert.equal(r.coverage.total, 2);
  assertCoverage(r.coverage);
  assert.match(r.units[0].text, /Prices!B1: 0/);
  assert.match(r.units[0].text, /Prices!C1: FALSE/);
  assert.match(r.units[0].text, /formula =B1\*2; cached value 0/);
  assert.match(r.units[1].text, /hidden/);
  assert.match(r.units[1].text, /Insurance required/);
});
test("XLSX missing cached formula blocks coverage but retains visible cells", async () => {
  const r = await extract(
    "excel",
    XLSX,
    workbook('<c r="E1"><f>SUM(B1:D1)</f></c>'),
  );
  assert.equal(r.state, "partial");
  assert.equal(r.coverage.read, 1);
  assert.equal(r.coverage.unread, 1);
  assertCoverage(r.coverage);
  assert.match(r.coverage.failures[0], /Prices!E1/);
  assert.match(r.units[0].text, /Mandatory form/);
});
test("Office malformed containers and DTDs fail closed", async () => {
  await assert.rejects(officeParts(Buffer.from("not a zip")), /Invalid Office/);
  const r = await extract(
    "word",
    DOCX,
    zipParts({
      "word/document.xml":
        '<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]><document>&x;</document>',
    }),
  );
  assert.equal(r.state, "unread");
  assert.match(r.coverage.failures[0], /DTD/);
});
test("Native PDF saves valid highlight coordinates, including rotated pages", async () => {
  for (const rotation of [0, 90, 180, 270]) {
    const r = await extract("pdf", "application/pdf", nativePdf(rotation));
    assert.equal(r.state, "read");
    const u = r.units[0];
    assert.equal(u.geometry?.method, "native");
    const boxes = quoteRegions(
      u.text,
      "Suppliers must submit Form X.",
      u.geometry,
    );
    assert.ok(boxes.length > 0);
    assert.ok(
      boxes.every(
        (b) =>
          b.x >= 0 &&
          b.y >= 0 &&
          b.x + b.width <= 1.001 &&
          b.y + b.height <= 1.001,
      ),
    );
  }
});
test("Real local OCR reads scanned body even with a native text header", async () => {
  for (const header of [false, true]) {
    const r = await extract("scan", "application/pdf", scannedPdf(header));
    assert.equal(r.state, "read", JSON.stringify(r.coverage));
    assert.equal(r.units[0].geometry?.method, "ocr");
    assert.match(r.units[0].text, /Suppliers must submit Form X/);
    assert.ok(
      quoteRegions(
        r.units[0].text,
        "Suppliers must submit Form X.",
        r.units[0].geometry,
      ).length > 0,
    );
  }
});
test("Quote locations never guess ambiguous or unsupported text", () => {
  const geometry = {
    page: 1,
    method: "native" as const,
    regions: [{ start: 0, end: 12, x: 0.1, y: 0.1, width: 0.3, height: 0.02 }],
  };
  assert.equal(quoteRegions("same same", "same", geometry).length, 0);
  assert.equal(quoteRegions("original", "different", geometry).length, 0);
  assert.equal(quoteRegions("A  B\nC", "A B C", geometry).length, 1);
  assert.equal(quoteRegions("original", "original").length, 0);
});
test("OCR cannot supply out-of-page rectangles", () => {
  assert.throws(
    () =>
      parseOcrTsv(
        "level\tpage\tblock\tpar\tline\tword\tleft\ttop\twidth\theight\tconf\ttext\n1\t1\t0\t0\t0\t0\t0\t0\t100\t100\t-1\t\n5\t1\t1\t1\t1\t1\t99\t0\t10\t10\t90\tword",
      ),
    /invalid/,
  );
});

test("OCR rectangles use the same PDF crop box as the viewer", async () => {
  const result = await extract(
    "cropped-scan",
    "application/pdf",
    scannedPdf(false, true),
  );
  assert.equal(result.state, "read", JSON.stringify(result.coverage));
  const unit = result.units[0];
  const regions = quoteRegions(
    unit.text,
    "Suppliers must submit Form X.",
    unit.geometry,
  );
  assert.ok(regions.length >= 5);
  // Text starts at ~60pt; CropBox starts at 40pt on a 532pt-wide displayed page.
  assert.ok(
    regions[0].x > 0.03 && regions[0].x < 0.06,
    JSON.stringify(regions[0]),
  );
});
