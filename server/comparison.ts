import type { Assessment } from "../shared/contracts.ts";
import { hash } from "./storage.ts";
import { compareFindings } from "./domain/evidence.ts";
export function reportFindings(assessment: Assessment) {
  return assessment.claims.map((c) => ({
    ...c,
    evidenceIds: c.evidenceIds.map((id) => {
      const evidence = assessment.evidence.find((e) => e.id === id);
      if (!evidence) throw new Error("Report evidence reference missing");
      return hash(
        JSON.stringify({
          unitId: evidence.unitId,
          kind: evidence.kind,
          excerpt: evidence.excerpt,
        }),
      );
    }),
  }));
}
export function compareReports(previous: Assessment, current: Assessment) {
  return compareFindings(reportFindings(previous), reportFindings(current)).map(
    (row) => ({
      ...row,
      previousText:
        previous.claims.find((c) => c.id === row.previousId)?.text ?? null,
      currentText:
        current.claims.find((c) => c.id === row.currentId)?.text ?? null,
    }),
  );
}
