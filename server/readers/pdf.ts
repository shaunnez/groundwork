import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDocument, OPS, Util } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Extraction } from "../extract.ts";
import type { TextRegion, UnitGeometry } from "../../shared/source-geometry.ts";
const execute = promisify(execFile);
export function parseOcrTsv(tsv: string): {
  text: string;
  regions: TextRegion[];
} {
  let width = 0,
    height = 0,
    text = "",
    lineKey = "";
  const regions: TextRegion[] = [];
  for (const row of tsv.split(/\r?\n/).slice(1)) {
    const fields = row.split("\t");
    if (fields.length < 12) continue;
    const [level, , , , , , x, y, w, h] = fields.slice(0, 10).map(Number);
    if (level === 1) {
      width = w;
      height = h;
      continue;
    }
    if (level !== 5) continue;
    const word = fields.slice(11).join("\t").trim();
    if (!word) continue;
    if (
      !(width > 0 && height > 0) ||
      ![x, y, w, h].every(Number.isFinite) ||
      x < 0 ||
      y < 0 ||
      w <= 0 ||
      h <= 0 ||
      x + w > width ||
      y + h > height
    )
      throw new Error("OCR returned invalid page coordinates");
    const key = fields.slice(1, 5).join("-");
    if (text) text += key === lineKey ? " " : "\n";
    lineKey = key;
    const start = text.length;
    text += word;
    regions.push({
      start,
      end: text.length,
      x: x / width,
      y: y / height,
      width: w / width,
      height: h / height,
    });
  }
  return { text, regions };
}
// Serialise extraction per API process to avoid concurrent raster/OCR memory spikes.
let busy = false;
export async function extractPdf(
  sourceId: string,
  buffer: Buffer,
): Promise<Extraction> {
  if (busy)
    throw Object.assign(
      new Error("Another PDF is being read. Try again when it finishes."),
      { statusCode: 429 },
    );
  busy = true;
  const units: Extraction["units"] = [],
    failures: string[] = [];
  let total: number | null = null,
    temporary: string | undefined,
    ocrPages = 0;
  const started = Date.now();
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });
  try {
    const doc = await task.promise;
    total = doc.numPages;
    if (total > 200) throw new Error("PDF exceeds the 200-page pack limit");
    for (let p = 1; p <= total; p++) {
      if (Date.now() - started > 300000) {
        failures.push(
          `Pages ${p}–${total}: extraction time limit reached; split the PDF`,
        );
        break;
      }
      try {
        const page = await doc.getPage(p),
          viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        let text = "";
        const regions: TextRegion[] = [];
        for (const item of content.items) {
          if (!("str" in item) || !item.str) continue;
          const start = text.length;
          text += item.str;
          const t = Util.transform(viewport.transform, item.transform),
            fontHeight = Math.hypot(t[2], t[3]),
            angle = Math.atan2(t[1], t[0]);
          const ascent = content.styles[item.fontName]?.ascent ?? 0.8;
          const dx = Math.cos(angle) * item.width,
            dy = Math.sin(angle) * item.width;
          const upX = Math.sin(angle) * fontHeight,
            upY = -Math.cos(angle) * fontHeight;
          const points = [
            [t[4] + upX * ascent, t[5] + upY * ascent],
            [t[4] + dx + upX * ascent, t[5] + dy + upY * ascent],
            [t[4] + dx - upX * (1 - ascent), t[5] + dy - upY * (1 - ascent)],
            [t[4] - upX * (1 - ascent), t[5] - upY * (1 - ascent)],
          ];
          const left = Math.max(0, Math.min(...points.map((v) => v[0]))),
            top = Math.max(0, Math.min(...points.map((v) => v[1]))),
            right = Math.min(
              viewport.width,
              Math.max(...points.map((v) => v[0])),
            ),
            bottom = Math.min(
              viewport.height,
              Math.max(...points.map((v) => v[1])),
            );
          if (right > left && bottom > top)
            regions.push({
              start,
              end: text.length,
              x: left / viewport.width,
              y: top / viewport.height,
              width: (right - left) / viewport.width,
              height: (bottom - top) / viewport.height,
            });
          text += item.hasEOL ? "\n" : " ";
        }
        // A header over a scanned body is still a scan. Inspect image placement, not text length alone.
        const ops = await page.getOperatorList();
        let matrix = [1, 0, 0, 1, 0, 0],
          imageArea = 0,
          largeImage = false;
        const stack: number[][] = [];
        for (let i = 0; i < ops.fnArray.length; i++) {
          const op = ops.fnArray[i],
            args = ops.argsArray[i];
          if (op === OPS.save) stack.push([...matrix]);
          else if (op === OPS.restore)
            matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
          else if (op === OPS.transform) matrix = Util.transform(matrix, args);
          else if (
            [
              OPS.paintImageXObject,
              OPS.paintInlineImageXObject,
              OPS.paintImageMaskXObject,
            ].includes(op)
          ) {
            const area = Math.abs(
              matrix[0] * matrix[3] - matrix[1] * matrix[2],
            );
            imageArea += area;
            if (imageArea / (viewport.width * viewport.height) >= 0.2)
              largeImage = true;
          }
        }
        let geometry: UnitGeometry = { page: p, method: "native", regions };
        if (!text.trim() || largeImage) {
          if (++ocrPages > 50)
            throw new Error(
              "OCR limit is 50 scanned pages per document; split the PDF",
            );
          if (!temporary) {
            temporary = await mkdtemp(join(tmpdir(), "groundwork-ocr-"));
            await writeFile(join(temporary, "source.pdf"), buffer, {
              mode: 0o600,
            });
          }
          const prefix = join(temporary, "page");
          await execute(
            "pdftoppm",
            [
              "-f",
              String(p),
              "-l",
              String(p),
              "-singlefile",
              "-cropbox",
              "-scale-to",
              "2400",
              "-png",
              join(temporary, "source.pdf"),
              prefix,
            ],
            {
              timeout: 20000,
              maxBuffer: 1024 * 1024,
              env: { ...process.env, OMP_THREAD_LIMIT: "1" },
            },
          );
          const result = await execute(
            "tesseract",
            [prefix + ".png", "stdout", "-l", "eng", "--psm", "3", "tsv"],
            {
              timeout: 25000,
              maxBuffer: 8 * 1024 * 1024,
              env: { ...process.env, OMP_THREAD_LIMIT: "1" },
            },
          );
          const ocr = parseOcrTsv(result.stdout);
          text = ocr.text;
          geometry = { page: p, method: "ocr", regions: ocr.regions };
        }
        if (!text.trim())
          throw new Error(
            "no readable text after OCR; needs blank-page review or better scan",
          );
        units.push({
          id: randomUUID(),
          sourceId,
          ordinal: p,
          location: `Page ${p}${geometry.method === "ocr" ? " · OCR" : ""}`,
          text,
          geometry,
        });
        page.cleanup();
      } catch (e) {
        const err = e as NodeJS.ErrnoException & { killed?: boolean };
        const detail =
          err.code === "ENOENT"
            ? "needs local Poppler and Tesseract OCR readers"
            : err.killed
              ? "reader time limit reached; needs a smaller or clearer PDF"
              : err.message.includes("Command failed")
                ? "OCR/raster reader failed; needs a valid PDF and English OCR data"
                : err.message;
        failures.push(`Page ${p}: ${detail}`);
      }
    }
  } catch (e) {
    failures.push(
      `PDF text/OCR reader: ${(e as Error).message}; needs a valid, unencrypted PDF`,
    );
  } finally {
    await task.destroy().catch(() => {});
    if (temporary) await rm(temporary, { recursive: true, force: true });
    busy = false;
  }
  return {
    reader: "pdfjs-text-tesseract-v3",
    state:
      total !== null && units.length === total && !failures.length
        ? "read"
        : units.length
          ? "partial"
          : "unread",
    units,
    coverage: {
      total,
      read: units.length,
      unread: total === null ? 0 : total - units.length,
      unit: "page",
      failures,
    },
  };
}
