import type { GetsScope } from "./parser.ts";

export function getsAccess() {
  return {
    enabled: true as const,
    mode: "manual_public" as const,
    reason: "Owner-initiated public notice check",
    scopes: ["current", "future", "single"] as GetsScope[],
  };
}
