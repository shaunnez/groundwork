import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import type { Config } from "./config.ts";
import type { Database } from "./db.ts";
import { claudeEnvironment } from "./claude.ts";

export function firecrawlFile(config: Config): string {
  return (
    config.firecrawlCredentialFile ||
    (config.publicOrigin
      ? "/data/secrets/firecrawl.env"
      : resolve(config.storageRoot, "..", "firecrawl.env"))
  );
}

export async function firecrawlSettings(db: Database, config: Config) {
  const row = await db.query(
    "SELECT firecrawl_enabled FROM app_settings WHERE id='workspace'",
  );
  return {
    includedConfirmed: row.rowCount
      ? Boolean(row.rows[0].firecrawl_enabled)
      : config.firecrawlIncludedConfirmed,
    credentialFile: firecrawlFile(config),
  };
}

export async function hasFirecrawlKey(config: Config): Promise<boolean> {
  try {
    const env = parseEnv(await readFile(firecrawlFile(config), "utf8"));
    return Boolean(env.FIRECRAWL_API_KEY);
  } catch {
    return false;
  }
}

export async function saveFirecrawlKey(
  config: Config,
  key: string,
): Promise<void> {
  const file = firecrawlFile(config);
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `FIRECRAWL_API_KEY=${key}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

function cliEnv(config: Config): NodeJS.ProcessEnv {
  return claudeEnvironment(
    {
      ...process.env,
      ...(config.claudeHome ? { HOME: config.claudeHome } : {}),
    },
    config.storageRoot,
  );
}

export async function claudeStatus(config: Config) {
  try {
    let output: string;
    try {
      const result = await promisify(execFile)(
        config.claudeExecutable!,
        ["auth", "status", "--json"],
        { env: cliEnv(config), timeout: 15000, maxBuffer: 65536 },
      );
      output = result.stdout;
    } catch (error) {
      const stdout = (error as { stdout?: unknown }).stdout;
      if (typeof stdout !== "string") throw error;
      output = stdout;
    }
    const value = JSON.parse(output) as Record<string, unknown>;
    const authenticated =
      value.loggedIn === true &&
      value.authMethod === "claude.ai" &&
      value.apiProvider === "firstParty";
    return {
      authenticated,
      account:
        authenticated && typeof value.email === "string"
          ? value.email.slice(0, 320)
          : null,
      plan:
        authenticated && typeof value.subscriptionType === "string"
          ? value.subscriptionType.slice(0, 80)
          : null,
      issue: authenticated
        ? null
        : value.loggedIn === true
          ? "The CLI is signed in through an unsupported provider."
          : "The CLI is signed out.",
    };
  } catch {
    return {
      authenticated: false,
      account: null,
      plan: null,
      issue: "Claude CLI status is unavailable.",
    };
  }
}

export async function claudeLogout(config: Config): Promise<void> {
  await promisify(execFile)(config.claudeExecutable!, ["auth", "logout"], {
    env: cliEnv(config),
    timeout: 15000,
    maxBuffer: 65536,
  });
}

export function claudeLoginCommand(config: Config): string {
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  const executable = quote(config.claudeExecutable || "claude");
  const command = `${config.claudeHome ? `HOME=${quote(config.claudeHome)} ` : ""}${executable} auth login --claudeai`;
  return config.publicOrigin ? `gosu node env ${command}` : command;
}
