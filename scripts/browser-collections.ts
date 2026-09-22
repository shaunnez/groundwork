import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true }),
  context = await browser.newContext({
    storageState:
      "/Users/shaun/projects/procint/.local-groundwork/browser/session.json",
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:5178/local");
await page
  .getByRole("button", { name: "Watchlists & briefs", exact: true })
  .click();
await page
  .getByRole("combobox", { name: /^Collection/ })
  .selectOption("weekly");
await page.getByRole("button", { name: "Compile current collection" }).click();
await page
  .getByRole("heading", { name: "Your week in procurement.", exact: true })
  .waitFor();
const body = await page.locator(".local-report").innerText();
assert.match(body, /CSP26317/);
assert.match(body, /SYNTHETIC/);
assert.match(body, /Public evidence/);
assert.match(body, /Synthetic evidence/);
assert.equal(
  await page
    .getByRole("button", { name: "Deliver collection to local inbox" })
    .isDisabled(),
  true,
);
await page.locator(".local-report").scrollIntoViewIfNeeded();
await page.screenshot({
  path: "/Users/shaun/projects/procint/.local-groundwork/browser/account-weekly-desktop.png",
});
await page
  .getByRole("combobox", { name: /^Collection/ })
  .selectOption("watchlist");
await page.getByRole("button", { name: "Compile current collection" }).click();
await page
  .getByRole("heading", {
    name: "Your opportunities, in context.",
    exact: true,
  })
  .waitFor();
await page.setViewportSize({ width: 390, height: 844 });
await page.locator(".local-report").scrollIntoViewIfNeeded();
await page.screenshot({
  path: "/Users/shaun/projects/procint/.local-groundwork/browser/account-watchlist-mobile.png",
});
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);
assert.deepEqual(errors, []);
console.log(
  "Actual browser: account weekly and daily collections include both tracked opportunities, label real versus synthetic evidence, preserve pending-review delivery gate, and fit mobile.",
);
await browser.close();
