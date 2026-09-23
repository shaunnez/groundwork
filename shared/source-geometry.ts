/** Normalised to the displayed (rotation-applied) page, with a top-left origin. */
export interface TextRegion {
  start: number;
  end: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface UnitGeometry {
  page: number;
  method: "native" | "ocr";
  regions: TextRegion[];
}
/** Exact or whitespace-normalised match within one extracted unit, only if unique. */
export function quoteSpan(
  text: string,
  quote: string,
): { start: number; end: number } | null {
  if (!quote.trim()) return null;
  let normalized = "";
  const offsets: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = /\s/.test(text[i]) ? " " : text[i];
    if (char === " " && normalized.endsWith(" ")) continue;
    normalized += char;
    offsets.push(i);
  }
  const needle = quote.replace(/\s+/g, " ").trim();
  const index = normalized.indexOf(needle);
  if (index < 0 || normalized.indexOf(needle, index + 1) >= 0) return null;
  return { start: offsets[index], end: offsets[index + needle.length - 1] + 1 };
}
/** Match only within the cited unit. Ambiguous/non-matching quotations get no box. */
export function quoteRegions(
  text: string,
  quote: string,
  geometry?: UnitGeometry | null,
): TextRegion[] {
  if (!geometry || !quote.trim()) return [];
  const span = quoteSpan(text, quote);
  if (!span) return [];
  const { start, end } = span;
  return geometry.regions.filter(
    (r) =>
      r.end > start &&
      r.start < end &&
      [r.x, r.y, r.width, r.height].every(Number.isFinite) &&
      r.x >= 0 &&
      r.y >= 0 &&
      r.width > 0 &&
      r.height > 0 &&
      r.x + r.width <= 1.001 &&
      r.y + r.height <= 1.001,
  );
}
