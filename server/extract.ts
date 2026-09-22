import { randomUUID } from "node:crypto";
import * as cheerio from "cheerio";
import { extractPdf } from "./readers/pdf.ts";
import { extractOffice, DOCX, XLSX } from "./readers/office.ts";
import type { Coverage, SourceUnit } from "./domain/evidence.ts";
export type Extraction = {
  reader: string;
  state: "read" | "partial" | "unread";
  coverage: Coverage;
  units: SourceUnit[];
};
export async function extract(
  sourceId: string,
  mediaType: string,
  buffer: Buffer,
): Promise<Extraction> {
  let reader = "unsupported";
  const units: SourceUnit[] = [];
  const failures: string[] = [];
  const add = (text: string, ordinal: number, location: string) => {
    units.push({ id: randomUUID(), sourceId, ordinal, text, location });
  };
  if (mediaType === "application/pdf") return extractPdf(sourceId, buffer);
  if ([DOCX, XLSX].includes(mediaType))
    return extractOffice(sourceId, mediaType, buffer);
  if (
    ["text/plain", "text/html", "text/csv", "application/json"].includes(
      mediaType,
    )
  ) {
    reader =
      mediaType === "text/html" ? "html-structure-v1" : "utf8-sections-v1";
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      return {
        reader,
        state: "unread",
        units,
        coverage: {
          total: null,
          read: 0,
          unread: 0,
          unit: "section",
          failures: ["Invalid UTF-8: needs encoding-aware text reader"],
        },
      };
    }
    let chunks: string[];
    if (mediaType === "text/html") {
      const $ = cheerio.load(text);
      $("script,style,noscript,nav,footer,header,form,iframe").remove();
      const root = $("main").length ? $("main").first() : $("body");
      const blocks = root
        .find("h1,h2,h3,h4,p,li,table,pre")
        .filter((_, el) => $(el).parents("table,li,pre").length === 0)
        .toArray();
      chunks = blocks.map((el) => $(el).text().trim()).filter(Boolean);
      if (!chunks.length) chunks = [root.text().trim()];
    } else {
      chunks = text
        .split(/\n\s*\n/)
        .map((t) => t.trim())
        .filter(Boolean);
    }
    chunks.forEach((s, i) => add(s, i + 1, `Section ${i + 1}`));
    if (!units.length)
      failures.push("No readable text; needs a source containing text");
    return {
      reader,
      state: units.length ? "read" : "unread",
      units,
      coverage: {
        total: Math.max(1, units.length),
        read: units.length,
        unread: units.length ? 0 : 1,
        unit: "section",
        failures,
      },
    };
  }
  const needed =
    mediaType.includes("sheet") || mediaType.includes("excel")
      ? "spreadsheet cell, formula and sheet reader"
      : mediaType.startsWith("image/")
        ? "OCR image reader"
        : "a reader supporting this format";
  return {
    reader,
    state: "unread",
    units,
    coverage: {
      total: null,
      read: 0,
      unread: 0,
      unit: "section",
      failures: [`Unsupported ${mediaType}; needs ${needed}`],
    },
  };
}
