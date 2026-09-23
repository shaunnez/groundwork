import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const cfg = JSON.parse(await readFile(process.env.GROUNDWORK_CONFIG!, "utf8"));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:5178/local");
await page.getByLabel("Local access key").fill(cfg.sessionSecret);
await page.getByRole("button", { name: "Open workspace" }).click();
await page
  .getByRole("heading", { name: "Pursuit room", exact: true })
  .waitFor();
await mkdir("/Users/shaun/projects/groundwork/.local-groundwork/browser", {
  recursive: true,
});
await page.screenshot({
  path: "/Users/shaun/projects/groundwork/.local-groundwork/browser/desktop.png",
  fullPage: true,
});
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({
  path: "/Users/shaun/projects/groundwork/.local-groundwork/browser/mobile.png",
  fullPage: true,
});
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);
assert.deepEqual(errors, []);
console.log(
  "Browser login, desktop/mobile rendering, no overflow and no page errors passed",
);
await browser.close();
