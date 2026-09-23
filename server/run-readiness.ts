import { completeCoverage, type Coverage } from "./domain/evidence.ts";

export const MAX_ANALYSIS_CHARACTERS = 160_000;

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
  characters: number,
): string[] {
  const issues: string[] = [];
  for (const source of sources) {
    if (source.required && !completeCoverage(source.coverage))
      issues.push(
        `${source.name}: ${source.reader}: ${source.coverage.failures.join("; ") || "Incomplete source coverage"}`,
      );
    if (
      source.published_at &&
      new Date(source.published_at).toISOString().slice(0, 10) > cutoff
    )
      issues.push(`${source.name}: published after assessment cutoff`);
  }
  if (characters > MAX_ANALYSIS_CHARACTERS)
    issues.push(
      `Selected evidence has ${characters.toLocaleString("en-NZ")} characters; this analysis path supports at most ${MAX_ANALYSIS_CHARACTERS.toLocaleString("en-NZ")}. Select a narrower source scope.`,
    );
  return issues;
}
