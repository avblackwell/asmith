/* Browser check for creating and uploading a new dashboard with controlled HTTP responses. */
const assert = require("node:assert/strict");
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

async function readDrafts(page) {
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
            resolve(requested.result);
          };
        };
      }),
  );
}

function widgetTypes(document) {
  const types = [];

  function visit(widget) {
    types.push(widget.type);
    widget.children?.forEach(visit);
  }

  visit(document.layout.dsl);

  return types;
}

function typeCount(document, type) {
  return widgetTypes(document).filter((candidate) => candidate === type).length;
}

function allWidgets(document) {
  const widgets = [];

  function visit(widget) {
    widgets.push(widget);
    widget.children?.forEach(visit);
  }

  visit(document.layout.dsl);

  return widgets;
}

function assertGuidedBindings(document, textWidgetId, chartWidgetId) {
  assert.equal(document.variables.length, 1);
  const variable = document.variables[0];

  assert.equal(variable.label, "Engine speed");
  assert.deepEqual(variable.selector, {
    kind: "logicalName",
    name: "ENGINE_SPEED",
  });
  const savedContent = JSON.stringify(document);

  assert.doesNotMatch(
    savedContent,
    /"(?:selectedCellId|testCellId|softwareId|cellId)"\s*:/,
    "Selected test-cell identity leaked into the dashboard package",
  );
  assert.ok(!savedContent.includes("Engine test cell"));
  assert.ok(!savedContent.includes("18446744073709551615"));
  assert.equal(variable.valueType, "number");
  assert.equal(document.bindings.length, 2);
  const textBinding = document.bindings.find(
    (binding) => binding.target.widgetId === textWidgetId,
  );
  const chartBinding = document.bindings.find(
    (binding) => binding.target.widgetId === chartWidgetId,
  );

  assert.ok(textBinding, "Text binding is missing");
  assert.ok(chartBinding, "Chart binding is missing");
  assert.equal(textBinding.variableKey, variable.key);
  assert.equal(chartBinding.variableKey, variable.key);
  assert.equal(textBinding.unitCode, 16);
  assert.equal(chartBinding.unitCode, 16);
  assert.deepEqual(textBinding.target, {
    widgetId: textWidgetId,
    propertyPath: "text",
  });
  assert.deepEqual(textBinding.presentation, {
    kind: "latest",
    template: "{value} rpm",
    decimalPlaces: 0,
  });
  assert.deepEqual(chartBinding.target, {
    widgetId: chartWidgetId,
    propertyPath: "chartData.series1.data",
  });
  assert.deepEqual(chartBinding.presentation, {
    kind: "history",
    maxPoints: 180,
    windowSeconds: 180,
  });
}

async function bindingPanelStructure(page) {
  return page.evaluate(() => {
    const properties = document.querySelector(".standalone-editor__properties");
    const sections = Array.from(document.querySelectorAll(".binding-editor"));

    return sections.map((section) => ({
      selectedId: section.querySelector(
        '[data-testid="t--binding-selected-widget-id"]',
      )?.textContent,
      parentClass: section.parentElement?.className,
      parentTag: section.parentElement?.tagName,
      propertiesChildIndex: properties
        ? Array.from(properties.children).indexOf(section)
        : -1,
      previousSiblingClass: section.previousElementSibling?.className,
      nextSiblingClass: section.nextElementSibling?.className,
    }));
  });
}

