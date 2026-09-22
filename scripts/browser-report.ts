import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState:
    "/Users/shaun/projects/procint/.local-groundwork/browser/session.json",
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:5178/local");
await page
  .getByRole("button", { name: /CSP26317 - Psychometric testing/ })
  .click();
await page
  .getByRole("button", { name: /Pursuit package/ })
  .first()
  .click();
await page.getByRole("heading", { name: "Executive summary" }).waitFor();
for (const heading of [
  "Centre of gravity",
  "Cone of plausibility",
  "Competing hypotheses",
  "Risk register",
  "Evidence and limitations",
])
  assert.equal(
    await page.getByRole("heading", { name: heading, exact: true }).count(),
    1,
  );
await page.locator(".local-report").scrollIntoViewIfNeeded();
await page.screenshot({
  path: "/Users/shaun/projects/procint/.local-groundwork/browser/report-desktop.png",
  fullPage: true,
});
await page.locator(".local-citations button:visible").first().click();
await page.getByRole("region", { name: "Source evidence" }).waitFor();
assert.equal(await page.locator(".cited-unit").count(), 1);
await page.screenshot({
  path: "/Users/shaun/projects/procint/.local-groundwork/browser/citation.png",
});
await page.getByRole("button", { name: "Close evidence" }).click();
const decision = page
  .getByRole("heading", { name: "Your decision", exact: true })
  .locator("..");
await decision.locator("select").selectOption("watch");
await decision
  .getByLabel("Reason", { exact: true })
  .fill(
    "Local acceptance test: retain system NO-GO and record my separate monitoring choice.",
  );
await decision.getByRole("button", { name: "Record decision" }).click();
await page
  .getByText(
    "watch: Local acceptance test: retain system NO-GO and record my separate monitoring choice.",
    { exact: true },
  )
  .last()
  .waitFor();
const review = page
  .getByRole("heading", { name: "Reviewer feedback", exact: true })
  .locator("..");
await review
  .getByRole("combobox", { name: /Feedback/ })
  .selectOption("unclear");
await review
  .getByLabel("Reason", { exact: true })
  .fill(
    "Engineering evaluation only; Bobby has not accepted analytical quality.",
  );
await review.getByRole("button", { name: "Save feedback" }).click();
await page
  .getByText(
    "unclear · Engineering evaluation only; Bobby has not accepted analytical quality.",
    { exact: true },
  )
  .last()
  .waitFor();
await page.reload();
await page
  .getByRole("button", { name: /CSP26317 - Psychometric testing/ })
  .click();
await page
  .getByRole("button", { name: /Pursuit package/ })
  .first()
  .click();
await page
  .getByText(
    "watch: Local acceptance test: retain system NO-GO and record my separate monitoring choice.",
    { exact: true },
  )
  .last()
  .waitFor();
await page.setViewportSize({ width: 390, height: 844 });
await page
  .getByRole("heading", { name: "Executive summary" })
  .scrollIntoViewIfNeeded();
await page.screenshot({
  path: "/Users/shaun/projects/procint/.local-groundwork/browser/report-mobile.png",
});
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);
assert.deepEqual(errors, []);
console.log(
  "Live report: required sections, frozen citation, separate customer decision, feedback, reload persistence, mobile overflow and no page errors passed",
);
await browser.close();
