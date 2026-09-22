import * as cheerio from "cheerio";
import { hash } from "../storage.ts";

export const GETS_PARSER_VERSION = "gets-html-v1";
export type GetsScope = "current" | "future" | "single";
export interface GetsSighting {
  rfxId: string;
  url: string;
  title: string | null;
  listingUrl: string;
}
export interface GetsListing {
  sightings: GetsSighting[];
  nextUrl: string | null;
  advertisedTotal: number | null;
  warnings: string[];
}
export interface GetsNoticeFields {
  provider: "GETS";
  rfxId: string;
  url: string;
  title: string | null;
  buyer: string | null;
  department: string | null;
  reference: string | null;
  noticeType: string | null;
  status: string | null;
  openedRaw: string | null;
  openedAt: string | null;
  closesRaw: string | null;
  closesAt: string | null;
  categories: string[];
  regions: string[];
  overview: string | null;
  accessState: "public_notice_only";
  warnings: string[];
}
const detailPath = /^\/[A-Za-z0-9_-]+\/ExternalTenderDetails\.htm$/;
const rfxPattern = /^\d{5,12}$/;
const clean = (value: string | undefined | null) =>
  value?.replace(/\s+/g, " ").trim() || null;
export function canonicalGetsDetail(
  value: string,
  base = "https://www.gets.govt.nz/",
) {
  const url = new URL(value, base);
  const id = url.searchParams.get("id");
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.gets.govt.nz" ||
    !detailPath.test(url.pathname) ||
    !id ||
    !rfxPattern.test(id) ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    url.hash
  )
    throw new Error("Expected a public GETS detail URL with RFx ID");
  return { rfxId: id, url: `https://www.gets.govt.nz${url.pathname}?id=${id}` };
}
export function parseGetsListing(
  html: string,
  listingUrl: string,
): GetsListing {
  const $ = cheerio.load(html);
  const sightings: GetsSighting[] = [];
  const warnings: string[] = [];
  $("tr").each((_, row) => {
    const element = $(row).find('a[href*="ExternalTenderDetails.htm"]').first();
    const href = element.attr("href") || "";
    if (!href) return;
    try {
      const detail = canonicalGetsDetail(href, listingUrl);
      const title =
        clean($(row).children("td").eq(2).text()) ||
        clean(
          $(row).find('a[href*="ExternalTenderDetails.htm"]').last().text(),
        ) ||
        clean(element.text());
      sightings.push({ ...detail, title, listingUrl });
    } catch {
      warnings.push("A detail link was not a supported GETS URL");
    }
  });
  let nextUrl: string | null = null;
  $("a[href]").each((_, element) => {
    if (nextUrl) return;
    const label = clean($(element).text())?.toLowerCase() || "";
    const rel = $(element).attr("rel")?.toLowerCase();
    if (
      rel !== "next" &&
      !/^(next|next page|›|»)$/.test(label) &&
      !$(element).find("img#next-active").length
    )
      return;
    try {
      const candidate = new URL($(element).attr("href")!, listingUrl);
      if (
        candidate.protocol === "https:" &&
        candidate.hostname === "www.gets.govt.nz" &&
        /^\/(?:ExternalIndex|FutureProcurementOpportunitiesIndex)\.htm$/.test(
          candidate.pathname,
        )
      )
        nextUrl = candidate.href;
      else
        warnings.push("Pagination link left the selected public listing route");
    } catch {
      warnings.push("Invalid pagination URL");
    }
  });
  const body = clean($("body").text()) || "";
  const totalMatch =
    body.match(
      /(?:total|showing|results?)\s*[: ]\s*(\d{1,6})\s+(?:tenders?|opportunities|results?)/i,
    ) ||
    (clean($(".paging").first().text()) || "").match(
      /\b\d+\s*-\s*\d+\s+of\s+(\d{1,6})\b/i,
    );
  return {
    sightings,
    nextUrl,
    advertisedTotal: totalMatch ? Number(totalMatch[1]) : null,
    warnings,
  };
}

