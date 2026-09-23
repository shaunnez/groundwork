import { posix } from "node:path";
import { randomUUID } from "node:crypto";
import * as yauzl from "yauzl";
import sax from "sax";
import type { Extraction } from "../extract.ts";
import type { SourceUnit } from "../domain/evidence.ts";
export const DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export function detectMediaType(name: string, supplied: string, body: Buffer) {
  if (body.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "docx") return DOCX;
  if (ext === "xlsx") return XLSX;
  return supplied;
}
/** Read only XML parts, sequentially, with declared and actual decompression limits. */
export async function officeParts(
  buffer: Buffer,
): Promise<Map<string, string>> {
  return new Promise((resolve, reject) =>
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => {
        if (error || !zip)
          return reject(new Error("Invalid Office ZIP container"));
        const parts = new Map<string, string>();
        let total = 0,
          entries = 0,
          ended = false;
        const fail = (e: Error) => {
          if (ended) return;
          ended = true;
          zip.close();
          reject(e);
        };
        zip.on("error", fail);
        zip.on("end", () => {
          if (!ended) {
            ended = true;
            resolve(parts);
          }
        });
        zip.on("entry", (entry: yauzl.Entry) => {
          if (
            ++entries > 2000 ||
            entry.uncompressedSize > 32 * 1024 * 1024 ||
            (total += entry.uncompressedSize) > 64 * 1024 * 1024
          )
            return fail(
              new Error(
                "Office expansion limit exceeded (64 MB / 2,000 entries)",
              ),
            );
          if (entry.isEncrypted())
            return fail(
              new Error("Encrypted Office files need an unencrypted copy"),
            );
          if (!/\.(xml|rels)$/.test(entry.fileName)) {
            zip.readEntry();
            return;
          }
          if (parts.has(entry.fileName))
            return fail(new Error("Duplicate Office part"));
          zip.openReadStream(entry, (err, stream) => {
            if (err || !stream)
              return fail(new Error("Cannot decompress Office part"));
            const chunks: Buffer[] = [];
            let size = 0;
            stream.on("data", (chunk: Buffer) => {
              size += chunk.length;
              if (size > 32 * 1024 * 1024) {
                stream.destroy();
                fail(new Error("Office part exceeds limit"));
              } else chunks.push(chunk);
            });
            stream.on("error", fail);
            stream.on("end", () => {
              if (ended) return;
              try {
                parts.set(
                  entry.fileName,
                  new TextDecoder("utf-8", { fatal: true }).decode(
                    Buffer.concat(chunks),
                  ),
                );
                zip.readEntry();
              } catch {
                fail(new Error("Office XML requires valid UTF-8"));
              }
            });
          });
        });
        zip.readEntry();
      },
    ),
  );
}
interface Node {
  name: string;
  attrs: Record<string, string>;
  children: Node[];
  text: string;
}
function xml(source: string | undefined): Node {
  if (!source) throw new Error("Required Office XML part missing");
  if (/<!DOCTYPE|<!ENTITY/i.test(source))
    throw new Error("DTD/entity declarations are not supported");
  const root: Node = { name: "#root", attrs: {}, children: [], text: "" };
  const stack = [root];
  let count = 0;
  const parser = sax.parser(true, { xmlns: false });
  parser.onopentag = (node) => {
    if (++count > 200000 || stack.length > 100)
      throw new Error("Office XML complexity limit exceeded");
    const item: Node = {
      name: node.name.split(":").pop()!,
      attrs: Object.fromEntries(
        Object.entries(node.attributes).map(([k, v]) => [
          k.split(":").pop()!,
          String(v),
        ]),
      ),
      children: [],
      text: "",
    };
    stack.at(-1)!.children.push(item);
    stack.push(item);
  };
  parser.ontext = (text) => {
    stack.at(-1)!.text += text;
  };
  parser.oncdata = parser.ontext;
  parser.onclosetag = () => {
    stack.pop();
  };
  parser.write(source).close();
  return root;
}
const descendants = (n: Node, name: string): Node[] =>
  n.children.flatMap((c) => [
    ...(c.name === name ? [c] : []),
    ...descendants(c, name),
  ]);
const text = (n: Node): string => n.text + n.children.map(text).join("");
const child = (n: Node, name: string) =>
  n.children.find((c) => c.name === name);
