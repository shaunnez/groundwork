import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const client = resolve(root, "dist/client");
let html = await readFile(resolve(client, "index.html"), "utf8");
const script = html.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/);
const stylesheet = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/);
if (!script || !stylesheet)
  throw new Error(
    "Expected one built JavaScript and CSS entry. Run npm run build first.",
  );
const asset = (path) => resolve(client, path.replace(/^\//, ""));
let css = await readFile(asset(stylesheet[1]), "utf8");
const urls = [
  ...new Set(
    [...css.matchAll(/url\(([^)]+)\)/g)].map((m) =>
      m[1].replace(/^['"]|['"]$/g, ""),
    ),
  ),
];
for (const url of urls) {
  if (url.startsWith("data:")) continue;
  const mime = extname(url) === ".woff2" ? "font/woff2" : "font/woff";
  const bytes = await readFile(asset(url));
  css = css.replaceAll(
    url,
    "data:" + mime + ";base64," + bytes.toString("base64"),
  );
}
let js = await readFile(asset(script[1]), "utf8");
const reference = await readFile(resolve(client, "reference.png"));
js = js.replaceAll(
  '"./reference.png"',
  JSON.stringify("data:image/png;base64," + reference.toString("base64")),
);
html = html.replace(
  script[0],
  () =>
    '<script type="module">' +
    js.replace(/<\/script/gi, "<\\/script") +
    "</script>",
);
html = html.replace(stylesheet[0], () => "<style>" + css + "</style>");
html = html.replace(
  "<title>",
  "<!-- Self-contained review prototype. Fictional data; no backend or email. -->\n<title>",
);
const output = resolve(root, "../Procint-Prototype.html");
await writeFile(output, html);
console.log(
  "Standalone review copy: " +
    output +
    " (" +
    Math.round(Buffer.byteLength(html) / 1024) +
    " KB)",
);
