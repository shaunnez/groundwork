import assert from "node:assert/strict";
import { test } from "node:test";
import { HostedGetsSession } from "../../server/gets/hosted-session.ts";

test("selected GETS subscription waits for the form and admits the matching pack", async () => {
  const rfxId = "34920325";
  const detailUrl =
    "https://www.gets.govt.nz/DCC/ExternalTenderDetails.htm?id=" + rfxId;
  let subscribed = false;
  let submitted = false;
  const session = new HostedGetsSession(async (context) => {
    await context.route("https://www.gets.govt.nz/DCC/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (
        url.pathname.endsWith("/RegisterInterest.htm") &&
        request.method() === "POST"
      ) {
        const body = new URLSearchParams(request.postData() ?? "");
        assert.equal(body.get("projectID"), rfxId);
        assert.equal(body.get("receiveMail"), null);
        assert.equal(body.get("registerCategory"), null);
        assert.equal(body.get("firstName"), "Fixture");
        submitted = true;
        subscribed = true;
        await route.fulfill({
          status: 302,
          headers: { location: detailUrl },
          body: "",
        });
        return;
      }
      if (url.pathname.endsWith("/RegisterInterest.htm")) {
        await route.fulfill({
          contentType: "text/html",
          body:
            '<form action="RegisterInterest.htm" method="post">' +
            '<input type="hidden" name="projectID" value="' +
            rfxId +
            '">' +
            '<input name="firstName" value="Fixture">' +
            '<input name="lastName" value="Supplier">' +
            '<input name="telephoneNumber" value="0000000">' +
            '<input name="emailAddress1" value="fixture@example.invalid">' +
            '<input type="checkbox" name="receiveMail" checked>' +
            '<input type="checkbox" name="registerCategory">' +
            '<input type="submit" name="registerSubmitBtn" value="Register"></form>',
        });
        return;
      }
      if (url.pathname.endsWith("/ExternalTenderDetails.htm")) {
        await route.fulfill({
          contentType: "text/html",
          body: subscribed
            ? '<table><tr><td><a href="ExternalGetProjectFile.htm?projectID=' +
              rfxId +
              '&fileID=1">RFP.pdf</a></td><td>12</td><td>' +
              "a".repeat(64) +
              "</td></tr></table>"
            : '<a href="RegisterInterest.htm?projectID=' +
              rfxId +
              '" role="button">Subscribe to this Notice for Full Access</a>',
        });
        return;
      }
      throw new Error("Unexpected GETS fixture URL");
    });
  });
  try {
    const pack = await session.inventory(rfxId);
    assert.equal(submitted, true);
    assert.equal(pack.files.length, 1);
    assert.equal(pack.files[0].name, "RFP.pdf");
  } finally {
    await session.close();
  }
});
