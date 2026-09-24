import { completeCoverage, type Coverage } from "./domain/evidence.ts";

export type ReadinessSource = {
  name: string;
  reader: string;
  required: boolean;
  coverage: Coverage;
  published_at: string | Date | null;
};

export function hasUnmarkedLegacyRevisions(source: ReadinessSource): boolean {
  return (
    source.reader === "docx-structure-v1" &&
    source.coverage.failures.some((failure) => /: (?:ins|del) /.test(failure))
  );
}

export function runReadinessIssues(
  sources: ReadinessSource[],
  cutoff: string,
  _characters: number,
  options: { allowPartial?: boolean } = {},
): string[] {
  const issues: string[] = [];
  for (const source of sources) {
    if (hasUnmarkedLegacyRevisions(source))
      issues.push(
        `${source.name}: legacy DOCX extraction mixed proposed wording into ordinary text; exclude this source from a high-level assessment`,
      );
    if (
      source.required &&
      !completeCoverage(source.coverage) &&
      !options.allowPartial
    )
      issues.push(
        `${source.name}: ${source.reader}: ${source.coverage.failures.join("; ") || "Incomplete source coverage"}`,
      );
    if (
      source.published_at &&
      new Date(source.published_at).toISOString().slice(0, 10) > cutoff
    )
      issues.push(`${source.name}: published after assessment cutoff`);
  }
  return issues;
}
