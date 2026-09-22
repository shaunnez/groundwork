import test from "node:test";
import assert from "node:assert/strict";
import { extract } from "../../server/extract.ts";
import { publicAddress, fetchSource } from "../../server/fetch-source.ts";
import { claudeEnvironment } from "../../server/claude.ts";
test("HTML preserves table context and ignores executable content", async () => {
  const e = await extract(
    "source",
    "text/html",
    Buffer.from(
      "<main><h1>Notice</h1><script>stealSecret()</script><table><tr><th>Criterion</th><th>Weight</th></tr><tr><td>Price</td><td>40%</td></tr></table></main>",
    ),
  );
  assert.equal(e.state, "read");
  assert.equal(e.units.length, 2);
  assert.match(e.units[1].text, /Criterion.*Weight.*Price.*40%/);
  assert.ok(!JSON.stringify(e).includes("stealSecret"));
});
test("unknown readers retain failure and unknown total", async () => {
  const e = await extract("source", "image/png", Buffer.from("invalid"));
  assert.equal(e.coverage.total, null);
  assert.match(e.coverage.failures[0], /OCR/);
});
test("SSRF addresses and prohibited schemes blocked", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "192.168.1.1",
    "172.16.0.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fd00::1",
  ])
    assert.equal(publicAddress(ip), false);
  assert.equal(publicAddress("8.8.8.8"), true);
  await assert.rejects(fetchSource("http://example.com"), /HTTPS/);
  await assert.rejects(
    fetchSource("https://www.gets.govt.nz/"),
    /not authorised/,
  );
});
test("model environment excludes secrets and routing overrides", () => {
  const env = claudeEnvironment(
    {
      HOME: "/home",
      PATH: "/bin",
      ANTHROPIC_API_KEY: "secret",
      ANTHROPIC_AUTH_TOKEN: "secret",
      ANTHROPIC_BASE_URL: "https://wrong",
      CLAUDE_CODE_USE_BEDROCK: "1",
      CLAUDE_CONFIG_DIR: "/unexpected",
    },
    "/tmp/own",
  );
  assert.deepEqual(Object.keys(env).sort(), [
    "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
    "HOME",
    "PATH",
    "TMPDIR",
  ]);
});

test("A3 a blank/unread PDF page stays in the page denominator", async () => {
  const content =
    "BT /F1 12 Tf 72 720 Td (Suppliers must submit Form X.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
      .join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const result = await extract(
    "synthetic-pdf",
    "application/pdf",
    Buffer.from(pdf),
  );
  assert.equal(result.coverage.total, 2);
  assert.equal(result.coverage.read, 1);
  assert.equal(result.coverage.unread, 1);
  assert.equal(result.state, "partial");
  assert.match(result.coverage.failures[0], /Page 2.*OCR/);
});

test("IPv6 transition ranges and trailing-dot prohibited domains cannot bypass source policy", async () => {
  for (const address of ["2002:7f00:1::", "2001::1", "2001:db8::1", "3fff::1"])
    assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
  await assert.rejects(
    fetchSource("https://www.gets.govt.nz./"),
    /not authorised/,
  );
});
