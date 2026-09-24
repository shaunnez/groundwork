import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  GetsSessionExpired,
  streamGetsResponse,
} from "../../server/gets/pack-transfer.ts";

test("GETS transfer rejects redirected and HTML sign-in responses before admission", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gets-transfer-"));
  try {
    await assert.rejects(
      streamGetsResponse(
        new Response(null, {
          status: 302,
          headers: { location: "https://login.realme.govt.nz/" },
        }),
        join(dir, "redirect"),
        100,
      ),
      GetsSessionExpired,
    );
    await assert.rejects(
      streamGetsResponse(
        new Response("<html>Sign in</html>", {
          headers: { "content-type": "text/html" },
        }),
        join(dir, "html"),
        100,
      ),
      GetsSessionExpired,
    );
    await assert.rejects(
      streamGetsResponse(
        new Response("oversized", { headers: { "content-length": "999" } }),
        join(dir, "large"),
        10,
      ),
      /size limit/,
    );
    await streamGetsResponse(
      new Response("verified", {
        headers: { "content-length": "8", "content-type": "application/pdf" },
      }),
      join(dir, "good"),
      10,
    );
    assert.equal((await readFile(join(dir, "good"))).toString(), "verified");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
