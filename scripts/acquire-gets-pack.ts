import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { createInterface } from "node:readline/promises";
import { chromium } from "@playwright/test";
import * as yauzl from "yauzl";
import { parseSubscribedPack } from "../server/gets/subscribed-pack.ts";
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
const scratch = join(output, "temporary");
const originals = join(output, "originals");
await mkdir(scratch, { recursive: true, mode: 0o700 });
await mkdir(originals, { recursive: true, mode: 0o700 });
const detailUrl = `https://www.gets.govt.nz/DCC/ExternalTenderDetails.htm?id=${rfx}`;

async function verifyFile(
  path: string,
  expected: { bytes: number; sha256: string },
) {
  try {
    if ((await stat(path)).size !== expected.bytes) return false;
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(path)) digest.update(chunk);
    return digest.digest("hex") === expected.sha256.toLowerCase();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function extractArchive(path: string, manifest: PackDeclaration) {
  const expected = new Map(
    manifest.files.map((file) => [
      `${file.kind === "attachment" ? "project_files" : "addendum"}/${file.name}`,
      file,
    ]),
  );
  const seen = new Set<string>();
  let expanded = 0;
  await new Promise<void>((resolveDone, rejectDone) => {
    yauzl.open(
      path,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => {
        if (error || !zip)
          return rejectDone(new Error("GETS archive is not a readable ZIP"));
        let done = false;
        const fail = (cause: Error) => {
          if (done) return;
          done = true;
          zip.close();
          rejectDone(cause);
        };
        zip.on("error", fail);
        zip.on("end", () => {
          if (done) return;
          if (seen.size !== manifest.files.length)
            return fail(
              new Error(
                `Archive contains ${seen.size}/${manifest.files.length} declared files`,
              ),
            );
          done = true;
          resolveDone();
        });
        zip.on("entry", (entry: yauzl.Entry) => {
          if (entry.fileName.endsWith("/")) return zip.readEntry();
          const file = manifest.files.find(
            (candidate) =>
              (entry.fileName === `project_files/${candidate.name}` &&
                candidate.kind === "attachment") ||
              (/^addendum\d+_files\//.test(entry.fileName) &&
                entry.fileName.endsWith(`/${candidate.name}`) &&
                candidate.kind === "addendum"),
          );
          if (!file || seen.has(file.fileId))
            return fail(
              new Error(
                `Unexpected or duplicate GETS archive entry: ${entry.fileName}`,
              ),
            );
          if (
            entry.uncompressedSize !== file.bytes ||
            (expanded += file.bytes) > TENDER_PACK_LIMIT
          )
            return fail(new Error(`GETS archive size mismatch: ${file.name}`));
          seen.add(file.fileId);
          const destination = join(originals, `${file.fileId}-${file.name}`);
          if (expected.size !== manifest.files.length)
            return fail(new Error("Ambiguous declared filenames"));
          void (async () => {
            if (await verifyFile(destination, file)) return;
            const temporary = join(
              scratch,
              `${file.fileId}-${randomUUID()}.part`,
            );
            try {
              const stream = await new Promise<NodeJS.ReadableStream>(
                (res, rej) =>
                  zip.openReadStream(entry, (e, value) =>
                    e || !value
                      ? rej(e ?? new Error("ZIP entry unreadable"))
                      : res(value),
                  ),
              );
              const digest = createHash("sha256");
              let bytes = 0;
              await pipeline(
                stream,
                new Transform({
                  transform(chunk: Buffer, _encoding, callback) {
                    bytes += chunk.length;
                    if (bytes > file.bytes)
                      return callback(
                        new Error("GETS file exceeded declared size"),
                      );
                    digest.update(chunk);
                    callback(null, chunk);
                  },
                }),
                createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
              );
              if (
                bytes !== file.bytes ||
                digest.digest("hex") !== file.sha256.toLowerCase()
              )
                throw new Error(`GETS checksum mismatch: ${file.name}`);
              await rename(temporary, destination);
            } catch (cause) {
              await rm(temporary, { force: true });
              throw cause;
            }
          })()
            .then(() => zip.readEntry())
            .catch(fail);
        });
        zip.readEntry();
      },
    );
  });
  for (const file of manifest.files)
    if (
      !(await verifyFile(join(originals, `${file.fileId}-${file.name}`), file))
    )
      throw new Error(`Original did not reconcile: ${file.name}`);
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
      if (args.headless === "true") throw error;
      const supplierLogin = page
        .locator('a.realme_login[href*="TendererLogin.auth"]')
        .first();
      if (await supplierLogin.count()) {
        await supplierLogin.click();
        await page
          .waitForLoadState("domcontentloaded", { timeout: 45000 })
          .catch(() => undefined);
      }
      console.log(
        `Complete RealMe sign-in and, if needed, this notice's subscription in the opened browser: ${detailUrl}`,
      );
      const terminal = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      await terminal.question(
        "Press Enter after the files are visible in the browser. ",
      );
      terminal.close();
      await page.goto(detailUrl, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      html = await page.content();
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
          verifyFile(join(originals, `${file.fileId}-${file.name}`), file),
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
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), 180000);
      try {
        const response = await fetch(
          `https://www.gets.govt.nz/DCC/ExternalGetAllFiles.htm?projectID=${rfx}`,
          {
            headers: { Cookie: cookie },
            redirect: "manual",
            signal: controller.signal,
          },
        );
        if (response.status !== 200 || !response.body)
          throw new Error(
            `GETS bulk download returned HTTP ${response.status}; sign-in may have expired`,
          );
        const declared = Number(response.headers.get("content-length"));
        if (declared > TENDER_PACK_LIMIT)
          throw new Error(
            "GETS bulk archive exceeds the 128 MiB transfer limit",
          );
        let bytes = 0;
        await pipeline(
          response.body,
          new Transform({
            transform(chunk: Buffer, _encoding, callback) {
              bytes += chunk.length;
              if (bytes > TENDER_PACK_LIMIT)
                return callback(
                  new Error("GETS bulk archive exceeded 128 MiB"),
                );
              callback(null, chunk);
            },
          }),
          createWriteStream(archivePath, { flags: "wx", mode: 0o600 }),
        );
        downloaded = true;
      } finally {
        clearTimeout(deadline);
      }
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
        verifyFile(join(originals, `${file.fileId}-${file.name}`), file),
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
