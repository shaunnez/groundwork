import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { z } from "zod";
import type { Database } from "./db.ts";
import { ObjectStore, hash } from "./storage.ts";
import { reserveCall, settleCall } from "./ledger.ts";
const Result = z.object({
  success: z.literal(true),
  data: z.object({
    web: z
      .array(
        z.object({
          url: z.string().url(),
          title: z.string().optional(),
          description: z.string().optional(),
        }),
      )
      .default([]),
  }),
  creditsUsed: z.number().optional(),
});
export async function research(
  db: Database,
  store: ObjectStore,
  accountId: string,
  query: string,
  settings: { includedConfirmed: boolean; credentialFile?: string },
) {
  if (!settings.includedConfirmed || !settings.credentialFile)
    throw new Error(
      "Included Firecrawl credits and no-overage policy must be confirmed",
    );
  const key = `firecrawl-search-v1:${accountId}:${hash(query)}:${new Date().toISOString().slice(0, 10)}`;
  const existing = await db.query(
    "SELECT * FROM provider_calls WHERE logical_key=$1",
    [key],
  );
  if (existing.rowCount) {
    if (existing.rows[0].status === "succeeded") {
      const cached = Result.safeParse(
        await store.json(accountId, existing.rows[0].receipt_ref),
      );
      if (!cached.success)
        throw new Error(
          "Recorded research usage is reconciled, but the original search results are unavailable; this is not a completed search",
        );
      return cached.data;
    }
    throw new Error("Prior research outcome unresolved; no automatic replay");
  }
  const env = parseEnv(await readFile(settings.credentialFile, "utf8"));
  if (!env.FIRECRAWL_API_KEY)
    throw new Error("Research credential unavailable");
  const headers = {
    Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
    "content-type": "application/json",
  };
  const balanceResponse = await fetch(
    "https://api.firecrawl.dev/v2/team/credit-usage",
    { headers, signal: AbortSignal.timeout(15000) },
  );
  const balance = (await balanceResponse.json()) as {
    success: boolean;
    data: { remainingCredits: number };
  };
  if (
    !balanceResponse.ok ||
    !balance.success ||
    balance.data.remainingCredits < 2
  )
    throw new Error("Included research allowance unavailable");
  const callId = await reserveCall(db, {
    accountId,
    runId: null,
    key,
    provider: "firecrawl-search",
    maximum: 2,
    budgetId: "goal-firecrawl",
  });
  let receiptRef: string | undefined;
  try {
    const response = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers,
      body: JSON.stringify({
        query,
        limit: 5,
        sources: ["web"],
        excludeDomains: ["gets.govt.nz", "realme.govt.nz"],
      }),
      signal: AbortSignal.timeout(30000),
    });
    const raw = await response.text();
    const ref = await store.put(accountId, raw);
    receiptRef = ref;
    if (!response.ok)
      throw new Error(
        `Research returned HTTP ${response.status}; credit outcome needs reconciliation`,
      );
    const result = Result.parse(JSON.parse(raw));
    if (
      result.creditsUsed !== undefined &&
      (!Number.isFinite(result.creditsUsed) ||
        result.creditsUsed < 0 ||
        result.creditsUsed > 2)
    )
      throw new Error(
        "Reported research usage exceeds the reservation; reconcile before another call",
      );
    await settleCall(db, callId, {
      status: "succeeded",
      actual: result.creditsUsed ?? 2,
      receiptRef: ref,
      usage: {
        credits: result.creditsUsed ?? 2,
        basis: "documented fixed search price: 1–10 results = 2 credits",
        reportedCredits: result.creditsUsed ?? null,
        scope: "bounded five-result web search, no automatic scraping",
      },
    });
    return result;
  } catch (e) {
    await settleCall(db, callId, { status: "uncertain", receiptRef });
    throw e;
  }
}
