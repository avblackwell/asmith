/* Browser check for the marketplace frontend using controlled HTTP responses. */
const assert = require("node:assert/strict");
const esbuild = require("esbuild");
const { chromium } = require("@playwright/test");

const baseUrl = process.env.STANDALONE_URL || "http://127.0.0.1:3002";
const appsmithPath = /^\/(api|v1|rts|oauth2|login|logout|user)(?:\/|$)/;

async function loadFixture() {
  const bundle = await esbuild.build({
    stdin: {
      contents:
        'export { exampleDashboardDocument } from "./src/integration/document/exampleDashboardDocument";',
      resolveDir: process.cwd(),
      sourcefile: "workspace-verification-entry.ts",
      loader: "ts",
    },
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
  });
  const localModule = { exports: {} };

  new Function("module", "exports", bundle.outputFiles[0].text)(
    localModule,
    localModule.exports,
  );

  return localModule.exports.exampleDashboardDocument;
}

async function main() {
  const document = await loadFixture();
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
    headless: true,
  });

  try {
    const page = await browser.newPage();
    const pageErrors = [];
    const appsmithRequests = [];
    let activeUserId = 11;
    let replacements = 0;
    let creations = 0;
    const unknownRequests = [];
    const item = {
      id: 7,
      name: "Engine overview",
      description: "Shared dashboard",
      typeId: 2,
      type: "dashboard",
      tags: [],
      publisherId: 11,
      publisherUsername: "publisher@example.com",
      createdAt: 0,
      updatedAt: 0,
      publishedAt: 0,
      downloadCount: 0,
      rating: null,
      ratingCount: 0,
      thumbnailUrl: "",
      previewImages: [],
    };
    const replyJson = (route, body) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => {
      if (appsmithPath.test(new URL(request.url()).pathname)) {
        appsmithRequests.push(request.url());
      }
    });
    await page.route("**/operator_display/**", (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;

      if (path === "/operator_display/system/userInfo") {
        return replyJson(route, {
          id: activeUserId,
          username: `user-${activeUserId}@example.com`,
          isSystemAdmin: false,
          groupMemberships: [],
        });
      }

      if (
        path === "/operator_display/marketplace/items" &&
        request.method() === "GET"
      ) {
        return replyJson(route, {
          data: [item],
          meta: {
            cursor: 0,
            previousCursor: null,
            nextCursor: null,
            pageSize: 12,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
            sorts: null,
            filters: null,
          },
        });
      }

      if (
        path === "/operator_display/marketplace/items/7/download" &&
        request.method() === "POST"
      ) {
        return replyJson(route, {
          downloadUrl: "/operator_display/mock-content/7",
          metadata: item,
        });
      }

      if (path === "/operator_display/mock-content/7") {
        return replyJson(route, document);
      }

      if (path === "/operator_display/marketplace/items/7") {
        if (request.method() === "GET") return replyJson(route, item);

        if (request.method() === "PUT") {
          replacements += 1;

          return route.fulfill({ status: 204 });
        }
      }

      if (
        path === "/operator_display/marketplace/items" &&
        request.method() === "POST"
      ) {
        creations += 1;

        return replyJson(route, { ...item, id: 8 });
      }

      unknownRequests.push(`${request.method()} ${path}`);

      return route.fulfill({
        status: 500,
        body: "Unexpected marketplace request",
      });
    });

    await page.goto(`${baseUrl}/workspace`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Dashboards" }).waitFor();
    await page.getByText("Signed in as").waitFor();
    await page
      .getByRole("button", { name: "Open dashboard Engine overview" })
      .waitFor();
    // The session changes after listing; the open result must own draft scope.
    activeUserId = 22;
    await page
      .getByRole("button", { name: "Open dashboard Engine overview" })
      .click();
    const title = page.getByRole("textbox", { name: "Title text" });

    await title.waitFor({ timeout: 90_000 });
    assert.equal(await title.inputValue(), "Engine overview");
    await title.fill("Account 22 local edit");
    await page.getByTestId("t--standalone-save").click();
    await page
      .getByRole("status")
      .getByText(/Saved locally as revision 1/)
      .waitFor();
    assert.equal(replacements, 0);
    assert.equal(creations, 0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await title.waitFor({ timeout: 90_000 });
    assert.equal(await title.inputValue(), "Account 22 local edit");
    await page
      .getByRole("status")
      .getByText(/local draft revision 1 loaded/)
      .waitFor();

    await page.getByTestId("t--workbench-nav-tools").click();
    await page.getByTestId("t--publish-replace").click();
    await page
      .getByRole("status")
      .getByText(/Replaced marketplace item #7/)
      .waitFor();
    assert.equal(replacements, 1);
    await page
      .getByRole("textbox", { name: "New item description" })
      .fill("New copy");
    await page.locator('input[aria-label="New item thumbnail"]').setInputFiles({
      name: "thumbnail.png",
      mimeType: "image/png",
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    });
    await page.getByTestId("t--publish-new").click();
    await page
      .getByRole("status")
      .getByText(/Uploaded a new dashboard item #8/)
      .waitFor();
    assert.equal(creations, 1);

    activeUserId = 11;
    await page.reload({ waitUntil: "domcontentloaded" });
    await title.waitFor({ timeout: 90_000 });
    assert.equal(await title.inputValue(), "Engine overview");
    await page
      .getByRole("status")
      .getByText(/Save locally to create/)
      .waitFor();
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(appsmithRequests, []);
    assert.deepEqual(unknownRequests, []);
    process.stdout.write("Marketplace workspace mock-browser flow passed\n");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
