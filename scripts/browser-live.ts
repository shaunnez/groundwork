import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const cfg = JSON.parse(await readFile(process.env.GROUNDWORK_CONFIG!, "utf8"));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:5178/local");
await page.getByLabel("Local access key").fill(cfg.sessionSecret);
await page.getByRole("button", { name: "Open workspace" }).click();
await page
  .getByRole("heading", { name: "Pursuit room", exact: true })
  .waitFor();
await page
  .getByRole("button", { name: /CSP26317 - Psychometric testing/ })
  .click();
await page.getByRole("heading", { name: "Source inventory" }).waitFor();
if (process.argv.includes("--start")) {
  await page
    .getByRole("button", {
      name: /Generate pursuit package|Reassess with current evidence/,
      exact: true,
    })
    .click();
  await page
    .getByText(/Assessing evidence|queued/)
    .first()
    .waitFor();
}
await page.screenshot({
  path: "/Users/shaun/projects/procint/.local-groundwork/browser/live-desktop.png",
  fullPage: true,
});
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({
  path: "/Users/shaun/projects/procint/.local-groundwork/browser/live-mobile.png",
  fullPage: true,
});
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);
assert.deepEqual(errors, []);
await context.storageState({
  path: "/Users/shaun/projects/procint/.local-groundwork/browser/session.json",
});
console.log(
  "Live source pack visible; desktop/mobile and start journey checked",
);
await browser.close();
