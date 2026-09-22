import { createWriteStream } from "node:fs";
import { mkdir, writeFile, readFile, rename } from "node:fs/promises";
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
    const [owner, id, ...rest] = ref.split("/");
    if (
      owner !== accountId ||
      !uuid.test(owner) ||
      !uuid.test(id ?? "") ||
      rest.length
    )
      throw new Error("Object access denied");
    return readFile(join(this.root, owner, id));
  }
  async json<T>(accountId: string, ref: string): Promise<T> {
    return JSON.parse((await this.get(accountId, ref)).toString("utf8"));
  }
}
