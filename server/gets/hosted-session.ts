import { join } from "node:path";
import { open, rm } from "node:fs/promises";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { parseSubscribedPack } from "./subscribed-pack.ts";
import {
  extractGetsArchive,
  GetsSessionExpired,
  streamGetsResponse,
  verifyOriginal,
} from "./pack-transfer.ts";
import {
  TENDER_FILE_LIMIT,
  TENDER_PACK_LIMIT,
  type PackDeclaration,
} from "../tender-packs.ts";

export class GetsCollectionBlocked extends Error {}
export interface GetsCollectionSession {
  inventory(rfxId: string): Promise<PackDeclaration>;
  download(
    rfxId: string,
    manifest: PackDeclaration,
    needed: PackDeclaration["files"],
    directory: string,
  ): Promise<void>;
  readonly loginRetries: number;
  close(): Promise<void>;
}

const detailUrl = (rfxId: string) =>
  `https://www.gets.govt.nz/DCC/ExternalTenderDetails.htm?id=${rfxId}`;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export class RealMeLoginBudget {
  private count = 0;
  get loginRetries() {
    return Math.max(0, this.count - 1);
  }
  get attempts() {
    return this.count;
  }
  reserve() {
    if (this.count >= 4)
      throw new GetsCollectionBlocked(
        "RealMe session expired after three re-login attempts in this batch",
      );
    this.count++;
  }
}

export function realMeFailure(html: string) {
  return /captcha|multi.factor|verification code|one.time code|authenticator|security challenge/i.test(
    html,
  )
    ? new GetsCollectionBlocked(
        "RealMe requires MFA, CAPTCHA or another interactive challenge",
      )
    : new GetsCollectionBlocked(
        "RealMe did not accept the saved sign-in; check credentials or account access",
      );
}

