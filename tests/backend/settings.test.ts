import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../server/config.ts";
import { claudeStatus, claudeLoginCommand } from "../../server/settings.ts";

test("Claude settings distinguish signed out CLI from unavailable CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "groundwork-settings-"));
  try {
    const executable = join(root, "claude-test");
    const config = {
      ...loadConfig(),
      claudeExecutable: executable,
      claudeHome: root,
      storageRoot: root,
    };
    await writeFile(
      executable,
      "#!/bin/sh\nprintf '%s\\n' '{\"loggedIn\":false}'\nexit 1\n",
      { mode: 0o700 },
    );
    const signedOut = await claudeStatus(config);
    assert.equal(signedOut.authenticated, false);
    assert.equal(signedOut.issue, "The CLI is signed out.");
    await writeFile(
      executable,
      '#!/bin/sh\nprintf \'%s\\n\' \'{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","email":"owner@example.test","subscriptionType":"Pro"}\'\n',
      { mode: 0o700 },
    );
    const signedIn = await claudeStatus(config);
    assert.equal(signedIn.authenticated, true);
    assert.equal(signedIn.account, "owner@example.test");
    assert.equal(signedIn.plan, "Pro");
    assert.match(claudeLoginCommand(config), /auth login --claudeai$/);
    config.claudeExecutable = join(root, "missing");
    assert.equal(
      (await claudeStatus(config)).issue,
      "Claude CLI status is unavailable.",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
