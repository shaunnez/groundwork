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
  .getByRole("button", { name: /SYNTHETIC — Harbour assessment services/ })
  .click();
await page
  .getByRole("button", { name: /Pursuit package/ })
  .first()
  .click();
await page
  .getByRole("heading", { name: "Systematic requirements review" })
  .waitFor();
assert.match(
  await page.locator(".local-report").innerText(),
  /22 \/ 22 candidates/,
);
assert.match(
  await page.locator(".local-report").innerText(),
  /12 October 2026/,
);
assert.match(
  await page.locator(".local-report").innerText(),
  /data-residency declaration/,
);
await page
  .getByRole("button", { name: "Open requirement evidence" })
  .first()
  .click();
await page.locator(".cited-unit").waitFor();
await page
  .locator(".local-evidence")
  .screenshot({
    path: "/Users/shaun/projects/procint/.local-groundwork/browser/rfp-evidence.png",
  });
await page.getByRole("button", { name: "Close evidence" }).click();
await page
  .getByRole("button", { name: "Create watchlist, profile and weekly brief" })
  .click();
await page
  .getByRole("button", { name: /Daily watchlist/ })
  .first()
  .waitFor();
await page
  .getByRole("button", { name: /Pursuit package/ })
  .first()
  .click();
const review = page
  .getByRole("heading", { name: "Internal review and delivery" })
  .locator("..");
await review
  .getByLabel("Review reason")
  .fill(
    "Synthetic engineering acceptance only; local inbox test, not Bobby analytical approval.",
  );
await review.getByRole("button", { name: "Record review" }).click();
await page
  .getByRole("button", { name: "Deliver to local inbox" })
  .waitFor({ state: "visible" });
await page.getByRole("button", { name: "Deliver to local inbox" }).click();
for (const [button, heading] of [
  ["Daily watchlist", "Intelligence summary"],
  ["Competitor profile", "Notice-linked competitor profile"],
  ["Weekly brief", "What changed"],
]) {
  await page
    .getByRole("button", { name: new RegExp(button) })
    .first()
    .click();
  await page.getByRole("heading", { name: heading, exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Deliver to local inbox" })
      .isDisabled(),
    true,
  );
  await page
    .locator(".local-report")
    .screenshot({
      path: `/Users/shaun/projects/procint/.local-groundwork/browser/${button.replaceAll(" ", "-")}.png`,
    });
}
await page
  .getByRole("button", { name: "Refresh & delivery", exact: true })
  .click();
await page
  .getByRole("combobox", { name: /^Deliverable/ })
  .selectOption("weekly");
await page
  .getByRole("combobox", { name: /^Refresh interval/ })
  .selectOption("168");
await page.getByRole("button", { name: "Schedule local refresh" }).click();
await page
  .getByText("internal-draft-ready", { exact: true })
  .waitFor({ timeout: 20000 });
await page.getByRole("button", { name: "Pause refresh", exact: true }).click();
await page.getByText("Paused", { exact: true }).waitFor();
await page.getByRole("heading", { name: "Local delivery inbox" }).waitFor();
assert.equal(
  await page.getByRole("button", { name: "Open delivered version" }).count(),
  1,
);
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({
  path: "/Users/shaun/projects/procint/.local-groundwork/browser/operations-mobile.png",
  fullPage: true,
});
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);
assert.deepEqual(errors, []);
console.log(
  "M4 real browser: 22/22, late clause, date correction, stable citation. M5: all three derived views, pending-review delivery block, approved synthetic local delivery, schedule refresh and pause, mobile overflow checks passed.",
);
await browser.close();
