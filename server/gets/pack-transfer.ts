import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as yauzl from "yauzl";
import { TENDER_PACK_LIMIT, type PackDeclaration } from "../tender-packs.ts";

export class GetsSessionExpired extends Error {}

export async function verifyOriginal(
  path: string,
  file: PackDeclaration["files"][number],
) {
  try {
    if ((await stat(path)).size !== file.bytes) return false;
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(path)) digest.update(chunk);
    return digest.digest("hex") === file.sha256.toLowerCase();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function streamGetsResponse(
  response: Response,
  destination: string,
  limit: number,
) {
  if ([301, 302, 303, 307, 308, 401, 403].includes(response.status))
    throw new GetsSessionExpired("GETS session expired during download");
  if (response.status !== 200 || !response.body)
    throw new Error(`GETS download returned HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (/text\/html/i.test(contentType))
    throw new GetsSessionExpired(
      "GETS returned a sign-in page instead of a file",
    );
  const declaredLength = Number(response.headers.get("content-length"));
  if (declaredLength > limit)
    throw new Error("GETS download exceeded size limit");
  let bytes = 0;
  try {
    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length;
          callback(
            bytes > limit
              ? new Error("GETS download exceeded size limit")
              : null,
            chunk,
          );
        },
      }),
      createWriteStream(destination, { flags: "wx", mode: 0o600 }),
      { signal: AbortSignal.timeout(180000) },
    );
    if (declaredLength && bytes !== declaredLength)
      throw new Error("GETS download length did not match response header");
    return bytes;
  } catch (error) {
    await rm(destination, { force: true });
    throw error;
  }
}

export async function extractGetsArchive(
  path: string,
  manifest: PackDeclaration,
  directory: string,
  filename: (file: PackDeclaration["files"][number]) => string = (file) =>
    file.fileId,
) {
  const destination = (file: PackDeclaration["files"][number]) => {
    const name = filename(file);
    if (!name || name !== basename(name) || name === "." || name === "..")
      throw new Error("Unsafe GETS original filename");
    return join(directory, name);
  };
  const seen = new Set<string>();
  let expanded = 0;
  await new Promise<void>((done, reject) => {
    yauzl.open(
      path,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => {
        if (error || !zip)
          return reject(new Error("GETS bulk archive is not a readable ZIP"));
        let finished = false;
        const fail = (cause: Error) => {
          if (finished) return;
          finished = true;
          zip.close();
          reject(cause);
        };
        zip.on("error", fail);
        zip.on("end", () => {
          if (finished) return;
          if (seen.size !== manifest.files.length)
            return fail(
              new Error(
                `GETS archive contains ${seen.size}/${manifest.files.length} declared files`,
              ),
            );
          finished = true;
          done();
        });
        zip.on("entry", (entry: yauzl.Entry) => {
          if (entry.fileName.endsWith("/")) return zip.readEntry();
          const file = manifest.files.find((candidate) =>
            candidate.kind === "attachment"
              ? entry.fileName === `project_files/${candidate.name}`
              : /^addendum\d+_files\//.test(entry.fileName) &&
                entry.fileName.endsWith(`/${candidate.name}`),
          );
          if (!file || seen.has(file.fileId))
            return fail(
              new Error(
                "GETS archive contained an unexpected or duplicate file",
              ),
            );
          if (
            entry.uncompressedSize !== file.bytes ||
            (expanded += file.bytes) > TENDER_PACK_LIMIT
          )
            return fail(
              new Error(`GETS archive size mismatch for file ${file.fileId}`),
            );
          seen.add(file.fileId);
          void (async () => {
            const target = destination(file);
            if (await verifyOriginal(target, file)) return;
            await rm(target, { force: true });
            const stream = await new Promise<NodeJS.ReadableStream>(
              (resolve, rejectStream) =>
                zip.openReadStream(entry, (streamError, value) =>
                  streamError || !value
                    ? rejectStream(
                        streamError ?? new Error("ZIP entry unreadable"),
                      )
                    : resolve(value),
                ),
            );
            await pipeline(
              stream,
              createWriteStream(target, { flags: "wx", mode: 0o600 }),
            );
            if (!(await verifyOriginal(target, file)))
              throw new Error(`GETS checksum mismatch for file ${file.fileId}`);
          })()
            .then(() => zip.readEntry())
            .catch(fail);
        });
        zip.readEntry();
      },
    );
  });
  for (const file of manifest.files)
    if (!(await verifyOriginal(destination(file), file)))
      throw new Error(
        `GETS original did not reconcile for file ${file.fileId}`,
      );
}