function localDate(raw: string | null): string | null {
  if (!raw) return null;
  const zone = raw
    .match(/\b(NZST|NZDT|UTC\s*[+-]\s*\d{1,2}(?::?\d{2})?)\b/i)?.[1]
    ?.toUpperCase();
  const offset =
    zone === "NZST"
      ? "+12:00"
      : zone === "NZDT"
        ? "+13:00"
        : zone?.startsWith("UTC")
          ? zone
              .replace(/UTC\s*/, "")
              .replace(/\s/g, "")
              .replace(/^([+-]\d{1,2})$/, "$1:00")
          : null;
  if (!offset) return null;
  const after = raw.match(
    /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:\s+(?:at\s+)?)?(\d{1,2}):(\d{2})\s*(AM|PM)?/i,
  );
  const before = raw.match(
    /(\d{1,2}):(\d{2})\s*(AM|PM)?\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i,
  );
  if (!after && !before) return null;
  const day = Number(after?.[1] ?? before?.[4]);
  const name = (after?.[2] ?? before?.[5] ?? "").toLowerCase();
  const year = Number(after?.[3] ?? before?.[6]);
  let hour = Number(after?.[4] ?? before?.[1]);
  const minute = Number(after?.[5] ?? before?.[2]);
  const period = (after?.[6] ?? before?.[3])?.toUpperCase();
  const month = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].findIndex(
    (month) => month === name || (month.startsWith(name) && name.length >= 3),
  );
  if (
    month < 0 ||
    minute > 59 ||
    day < 1 ||
    day > 31 ||
    (period ? hour < 1 || hour > 12 : hour > 23)
  )
    return null;
  const calendar = new Date(Date.UTC(year, month, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month ||
    calendar.getUTCDate() !== day
  )
    return null;
  if (period) hour = (hour % 12) + (period === "PM" ? 12 : 0);
  const stamp = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${offset}`;
  return Number.isNaN(Date.parse(stamp)) ? null : stamp;
}
export function parseGetsDetail(html: string, value: string): GetsNoticeFields {
  const { rfxId, url } = canonicalGetsDetail(value);
  const $ = cheerio.load(html);
  $("script,style,noscript,nav,footer,header,form,iframe").remove();
  const labels = new Map<string, string[]>();
  const add = (key: string | null, value: string | null) => {
    if (!key || !value) return;
    const normalized = key
      .toLowerCase()
      .replace(/[^a-z ]/g, "")
      .trim();
    labels.set(normalized, [...(labels.get(normalized) || []), value]);
  };
  $("tr").each((_, row) => {
    const cells = $(row).children("th,td");
    if (cells.length >= 2)
      add(clean($(cells[0]).text()), clean($(cells[1]).text()));
  });
  $("dt").each((_, term) =>
    add(clean($(term).text()), clean($(term).next("dd").text())),
  );
  const field = (...names: string[]) =>
    names.flatMap((name) => labels.get(name) || [])[0] || null;
  const arrayField = (...names: string[]) => {
    const values: string[] = [];
    $("tr").each((_, row) => {
      const cells = $(row).children("th,td");
      const label = clean($(cells[0]).text())
        ?.toLowerCase()
        .replace(/[^a-z ]/g, "")
        .trim();
      if (!label || !names.includes(label)) return;
      const entries = $(cells[1]).find("li");
      if (entries.length)
        entries.each((_, entry) => {
          const value = clean(
            $(entry).clone().children("ul").remove().end().text(),
          );
          if (value) values.push(value);
        });
      else
        values.push(
          ...(clean($(cells[1]).text()) || "").split(/[,;]|\s*\|\s*/),
        );
    });
    if (!values.length)
      values.push(
        ...names
          .flatMap((name) => labels.get(name) || [])
          .flatMap((value) => value.split(/[,;]|\s*\|\s*/)),
      );
    return [...new Set(values.map(clean).filter((v): v is string => !!v))];
  };
  const title =
    field("title", "tender title", "tender name") ||
    clean($("h1").first().text());
  const overviewHeading = $("h2,h3,h4")
    .filter((_, element) => /^overview$/i.test(clean($(element).text()) || ""))
    .first();
  const overview =
    field("overview", "description", "tender overview") ||
    clean($(".overview").first().text()) ||
    clean(overviewHeading.next("p,div").text()) ||
    clean(
      $(".detail-divider .legend")
        .filter((_, element) =>
          /^overview$/i.test(clean($(element).text()) || ""),
        )
        .first()
        .parent()
        .nextAll("p")
        .first()
        .text(),
    );
  const openedRaw = field("open date", "opening date", "published date");
  const closesRaw = field("close date", "closing date", "deadline");
  const warnings: string[] = [];
  if (!title) warnings.push("Title was not located");
  if (!overview) warnings.push("Public overview was not located");
  if (openedRaw && !localDate(openedRaw))
    warnings.push(
      "Open date retained as raw text; timezone or format unresolved",
    );
  if (closesRaw && !localDate(closesRaw))
    warnings.push(
      "Close date retained as raw text; timezone or format unresolved",
    );
  return {
    provider: "GETS",
    rfxId,
    url,
    title,
    buyer:
      field("purchaser", "buyer", "agency", "organisation", "organization") ||
      clean($("#theDrill a").eq(1).text()),
    department: field("department", "departmentbusiness unit"),
    reference: field("reference", "tender reference", "reference number"),
    noticeType: field("tender type", "notice type", "type"),
    status:
      field("status", "tender status") ||
      clean($(".tender-details .notice.warning").first().text()),
    openedRaw,
    openedAt: localDate(openedRaw),
    closesRaw,
    closesAt: localDate(closesRaw),
    categories: arrayField("categories", "category"),
    regions: arrayField("regions", "region"),
    overview,
    accessState: "public_notice_only",
    warnings,
  };
}
export function semanticNoticeHash(fields: GetsNoticeFields) {
  const { warnings: _warnings, ...material } = fields;
  return hash(JSON.stringify(material));
}
