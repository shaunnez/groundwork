import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { chromium } from "@playwright/test";
import { parseSubscribedPack } from "../server/gets/subscribed-pack.ts";
import {
  extractGetsArchive,
  streamGetsResponse,
  verifyOriginal,
} from "../server/gets/pack-transfer.ts";
import type { PackDeclaration } from "../server/tender-packs.ts";
import { TENDER_PACK_LIMIT } from "../server/tender-packs.ts";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, "").split("=");
    return [key, value.join("=")];
  }),
);
const rfx = args.rfx;
if (!/^\d{1,20}$/.test(rfx ?? "") || !args.output)
  throw new Error(
    "Usage: acquire-gets-pack --rfx=<GETS project ID> --output=.local-groundwork/<private-dir> [--notice=<saved.html> --archive=<existing.zip> | --headless=true]",
  );
const privateRoot = resolve(".local-groundwork");
const output = resolve(args.output);
if (!output.startsWith(privateRoot + "/"))
  throw new Error(
    "GETS browser profiles and files must stay under .local-groundwork/",
  );
if (!!args.notice !== !!args.archive)
  throw new Error("--notice and --archive must be supplied together");
const privateEnvPath = join(privateRoot, "realme.env");
if (existsSync(privateEnvPath)) {
  if ((await stat(privateEnvPath)).mode & 0o077)
    throw new Error(".local-groundwork/realme.env must have file mode 0600");
  process.loadEnvFile(privateEnvPath);
}
const scratch = join(output, "temporary");
const originals = join(output, "originals");
await mkdir(scratch, { recursive: true, mode: 0o700 });
await mkdir(originals, { recursive: true, mode: 0o700 });
const detailUrl = `https://www.gets.govt.nz/DCC/ExternalTenderDetails.htm?id=${rfx}`;
const realmeUsername = process.env.GROUNDWORK_REALME_USERNAME;
const realmePassword = process.env.GROUNDWORK_REALME_PASSWORD;
if (!!realmeUsername !== !!realmePassword)
  throw new Error(
    "Set both GROUNDWORK_REALME_USERNAME and GROUNDWORK_REALME_PASSWORD, or neither",
  );

const originalName = (file: PackDeclaration["files"][number]) =>
  `${file.fileId}-${file.name}`;
async function extractArchive(path: string, manifest: PackDeclaration) {
  await extractGetsArchive(path, manifest, originals, originalName);
}

let html: string;
let archivePath: string;
let downloaded = false;
if (args.notice && args.archive) {
  html = await readFile(args.notice, "utf8");
  archivePath = args.archive;
} else {
  const context = await chromium.launchPersistentContext(
    join(output, "browser-profile"),
    {
      headless: args.headless === "true",
      acceptDownloads: false,
    },
  );
  try {
    const sessionPath = join(output, "gets-session.local.json");
    try {
      const saved = JSON.parse(await readFile(sessionPath, "utf8"));
      if (Array.isArray(saved.cookies)) await context.addCookies(saved.cookies);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(detailUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    html = await page.content();
    try {
      parseSubscribedPack(html, rfx!);
    } catch (error) {
      const supplierLogin = page
        .locator('a.realme_login[href*="TendererLogin.auth"]')
        .first();
      if (!(await supplierLogin.count())) throw error;
      await supplierLogin.click();
      if (realmeUsername && realmePassword) {
        const usernameField = page.locator("#signInName");
        await usernameField.waitFor({ timeout: 45000 });
        if (new URL(page.url()).hostname !== "login.realme.govt.nz")
          throw new Error("RealMe login redirected to an unexpected host");
        await usernameField.fill(realmeUsername);
        await page.locator("#password").fill(realmePassword);
        await page.getByRole("button", { name: "Log in", exact: true }).click();
        try {
          await page.waitForURL((url) => url.hostname === "www.gets.govt.nz", {
            timeout: 120000,
          });
        } catch {
          if (args.headless === "true")
            throw new Error(
              "RealMe did not return to GETS after sign-in; rerun visibly to complete any challenge",
            );
        }
      }
      if (new URL(page.url()).hostname !== "www.gets.govt.nz") {
        if (args.headless === "true")
          throw new Error(
            "GETS session expired and interactive RealMe sign-in is required",
          );
        console.log(
          "Complete any RealMe challenge in the opened browser; credentials and challenges stay local.",
        );
        const terminal = createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        await terminal.question("Press Enter after GETS opens. ");
        terminal.close();
      }
      await page.goto(detailUrl, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      html = await page.content();
      try {
        parseSubscribedPack(html, rfx!);
      } catch (cause) {
        if (args.headless === "true") throw cause;
        console.log(
          `Subscribe to this notice in the opened browser if the file table is not yet visible: ${detailUrl}`,
        );
        const terminal = createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        await terminal.question("Press Enter after the files are visible. ");
        terminal.close();
        await page.goto(detailUrl, {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });
        html = await page.content();
      }
    }
    const manifest = parseSubscribedPack(html, rfx!);
    const getsCookies = (
      await context.cookies("https://www.gets.govt.nz/DCC/")
    ).filter(
      (cookie) =>
        cookie.domain === "www.gets.govt.nz" ||
        cookie.domain === ".gets.govt.nz",
    );
    await writeFile(sessionPath, JSON.stringify({ cookies: getsCookies }), {
      mode: 0o600,
    });
    const allPresent = (
      await Promise.all(
        manifest.files.map((file) =>
          verifyOriginal(join(originals, `${file.fileId}-${file.name}`), file),
        ),
      )
    ).every(Boolean);
    archivePath = join(scratch, `gets-${rfx}-${randomUUID()}.zip`);
    if (!allPresent) {
      const cookies = await context.cookies("https://www.gets.govt.nz/DCC/");
      const cookie = cookies
        .map((item) => `${item.name}=${item.value}`)
        .join("; ");
      if (!cookie)
        throw new Error("GETS browser session has no authentication cookies");
      const response = await fetch(
        `https://www.gets.govt.nz/DCC/ExternalGetAllFiles.htm?projectID=${rfx}`,
        {
          headers: { Cookie: cookie },
          redirect: "manual",
          signal: AbortSignal.timeout(180000),
        },
      );
      await streamGetsResponse(response, archivePath, TENDER_PACK_LIMIT);
      downloaded = true;
    }
  } finally {
    await context.close();
  }
}
const manifest = parseSubscribedPack(html, rfx!);
const noticeHash = createHash("sha256").update(html).digest("hex");
const noticePath = join(output, `notice-${noticeHash}.html`);
await writeFile(noticePath, html, { flag: "wx", mode: 0o600 }).catch(
  (error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  },
);
const manifestPath = join(output, `manifest-${noticeHash}.json`);
await writeFile(manifestPath, JSON.stringify(manifest, null, 2), {
  mode: 0o600,
});
try {
  const present = (
    await Promise.all(
      manifest.files.map((file) =>
        verifyOriginal(join(originals, `${file.fileId}-${file.name}`), file),
      ),
    )
  ).every(Boolean);
  if (!present) await extractArchive(archivePath!, manifest);
} finally {
  if (downloaded) await rm(archivePath!, { force: true });
}
console.log(
  JSON.stringify({
    rfxId: rfx,
    files: manifest.files.length,
    originalBytes: manifest.files.reduce((n, file) => n + file.bytes, 0),
    noticePath,
    manifestPath,
    originals,
  }),
);