/** One private Chromium context and one GETS session per drained worker batch. */
export class HostedGetsSession implements GetsCollectionSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private budget = new RealMeLoginBudget();
  private lastRequestAt = 0;
  constructor(
    private readonly configureContext?: (
      context: BrowserContext,
    ) => Promise<void>,
  ) {}
  get loginRetries() {
    return this.budget.loginRetries;
  }

  private async currentPage() {
    if (!this.page) {
      this.browser = await chromium.launch({ headless: true });
      this.context = await this.browser.newContext({ acceptDownloads: false });
      await this.configureContext?.(this.context);
      this.page = await this.context.newPage();
    }
    return this.page;
  }

  private async pace() {
    const wait = Math.max(0, 1000 - (Date.now() - this.lastRequestAt));
    if (wait) await delay(wait);
    this.lastRequestAt = Date.now();
  }

  private async signIn(rfxId: string) {
    const username = process.env.GROUNDWORK_REALME_USERNAME;
    const password = process.env.GROUNDWORK_REALME_PASSWORD;
    if (!username || !password)
      throw new GetsCollectionBlocked(
        "Railway RealMe username and password are both required",
      );
    if (this.budget.attempts >= 4)
      throw new GetsCollectionBlocked(
        "RealMe session expired after three re-login attempts in this batch",
      );
    if (this.budget.attempts)
      await delay(Math.min(4000, 1000 * 2 ** (this.budget.attempts - 1)));
    const page = await this.currentPage();
    if (new URL(page.url()).hostname === "www.gets.govt.nz") {
      const link = page
        .locator('a.realme_login[href*="TendererLogin.auth"]')
        .first();
      if (!(await link.count()))
        throw new GetsCollectionBlocked(
          `RFx ${rfxId}: GETS did not offer the expected supplier sign-in`,
        );
      await link.click();
    }
    const usernameField = page.locator("#signInName");
    try {
      await usernameField.waitFor({ timeout: 45000 });
    } catch {
      if (new URL(page.url()).hostname === "login.realme.govt.nz")
        throw realMeFailure((await page.content()).slice(0, 50000));
      throw new GetsCollectionBlocked(
        "RealMe sign-in did not show the expected form",
      );
    }
    if (new URL(page.url()).hostname !== "login.realme.govt.nz")
      throw new GetsCollectionBlocked(
        "RealMe sign-in went to an unexpected host",
      );
    this.budget.reserve();
    await usernameField.fill(username);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    try {
      await page.waitForURL((url) => url.hostname === "www.gets.govt.nz", {
        timeout: 60000,
      });
    } catch {
      throw realMeFailure((await page.content()).slice(0, 50000));
    }
  }

  async inventory(rfxId: string): Promise<PackDeclaration> {
    if (!/^\d{1,20}$/.test(rfxId)) throw new Error("Invalid GETS RFx ID");
    const page = await this.currentPage();
    await this.pace();
    await page.goto(detailUrl(rfxId), {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    let html = await page.content();
    try {
      return parseSubscribedPack(html, rfxId);
    } catch {
      /* access step below */
    }
    if (
      new URL(page.url()).hostname === "login.realme.govt.nz" ||
      (await page.locator('a.realme_login[href*="TendererLogin.auth"]').count())
    ) {
      await this.signIn(rfxId);
      await this.pace();
      await page.goto(detailUrl(rfxId), {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      html = await page.content();
      try {
        return parseSubscribedPack(html, rfxId);
      } catch {
        /* selected notice may need subscription */
      }
    }
    const subscribeButton = page
      .getByRole("button", {
        name: /subscribe to this notice for full access/i,
      })
      .first();
    const subscribeLink = page
      .getByRole("link", { name: /subscribe to this notice for full access/i })
      .first();
    if (await subscribeButton.count()) await subscribeButton.click();
    else if (await subscribeLink.count()) {
      const href = await subscribeLink.getAttribute("href");
      const target = new URL(href!, page.url());
      if (
        target.hostname !== "www.gets.govt.nz" ||
        target.searchParams.get("projectID") !== rfxId
      )
        throw new GetsCollectionBlocked(
          `RFx ${rfxId}: subscription link did not match the selected notice`,
        );
      await subscribeLink.click();
    } else
      throw new GetsCollectionBlocked(
        `RFx ${rfxId}: attachment access unavailable; no selected-notice subscription step was offered`,
      );
    try {
      await page
        .locator(
          'form[action*="RegisterInterest.htm"], a[href*="ExternalGetProjectFile.htm"], a[href*="ExternalGetAddendumFile.htm"]',
        )
        .first()
        .waitFor({ timeout: 30000 });
    } catch {
      throw new GetsCollectionBlocked(
        `RFx ${rfxId}: selected-notice subscription did not finish loading`,
      );
    }
    if (new URL(page.url()).hostname !== "www.gets.govt.nz")
      throw new GetsCollectionBlocked(`RFx ${rfxId}: subscription left GETS`);
    try {
      return parseSubscribedPack(await page.content(), rfxId);
    } catch {
      /* supplier details may need submission */
    }
    const form = page.locator('form[action*="RegisterInterest.htm"]').first();
    if (await form.count()) {
      const action = new URL((await form.getAttribute("action"))!, page.url());
      const selectedId = await form
        .locator('input[name="projectID"]')
        .inputValue();
      if (
        action.hostname !== "www.gets.govt.nz" ||
        action.pathname !== "/DCC/RegisterInterest.htm" ||
        (await form.getAttribute("method"))?.toLowerCase() !== "post" ||
        selectedId !== rfxId ||
        new URL(page.url()).searchParams.get("projectID") !== rfxId
      )
        throw new GetsCollectionBlocked(
          `RFx ${rfxId}: subscription form did not match the selected notice`,
        );
      for (const name of [
        "firstName",
        "lastName",
        "telephoneNumber",
        "emailAddress1",
      ]) {
        if (
          !(
            await form.locator('input[name="' + name + '"]').inputValue()
          ).trim()
        )
          throw new GetsCollectionBlocked(
            "RFx " + rfxId + ": subscription details need owner review",
          );
      }
      for (const name of ["receiveMail", "registerCategory"]) {
        const checkbox = form.locator(
          'input[type="checkbox"][name="' + name + '"]',
        );
        if (await checkbox.count()) await checkbox.uncheck();
      }
      const submit = form.locator(
        'input[type="submit"][name="registerSubmitBtn"]',
      );
      if (!(await submit.count()))
        throw new GetsCollectionBlocked(
          `RFx ${rfxId}: subscription form needs owner review`,
        );
      await submit.click();
    } else
      throw new GetsCollectionBlocked(
        `RFx ${rfxId}: subscription details need owner review`,
      );
    await this.pace();
    await page.goto(detailUrl(rfxId), {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    try {
      return parseSubscribedPack(await page.content(), rfxId);
    } catch {
      throw new GetsCollectionBlocked(
        `RFx ${rfxId}: subscription did not expose a complete attachment inventory`,
      );
    }
  }

  private async get(url: string, destination: string, limit: number) {
    const context = this.context;
    if (!context) throw new Error("GETS browser is not open");
    await this.pace();
    const cookies = (await context.cookies("https://www.gets.govt.nz/DCC/"))
      .filter((cookie) =>
        ["www.gets.govt.nz", ".gets.govt.nz"].includes(cookie.domain),
      )
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
    if (!cookies) throw new GetsSessionExpired("GETS session has no cookies");
    const response = await fetch(url, {
      headers: {
        Cookie: cookies,
        Accept: "application/zip,application/octet-stream,application/pdf",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(180000),
    });
    await streamGetsResponse(response, destination, limit);
  }

  async download(
    rfxId: string,
    manifest: PackDeclaration,
    needed: PackDeclaration["files"],
    directory: string,
  ) {
    if (manifest.rfxId !== rfxId)
      throw new Error("GETS inventory RFx mismatch");
    if (!needed.length) return;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (needed.length === manifest.files.length) {
          const archive = join(directory, "bulk.zip");
          await this.get(
            `https://www.gets.govt.nz/DCC/ExternalGetAllFiles.htm?projectID=${rfxId}`,
            archive,
            TENDER_PACK_LIMIT,
          );
          const handle = await open(archive, "r");
          const header = Buffer.alloc(2);
          try {
            await handle.read(header, 0, 2, 0);
          } finally {
            await handle.close();
          }
          if (header.toString() !== "PK")
            throw new Error("GETS bulk response was not a ZIP archive");
          await extractGetsArchive(archive, manifest, directory);
        } else {
          for (const file of needed) {
            const destination = join(directory, file.fileId);
            if (await verifyOriginal(destination, file)) continue;
            await rm(destination, { force: true });
            const kind =
              file.kind === "addendum"
                ? "ExternalGetAddendumFile"
                : "ExternalGetProjectFile";
            await this.get(
              `https://www.gets.govt.nz/DCC/${kind}.htm?projectID=${rfxId}&fileID=${file.fileId}`,
              destination,
              TENDER_FILE_LIMIT,
            );
            if (!(await verifyOriginal(destination, file)))
              throw new Error(
                `GETS file ${file.fileId} failed length or SHA-256 verification`,
              );
          }
        }
        return;
      } catch (error) {
        if (!(error instanceof GetsSessionExpired)) throw error;
        if (attempt)
          throw new GetsCollectionBlocked(
            `RFx ${rfxId}: GETS session still expired after re-login`,
          );
        const page = await this.currentPage();
        await page.goto(detailUrl(rfxId), {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });
        await this.signIn(rfxId);
      }
    }
  }

  async close() {
    await this.context?.close();
    await this.browser?.close();
    this.context = null;
    this.browser = null;
    this.page = null;
  }
}
