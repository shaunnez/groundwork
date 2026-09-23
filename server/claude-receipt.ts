import { z } from "zod";
export class ClaudeTerminalError extends Error {
  constructor(
    readonly callId: string,
    readonly subtype: string,
  ) {
    super(`Claude returned a failed result (${subtype}); inspect receipt before another attempt`);
    this.name = "ClaudeTerminalError";
  }
}
const Envelope = z
  .object({
    type: z.literal("result"),
    subtype: z.string(),
    is_error: z.boolean().optional(),
    structured_output: z.unknown().optional(),
    result: z.string().optional(),
    total_cost_usd: z.number().optional(),
    modelUsage: z.record(z.string(), z.unknown()).optional(),
    duration_ms: z.number().optional(),
  })
  .passthrough();
export function terminalReceipt(raw: string) {
  const lines = raw.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = Envelope.safeParse(JSON.parse(lines[i]));
      if (parsed.success) return parsed.data;
    } catch {
      /* A truncated last frame is not a terminal receipt. */
    }
  }
  return null;
}
export function receiptPayload<T>(raw: string, schema: z.ZodType<T>): T {
  const envelope = terminalReceipt(raw);
  if (!envelope || envelope.is_error || envelope.subtype !== "success")
    throw new Error(
      "No successful terminal provider receipt; reconciliation required",
    );
  return schema.parse(
    envelope.structured_output ?? JSON.parse(envelope.result ?? ""),
  );
}
