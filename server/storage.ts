import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { mkdir, writeFile, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
export const hash = (input: string | Buffer) =>
  createHash("sha256").update(input).digest("hex");
const uuid = /^[a-f0-9-]{36}$/;
export class ObjectStore {
  constructor(readonly root: string) {}
  async put(accountId: string, data: Buffer | string): Promise<string> {
    if (!uuid.test(accountId)) throw new Error("Invalid account identifier");
    const id = randomUUID(),
      dir = join(this.root, accountId);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const path = join(dir, id);
    await writeFile(`${path}.tmp`, data, { mode: 0o600, flag: "wx" });
    await rename(`${path}.tmp`, path);
    return `${accountId}/${id}`;
  }
  async putFile(accountId: string, sourcePath: string): Promise<string> {
    if (!uuid.test(accountId)) throw new Error("Invalid account identifier");
    const id = randomUUID(),
      dir = join(this.root, accountId);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const path = join(dir, id);
    try {
      await pipeline(
        createReadStream(sourcePath),
        createWriteStream(`${path}.tmp`, { flags: "wx", mode: 0o600 }),
      );
      await rename(`${path}.tmp`, path);
    } catch (error) {
      await rm(`${path}.tmp`, { force: true }).catch(() => {});
      throw error;
    }
    return `${accountId}/${id}`;
  }
  async receipt(accountId: string) {
    const ref = await this.put(accountId, "");
    return {
      ref,
      stream: createWriteStream(join(this.root, ref), {
        flags: "a",
        mode: 0o600,
      }),
    };
  }
  async get(accountId: string, ref: string): Promise<Buffer> {
    return readFile(this.path(accountId, ref));
  }
  path(accountId: string, ref: string): string {
    const [owner, id, ...rest] = ref.split("/");
    if (
      owner !== accountId ||
      !uuid.test(owner) ||
      !uuid.test(id ?? "") ||
      rest.length
    )
      throw new Error("Object access denied");
    return join(this.root, owner, id);
  }
  async verifiedStream(accountId: string, ref: string, expectedHash: string) {
    const path = this.path(accountId, ref);
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(path)) digest.update(chunk);
    if (digest.digest("hex") !== expectedHash)
      throw new Error("Frozen source integrity check failed");
    return createReadStream(path);
  }
  async json<T>(accountId: string, ref: string): Promise<T> {
    return JSON.parse((await this.get(accountId, ref)).toString("utf8"));
  }
}
