import { completeCoverage, type Coverage } from "./domain/evidence.ts";

export type ReadinessSource = {
  name: string;
  reader: string;
  required: boolean;
  coverage: Coverage;
  published_at: string | Date | null;
};

export function runReadinessIssues(
  sources: ReadinessSource[],
  cutoff: string,
  _characters: number,
  options: { allowPartial?: boolean } = {},
): string[] {
  const issues: string[] = [];
  for (const source of sources) {
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
