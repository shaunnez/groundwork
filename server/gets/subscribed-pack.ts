import * as cheerio from "cheerio";
import {
  PackDeclaration,
  type PackDeclaration as Manifest,
} from "../tender-packs.ts";

/** Current downloadable files in a subscribed GETS project detail page. */
export function parseSubscribedPack(
  html: string,
  rfxId: string,
  observedAt = new Date().toISOString(),
): Manifest {
  if (!/^\d{1,20}$/.test(rfxId)) throw new Error("Invalid GETS RFx ID");
  const $ = cheerio.load(html);
  const files: Manifest["files"] = [];
  $("tr").each((_, row) => {
    const cells = $(row).children("td");
    if (cells.length < 3) return;
    if (
      $(row).find("del").length ||
      /\b(?:file\s+)?withdrawn\b/i.test($(row).text())
    )
      return;
    const link = $(cells[0]).find("a[href]").first();
    const href = link.attr("href");
    if (!href || !/ExternalGet(Project|Addendum)File\.htm/i.test(href)) return;
    const url = new URL(href, "https://www.gets.govt.nz/DCC/");
    if (
      url.origin !== "https://www.gets.govt.nz" ||
      url.searchParams.get("projectID") !== rfxId
    )
      throw new Error("GETS attachment link points outside the selected RFx");
    const fileId = url.searchParams.get("fileID") ?? "";
    const name = link.text().trim();
    const bytes = Number($(cells[1]).text().trim());
    const sha256 = $(cells[2]).text().trim().toLowerCase();
    files.push({
      fileId,
      name,
      bytes,
      sha256,
      kind: url.pathname.endsWith("ExternalGetAddendumFile.htm")
        ? "addendum"
        : "attachment",
      status: "current",
    });
  });
  if (!files.length)
    throw new Error(
      "No downloadable files found. Complete RealMe sign-in and subscribe to this selected notice in the browser.",
    );
  return PackDeclaration.parse({ rfxId, observedAt, files });
}
