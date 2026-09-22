import { readFileSync } from "node:fs";
import { z } from "zod";
import type { Config } from "../config.ts";
import type { GetsScope } from "./parser.ts";

const Approval = z
  .object({
    agreementReference: z.string().min(8),
    authorisedAccountIds: z.array(z.string().uuid()).min(1),
    allowedScopes: z.array(z.enum(["current", "future", "single"])).min(1),
    expiresAt: z.string().datetime({ offset: true }),
    route: z.literal("public-gets-html"),
  })
  .strict();
export function getsAccess(
  config: Config,
  accountId: string,
  scope?: GetsScope,
) {
  if (config.getsOperatorTest) {
    if (config.getsOperatorTest.accountId !== accountId)
      return {
        enabled: false as const,
        reason: "This workspace is outside the GETS test scope",
      };
    if (Date.parse(config.getsOperatorTest.expiresAt) <= Date.now())
      return {
        enabled: false as const,
        reason: "The GETS live test has expired",
      };
    return {
      enabled: true as const,
      mode: "operator_test" as const,
      reason: "Owner-authorised live test; GETS permission is pending",
      scopes: ["current", "future", "single"] as GetsScope[],
      expiresAt: config.getsOperatorTest.expiresAt,
    };
  }
  if (!config.getsApprovalFile)
    return {
      enabled: false as const,
      reason: "GETS access arrangement has not been recorded",
    };
  try {
    const approved = Approval.parse(
      JSON.parse(readFileSync(config.getsApprovalFile, "utf8")),
    );
    if (!approved.authorisedAccountIds.includes(accountId))
      return {
        enabled: false as const,
        reason: "This workspace is outside the recorded GETS access scope",
      };
    if (Date.parse(approved.expiresAt) <= Date.now())
      return {
        enabled: false as const,
        reason: "GETS access arrangement has expired",
      };
    if (scope && !approved.allowedScopes.includes(scope))
      return {
        enabled: false as const,
        reason: "This GETS scope is outside the recorded arrangement",
      };
    return {
      enabled: true as const,
      mode: "approved_route" as const,
      reason: "Recorded GETS access arrangement",
      agreementReference: approved.agreementReference,
      scopes: approved.allowedScopes,
    };
  } catch {
    return {
      enabled: false as const,
      reason: "GETS access arrangement file is invalid or unavailable",
    };
  }
}
