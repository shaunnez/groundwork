import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { z } from "zod";
const Config = z.object({
  databaseUrl: z.string().startsWith("postgresql://"),
  storageRoot: z.string(),
  sessionSecret: z.string().min(32),
  claudeSubscriptionApproved: z.boolean().default(false),
  firecrawlIncludedConfirmed: z.boolean().default(false),
  firecrawlCredentialFile: z.string().optional(),
  port: z.number().int().default(4318),
  publicOrigin: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return url.protocol === "https:" && url.origin === value;
    }, "Hosted origin must be an exact HTTPS origin")
    .optional(),
  staticRoot: z.string().optional(),
  claudeExecutable: z.string().optional(),
  claudeHome: z.string().optional(),
  reviewerSecret: z.string().min(32).optional(),
  analysisMaxModelCalls: z.number().int().min(1).max(500).default(96),
  analysisRunMinutes: z.number().int().min(10).max(720).default(180),
});
export type Config = z.infer<typeof Config>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const path = env.GROUNDWORK_CONFIG;
  if (env.GROUNDWORK_HOSTED === "true") {
    const c = Config.parse({
      databaseUrl: env.DATABASE_URL,
      storageRoot: env.GROUNDWORK_STORAGE_ROOT || "/data/objects",
      sessionSecret: env.GROUNDWORK_ACCESS_KEY,
      reviewerSecret: env.GROUNDWORK_REVIEW_KEY,
      publicOrigin:
        env.GROUNDWORK_PUBLIC_ORIGIN ||
        (env.RAILWAY_PUBLIC_DOMAIN
          ? `https://${env.RAILWAY_PUBLIC_DOMAIN}`
          : undefined),
      staticRoot: resolve("dist/client"),
      claudeExecutable:
        env.GROUNDWORK_CLAUDE_EXECUTABLE || "/home/node/.local/bin/claude",
      claudeHome: env.GROUNDWORK_CLAUDE_HOME || "/data/claude-home",
      claudeSubscriptionApproved:
        env.GROUNDWORK_SUBSCRIPTION_APPROVED === "true",
      firecrawlIncludedConfirmed:
        env.GROUNDWORK_FIRECRAWL_INCLUDED_CONFIRMED === "true",
      firecrawlCredentialFile: env.GROUNDWORK_FIRECRAWL_CREDENTIAL_FILE,
      analysisMaxModelCalls: Number(
        env.GROUNDWORK_ANALYSIS_MAX_MODEL_CALLS || 96,
      ),
      analysisRunMinutes: Number(env.GROUNDWORK_ANALYSIS_RUN_MINUTES || 180),
      port: Number(env.PORT || 4318),
    });
    if (!c.publicOrigin)
      throw new Error("Hosted access requires an explicit public HTTPS origin");
    if (c.reviewerSecret === c.sessionSecret)
      throw new Error("Owner and reviewer keys must be different");
    return c;
  }
  if (!path)
    throw new Error(
      "Set GROUNDWORK_CONFIG to the private local configuration file.",
    );
  const c = Config.parse(JSON.parse(readFileSync(path, "utf8")));
  c.storageRoot = resolve(c.storageRoot);
  c.claudeExecutable ??= resolve(homedir(), ".local/bin/claude");
  return c;
}
