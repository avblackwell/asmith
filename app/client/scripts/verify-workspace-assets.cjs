/* Browser check for component and theme marketplace flows with controlled HTTP responses. */
const assert = require("node:assert/strict");
const esbuild = require("esbuild");
const { chromium } = require("@playwright/test");

const baseUrl = process.env.STANDALONE_URL || "http://127.0.0.1:3002";
const appsmithPath = /^\/(api|v1|rts|oauth2|login|logout|user)(?:\/|$)/;

function pageOf(data) {
  return {
    data,
    meta: {
      cursor: 0,
      previousCursor: null,
      nextCursor: null,
      pageSize: 12,
      currentPage: 1,
      totalPages: 1,
      totalItems: data.length,
      sorts: null,
      filters: null,
    },
  };
}

async function loadDocument() {
  const bundle = await esbuild.build({
    stdin: {
      contents:
        'export { exampleDashboardDocument } from "./src/integration/document/exampleDashboardDocument";',
      resolveDir: process.cwd(),
      sourcefile: "workspace-assets-verification-entry.ts",
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

function componentFrom(document) {
  const subtree = structuredClone(
    document.layout.dsl.children.find(
      (widget) => widget.widgetId === "engine-speed-card",
    ),
  );

  delete subtree.parentId;

  return {
    assetKind: "component",
    schemaVersion: 1,
    componentId: "shared-engine-speed-card",
    name: "Shared engine speed card",
    compatibility: document.compatibility,
    subtree,
    variables: document.variables,
    bindings: document.bindings.filter(
      (binding) => binding.id === "engine-speed-value-binding",
    ),
  };
}

function themeFrom(document) {
  return {
    assetKind: "theme",
    schemaVersion: 1,
    name: "Night operations",
    properties: {
      ...document.theme.properties,
      colors: {
        primaryColor: "#ffba52",
        backgroundColor: "#152536",
      },
    },
  };
}

function item(id, type, name) {
  return {
    id,
    name,
    description: `Shared ${type}`,
    typeId: type === "dashboard" ? 2 : type === "component" ? 3 : 4,
    type,
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
}

async function readDraft(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const opened = indexedDB.open("operator-display-drafts", 1);

        opened.onerror = () => reject(opened.error);
        opened.onsuccess = () => {
          const db = opened.result;
          const transaction = db.transaction("drafts", "readonly");
          const requested = transaction.objectStore("drafts").getAll();

          requested.onerror = () => reject(requested.error);
          requested.onsuccess = () => {
            db.close();
            resolve(requested.result[0] || null);
          };
        };
      }),
  );
}

async function waitForCount(readCount, count) {
  const deadline = Date.now() + 10_000;

  while (readCount() !== count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  assert.equal(readCount(), count);
}

async function waitForAssetStatus(page, pattern) {
  try {
    await page
      .locator(".marketplace-assets__body > [role=status]")
      .getByText(pattern)
      .waitFor({ timeout: 10_000 });
  } catch (error) {
    const panel = await page.locator(".marketplace-assets").innerText();

    throw new Error(`Asset status ${pattern} did not appear. Panel: ${panel}`, {
      cause: error,
    });
  }
}

async function main() {
  const document = await loadDocument();
  const theme = themeFrom(document);
  const items = {
    7: item(7, "dashboard", "Engine overview"),
    21: item(21, "component", "Shared engine speed card"),
    31: item(31, "theme", "Night operations"),
  };
  const content = { 7: document, 21: componentFrom(document), 31: theme };
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
    headless: true,
  });

  try {
    const page = await browser.newPage();
    const pageErrors = [];
    const appsmithRequests = [];
    const unknownRequests = [];
    const assetQueries = [];
    const creations = { component: 0, theme: 0 };
    const replacements = { component: 0, theme: 0 };
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
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();

      if (path === "/operator_display/system/userInfo") {
        return replyJson(route, {
          id: 11,
          username: "operator@example.com",
          isSystemAdmin: false,
          groupMemberships: [],
        });
      }

      if (path === "/operator_display/marketplace/items") {
        if (method === "GET") {
          const filters = url.searchParams.getAll("filter");
          const values = url.searchParams.getAll("filterValue");
          const type = values[filters.indexOf("type")];

          if (type === "component" || type === "theme") {
            assetQueries.push({ type, search: url.searchParams.get("search") });

            return replyJson(
              route,
              pageOf([items[type === "component" ? 21 : 31]]),
            );
          }

          return replyJson(route, pageOf([items[7]]));
        }

        if (method === "POST") {
          const body = request.postData() || "";
          const type = /"type":"component"/.test(body)
            ? "component"
            : /"type":"theme"/.test(body)
              ? "theme"
              : null;

          assert.ok(type, `Unexpected asset creation body: ${body}`);
          creations[type] += 1;

          return replyJson(
            route,
            item(type === "component" ? 22 : 32, type, `New ${type}`),
          );
        }
      }

      const download = path.match(
        /^\/operator_display\/marketplace\/items\/(7|21|31)\/download$/,
      );

      if (download && method === "POST") {
        const id = Number(download[1]);

        return replyJson(route, {
          downloadUrl: `/operator_display/mock-content/${id}`,
          metadata: items[id],
        });
      }

      const contentMatch = path.match(
        /^\/operator_display\/mock-content\/(7|21|31)$/,
      );

      if (contentMatch && method === "GET") {
        return replyJson(route, content[Number(contentMatch[1])]);
      }

      const itemMatch = path.match(
        /^\/operator_display\/marketplace\/items\/(7|21|31)$/,
      );

      if (itemMatch) {
        const id = Number(itemMatch[1]);

        if (method === "GET") return replyJson(route, items[id]);

        if (method === "PUT" && (id === 21 || id === 31)) {
          const type = items[id].type;
          const body = request.postData() || "";

          assert.ok(body.includes(`"typeId":${items[id].typeId}`));
          replacements[type] += 1;

          return route.fulfill({ status: 204 });
        }
      }

      unknownRequests.push(`${method} ${path}`);

      return route.fulfill({ status: 500, body: "Unexpected request" });
    });

    await page.goto(`${baseUrl}/workspace?itemId=7`, {
      waitUntil: "domcontentloaded",
    });
    const title = page.getByRole("textbox", { name: "Title text" });

    await title.waitFor({ timeout: 90_000 });
    assert.deepEqual(assetQueries, []);
    await title.fill("Unsaved before assets");
    assert.equal(content[21].compatibility.widgetDslVersion, 89);
    await page.getByTestId("t--workbench-nav-tools").click();
    await page.getByTestId("t--asset-toggle").click();
    await page.getByTestId("t--asset-install-21").waitFor();
    assert.equal(assetQueries[0].type, "component");
    assert.equal(assetQueries[0].search, null);
    assert.equal(await readDraft(page), null);
    assert.deepEqual(creations, { component: 0, theme: 0 });
    assert.deepEqual(replacements, { component: 0, theme: 0 });

    await page.getByTestId("t--asset-install-21").click();
    await waitForAssetStatus(page, /installed/i);
    assert.equal(await title.inputValue(), "Unsaved before assets");
    assert.equal(await readDraft(page), null);

    await page.getByTestId("t--asset-tab-theme").click();
    await page.getByTestId("t--asset-apply-31").waitFor();
    assert.equal(assetQueries.at(-1).type, "theme");
    await page.getByTestId("t--asset-apply-31").click();
    await waitForAssetStatus(page, /applied/i);
    assert.equal(await title.inputValue(), "Unsaved before assets");
    assert.equal(await readDraft(page), null);
    assert.deepEqual(creations, { component: 0, theme: 0 });
    assert.deepEqual(replacements, { component: 0, theme: 0 });

    await page.getByTestId("t--standalone-save").click();
    await page
      .getByRole("status")
      .getByText(/Saved locally as revision 1/)
      .waitFor();
    let draft = await readDraft(page);

    assert.equal(draft.revision, 1);
    assert.equal(draft.document.layout.dsl.children.length, 4);
    assert.equal(draft.document.theme.name, "Night operations");
    assert.equal(
      draft.document.layout.dsl.children[0].text,
      "Unsaved before assets",
    );
    assert.ok(
      draft.document.componentDependencies.some(
        (dependency) =>
          dependency.source.kind === "marketplace" &&
          dependency.source.itemId === "21" &&
          /^[a-f0-9]{64}$/.test(dependency.source.contentSha256),
      ),
    );
    assert.deepEqual(creations, { component: 0, theme: 0 });
    assert.deepEqual(replacements, { component: 0, theme: 0 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await title.waitFor({ timeout: 90_000 });
    assert.equal(await title.inputValue(), "Unsaved before assets");
    draft = await readDraft(page);
    assert.equal(draft.document.layout.dsl.children.length, 4);
    assert.equal(draft.document.theme.name, "Night operations");

    await page.getByTestId("t--workbench-nav-tools").click();
    await page.getByTestId("t--asset-toggle").click();
    await page.getByTestId("t--asset-install-21").waitFor();
    await page
      .getByLabel("Dashboard source widget group")
      .selectOption("engine-speed-card");
    await page
      .getByRole("textbox", { name: "New asset description" })
      .fill("Reusable card");
    await page.getByLabel("New asset thumbnail").setInputFiles({
      name: "thumbnail.png",
      mimeType: "image/png",
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    });
    await page.getByTestId("t--asset-publish-new").click();
    await waitForCount(() => creations.component, 1);
    await page.getByTestId("t--asset-replace-21").click();
    await waitForCount(() => replacements.component, 1);

    await page.getByTestId("t--asset-tab-theme").click();
    await page.getByTestId("t--asset-apply-31").waitFor();
    await page.getByTestId("t--asset-publish-new").click();
    await waitForCount(() => creations.theme, 1);
    await page.getByTestId("t--asset-replace-31").click();
    await waitForCount(() => replacements.theme, 1);

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(appsmithRequests, []);
    assert.deepEqual(unknownRequests, []);
    assert.ok(
      assetQueries.every(
        ({ type }) => type === "component" || type === "theme",
      ),
    );
    process.stdout.write("Workspace asset mock-browser flow passed\n");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
