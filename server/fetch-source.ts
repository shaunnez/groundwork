import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import https from "node:https";
export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    const [prefix, subnet] = a.split(":");
    if (
      prefix === "2002" ||
      prefix === "3fff" ||
      (prefix === "2001" &&
        (parseInt(subnet || "0", 16) <= 0x1ff || subnet === "db8"))
    )
      return false;
    return a.startsWith("2") || a.startsWith("3");
  }
  return false;
}
export async function fetchSource(
  raw: string,
  redirects = 0,
): Promise<{ body: Buffer; mediaType: string; url: string }> {
  const url = new URL(raw);
  const hostname = url.hostname.replace(/\.$/, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error(
      "Only public HTTPS sources without credentials or custom ports are allowed",
    );
  if (
    hostname === "gets.govt.nz" ||
    hostname.endsWith(".gets.govt.nz") ||
    hostname === "realme.govt.nz" ||
    hostname.endsWith(".realme.govt.nz")
  )
    throw new Error("Automated GETS/RealMe collection is not authorised");
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error("Private/internal destinations are blocked");
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        family: address.family,
        headers: {
          "User-Agent": "Groundwork-local-evaluation/0.1",
          Accept: "text/html,application/pdf,text/plain",
        },
        lookup: (_host, _options, callback) =>
          callback(null, address.address, address.family),
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          if (redirects >= 4 || !res.headers.location) {
            reject(new Error("Unsafe or excessive redirects"));
            return;
          }
          fetchSource(
            new URL(res.headers.location, url).href,
            redirects + 1,
          ).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Source returned HTTP ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 20 * 1024 * 1024) {
            req.destroy(new Error("Source exceeds 20 MB limit"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            body: Buffer.concat(chunks),
            mediaType: (
              res.headers["content-type"] ?? "application/octet-stream"
            ).split(";")[0],
            url: url.href,
          }),
        );
        res.on("error", reject);
      },
    );
    req.setTimeout(15000, () =>
      req.destroy(new Error("Source request timed out")),
    );
    const deadline = setTimeout(
      () =>
        req.destroy(new Error("Source exceeded the total request deadline")),
      30000,
    );
    req.on("close", () => clearTimeout(deadline));
    req.on("error", reject);
  });
}