async function main() {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
    headless: true,
  });

  try {
    const page = await browser.newPage();
    const appsmithRequests = [];
    const pageErrors = [];
    const unknownRequests = [];
    const marketplaceWrites = [];
    const cellMetadataRequests = [];
    const liveRequests = [];
    const webSocketUrls = [];
    const testCell = {
      id: 6,
      name: "Engine test cell",
      site: { oid: 3, name: "North" },
      state: null,
    };
    const publishedItem = {
      id: 42,
      name: "New dashboard",
      description: "Created from the empty workspace",
      typeId: 2,
      type: "dashboard",
      tags: [],
      publisherId: 11,
      publisherUsername: "operator@example.com",
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
    page.on("websocket", (socket) => {
      const url = new URL(socket.url());
      const devHost = new URL(baseUrl).host;

      if (url.pathname !== "/ws" || url.host !== devHost) {
        webSocketUrls.push(socket.url());
      }
    });
    page.on("request", (request) => {
      const url = new URL(request.url());

      if (appsmithPath.test(url.pathname)) {
        appsmithRequests.push(request.url());
      }
      if (
        request.resourceType() !== "script" &&
        /cyflex|nats/i.test(`${url.hostname}${url.pathname}`)
      ) {
        if (
          request.method() === "GET" &&
          url.pathname === "/operator_display/remote/tc/6/cyflex/variables"
        ) {
          cellMetadataRequests.push(request.url());
        } else {
          liveRequests.push(`${request.method()} ${request.url()}`);
        }
      }
    });
    await page.route("**/operator_display/**", (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();

      if (path === "/operator_display/system/userInfo" && method === "GET") {
        return replyJson(route, {
          id: 11,
          username: "operator@example.com",
          isSystemAdmin: false,
          groupMemberships: [],
        });
      }
      if (path === "/operator_display/system/testcells" && method === "GET") {
        cellMetadataRequests.push(request.url());

        return replyJson(route, pageOf([testCell]));
      }
      if (path === "/operator_display/system/testcells/6" && method === "GET") {
        cellMetadataRequests.push(request.url());

        return replyJson(route, testCell);
      }
      if (
        path === "/operator_display/remote/tc/6/cyflex/variables" &&
        method === "GET"
      ) {
        assert.equal(request.headers().accept, "variables/json_all+output+v1");

        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: '{"variables":[{"id":18446744073709551615,"label":"ENGINE_SPEED","unit_code":16}]}',
        });
      }
      if (path === "/operator_display/marketplace/items" && method === "GET") {
        return replyJson(route, pageOf([]));
      }
      if (path === "/operator_display/marketplace/items" && method === "POST") {
        marketplaceWrites.push({ method, body: request.postData() || "" });

        return replyJson(route, publishedItem);
      }
      if (method === "POST" || method === "PUT" || method === "DELETE") {
        marketplaceWrites.push({
          method,
          path,
          body: request.postData() || "",
        });
      }
      unknownRequests.push(`${method} ${path}`);

      return route.fulfill({ status: 500, body: "Unexpected request" });
    });

    await page.goto(`${baseUrl}/workspace`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    try {
      await page.getByRole("heading", { name: "Dashboards" }).waitFor();
    } catch (error) {
      process.stderr.write(
        `${JSON.stringify({
          url: page.url(),
          title: await page.title(),
          body: (await page.locator("body").innerText()).slice(0, 1500),
          pageErrors,
          unknownRequests,
          appsmithRequests,
        })}\n`,
      );
      throw error;
    }
    await page.getByText("Signed in as").waitFor();
    await page.getByText("No dashboards are available").waitFor();
    await page.getByTestId("t--new-dashboard").click();
    await page.waitForURL(/\/workspace\?draftId=[0-9a-f-]+$/i);
    const draftId = new URL(page.url()).searchParams.get("draftId");
    const title = page.getByRole("textbox", { name: "Title text" });
    const dashboardName = page.getByRole("textbox", { name: "Dashboard name" });
    const bindingPanel = page.locator(".binding-editor").last();

    await title.waitFor({ timeout: 90_000 });
    await page.getByTestId("t--workbench-properties-tab").waitFor();
    await page.locator(".t--propertypane").waitFor();
    await page.getByTestId("t--workbench-live-data-tab").click();
    await bindingPanel.waitFor();
    assert.equal(await dashboardName.inputValue(), "Untitled dashboard");
    assert.ok(draftId);
    assert.notEqual(draftId, "example-engine-overview");
    assert.equal(await page.getByTestId("t--publish-replace").count(), 0);
    let drafts = await readDrafts(page);

    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].documentId, draftId);
    assert.equal(drafts[0].accountId, "11");
    assert.equal(drafts[0].revision, 1);
    assert.equal(marketplaceWrites.length, 0);
    const originalDocument = drafts[0].document;

    assert.deepEqual(originalDocument.variables, []);
    assert.deepEqual(originalDocument.bindings, []);
    assert.equal(originalDocument.layout.dsl.children.length, 1);
    assert.equal(originalDocument.layout.dsl.children[0].type, "TEXT_WIDGET");

    await dashboardName.fill("Production telemetry");
    await title.fill("Authoring browser test");
    await page
      .getByTestId("t--canvas-artboard")
      .getByText("Authoring browser test")
      .waitFor();
    await page.getByTestId("t--palette-add-text").click();
    await page.waitForFunction(() => {
      return Array.from(
        document.querySelectorAll(
          '[data-testid="t--binding-selected-widget-id"]',
        ),
      ).some((selected) => selected.textContent?.trim() !== "dashboard-title");
    });
    const textWidgetId = (
      await bindingPanel
        .getByTestId("t--binding-selected-widget-id")
        .textContent()
    )?.trim();

    assert.ok(textWidgetId);
    assert.notEqual(textWidgetId, "dashboard-title");
    await bindingPanel
      .getByTestId("t--binding-variable-choice")
      .selectOption({ label: "New variable" });
    await bindingPanel.getByTestId("t--binding-discovery-open").click();
    await bindingPanel
      .getByTestId("t--binding-discovery-cell")
      .selectOption("6");
    await bindingPanel
      .getByTestId("t--binding-discovery-search")
      .fill("ENGINE");
    await bindingPanel.getByTestId("t--binding-discovery-result-0").click();
    assert.equal(
      await bindingPanel.getByTestId("t--binding-variable-label").inputValue(),
      "ENGINE_SPEED",
    );
    assert.equal(
      await bindingPanel.getByTestId("t--binding-selector-value").inputValue(),
      "ENGINE_SPEED",
    );
    await bindingPanel
      .getByTestId("t--binding-variable-label")
      .fill("Engine speed");
    await bindingPanel
      .getByTestId("t--binding-value-type")
      .selectOption("number");
    await bindingPanel.getByTestId("t--binding-unit-code").fill("16");
    await bindingPanel.getByTestId("t--binding-template").fill("{value} rpm");
    await bindingPanel.getByTestId("t--binding-decimal-places").fill("0");
    await bindingPanel.getByTestId("t--binding-save").click();
    assert.equal(
      await page.locator(".binding-editor").count(),
      1,
      `Text save duplicated the binding panel: ${JSON.stringify(await bindingPanelStructure(page))}`,
    );

    await page.getByTestId("t--palette-add-chart").click();
    try {
      await page.waitForFunction((prior) => {
        return Array.from(
          document.querySelectorAll(
            '[data-testid="t--binding-selected-widget-id"]',
          ),
        ).some((selected) => selected.textContent?.trim() !== prior);
      }, textWidgetId);
    } catch (error) {
      process.stderr.write(
        `${JSON.stringify({
          selectedWidget: await page
            .getByTestId("t--binding-selected-widget-id")
            .allTextContents(),
          bindingPanel: await page
            .getByRole("region", { name: "Live data bindings" })
            .allInnerTexts(),
          palette: await page.locator(".widget-palette").innerText(),
          alerts: await page.getByRole("alert").allInnerTexts(),
          pageErrors,
        })}\n`,
      );
      throw error;
    }
    assert.equal(
      await page.locator(".binding-editor").count(),
      1,
      `Chart add duplicated the binding panel: ${JSON.stringify(await bindingPanelStructure(page))}`,
    );
    const chartWidgetId = (
      await bindingPanel
        .getByTestId("t--binding-selected-widget-id")
        .textContent()
    )?.trim();

    assert.ok(chartWidgetId);
    await bindingPanel
      .getByTestId("t--binding-variable-choice")
      .selectOption({ label: "Engine speed" });
    await bindingPanel.getByTestId("t--binding-unit-code").fill("16");
    await bindingPanel.getByTestId("t--binding-series").selectOption("series1");
    await bindingPanel.getByTestId("t--binding-max-points").fill("180");
    await bindingPanel.getByTestId("t--binding-window-seconds").fill("180");
    await bindingPanel.getByTestId("t--binding-save").click();
    await page.getByTestId("t--palette-add-container").click();
    await page.getByTestId("t--standalone-save").click();
    try {
      await page
        .getByRole("status")
        .getByText(/Saved locally as revision 2/)
        .waitFor({ timeout: 30_000 });
    } catch (error) {
      process.stderr.write(
        `${JSON.stringify({
          status: await page.getByRole("status").allInnerTexts(),
          alert: await page.getByRole("alert").allInnerTexts(),
          palette: await page.locator(".widget-palette").innerText(),
          draftRevisions: (await readDrafts(page)).map((draft) => ({
            revision: draft.revision,
            name: draft.document.name,
            types: widgetTypes(draft.document),
          })),
          pageErrors,
          unknownRequests,
        })}\n`,
      );
      throw error;
    }
    drafts = await readDrafts(page);
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].revision, 2);
    assert.equal(drafts[0].documentId, draftId);
    assert.equal(drafts[0].document.name, "Production telemetry");
    assertGuidedBindings(drafts[0].document, textWidgetId, chartWidgetId);
    assert.equal(
      allWidgets(drafts[0].document).find(
        (widget) => widget.widgetId === textWidgetId,
      )?.type,
      "TEXT_WIDGET",
    );
    assert.equal(
      allWidgets(drafts[0].document).find(
        (widget) => widget.widgetId === chartWidgetId,
      )?.type,
      "CHART_WIDGET",
    );
    assert.equal(
      typeCount(drafts[0].document, "TEXT_WIDGET"),
      typeCount(originalDocument, "TEXT_WIDGET") + 1,
    );
    assert.equal(
      typeCount(drafts[0].document, "CHART_WIDGET"),
      typeCount(originalDocument, "CHART_WIDGET") + 1,
    );
    assert.equal(
      typeCount(drafts[0].document, "CONTAINER_WIDGET"),
      typeCount(originalDocument, "CONTAINER_WIDGET") + 1,
    );
    assert.equal(
      marketplaceWrites.length,
      0,
      "Local save wrote to the marketplace",
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await title.waitFor({ timeout: 90_000 });
    assert.equal(await title.inputValue(), "Authoring browser test");
    assert.equal(await dashboardName.inputValue(), "Production telemetry");
    assertGuidedBindings(
      (await readDrafts(page))[0].document,
      textWidgetId,
      chartWidgetId,
    );
    await page
      .getByRole("status")
      .getByText(/draft revision 2 loaded/i)
      .waitFor();
    assert.equal(new URL(page.url()).searchParams.get("draftId"), draftId);
    await page.getByTestId("t--workbench-nav-tools").click();
    await page
      .getByRole("textbox", { name: "New item description" })
      .fill("Created from the empty workspace");
    await page.getByLabel("New item thumbnail").setInputFiles({
      name: "thumbnail.png",
      mimeType: "image/png",
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    });
    await page.getByTestId("t--publish-new").click();
    await page
      .getByRole("status")
      .getByText(/Uploaded a new dashboard item #42/)
      .waitFor();
    assert.equal(marketplaceWrites.length, 1);
    assert.equal(
      cellMetadataRequests.filter((requestUrl) =>
        new URL(requestUrl).pathname.endsWith("/cyflex/variables"),
      ).length,
      1,
    );
    assert.ok(
      cellMetadataRequests.some(
        (requestUrl) =>
          new URL(requestUrl).pathname === "/operator_display/system/testcells",
      ),
    );
    assert.ok(
      cellMetadataRequests.some(
        (requestUrl) =>
          new URL(requestUrl).pathname ===
          "/operator_display/system/testcells/6",
      ),
    );
    assert.equal(marketplaceWrites[0].method, "POST");
    assert.match(marketplaceWrites[0].body, /"type":"dashboard"/);
    assert.match(marketplaceWrites[0].body, /"name":"Production telemetry"/);
    assert.ok(
      /"documentId"\s*:\s*"[0-9a-f-]+"/i.test(marketplaceWrites[0].body),
      "Uploaded content omitted the draft document ID",
    );
    assert.ok(marketplaceWrites[0].body.includes(draftId));
    assert.ok(marketplaceWrites[0].body.includes("Authoring browser test"));
    assert.ok(marketplaceWrites[0].body.includes('"ENGINE_SPEED"'));
    assert.ok(!marketplaceWrites[0].body.includes("Engine test cell"));
    assert.ok(!marketplaceWrites[0].body.includes("18446744073709551615"));
    assert.doesNotMatch(
      marketplaceWrites[0].body,
      /"(?:selectedCellId|testCellId|softwareId|cellId)"\s*:/,
    );
    assert.ok(marketplaceWrites[0].body.includes('"chartData.series1.data"'));
    assert.ok(marketplaceWrites[0].body.includes('"{value} rpm"'));
    assert.ok(marketplaceWrites[0].body.includes(textWidgetId));
    assert.ok(marketplaceWrites[0].body.includes(chartWidgetId));
    assert.equal((await readDrafts(page))[0].revision, 2);

    await page.goto(`${baseUrl}/workspace`, { waitUntil: "domcontentloaded" });
    await page.getByTestId(`t--open-local-draft-${draftId}`).waitFor();
    await page.getByTestId("t--new-dashboard").click();
    await page.waitForURL(/\/workspace\?draftId=[0-9a-f-]+$/i);
    const secondDraftId = new URL(page.url()).searchParams.get("draftId");

    await title.waitFor({ timeout: 90_000 });
    assert.ok(secondDraftId);
    assert.notEqual(secondDraftId, draftId);
    drafts = await readDrafts(page);
    assert.equal(drafts.length, 2);
    assert.ok(drafts.some((draft) => draft.documentId === draftId));
    assert.ok(drafts.some((draft) => draft.documentId === secondDraftId));
    assert.equal(marketplaceWrites.length, 1);
    assert.deepEqual(appsmithRequests, []);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(unknownRequests, []);
    assert.deepEqual(liveRequests, []);
    assert.deepEqual(webSocketUrls, []);
    process.stdout.write("Workspace new-dashboard mock-browser flow passed\n");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
