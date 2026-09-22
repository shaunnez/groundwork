import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { publicAddress } from "../fetch-source.ts";
import { canonicalGetsDetail, type GetsScope } from "./parser.ts";

export interface GetsTransport {
  listing(url: string): Promise<string>;
  detail(url: string): Promise<string>;
}
export function firstListingUrl(scope: GetsScope, rfxId?: string | null) {
  if (scope === "single") {
    if (!rfxId) throw new Error("RFx ID is required");
    return null;
  }
  return `https://www.gets.govt.nz/${scope === "current" ? "ExternalIndex.htm" : "FutureProcurementOpportunitiesIndex.htm"}`;
}
export function validateListingUrl(value: string, scope: "current" | "future") {
  const url = new URL(value);
  const path =
    scope === "current"
      ? "/ExternalIndex.htm"
      : "/FutureProcurementOpportunitiesIndex.htm";
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.gets.govt.nz" ||
    url.pathname !== path ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    url.hash
  )
    throw new Error("Listing pagination left the approved GETS route");
  return url.href;
}
async function readPublicHtml(url: URL): Promise<string> {
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (
    !addresses.length ||
    addresses.some((entry) => !publicAddress(entry.address))
  )
    throw new Error("GETS host did not resolve only to public addresses");
  const chosen = addresses[0];
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        timeout: 30000,
        maxHeaderSize: 16384,
        headers: {
          accept: "text/html",
          "user-agent": "Groundwork GETS intake (approved access only)",
        },
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [chosen]);
          else callback(null, chosen.address, chosen.family);
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(
            new Error(
              `GETS returned HTTP ${res.statusCode}${res.headers["retry-after"] ? `; Retry-After ${res.headers["retry-after"]}` : ""}; no redirect or challenge was followed`,
            ),
          );
          return;
        }
        if (
          !/^text\/html(?:;|$)/i.test(String(res.headers["content-type"] || ""))
        ) {
          res.resume();
          reject(new Error("GETS response was not HTML"));
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 1024 * 1024)
            req.destroy(new Error("GETS response exceeded 1 MB"));
          else chunks.push(chunk);
        });
        res.on("end", () => {
          try {
            const html = new TextDecoder("utf-8", { fatal: true }).decode(
              Buffer.concat(chunks),
            );
            const title =
              /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "";
            if (
              /\b(?:RealMe|log\s*in|sign\s*in|captcha|access denied)\b/i.test(
                title,
              )
            )
              reject(new Error("GETS access challenge; user login required"));
            else resolve(html);
          } catch {
            reject(new Error("GETS response was not valid UTF-8"));
          }
        });
        res.on("error", reject);
      },
    );
    const deadline = setTimeout(
      () => req.destroy(new Error("GETS request deadline exceeded")),
      30000,
    );
    req.on("close", () => clearTimeout(deadline));
    req.on("timeout", () => req.destroy(new Error("GETS request timed out")));
    req.on("error", reject);
    req.end();
  });
}
export class ApprovedPublicGetsTransport implements GetsTransport {
  private lastAt = 0;
  private async get(value: string) {
    const delay = Math.max(0, 1000 - (Date.now() - this.lastAt));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    this.lastAt = Date.now();
    return readPublicHtml(new URL(value));
  }
  listing(value: string) {
    const url = new URL(value);
    const scope = url.pathname === "/ExternalIndex.htm" ? "current" : "future";
    return this.get(validateListingUrl(value, scope));
  }
  detail(value: string) {
    return this.get(canonicalGetsDetail(value).url);
  }
}
