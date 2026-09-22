import type { UnitGeometry } from "../../shared/source-geometry.ts";
export interface SourceUnit {
  id: string;
  sourceId: string;
  ordinal: number;
  text: string;
  location: string;
  geometry?: UnitGeometry | null;
}
export interface Coverage {
  total: number | null;
  read: number;
  unread: number;
  unit: "page" | "section" | "sheet";
  failures: string[];
}
export type QuoteState =
  | "VERBATIM"
  | "VERBATIM_MODULO_SPACING"
  | "NOT_FOUND"
  | "UNVERIFIED_NOT_MACHINE_CHECKABLE";
export function assertCoverage(c: Coverage): void {
  if (
    !["page", "section", "sheet"].includes(c.unit) ||
    ![c.read, c.unread].every((n) => Number.isInteger(n) && n >= 0) ||
    !Array.isArray(c.failures)
  )
    throw new Error("Invalid coverage");
  if (
    c.total !== null &&
    (!Number.isInteger(c.total) || c.total < 0 || c.read + c.unread !== c.total)
  )
    throw new Error("Coverage does not reconcile");
}
export function completeCoverage(c: Coverage): boolean {
  assertCoverage(c);
  return (
    c.total !== null &&
    c.total > 0 &&
    c.unread === 0 &&
    c.read === c.total &&
    !c.failures.length
  );
}
export function quoteState(quote: string, text: string): QuoteState {
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  if (!quote.trim()) return "NOT_FOUND";
  if (text.includes(quote)) return "VERBATIM";
  return normalize(text).includes(normalize(quote))
    ? "VERBATIM_MODULO_SPACING"
    : "NOT_FOUND";
}
export function searchUnits(
  units: SourceUnit[],
  query: string,
  coverage: Coverage,
) {
  assertCoverage(coverage);
  const needle = query.trim().toLowerCase();
  const hits = needle
    ? units.filter((u) => u.text.toLowerCase().includes(needle))
    : [];
  const complete =
    !!needle &&
    completeCoverage(coverage) &&
    new Set(units.map((u) => u.id)).size === coverage.read;
  return {
    state: hits.length
      ? ("found" as const)
      : complete
        ? ("not_found" as const)
        : ("not_searched" as const),
    hits,
    visitedUnitIds: units.map((u) => u.id),
    coverage,
  };
}
function date(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("Expected ISO calendar date");
  const parsed = Date.parse(value + "T00:00:00Z");
  if (
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString().slice(0, 10) !== value
  )
    throw new Error("Invalid calendar date");
  return parsed;
}
export function calendarDaysBetween(from: string, to: string): number {
  return (date(to) - date(from)) / 86400000;
}
export interface ComparableFinding {
  id: string;
  key: string;
  text: string;
  evidenceIds: string[];
}
export type FindingStatus =
  | "NEW"
  | "UNCHANGED"
  | "CHANGED_EVIDENCE"
  | "CHANGED_ASSESSMENT"
  | "ABSENT_FROM_THIS_RUN";
export function compareFindings(
  previous: ComparableFinding[],
  next: ComparableFinding[],
) {
  const rows: Array<{
    previousId?: string;
    currentId?: string;
    status: FindingStatus;
    rationale: string;
  }> = [];
  const matched = new Set<string>();
  for (const current of next) {
    const candidates = previous.filter((p) => p.key === current.key);
    const unique = next.filter((n) => n.key === current.key).length === 1;
    if (candidates.length !== 1 || !unique) {
      rows.push({
        currentId: current.id,
        status: "NEW",
        rationale: "No unique stable-key match; preserve possible duplicate",
      });
      continue;
    }
    const old = candidates[0];
    matched.add(old.id);
    const evidence =
      JSON.stringify([...old.evidenceIds].sort()) ===
      JSON.stringify([...current.evidenceIds].sort());
    rows.push({
      previousId: old.id,
      currentId: current.id,
      status:
        old.text !== current.text
          ? "CHANGED_ASSESSMENT"
          : evidence
            ? "UNCHANGED"
            : "CHANGED_EVIDENCE",
      rationale:
        "Unique stable-key match; evidence and text compared separately",
    });
  }
  for (const old of previous)
    if (!matched.has(old.id))
      rows.push({
        previousId: old.id,
        status: "ABSENT_FROM_THIS_RUN",
        rationale: "Non-reappearance is not evidence of closure",
      });
  return rows;
}
export function enumerateCandidates(units: SourceUnit[]) {
  return units
    .filter((u) => u.text.trim())
    .map((u) => ({ id: `candidate-${u.id}`, unitId: u.id, text: u.text }));
}
