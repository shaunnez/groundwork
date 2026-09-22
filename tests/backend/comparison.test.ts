import test from "node:test";
import assert from "node:assert/strict";
import { reportFindings } from "../../server/comparison.ts";
import { compareFindings } from "../../server/domain/evidence.ts";
import type { Assessment } from "../../shared/contracts.ts";
test("A11 evidence changes are compared by source content, not model-local IDs", () => {
  const input = (unitId: string) =>
    ({
      evidence: [
        {
          id: "e1",
          unitId,
          kind: "quote",
          excerpt: "The closing date is Friday.",
        },
      ],
      claims: [
        {
          id: "c1",
          key: "deadline",
          text: "Deadline Friday",
          evidenceIds: ["e1"],
        },
      ],
    }) as Assessment;
  const before = reportFindings(input("source-version-one")),
    after = reportFindings(input("source-version-two"));
  assert.equal(compareFindings(before, after)[0].status, "CHANGED_EVIDENCE");
});
