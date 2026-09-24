import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  terminalReceipt,
  terminalFailureSubtype,
  receiptPayload,
} from "../../server/claude-receipt.ts";
test("interruption does not turn a partial response into success", () => {
  assert.equal(
    terminalReceipt('{"type":"assistant","message":"partial"}\n{"type":'),
    null,
  );
  assert.throws(
    () => receiptPayload('{"type":"assistant"}', z.object({ ok: z.boolean() })),
    /reconciliation/,
  );
});
test("terminal structured response can be recovered without another call", () => {
  const receipt = [
    { type: "system", subtype: "init" },
    {
      type: "result",
      subtype: "success",
      structured_output: { ok: true },
      total_cost_usd: 0.02,
      modelUsage: { sonnet: { inputTokens: 1 } },
    },
  ]
    .map((value) => JSON.stringify(value))
    .join("\n");
  assert.deepEqual(receiptPayload(receipt, z.object({ ok: z.literal(true) })), {
    ok: true,
  });
  assert.equal(terminalReceipt(receipt)?.total_cost_usd, 0.02);
});
test("provider success never bypasses schema validation", () => {
  assert.throws(() =>
    receiptPayload(
      '{"type":"result","subtype":"success","structured_output":{"ok":"wrong"}}',
      z.object({ ok: z.boolean() }),
    ),
  );
});
test("a failed success envelope names its output cap instead of success", () => {
  const capped = terminalReceipt(
    JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: true,
      result:
        "API Error: Claude's response exceeded the 12000 output token maximum.",
    }),
  );
  assert.ok(capped);
  assert.equal(terminalFailureSubtype(capped), "output_token_limit");
  const other = terminalReceipt(
    JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: true,
      result: "API Error: another terminal failure",
    }),
  );
  assert.ok(other);
  assert.equal(terminalFailureSubtype(other), "provider_error");
});