export async function extractOffice(
  sourceId: string,
  mediaType: string,
  buffer: Buffer,
): Promise<Extraction> {
  const reader = mediaType === DOCX ? "docx-structure-v2" : "xlsx-cells-v1";
  const unit = mediaType === DOCX ? "section" : "sheet";
  const units: SourceUnit[] = [];
  const failures: string[] = [];
  let total: number | null = null;
  const add = (value: string, ordinal: number, location: string) =>
    units.push({ id: randomUUID(), sourceId, text: value, ordinal, location });
  try {
    const parts = await officeParts(buffer);
    if (mediaType === DOCX) {
      const names = [...parts.keys()]
        .filter((n) =>
          /^word\/(document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/.test(
            n,
          ),
        )
        .sort((a, b) =>
          a === "word/document.xml"
            ? -1
            : b === "word/document.xml"
              ? 1
              : a.localeCompare(b),
        );
      if (!names.includes("word/document.xml"))
        throw new Error("Word document body missing");
      let ordinal = 0;
      for (const name of names) {
        const doc = xml(parts.get(name));
        const parents = new Map<Node, Node>();
        const indexParents = (node: Node) => {
          for (const nested of node.children) {
            parents.set(nested, node);
            indexParents(nested);
          }
        };
        indexParents(doc);
        const tableLocations = new Map<Node, string>();
        descendants(doc, "tbl").forEach((table, tableIndex) => {
          table.children
            .filter((n) => n.name === "tr")
            .forEach((row, rowIndex) => {
              row.children
                .filter((n) => n.name === "tc")
                .forEach((cell, cellIndex) => {
                  for (const paragraph of descendants(cell, "p")) {
                    tableLocations.set(
                      paragraph,
                      `Table ${tableIndex + 1}, row ${rowIndex + 1}, cell ${cellIndex + 1}`,
                    );
                  }
                });
            });
        });
        // Tracked alternatives are extracted below, but the source does not
        // identify which wording the parties regard as operative.
        for (const tag of [
          "drawing",
          "pict",
          "object",
          "altChunk",
          "del",
          "ins",
        ])
          if (descendants(doc, tag).length)
            failures.push(
              `${name}: ${tag} ${tag === "del" || tag === "ins" ? "alternatives extracted; revision acceptance unresolved" : "content needs visual or embedded-object review"}`,
            );
        for (const p of descendants(doc, "p")) {
          const visit = (n: Node): string => {
            if (n.name === "t" || n.name === "delText") return text(n);
            if (n.name === "tab") return "\t";
            if (n.name === "br") return "\n";
            const inner = n.children.map(visit).join("");
            if (n.name === "ins" || n.name === "del") {
              const label =
                n.name === "ins" ? "proposed insertion" : "proposed deletion";
              const attribution = [n.attrs.author, n.attrs.date]
                .filter(Boolean)
                .join(", ");
              return `⟦${label}${attribution ? ` (${attribution})` : ""}: ${inner}⟧`;
            }
            return inner;
          };
          let value = visit(p).trim();
          let ancestor = parents.get(p);
          while (ancestor) {
            if (ancestor.name === "ins" || ancestor.name === "del")
              value = `⟦proposed ${ancestor.name === "ins" ? "insertion" : "deletion"}: ${value}⟧`;
            ancestor = parents.get(ancestor);
          }
          if (value)
            add(
              value,
              ++ordinal,
              `${name === "word/document.xml" ? "Body" : name.replace("word/", "").replace(".xml", "")} · ${tableLocations.has(p) ? tableLocations.get(p) + " · " : ""}Paragraph ${ordinal}`,
            );
        }
      }
      // Paragraph coverage counts paragraphs only. Embedded content and
      // unresolved revisions stay explicit failures instead of invented
      // missing paragraphs in the denominator.
      total = units.length;
      if (!total) {
        total = 1;
        failures.push("Word document has no readable paragraphs");
      }
    } else {
      const workbook = xml(parts.get("xl/workbook.xml"));
      const rels = descendants(
        xml(parts.get("xl/_rels/workbook.xml.rels")),
        "Relationship",
      );
      const shared = parts.has("xl/sharedStrings.xml")
        ? descendants(xml(parts.get("xl/sharedStrings.xml")), "si").map((si) =>
            descendants(si, "t").map(text).join(""),
          )
        : [];
      const sheets = descendants(workbook, "sheet");
      total = sheets.length;
      if (!total) {
        total = 1;
        failures.push("Workbook has no sheets");
      }
      for (let i = 0; i < sheets.length; i++) {
        const sheet = sheets[i],
          label = sheet.attrs.name ?? `Sheet ${i + 1}`;
        try {
          const rel = rels.find((r) => r.attrs.Id === sheet.attrs.id);
          if (
            !rel ||
            rel.attrs.TargetMode === "External" ||
            !rel.attrs.Type.endsWith("/worksheet")
          )
            throw new Error("needs an internal worksheet reader");
          const path = rel.attrs.Target.startsWith("/")
            ? rel.attrs.Target.slice(1)
            : posix.normalize(posix.join("xl", rel.attrs.Target));
          if (!path.startsWith("xl/"))
            throw new Error("invalid worksheet path");
          const doc = xml(parts.get(path));
          const rows: string[] = [];
          let incomplete = false;
          for (const tag of [
            "drawing",
            "legacyDrawing",
            "oleObjects",
            "controls",
          ])
            if (descendants(doc, tag).length) {
              failures.push(`${label}: ${tag} needs a visual/embedded reader`);
              incomplete = true;
            }
          for (const c of descendants(doc, "c")) {
            const address = c.attrs.r;
            if (!/^[A-Z]{1,3}[1-9]\d*$/.test(address ?? ""))
              throw new Error("cell address missing or invalid");
            const formula = child(c, "f"),
              v = child(c, "v"),
              inline = child(c, "is");
            let value = v ? text(v) : "";
            if (c.attrs.t === "s") {
              const index = Number(value);
              if (!Number.isInteger(index) || shared[index] === undefined)
                throw new Error(`invalid shared string at ${address}`);
              value = shared[index];
            } else if (c.attrs.t === "inlineStr")
              value = inline ? descendants(inline, "t").map(text).join("") : "";
            else if (c.attrs.t === "b")
              value = value === "1" ? "TRUE" : value === "0" ? "FALSE" : value;
            if (formula) {
              if (!v) {
                failures.push(
                  `${label}!${address}: formula has no cached value; needs recalculation in the original spreadsheet`,
                );
                incomplete = true;
              }
              if (!text(formula).trim() || /\[\d+\]/.test(text(formula))) {
                failures.push(
                  `${label}!${address}: shared or external formula needs resolution in the original spreadsheet`,
                );
                incomplete = true;
              }
              if (c.attrs.t === "e") {
                failures.push(
                  `${label}!${address}: cached formula value is an error (${value})`,
                );
                incomplete = true;
              }
              rows.push(
                `${label}!${address}: formula =${text(formula) || "[shared/array formula]"}; cached value ${v ? value : "[missing]"}`,
              );
            } else if (v || inline)
              rows.push(
                `${label}!${address}: ${value}${c.attrs.t === "e" ? " [spreadsheet error]" : ""}${c.attrs.s ? ` [style ${c.attrs.s}; stored value, formatting not interpreted]` : ""}`,
              );
            if (rows.length > 20000)
              throw new Error("20,000-cell limit exceeded");
          }
          for (const merged of descendants(doc, "mergeCell"))
            rows.push(`Merged cells: ${merged.attrs.ref}`);
          const intro = `Sheet: ${label}${sheet.attrs.state ? ` (${sheet.attrs.state})` : ""}. Stored cell values; formulas are not executed.`;
          add(
            intro + "\n" + (rows.join("\n") || "[Empty worksheet]"),
            i + 1,
            `Sheet ${label}`,
          );
          if (incomplete) units[units.length - 1].location += " · incomplete";
        } catch (e) {
          failures.push(`${label}: ${(e as Error).message}`);
        }
      }
    }
  } catch (e) {
    failures.push(
      `${mediaType === XLSX ? "spreadsheet cell/formula reader" : "Word paragraph/table reader"}: ${(e as Error).message}`,
    );
  }
  // For sheets with partial content retain units, but never mark the sheet fully read.
  const read =
    unit === "sheet"
      ? units.filter((u) => !u.location.endsWith(" · incomplete")).length
      : units.length;
  return {
    reader,
    state:
      total !== null && read === total && !failures.length
        ? "read"
        : units.length
          ? "partial"
          : "unread",
    units,
    coverage: {
      total,
      read: total === null ? 0 : read,
      unread: total === null ? 0 : total - read,
      unit,
      failures,
    },
  };
}
