const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const dist = path.resolve(__dirname, "../dist");
const preview = (color) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600"><rect width="960" height="600" fill="${color}"/></svg>`)}`;
const items = [
  {
    id: 7,
    name: "Engine overview",
    description: "Engine dashboard",
    typeId: 1,
    type: "dashboard",
    publisherUsername: "publisher@example.com",
    downloadCount: 4,
    thumbnailUrl: "",
    previewImages: [preview("#dce5f5"), preview("#ddf3ec")],
    tags: [{ id: 2, name: "Monitoring", color: null, icon: null }],
    publishedAt: null,
  },
  {
    id: 8,
    name: "Coolant gauge",
    description: "Coolant component",
    typeId: 2,
    type: "component",
    publisherUsername: "publisher@example.com",
    downloadCount: 2,
    thumbnailUrl: "",
    previewImages: [],
    publishedAt: null,
  },
];
const groups = [
  { id: 5, name: "Public", memberCount: 2 },
  { id: 6, name: "Laboratory", memberCount: 3 },
];
const itemQueries = [];
const itemReads = [];
const dashboardDownloads = [];
const dashboardContentReads = [];
const appsmithRequests = [];
const cyflexRunRequests = [];
const cyflexDiscoveryRequests = [];
const invalidDashboardItem = { ...items[0], id: 10, name: "Broken dashboard" };
let publishedDashboard = null;

function paged(data) {
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
    },
  };
}

function json(response, value) {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

async function countLocalDrafts(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("operator-display-drafts", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = await new Promise((resolve, reject) => {
      const request = database.transaction("drafts", "readonly")
        .objectStore("drafts").count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return count;
  });
}

async function readLocalDraft(page, documentId) {
  return page.evaluate(async (id) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("operator-display-drafts", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const deploymentId = `${window.location.origin}/operator_display`;
    const draft = await new Promise((resolve, reject) => {
      const request = database.transaction("drafts", "readonly")
        .objectStore("drafts").get(JSON.stringify([deploymentId, "1", id]));
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return draft;
  }, documentId);
}

async function crossContainerDragState(page, widgetId, innerCanvasId, point) {
  return page.evaluate(({ widgetId, innerCanvasId, point }) => {
    const viewport = document.querySelector(".od-workbench__viewport");
    const widgets = [...document.querySelectorAll(`[data-widget-id="${widgetId}"]`)];
    const inner = document.querySelector(`[data-widget-id="${innerCanvasId}"]`);
    const preview = document.querySelector('[data-testid="canvas-dragging-0"]');
    return {
      viewportScrollTop: viewport?.scrollTop ?? null,
      sourceCount: widgets.length,
      nestedCount: widgets.filter((widget) => inner?.contains(widget)).length,
      sameSourceNode: widgets[0] === window.__crossContainerSourceNode,
      sourceDragState: widgets.map((widget) => widget.getAttribute("data-drag-source")),
      rootPreview: preview ? {
        valid: preview.getAttribute("data-drag-preview-valid"),
        visible: preview.getBoundingClientRect().width > 0 &&
          preview.getBoundingClientRect().height > 0,
      } : null,
      dragLayers: [...document.querySelectorAll(".drag-layer[data-drop-canvas-id]")]
        .map((layer) => layer.getAttribute("data-drop-canvas-id")),
      hitWidgets: document.elementsFromPoint(point.x, point.y)
        .map((element) => element.closest("[data-widget-id]")?.getAttribute("data-widget-id") ?? null)
        .filter(Boolean),
      errors: [...document.querySelectorAll(".od-workbench__preview-error")]
        .map((element) => element.textContent?.trim()),
      eventLog: window.__crossContainerEventLog ?? [],
    };
  }, { widgetId, innerCanvasId, point });
}

async function readStoredWidgetClipboard(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("operator-display-widget-clipboard", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const key = JSON.stringify([`${window.location.origin}/operator_display`, "1"]);
    const record = await new Promise((resolve, reject) => {
      const request = database.transaction("clipboard", "readonly")
        .objectStore("clipboard").get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return record;
  });
}

async function widgetGridFrame(page, widgetId) {
  const widget = page.locator(`[data-widget-id="${widgetId}"]`);
  await widget.waitFor();
  return widget.evaluate((element) => ({
    top: Number.parseFloat(element.style.top),
    height: Number.parseFloat(element.style.height),
  }));
}

async function installCanvasMountProbe(page, widgetId) {
  const installed = await page.evaluate((id) => {
    window.__canvasMountProbe?.observer.disconnect();
    const widget = document.querySelector(`[data-widget-id="${id}"]`);
    const measurement = widget?.querySelector(".auto-height-container");
    if (!widget || !measurement) return false;
    const probe = { widget, measurement, widgetRemovals: 0, measurementRemovals: 0 };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const removed of record.removedNodes) {
          if (removed === widget || removed.contains?.(widget)) probe.widgetRemovals += 1;
          if (removed === measurement || removed.contains?.(measurement)) {
            probe.measurementRemovals += 1;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    probe.observer = observer;
    window.__canvasMountProbe = probe;
    return true;
  }, widgetId);
  assert.ok(installed, `auto-height Text ${widgetId} must have a measurement wrapper`);
}

async function assertCanvasMountProbe(page, context, { measurement = true } = {}) {
  const observed = await page.evaluate(() => {
    const probe = window.__canvasMountProbe;
    const currentWidget = document.querySelector(
      `[data-widget-id="${probe.widget.getAttribute("data-widget-id")}"]`,
    );
    return {
      widgetConnected: probe.widget.isConnected,
      widgetUnchanged: currentWidget === probe.widget,
      measurementConnected: probe.measurement.isConnected,
      measurementUnchanged: currentWidget?.querySelector(".auto-height-container") ===
        probe.measurement,
      widgetRemovals: probe.widgetRemovals,
      measurementRemovals: probe.measurementRemovals,
    };
  });
  const expected = {
    widgetConnected: true,
    widgetUnchanged: true,
    widgetRemovals: 0,
  };
  if (measurement) {
    Object.assign(expected, {
      measurementConnected: true,
      measurementUnchanged: true,
      measurementRemovals: 0,
    });
  }
  assert.deepEqual(Object.fromEntries(Object.keys(expected).map((key) =>
    [key, observed[key]])), expected, context);
}

async function dragHandle(page, handle, deltaX, deltaY) {
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  assert.ok(box, "editor handle must be visible");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX, y + deltaY, { steps: 5 });
  await page.mouse.up();
}

async function dragPaletteTo(page, card, target, { x, y, onHover } = {}) {
  await card.scrollIntoViewIfNeeded();
  const sourceBox = await card.boundingBox();
  const targetBox = await target.boundingBox();
  assert.ok(sourceBox && targetBox, "palette source and destination must be visible");
  await page.mouse.move(sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + (x ?? targetBox.width / 2),
    targetBox.y + (y ?? targetBox.height / 2), { steps: 12 });
  if (onHover) await onHover();
  await page.mouse.up();
}

async function canvasDragPixels(page, canvasId) {
  const canvas = page.getByTestId(`canvas-dragging-${canvasId}`);
  return canvas.evaluate((element) => {
    const context = element.getContext("2d", { willReadFrequently: true });
    const pixels = context.getImageData(0, 0, element.width, element.height).data;
    let blue = 0;
    let red = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const [r, g, b, a] = pixels.subarray(index, index + 4);
      if (a < 30) continue;
      if (Math.abs(r - 104) <= 18 && Math.abs(g - 113) <= 18 &&
        Math.abs(b - 239) <= 18) blue += 1;
      if (r >= 225 && g <= 90 && b <= 90) red += 1;
    }
    return { blue, red };
  });
}

async function selectionCanvasPixel(page, canvasId, localX, localY) {
  return page.getByTestId(`canvas-selection-${canvasId}`).evaluate(
    (canvas, { x, y }) => {
      const scaleX = canvas.width / canvas.getBoundingClientRect().width;
      const scaleY = canvas.height / canvas.getBoundingClientRect().height;
      const visibleLeft = Number.parseFloat(canvas.style.left) || 0;
      const visibleTop = Number.parseFloat(canvas.style.top) || 0;
      const pixel = canvas.getContext("2d", { willReadFrequently: true }).getImageData(
        Math.round((x - visibleLeft) * scaleX),
        Math.round((y - visibleTop) * scaleY), 1, 1,
      ).data;
      return [...pixel];
    }, { x: localX, y: localY },
  );
}

async function dragPreviewBlueBounds(page, canvasId) {
  return page.getByTestId(`canvas-dragging-${canvasId}`).evaluate((canvas) => {
    const frame = canvas.getBoundingClientRect();
    const pixels = canvas.getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width;
    let top = canvas.height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const index = (y * canvas.width + x) * 4;
        if (Math.abs(pixels[index] - 104) > 6 ||
          Math.abs(pixels[index + 1] - 113) > 6 ||
          Math.abs(pixels[index + 2] - 239) > 6 || pixels[index + 3] < 120) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    if (right < left || bottom < top) return null;
    const scaleX = frame.width / canvas.width;
    const scaleY = frame.height / canvas.height;
    return { x: frame.x + left * scaleX, y: frame.y + top * scaleY,
      right: frame.x + (right + 1) * scaleX,
      bottom: frame.y + (bottom + 1) * scaleY };
  });
}

function unionFrames(frames) {
  return { x: Math.min(...frames.map((frame) => frame.x)),
    y: Math.min(...frames.map((frame) => frame.y)),
    right: Math.max(...frames.map((frame) => frame.x + frame.width)),
    bottom: Math.max(...frames.map((frame) => frame.y + frame.height)) };
}

async function expectBoxAround(page, box, widgetIds, tolerance = 2) {
  const frames = await Promise.all(widgetIds.map((id) =>
    page.locator(`[data-widget-id="${id}"]`).boundingBox()));
  assert.ok(frames.every(Boolean), "selected widget frames must be measurable");
  const actual = await box.boundingBox();
  assert.ok(actual, "Appsmith sibling selection box must be measurable");
  const expected = {
    left: Math.min(...frames.map((frame) => frame.x)),
    top: Math.min(...frames.map((frame) => frame.y)),
    right: Math.max(...frames.map((frame) => frame.x + frame.width)),
    bottom: Math.max(...frames.map((frame) => frame.y + frame.height)),
  };
  assert.ok(Math.abs(actual.x - expected.left) <= tolerance &&
    Math.abs(actual.y - expected.top) <= tolerance &&
    Math.abs(actual.x + actual.width - expected.right) <= tolerance &&
    Math.abs(actual.y + actual.height - expected.bottom) <= tolerance,
  `Appsmith selection box must enclose sibling widget bounds: ${JSON.stringify({ actual, expected })}`);
}

async function expectAppsmithDragPreview(page, canvasId, { widgetId, paint = true } = {}) {
  const grid = page.locator(`.drag-layer[data-drop-canvas-id="${canvasId}"]`);
  await expect(grid).toBeVisible();
  assert.match(await grid.evaluate((element) => getComputedStyle(element).backgroundImage),
    /radial-gradient/, "active Appsmith drop canvas must show grid dots");
  const canvas = page.getByTestId(`canvas-dragging-${canvasId}`);
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-drag-preview-valid", "true");
  // The sticky arena clips pixels outside the visible scroll viewport. At the
  // scroll edge the placement can be valid while its painted block is clipped.
  if (paint) {
    await expect.poll(async () => (await canvasDragPixels(page, canvasId)).blue)
      .toBeGreaterThan(100);
  }
  if (widgetId) {
    await expect(page.locator(`[data-widget-id="${widgetId}"][data-drag-source="true"]`))
      .toBeHidden();
  }
}

async function expectAppsmithWidgetName(page, widgetId, placement) {
  const boundary = page.locator(`[data-editing-widget-id="${widgetId}"]`);
  const name = boundary.getByTestId("t--widget-propertypane-toggle");
  await expect(name).toBeVisible();
  const frame = await boundary.boundingBox();
  const tag = await name.boundingBox();
  assert.ok(frame && tag, "widget name and selection boundary must be measurable");
  assert.ok(Math.abs(tag.x + tag.width - frame.x - frame.width) <= 4,
    `Appsmith widget name must align to right edge: ${JSON.stringify({ frame, tag })}`);
  if (placement === "below") {
    assert.ok(tag.y >= frame.y + frame.height - 4,
      `top-row Appsmith widget name must flip below: ${JSON.stringify({ frame, tag })}`);
  } else {
    assert.ok(tag.y + tag.height <= frame.y + 4,
      `Appsmith widget name must sit above: ${JSON.stringify({ frame, tag })}`);
  }
}

async function dragHandleWithPreview(page, handle, deltaX, deltaY, widgetId, canvasId) {
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  assert.ok(box, "editor handle must be visible");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX, y + deltaY, { steps: 5 });
  await expectAppsmithDragPreview(page, canvasId, { widgetId });
  await page.mouse.up();
  await expect(page.locator(`[data-widget-id="${widgetId}"][data-drag-source="true"]`))
    .toHaveCount(0);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");

  if (/^\/(?:api|v1|rts)(?:\/|$)/.test(url.pathname)) {
    appsmithRequests.push(url.pathname);
    response.writeHead(500).end("Appsmith backend unavailable");

    return;
  }

  if (url.pathname === "/operator_display/system/userInfo") {
    json(response, {
      id: 1,
      username: "operator@example.com",
      isSystemAdmin: false,
      groupMemberships: [],
    });

    return;
  }

  if (url.pathname === "/operator_display/system/testcells" && request.method === "GET") {
    cyflexDiscoveryRequests.push({ path: url.pathname, method: request.method });
    json(response, paged([{
      id: 6,
      name: "Engine cell",
      site: { oid: 1, name: "Test site" },
      state: null,
    }]));

    return;
  }

  if (url.pathname === "/operator_display/system/testcells/6" && request.method === "GET") {
    cyflexDiscoveryRequests.push({ path: url.pathname, method: request.method });
    json(response, {
      id: 6,
      name: "Engine cell",
      site: { oid: 1, name: "Test site" },
      state: null,
    });

    return;
  }

  if (url.pathname === "/operator_display/remote/tc/6/cyflex/variables" && request.method === "GET") {
    cyflexDiscoveryRequests.push({
      path: url.pathname,
      method: request.method,
      accept: request.headers.accept,
    });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end('{"variables":[{"id":18446744073709551615,"label":"ENGINE_SPEED"}]}');

    return;
  }

  if (url.pathname === "/operator_display/remote/tc/6/cyflex" && request.method === "GET") {
    cyflexRunRequests.push({ path: url.pathname, method: request.method, accept: request.headers.accept });
    json(response, { stream_subject: "global.streaming.test.engine" });
    return;
  }

  if (url.pathname === "/operator_display/remote/tc/6/cyflex/streaming" && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      cyflexRunRequests.push({
        path: url.pathname,
        method: request.method,
        accept: request.headers.accept,
        contentType: request.headers["content-type"],
        body,
      });
      json(response, {});
    });
    return;
  }

  if (url.pathname === "/operator_display/marketplace/groups") {
    json(response, paged(groups));

    return;
  }

  if (url.pathname === "/operator_display/marketplace/items") {
    itemQueries.push(url.search);
    const filterFields = url.searchParams.getAll("filter");
    const filterValues = url.searchParams.getAll("filterValue");
    const filters = new Map(filterFields.map((field, index) => [field, filterValues[index]]));
    const groupId = filters.get("group_id") || null;
    const type = filters.get("type") || null;
    const search = (url.searchParams.get("search") || "").toLowerCase();
    const selected = items.filter((item) => {
      if (groupId === "5" && item.id !== 7) return false;
      if (groupId === "6" && item.id !== 8) return false;
      if (type && item.type !== type) return false;

      return !search || item.name.toLowerCase().includes(search);
    });

    json(response, paged(selected));

    return;
  }

  const downloadMatch = /^\/operator_display\/marketplace\/items\/([1-9]\d*)\/download$/.exec(url.pathname);

  if (downloadMatch && request.method === "POST") {
    const itemId = Number(downloadMatch[1]);
    dashboardDownloads.push(itemId);

    if (itemId !== 7 && itemId !== 10) {
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("Dashboard unavailable");
    } else {
      json(response, {
        downloadUrl: `/operator_display/mock-content/${itemId}`,
        metadata: itemId === 7 ? items[0] : invalidDashboardItem,
      });
    }

    return;
  }

  const contentMatch = /^\/operator_display\/mock-content\/(7|10)$/.exec(url.pathname);

  if (contentMatch && request.method === "GET") {
    const itemId = Number(contentMatch[1]);
    dashboardContentReads.push(itemId);

    if (itemId === 7 && !publishedDashboard) {
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end("Published dashboard fixture was not prepared");
    } else if (itemId === 7) {
      json(response, publishedDashboard);
    } else {
      json(response, {
        assetKind: "dashboard",
        schemaVersion: 1,
        documentId: "broken-dashboard",
      });
    }

    return;
  }

  if (/^\/operator_display\/marketplace\/items\/[1-9]\d*$/.test(url.pathname)) {
    itemReads.push(url.pathname);
    const item = [...items, invalidDashboardItem]
      .find((candidate) => candidate.id === Number(url.pathname.split("/").pop()));

    if (!item) {
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("Item unavailable");
    } else {
      json(response, item);
    }

    return;
  }

  const file = path.resolve(dist, `.${url.pathname}`);
  const withinDist = file.startsWith(`${dist}${path.sep}`);

  if (withinDist && fs.existsSync(file) && fs.statSync(file).isFile()) {
    const extension = path.extname(file);
    const contentType = {
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
    }[extension] || "application/octet-stream";

    response.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(file).pipe(response);

    return;
  }

  response.writeHead(200, { "Content-Type": "text/html" });
  fs.createReadStream(path.join(dist, "index.html")).pipe(response);
});

async function main() {
  assert.ok(fs.existsSync(path.join(dist, "index.html")), "build first");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
    headless: true,
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    const browserRequests = [];

    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("request", (request) => browserRequests.push(request.url()));
    if (process.env.VERIFY_MODAL_ONLY === "1") {
      await verifyModalFlow();
      assert.deepEqual(pageErrors, []);
      console.log("Focused Modal browser flow passed");
      return;
    }
    await page.goto(`http://127.0.0.1:${port}/marketplace`);
    try {
      await page.getByText("Engine overview").waitFor({ timeout: 10000 });
    } catch (error) {
      console.error("Browser page errors:", pageErrors);
      console.error("Visible body:", (await page.locator("body").innerText()).slice(0, 1200));
      console.error("Item requests:", itemQueries);
      throw error;
    }
    await page.getByText("Coolant gauge").waitFor();

    if (process.env.BROWSER_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.BROWSER_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(process.env.BROWSER_SCREENSHOT_DIR, "marketplace.png"),
        fullPage: true,
      });
    }

    await page.getByRole("button", { name: /Public/ }).click();
    await page.getByText("Coolant gauge").waitFor({ state: "detached" });
    assert.ok(itemQueries.some((query) =>
      query.includes("filter=group_id&filterValue=5"),
    ));

    try {
      await page.getByRole("link", { name: /Engine overview/ }).click();
    } catch (error) {
      console.error("Filtered page:", (await page.locator("body").innerText()).slice(0, 1200));
      console.error("Links:", await page.locator("a").evaluateAll((anchors) => anchors.map((anchor) => [anchor.href, anchor.textContent])));
      console.error("Item queries:", itemQueries);
      console.error("Page errors:", pageErrors);
      throw error;
    }
    await page.getByRole("heading", { level: 1, name: "Engine overview" }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/marketplace/items/7");
    assert.equal(new URL(page.url()).searchParams.get("groupId"), "5");
    assert.ok(itemReads.includes("/operator_display/marketplace/items/7"));
    await page.getByRole("button", { name: "Show preview 2" }).click();
    assert.equal(await page.getByRole("button", { name: "Show preview 2" }).getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator(".marketplace-detail__browser-content img").getAttribute("alt"), "Engine overview preview 2");
    assert.equal(await page.getByRole("button", { name: "Publish" }).count(), 0);
    if (process.env.BROWSER_SCREENSHOT_DIR) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: path.join(process.env.BROWSER_SCREENSHOT_DIR, "marketplace-detail.png"),
        fullPage: true,
      });
    }
    await page.getByRole("link", { name: "Go back" }).click();
    await page.getByRole("heading", { level: 1, name: "Marketplace" }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get("groupId"), "5");

    await page.goto(`http://127.0.0.1:${port}/marketplace/items/8`);
    await page.getByRole("heading", { level: 1, name: "Coolant gauge" }).waitFor();
    await page.getByText("No preview available").waitFor();

    await page.goto(`http://127.0.0.1:${port}/marketplace/items/999`);
    await page.getByRole("heading", { level: 1, name: "Item unavailable" }).waitFor();
    await page.getByText("This item was not found or is unavailable to your account.").waitFor();

    await page.goto(`http://127.0.0.1:${port}/marketplace?groupId=5`);
    await page.getByRole("heading", { level: 1, name: "Marketplace" }).waitFor();

    await page.getByPlaceholder("Search marketplace").fill("missing");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByText("No items found for this search and group.").waitFor();
    assert.ok(itemQueries.some((query) => query.includes("search=missing")));

    await page.goto(`http://127.0.0.1:${port}/workspace`);
    await page.getByRole("heading", { level: 1, name: "Dashboards" }).waitFor();
    await page.getByText("Engine overview").waitFor();
    await page.getByText("Coolant gauge").waitFor({ state: "detached" });
    if (process.env.BROWSER_SCREENSHOT_DIR) {
      await page.screenshot({
        path: path.join(process.env.BROWSER_SCREENSHOT_DIR, "workspace.png"),
        fullPage: true,
      });
    }
    assert.ok(itemQueries.some((query) =>
      query.includes("filter=type&filterValue=dashboard"),
    ));
    await page.getByRole("button", { name: "Local drafts" }).click();
    await page.getByText("No local drafts yet.").waitFor();

    await page.goto(`http://127.0.0.1:${port}/workbench`);
    await page.getByText("Local editor").waitFor();
    await page.getByRole("region", { name: "Dashboard canvas" }).waitFor();
    await page.getByTestId("native-text-engine-title").waitFor();
    await page.getByTestId("native-container-engine-speed-card").waitFor();
    await page.getByTestId("native-basic-chart-widget").waitFor();
    await page.getByText("No chart data to display").waitFor();
    await page.getByRole("button", { name: "Preview dashboard" }).click();
    await expect(page.locator(".od-ide--preview")).toHaveCount(1);
    await expect(page.locator(".od-editable-canvas")).toHaveCount(0);
    await expect(page.locator(".od-ide__explorer")).toBeHidden();
    await expect(page.getByTestId("native-text-engine-title")).toBeVisible();
    await page.keyboard.press("Alt+p");
    await expect(page.locator(".od-ide--preview")).toHaveCount(0);
    await expect(page.locator(".od-editable-canvas")).toHaveCount(1);
    await page.getByRole("button", { name: "Preview sample values" }).click();
    await page.getByTestId("native-text-engine-speed-value").getByText("942 rpm").waitFor();
    await page.getByTestId("native-basic-chart").locator("svg").waitFor();
    await page.getByText("Local sample values").waitFor();
    if (process.env.BROWSER_SCREENSHOT_DIR) {
      await page.screenshot({
        path: path.join(process.env.BROWSER_SCREENSHOT_DIR, "workbench-sample-values.png"),
        fullPage: true,
      });
    }

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export JSON" }).click();
    const exportDownload = await downloadPromise;
    const dashboard = JSON.parse(fs.readFileSync(await exportDownload.path(), "utf8"));
    const mediaDashboard = JSON.parse(JSON.stringify(dashboard));
    mediaDashboard.documentId = `${dashboard.documentId}-media`;
    mediaDashboard.layout.dsl.minHeight = 1700;
    mediaDashboard.layout.dsl.bottomRow = 170;
    const mediaWidget = (widgetId, widgetName, type, topRow, bottomRow, leftColumn, rightColumn, properties) => ({
      widgetId,
      widgetName,
      type,
      version: 1,
      parentId: mediaDashboard.layout.dsl.widgetId,
      topRow,
      bottomRow,
      leftColumn,
      rightColumn,
      parentRowSpace: 10,
      parentColumnSpace: 19.4,
      isVisible: true,
      dynamicBindingPathList: [],
      ...properties,
    });
    mediaDashboard.layout.dsl.children.push(
      mediaWidget("reference-image", "ReferenceImage", "IMAGE_WIDGET", 90, 112, 2, 20, {
        image: preview("#5e7dbc"),
        defaultImage: "",
        objectFit: "contain",
      }),
      mediaWidget("unresolved-image", "UnresolvedImage", "IMAGE_WIDGET", 90, 112, 22, 40, {
        image: "{{MissingWidget.image}}",
        defaultImage: "",
        dynamicBindingPathList: [{ key: "image" }],
      }),
      mediaWidget("horizontal-divider", "HorizontalDivider", "DIVIDER_WIDGET", 94, 98, 42, 61, {
        orientation: "horizontal",
        strokeStyle: "dashed",
        dividerColor: "#b04a66",
        thickness: 3,
      }),
      mediaWidget("vertical-divider", "VerticalDivider", "DIVIDER_WIDGET", 103, 116, 50, 53, {
        orientation: "vertical",
        strokeStyle: "dotted",
        dividerColor: "#216b53",
        thickness: 4,
      }),
      mediaWidget("static-progress", "StaticProgress", "PROGRESS_WIDGET", 120, 124, 2, 30, {
        progressType: "linear",
        progress: 67,
        isIndeterminate: false,
        showResult: true,
        steps: 1,
        fillColor: "#2f80ed",
      }),
      mediaWidget("bound-progress", "BoundProgress", "PROGRESS_WIDGET", 120, 141, 32, 45, {
        progressType: "circular",
        progress: "{{StaticProgress.progress}}",
        dynamicBindingPathList: [{ key: "progress" }],
        isIndeterminate: false,
        showResult: true,
        steps: 1,
        fillColor: "#2f80ed",
      }),
      mediaWidget("unresolved-progress", "UnresolvedProgress", "PROGRESS_WIDGET", 129, 134, 2, 30, {
        progressType: "linear",
        progress: "{{MissingWidget.progress}}",
        dynamicBindingPathList: [{ key: "progress" }],
        isIndeterminate: false,
        showResult: true,
        steps: 1,
        fillColor: "#2f80ed",
      }),
      mediaWidget("indeterminate-progress", "IndeterminateProgress", "PROGRESS_WIDGET", 135, 140, 2, 30, {
        progressType: "linear",
        isIndeterminate: true,
        progress: "{{MissingWidget.progress}}",
        dynamicBindingPathList: [{ key: "progress" }],
        fillColor: "#2f80ed",
      }),
      mediaWidget("fallback-unresolved-image", "FallbackUnresolvedImage", "IMAGE_WIDGET", 119, 140, 46, 61, {
        image: preview("#375c86"),
        defaultImage: "{{MissingWidget.image}}",
        dynamicBindingPathList: [{ key: "defaultImage" }],
      }),
      mediaWidget("unresolved-divider", "UnresolvedDivider", "DIVIDER_WIDGET", 142, 145, 42, 61, {
        orientation: "{{MissingWidget.text}}",
        dynamicBindingPathList: [{ key: "orientation" }],
      }),
      mediaWidget("image-url-source", "ImageUrlSource", "TEXT_WIDGET", 145, 149, 25, 60, {
        text: preview("#42ac8d"),
        isVisible: false,
      }),
      mediaWidget("bound-image", "BoundImage", "IMAGE_WIDGET", 145, 166, 2, 20, {
        image: "{{ImageUrlSource.text}}",
        defaultImage: "",
        objectFit: "cover",
        dynamicBindingPathList: [{ key: "image" }],
      }),
    );
    const statbox = JSON.parse(JSON.stringify(mediaDashboard.layout.dsl.children.find(
      (widget) => widget.widgetId === "engine-speed-card",
    )));
    function renameStatboxTree(widget, parentId) {
      widget.widgetId = `statbox-${widget.widgetId}`;
      widget.widgetName = `Statbox${widget.widgetName}`;
      widget.parentId = parentId;
      widget.children?.forEach((child) => renameStatboxTree(child, widget.widgetId));
    }
    renameStatboxTree(statbox, mediaDashboard.layout.dsl.widgetId);
    statbox.type = "STATBOX_WIDGET";
    statbox.topRow = 145;
    statbox.bottomRow = 166;
    statbox.leftColumn = 32;
    statbox.rightColumn = 61;
    statbox.children[0].children[0].text = "Active cells";
    statbox.children[0].children[1].text = "4";
    mediaDashboard.layout.dsl.children.push(statbox);
    publishedDashboard = mediaDashboard;
    assert.equal(dashboard.assetKind, "dashboard");
    assert.equal(dashboard.layout.dsl.children.find((widget) =>
      widget.widgetId === "engine-speed-card",
    ).children[0].children.find((widget) =>
      widget.widgetId === "engine-speed-value",
    ).text, "— rpm", "sample values must not alter the saved document");
    assert.deepEqual(dashboard.layout.dsl.children.find((widget) =>
      widget.widgetId === "engine-speed-chart",
    ).chartData.speedSeries.data, []);

    await page.getByRole("button", { name: "Clear sample values" }).click();
    await page.getByText("No chart data to display").waitFor();
    await page.getByTestId("native-text-engine-speed-value").getByText("— rpm").waitFor();
    await page.getByRole("button", { name: "Select EngineSpeedCard", exact: true }).click({
      position: { x: 10, y: 10 },
    });
    assert.equal(await page.getByLabel("Widget name").inputValue(), "EngineSpeedCard");
    await page.getByRole("button", { name: "Select EngineTitle", exact: true }).click();
    assert.equal(await page.getByLabel("Widget name").inputValue(), "EngineTitle");
    await page.getByRole("button", { name: "Outline", exact: true }).click();
    await page.getByRole("button", { name: "EngineTitle", exact: true }).click();
    assert.equal(await page.getByLabel("Widget name").inputValue(), "EngineTitle");

    const draftIds = await page.evaluate(async ({ exported, media }) => {
      const deploymentId = `${window.location.origin}/operator_display`;
      const accountId = "1";
      const documentId = exported.documentId;
      exported.layout.dsl.children.find((widget) =>
        widget.widgetId === "engine-title").tabOrder = 3;
      const populated = JSON.parse(JSON.stringify(exported));
      populated.documentId = `${documentId}-with-data`;
      const chart = populated.layout.dsl.children.find((widget) =>
        widget.widgetId === "engine-speed-chart",
      );
      chart.chartData.speedSeries.data = [
        { x: "10:00", y: 915 },
        { x: "10:01", y: 942 },
      ];
      const resolved = JSON.parse(JSON.stringify(populated));
      resolved.documentId = `${documentId}-with-bindings`;
      const resolvedCard = resolved.layout.dsl.children.find((widget) =>
        widget.widgetId === "engine-speed-card",
      );
      const resolvedValue = resolvedCard.children[0].children.find((widget) =>
        widget.widgetId === "engine-speed-value",
      );
      resolvedValue.text = "Speed: {{EngineTitle.text}} rpm";
      resolvedValue.dynamicBindingPathList = [{ key: "text" }];
      const resolvedChart = resolved.layout.dsl.children.find((widget) =>
        widget.widgetId === "engine-speed-chart",
      );
      const boundChart = JSON.parse(JSON.stringify(resolvedChart));
      boundChart.widgetId = "engine-bound-chart";
      boundChart.widgetName = "EngineBoundChart";
      boundChart.topRow = 87;
      boundChart.bottomRow = 117;
      boundChart.chartName = "Bound speed history";
      boundChart.chartData = {
        boundSeries: {
          seriesName: "Speed from another chart",
          data: "{{EngineSpeedChart.chartData.speedSeries.data}}",
        },
      };
      boundChart.dynamicBindingPathList = [{ key: "chartData.boundSeries.data" }];
      resolved.layout.dsl.children.push(boundChart);

      const unresolved = JSON.parse(JSON.stringify(populated));
      unresolved.documentId = `${documentId}-with-missing-bindings`;
      unresolved.bindings = unresolved.bindings.filter((binding) =>
        binding.id !== "engine-speed-history-binding",
      );
      const unresolvedCard = unresolved.layout.dsl.children.find((widget) =>
        widget.widgetId === "engine-speed-card",
      );
      const unresolvedValue = unresolvedCard.children[0].children.find((widget) =>
        widget.widgetId === "engine-speed-value",
      );
      unresolvedValue.text = "{{MissingWidget.text}}";
      unresolvedValue.dynamicBindingPathList = [{ key: "text" }];
      const unresolvedChart = unresolved.layout.dsl.children.find((widget) =>
        widget.widgetId === "engine-speed-chart",
      );
      unresolvedChart.chartData.speedSeries.data = "{{MissingWidget.data}}";
      unresolvedChart.dynamicBindingPathList = [{ key: "chartData.speedSeries.data" }];
      const scrollingSelection = JSON.parse(JSON.stringify(exported));
      scrollingSelection.documentId = `${documentId}-scrolling-selection`;
      const scrollingCard = scrollingSelection.layout.dsl.children.find((widget) =>
        widget.widgetId === "engine-speed-card");
      scrollingCard.shouldScrollContents = true;
      const scrollingCanvas = scrollingCard.children[0];
      const deepText = {
        ...scrollingCanvas.children[0],
        widgetId: "engine-deep-selection-target",
        widgetName: "DeepSelectionTarget",
        topRow: 60,
        bottomRow: 65,
        text: "Deep selection target",
      };
      scrollingCanvas.children.push(deepText);
      const clipboardTarget = JSON.parse(JSON.stringify(exported));
      clipboardTarget.documentId = `${documentId}-clipboard-target`;
      clipboardTarget.name = "Clipboard target";
      clipboardTarget.layout.dsl.children = clipboardTarget.layout.dsl.children.filter((widget) =>
        widget.widgetId === "engine-title");
      clipboardTarget.variables = [];
      clipboardTarget.bindings = [];
      clipboardTarget.componentDependencies = [];
      const containerGate = JSON.parse(JSON.stringify(exported));
      containerGate.documentId = `${documentId}-container-gate`;
      containerGate.name = "Container reflow gate";
      const gateText = containerGate.layout.dsl.children.find((widget) =>
        widget.widgetId === "engine-title");
      const gateContainer = containerGate.layout.dsl.children.find((widget) =>
        widget.widgetId === "engine-speed-card");
      Object.assign(gateText, { widgetName: "GateText", leftColumn: 0,
        rightColumn: 20, topRow: 40, bottomRow: 46 });
      Object.assign(gateContainer, { widgetName: "GateContainer", leftColumn: 32,
        rightColumn: 56, topRow: 40, bottomRow: 58 });
      gateContainer.children[0].children = [];
      containerGate.layout.dsl.children = [gateText, gateContainer];
      containerGate.variables = [];
      containerGate.bindings = [];
      containerGate.componentDependencies = [];
      const autoHeight = JSON.parse(JSON.stringify(exported));
      autoHeight.documentId = `${documentId}-auto-height`;
      autoHeight.name = "Auto height browser fixture";
      autoHeight.variables = [];
      autoHeight.bindings = [];
      autoHeight.componentDependencies = [];
      const sampleText = exported.layout.dsl.children.find((widget) =>
        widget.widgetId === "engine-title");
      const sampleContainer = exported.layout.dsl.children.find((widget) =>
        widget.widgetId === "engine-speed-card");
      const fixtureText = (id, name, parentId, bounds, text, automatic = false) => ({
        ...JSON.parse(JSON.stringify(sampleText)),
        widgetId: id, widgetName: name, parentId,
        topRow: bounds.top, bottomRow: bounds.bottom,
        leftColumn: bounds.left, rightColumn: bounds.right,
        text, dynamicBindingPathList: [],
        ...(automatic ? { dynamicHeight: "AUTO_HEIGHT", minDynamicHeight: 4,
          maxDynamicHeight: 9000 } : { dynamicHeight: "FIXED" }),
      });
      const autoRootId = autoHeight.layout.dsl.widgetId;
      const autoContainer = JSON.parse(JSON.stringify(sampleContainer));
      Object.assign(autoContainer, { widgetId: "auto-height-container", widgetName: "AutoHeightContainer",
        parentId: autoRootId, topRow: 40, bottomRow: 56,
        leftColumn: 33, rightColumn: 60, dynamicHeight: "AUTO_HEIGHT",
        minDynamicHeight: 10, maxDynamicHeight: 9000, shouldScrollContents: true });
      const autoInnerCanvas = autoContainer.children[0];
      Object.assign(autoInnerCanvas, { widgetId: "auto-height-inner-canvas",
        widgetName: "AutoHeightContainerCanvas", parentId: autoContainer.widgetId,
        topRow: 0, bottomRow: 16 });
      autoInnerCanvas.children = [
        fixtureText("auto-height-child", "AutoHeightChild", autoInnerCanvas.widgetId,
          { top: 2, bottom: 8, left: 2, right: 30 }, "Child", true),
        fixtureText("auto-height-inner-lower", "AutoHeightInnerLower", autoInnerCanvas.widgetId,
          { top: 10, bottom: 14, left: 2, right: 30 }, "Inner lower"),
      ];
      autoHeight.layout.dsl.children = [
        fixtureText("auto-height-root", "AutoHeightRoot", autoRootId,
          { top: 10, bottom: 16, left: 2, right: 28 }, "Root", true),
        fixtureText("auto-height-root-lower", "AutoHeightRootLower", autoRootId,
          { top: 18, bottom: 24, left: 2, right: 28 }, "Root lower"),
        autoContainer,
        fixtureText("auto-height-container-lower", "AutoHeightContainerLower", autoRootId,
          { top: 58, bottom: 64, left: 33, right: 60 }, "Below container"),
      ];
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("operator-display-drafts", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      await new Promise((resolve, reject) => {
        const transaction = database.transaction("drafts", "readwrite");
        for (const entry of [exported, populated, resolved, unresolved,
          scrollingSelection, clipboardTarget, containerGate, autoHeight, media]) {
          transaction.objectStore("drafts").put({
            key: JSON.stringify([deploymentId, accountId, entry.documentId]),
            deploymentId,
            accountId,
            documentId: entry.documentId,
            revision: 1,
            savedAt: new Date().toISOString(),
            document: entry,
            history: [],
          });
        }
        transaction.oncomplete = () => resolve(undefined);
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
      return {
        populated: populated.documentId,
        resolved: resolved.documentId,
        unresolved: unresolved.documentId,
        scrollingSelection: scrollingSelection.documentId,
        clipboardTarget: clipboardTarget.documentId,
        containerGate: containerGate.documentId,
        autoHeight: autoHeight.documentId,
        media: media.documentId,
      };
    }, { exported: dashboard, media: mediaDashboard });

    if (process.env.VERIFY_FIXED_ARENA_ONLY === "1") {
      // Appsmith's delayed reflow callback updates the active canvas bitmap
      // and the rectangles committed by mouseup without another mousemove.
      await page.goto(`http://127.0.0.1:${port}/workbench?draftId=${draftIds.containerGate}`);
      await page.getByText("Local draft · revision 1").waitFor();
      const moving = page.locator('[data-widget-id="engine-title"]');
      const container = page.locator('[data-widget-id="engine-speed-card"]');
      const rootCanvas = page.locator('.od-workbench__artboard [data-widget-id="0"]');
      const [movingBox, containerBox, rootBox] = await Promise.all([
        moving.boundingBox(), container.boundingBox(), rootCanvas.boundingBox(),
      ]);
      assert.ok(movingBox && containerBox && rootBox);
      const column = (rootBox.width - 12) / 64;
      const x = movingBox.x + 20;
      const y = movingBox.y + 20;
      const endX = x + 19 * column;
      assert.ok(endX < containerBox.x - 20);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(endX, y, { steps: 10 });
      const rootPreview = page.getByTestId("canvas-dragging-0");
      await expect(rootPreview).toHaveAttribute("data-drag-preview-valid", "false");
      await expect(rootPreview).toHaveAttribute("data-drag-preview-valid", "true",
        { timeout: 2500 });
      assert.ok(await dragPreviewBlueBounds(page, "0"),
        "delayed valid preview must repaint the per-canvas bitmap at rest");
      await page.mouse.up();
      await expect.poll(async () => (await moving.boundingBox())?.x ?? 0)
        .toBeGreaterThan(movingBox.x + 10 * column);
      await page.getByRole("button", { name: "Save draft" }).click();
      await page.getByText("Local draft · revision 2").waitFor();
      const delayedDraft = await readLocalDraft(page, draftIds.containerGate);
      const delayedWidget = delayedDraft.document.layout.dsl.children.find((item) =>
        item.widgetId === "engine-title");
      assert.ok(delayedWidget.leftColumn >= 18,
        `stationary delayed preview must commit its final block: ${JSON.stringify(delayedWidget)}`);

      // useCanvasDragging replays the last slider offset after its nearest
      // canvas scrolls. The rendered and committed rows must advance together.
      await page.goto(`http://127.0.0.1:${port}/workbench?draftId=${draftIds.scrollingSelection}`);
      await page.getByText("Local draft · revision 1").waitFor();
      await page.getByRole("button", { name: "Widgets", exact: true }).click();
      const card = page.getByRole("button", { name: "Add Text widget" });
      const scroller = page.getByTestId("native-container-engine-speed-card");
      const nestedCanvas = page.locator('[data-widget-id="engine-speed-card-canvas"]');
      const [cardBox, scrollerBox] = await Promise.all([
        card.boundingBox(), scroller.boundingBox(),
      ]);
      assert.ok(cardBox && scrollerBox);
      await page.mouse.move(cardBox.x + cardBox.width / 2,
        cardBox.y + cardBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(scrollerBox.x + 90, scrollerBox.y + 70,
        { steps: 12 });
      const nestedPreview = page.getByTestId("canvas-dragging-engine-speed-card-canvas");
      await expect(nestedPreview).toHaveAttribute("data-drag-preview-valid", "true");
      const beforePaint = await dragPreviewBlueBounds(page, "engine-speed-card-canvas");
      const beforeCanvasBox = await nestedCanvas.boundingBox();
      assert.ok(beforePaint && beforeCanvasBox);
      const beforeRow = Math.round((beforePaint.y - beforeCanvasBox.y - 6) / 10);
      await scroller.evaluate((element) => { element.scrollTop = 60; });
      await expect.poll(() => scroller.evaluate((element) => element.scrollTop))
        .toBeGreaterThanOrEqual(60);
      await expect(nestedPreview).toHaveAttribute("data-drag-preview-valid", "true");
      const afterPaint = await dragPreviewBlueBounds(page, "engine-speed-card-canvas");
      const afterCanvasBox = await nestedCanvas.boundingBox();
      assert.ok(afterPaint && afterCanvasBox,
        "nested scroll replay must retain the active block paint");
      const afterRow = Math.round((afterPaint.y - afterCanvasBox.y - 6) / 10);
      assert.ok(afterRow >= beforeRow + 5,
        `nested scroll replay must advance rows under a still pointer: ${beforeRow} -> ${afterRow}`);
      await page.mouse.up();
      await page.getByRole("button", { name: "Save draft" }).click();
      await page.getByText("Local draft · revision 2").waitFor();
      const scrolledDraft = await readLocalDraft(page, draftIds.scrollingSelection);
      const nestedChildren = scrolledDraft.document.layout.dsl.children.find((item) =>
        item.widgetId === "engine-speed-card").children[0].children;
      const added = nestedChildren.find((item) => item.widgetName.startsWith("Text"));
      assert.ok(added, "nested palette drag must commit in the active canvas");
      assert.ok(Math.abs(added.topRow - afterRow) <= 1,
        `nested scroll commit must match painted row ${afterRow}: ${added.topRow}`);
      assert.deepEqual(pageErrors, []);
      console.log("Focused Fixed arena delayed-hover and nested-scroll Chrome probes passed");
      return;
    }

    // Appsmith's nested CanvasSelectionArena scrolls its nearest canvas
    // scroller while a marquee is held at the lower edge. A child originally
    // below the visible Container should then enter the selected area.
    await page.goto(`http://127.0.0.1:${port}/workbench?draftId=${draftIds.scrollingSelection}`);
    await page.getByText("Local draft · revision 1").waitFor();
    const nestedSelectionScroller = page.getByTestId("native-container-engine-speed-card");
    const nestedSelectionCanvas = page.locator('[data-widget-id="engine-speed-card-canvas"]');
    const deepSelectionTarget = page.locator('[data-widget-id="engine-deep-selection-target"]');
    await deepSelectionTarget.waitFor();
    const [scrollerBefore, canvasBefore, deepBefore] = await Promise.all([
      nestedSelectionScroller.boundingBox(), nestedSelectionCanvas.boundingBox(),
      deepSelectionTarget.boundingBox(),
    ]);
    assert.ok(scrollerBefore && canvasBefore && deepBefore);
    assert.ok(deepBefore.y >= scrollerBefore.y + scrollerBefore.height,
      "deep child must begin below the Container viewport");
    assert.ok(await nestedSelectionScroller.evaluate((element) =>
      element.scrollHeight > element.clientHeight + 200),
    "the nested Container must be scrollable");
    await page.keyboard.down("Control");
    await page.mouse.move(canvasBefore.x + 6, canvasBefore.y + 6);
    await page.mouse.down();
    await page.mouse.move(canvasBefore.x + 260,
      scrollerBefore.y + scrollerBefore.height - 8, { steps: 12 });
    const nestedMarquee = page.getByTestId("canvas-selection-engine-speed-card-canvas");
    await expect(nestedMarquee).toBeVisible();
    await expect.poll(() => nestedSelectionScroller.evaluate((element) =>
      element.scrollTop), { timeout: 10000 }).toBeGreaterThan(420);
    const nestedPaint = await nestedMarquee.evaluate((canvas) => {
      const frame = canvas.getBoundingClientRect();
      const canvasFrame = document.querySelector('[data-widget-id="engine-speed-card-canvas"]')
        .getBoundingClientRect();
      const scrollFrame = document.querySelector('[data-testid="native-container-engine-speed-card"]')
        .getBoundingClientRect();
      return { width: canvas.width, height: canvas.height,
        x: frame.x, y: frame.y,
        canvasX: canvasFrame.x, canvasY: canvasFrame.y,
        scrollWidth: scrollFrame.width, scrollHeight: scrollFrame.height,
        localLeft: Number.parseFloat(canvas.style.left) || 0,
        localTop: Number.parseFloat(canvas.style.top) || 0,
        scale: window.devicePixelRatio || 1 };
    });
    assert.ok(nestedPaint.width <= nestedPaint.scrollWidth * nestedPaint.scale + 2 &&
      nestedPaint.height <= nestedPaint.scrollHeight * nestedPaint.scale + 2,
    `nested marquee bitmap must clip to its own scroll viewport: ${JSON.stringify(nestedPaint)}`);
    assert.ok(Math.abs(nestedPaint.x - nestedPaint.canvasX - nestedPaint.localLeft) <= 2 &&
      Math.abs(nestedPaint.y - nestedPaint.canvasY - nestedPaint.localTop) <= 2,
    `nested marquee must track the scrolled canvas: ${JSON.stringify(nestedPaint)}`);
    const nestedSampleY = nestedPaint.localTop + 40;
    const nestedFill = await selectionCanvasPixel(page,
      "engine-speed-card-canvas", 120, nestedSampleY);
    assert.ok(Math.abs(nestedFill[0] - 84) <= 8 &&
      Math.abs(nestedFill[1] - 132) <= 8 &&
      Math.abs(nestedFill[2] - 236) <= 8 &&
      nestedFill[3] >= 10 && nestedFill[3] <= 30,
    `nested marquee paint must stay aligned after scroll: ${JSON.stringify(nestedFill)}`);
    await page.mouse.up();
    await page.keyboard.up("Control");
    await expect(page.locator(".t-multi-widget-button-engine-deep-selection-target"))
      .toBeVisible();

    // Appsmith's copied-widget entry survives leaving the editor. Our Fixed
    // clipboard is scoped to deployment/account in IndexedDB, so a new store
    // on a different draft must be able to paste the copied DSL and metadata.
    await page.goto(`http://127.0.0.1:${port}/workbench?draftId=${dashboard.documentId}`);
    await page.getByText("Local draft · revision 1").waitFor();
    await page.getByRole("button", { name: "Select EngineSpeedCard", exact: true })
      .click({ position: { x: 10, y: 10 } });
    await page.getByRole("button", { name: "Select EngineSpeedChart" })
      .click({ modifiers: ["Control"] });
    const copiedSelection = page.getByTestId("t--selection-box");
    await expect(copiedSelection).toBeVisible();
    await copiedSelection.getByRole("button", { name: "Copy selected widgets" }).click();
    await expect.poll(async () => (await readStoredWidgetClipboard(page))?.clipboard?.widgets?.length)
      .toBe(2);
    const storedCopy = await readStoredWidgetClipboard(page);
    assert.equal(storedCopy.deploymentId, `${new URL(page.url()).origin}/operator_display`);
    assert.equal(storedCopy.accountId, "1");
    assert.equal(storedCopy.clipboard.sourceDocumentId, dashboard.documentId);
    assert.deepEqual(storedCopy.clipboard.widgets.map((widget) => widget.widgetId),
      ["engine-speed-card", "engine-speed-chart"]);
    assert.equal(storedCopy.clipboard.variables.length, 1);
    assert.equal(storedCopy.clipboard.bindings.length, 2);

    await page.goto(`http://127.0.0.1:${port}/workbench?draftId=${draftIds.clipboardTarget}`);
    await page.getByText("Local draft · revision 1").waitFor();
    await page.reload(); // destroy every in-memory editor/store context
    await page.getByText("Local draft · revision 1").waitFor();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+v");
    const pastedCard = page.locator('[data-widget-name="EngineSpeedCard"]');
    const pastedChart = page.locator('[data-widget-name="EngineSpeedChart"]');
    await expect(pastedCard).toHaveCount(1);
    await expect(pastedChart).toHaveCount(1);
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 2").waitFor();
    const pastedDraft = await readLocalDraft(page, draftIds.clipboardTarget);
    const pastedDocument = pastedDraft.document;
    const pastedCardDsl = pastedDocument.layout.dsl.children.find((widget) =>
      widget.widgetName === "EngineSpeedCard");
    const pastedChartDsl = pastedDocument.layout.dsl.children.find((widget) =>
      widget.widgetName === "EngineSpeedChart");
    assert.ok(pastedCardDsl && pastedChartDsl);
    assert.notEqual(pastedCardDsl.widgetId, "engine-speed-card");
    assert.notEqual(pastedChartDsl.widgetId, "engine-speed-chart");
    assert.deepEqual(pastedDocument.variables, dashboard.variables,
      "cross-draft paste must import the bound Cyflex variable definition");
    assert.equal(pastedDocument.bindings.length, 2);
    const pastedTreeIds = new Set();
    const visitPasted = (widget) => {
      pastedTreeIds.add(widget.widgetId);
      widget.children?.forEach(visitPasted);
    };
    visitPasted(pastedCardDsl);
    visitPasted(pastedChartDsl);
    for (const sourceBinding of dashboard.bindings) {
      const remapped = pastedDocument.bindings.find((binding) =>
        binding.target.propertyPath === sourceBinding.target.propertyPath);
      assert.ok(remapped, `missing copied binding ${sourceBinding.id}`);
      assert.notEqual(remapped.id, sourceBinding.id);
      assert.notEqual(remapped.target.widgetId, sourceBinding.target.widgetId);
      assert.ok(pastedTreeIds.has(remapped.target.widgetId));
      assert.equal(remapped.variableKey, sourceBinding.variableKey);
    }
    assert.equal((await readLocalDraft(page, dashboard.documentId)).revision, 1,
      "copy and cross-draft paste must leave the source draft unchanged");
    if (process.argv.includes("--clipboard-only")) {
      assert.deepEqual(pageErrors, []);
      console.log("Clipboard browser flow passed: account-scoped IndexedDB copy, cross-draft reload/paste, fresh widget and binding IDs, Cyflex variable and binding preservation");
      return;
    }

    await page.goto(`http://127.0.0.1:${port}/workbench?draftId=${dashboard.documentId}`);
    await page.getByText("Local draft · revision 1").waitFor();
    if (process.env.BROWSER_SCREENSHOT_DIR) {
      await page.screenshot({
        path: path.join(process.env.BROWSER_SCREENSHOT_DIR, "workbench.png"),
        fullPage: true,
      });
    }

    await page.goto(`http://127.0.0.1:${port}/workbench?draftId=${draftIds.populated}`);
    await page.getByTestId("native-basic-chart").locator("svg").waitFor();
    await page.getByText("No chart data to display").waitFor({ state: "detached" });
    if (process.env.BROWSER_SCREENSHOT_DIR) {
      await page.screenshot({
        path: path.join(process.env.BROWSER_SCREENSHOT_DIR, "workbench-populated.png"),
        fullPage: true,
      });
    }

    await page.goto(`http://127.0.0.1:${port}/workbench?draftId=${draftIds.resolved}`);
    await page.getByTestId("native-text-engine-speed-value")
      .getByText("Speed: Engine overview rpm").waitFor();
    await page.locator('[data-widget-id="engine-bound-chart"] [data-testid="native-basic-chart"] svg').waitFor();
    assert.equal(await page.locator('[data-widget-id="engine-bound-chart"]')
      .getByText("Dynamic chart data unavailable in read-only preview").count(), 0);

    await page.goto(`http://127.0.0.1:${port}/workbench?draftId=${draftIds.unresolved}`);
    await page.getByTestId("native-text-engine-speed-value")
      .getByText("Dynamic text unavailable in read-only preview").waitFor();
    await page.locator('[data-widget-id="engine-speed-chart"]')
      .getByText("Dynamic chart data unavailable in read-only preview").waitFor();
    assert.equal(await page.getByText("{{MissingWidget.text}}").count(), 0);
    assert.equal(await page.getByText("{{MissingWidget.data}}").count(), 0);
    await page.getByRole("button", { name: "Select EngineSpeedValue" }).click();
    const missingReferenceBadge = page.locator(
      '[data-editing-widget-id="engine-speed-value"] .t--widget-propertypane-toggle',
    );
    await expect(missingReferenceBadge).toHaveAttribute("data-error-count", "1");
    await expect(missingReferenceBadge.locator("svg")).toHaveCount(1);
    await page.goto(`http://127.0.0.1:${port}/workbench?draftId=${draftIds.media}`);
    await page.locator('[data-widget-id="reference-image"] img[data-testid="native-image"]').waitFor();
    assert.equal(await page.locator('[data-widget-id="reference-image"] img').getAttribute("alt"), "ReferenceImage");
    assert.match(await page.locator('[data-widget-id="reference-image"] img').getAttribute("src"), /^data:image\/svg\+xml,/);
    await page.locator('[data-widget-id="reference-image"] img').evaluate((image) => image.decode());
    assert.equal(await page.locator('[data-widget-id="reference-image"] img').evaluate((image) =>
      getComputedStyle(image).objectFit), "contain");
    await page.locator('[data-widget-id="bound-image"] img[data-testid="native-image"]').waitFor();
    assert.equal(await page.locator('[data-widget-id="bound-image"] img').getAttribute("alt"), "BoundImage");
    assert.match(await page.locator('[data-widget-id="bound-image"] img').getAttribute("src"), /^data:image\/svg\+xml,/);
    await page.locator('[data-widget-id="bound-image"] img').evaluate((image) => image.decode());
    assert.equal(await page.locator('[data-widget-id="bound-image"] img').evaluate((image) =>
      getComputedStyle(image).objectFit), "cover");
    await page.locator('[data-widget-id="unresolved-image"]')
      .getByText("Dynamic image unavailable in read-only preview").waitFor();
    assert.equal(await page.locator('[data-widget-id="unresolved-image"] img').count(), 0);
    await page.locator('[data-widget-id="fallback-unresolved-image"] img[data-testid="native-image"]').waitFor();
    await page.locator('[data-widget-id="horizontal-divider"] [data-testid="native-divider"][data-orientation="horizontal"]').waitFor();
    await page.locator('[data-widget-id="vertical-divider"] [data-testid="native-divider"][data-orientation="vertical"]').waitFor();
    const horizontalStroke = await page.locator('[data-widget-id="horizontal-divider"] [data-testid="divider-horizontal-line"]')
      .evaluate((line) => ({
        style: getComputedStyle(line).borderTopStyle,
        width: getComputedStyle(line).borderTopWidth,
        color: getComputedStyle(line).borderTopColor,
      }));
    assert.deepEqual(horizontalStroke, { style: "dashed", width: "3px", color: "rgb(176, 74, 102)" });
    const verticalStroke = await page.locator('[data-widget-id="vertical-divider"] [data-testid="divider-vertical-line"]')
      .evaluate((line) => ({
        style: getComputedStyle(line).borderRightStyle,
        width: getComputedStyle(line).borderRightWidth,
        color: getComputedStyle(line).borderRightColor,
      }));
    assert.deepEqual(verticalStroke, { style: "dotted", width: "4px", color: "rgb(33, 107, 83)" });
    await page.getByTestId("native-progress-static-progress").waitFor();
    await page.getByTestId("native-progress-bound-progress").waitFor();
    assert.equal(await page.getByTestId("native-progress-static-progress").getAttribute("aria-valuenow"), "67");
    assert.equal(await page.getByTestId("native-progress-static-progress").getAttribute("data-progress-type"), "linear");
    assert.equal(await page.getByTestId("native-progress-bound-progress").getAttribute("aria-valuenow"), "67");
    assert.equal(await page.getByTestId("native-progress-bound-progress").getAttribute("data-progress-type"), "circular");
    await page.locator('[data-widget-id="unresolved-progress"]')
      .getByText("Dynamic progress unavailable in read-only preview").waitFor();
    await page.locator('[data-widget-id="unresolved-divider"]')
      .getByText("Dynamic divider unavailable in read-only preview").waitFor();
    assert.equal(await page.locator('[data-widget-id="unresolved-progress"] [role="progressbar"]').count(), 0);
    await page.getByTestId("native-progress-indeterminate-progress").waitFor();
    assert.equal(await page.getByTestId("native-progress-indeterminate-progress").getAttribute("aria-valuenow"), null);
    await page.getByTestId("native-container-statbox-engine-speed-card")
      .getByText("Active cells").waitFor();
    const hiddenEditorWidget = page.locator('[data-widget-id="image-url-source"]');
    await expect(hiddenEditorWidget).toBeVisible();
    await expect(hiddenEditorWidget).toHaveClass(/od-read-only-canvas__widget--invisible/);
    assert.equal(await hiddenEditorWidget.locator(".od-read-only-canvas__visibility > *").first().evaluate((element) =>
      getComputedStyle(element).opacity), "0.6",
    "Appsmith Fixed keeps hidden widgets editable at 60% opacity");
    await hiddenEditorWidget.focus();
    await expect(hiddenEditorWidget.locator("#widget_name_image-url-source")).toHaveCount(1);
    const hiddenChromeOpacity = await hiddenEditorWidget.evaluate((element) => ({
      wrapper: getComputedStyle(element.querySelector(".resize-wrapper")).opacity,
      name: getComputedStyle(element.querySelector("#widget_name_image-url-source")).opacity,
      handle: getComputedStyle(element.querySelector("[data-resize-handle]")).opacity,
    }));
    assert.deepEqual(hiddenChromeOpacity, { wrapper: "1", name: "1", handle: "1" },
      "Appsmith dims hidden widget content inside VisibilityContainer, leaving editor chrome clear");
    assert.equal(await page.getByText(/renderer for (IMAGE|DIVIDER|PROGRESS)_WIDGET is not yet available/).count(), 0);
    if (process.env.BROWSER_SCREENSHOT_DIR) {
      await page.screenshot({
        path: path.join(process.env.BROWSER_SCREENSHOT_DIR, "workbench-media.png"),
        fullPage: true,
      });
    }
    const draftCountBeforeViewer = await countLocalDrafts(page);

    await page.goto(`http://127.0.0.1:${port}/viewer/items/7`);
    await page.getByRole("region", { name: "Dashboard viewer" }).waitFor();
    await page.getByRole("heading", { level: 1, name: "Engine overview" }).waitFor();
    await page.getByTestId("native-text-engine-title").waitFor();
    await page.getByTestId("native-container-engine-speed-card").waitFor();
    await page.getByText("No chart data to display").waitFor();
    await page.locator('[data-widget-id="reference-image"] img[data-testid="native-image"]').waitFor();
    await page.locator('[data-widget-id="bound-image"] img[data-testid="native-image"]').waitFor();
    await page.locator('[data-widget-id="unresolved-image"]')
      .getByText("Dynamic image unavailable in read-only preview").waitFor();
    await page.locator('[data-widget-id="fallback-unresolved-image"] img[data-testid="native-image"]').waitFor();
    await page.locator('[data-widget-id="horizontal-divider"] [data-testid="native-divider"][data-orientation="horizontal"]').waitFor();
    await page.locator('[data-widget-id="vertical-divider"] [data-testid="native-divider"][data-orientation="vertical"]').waitFor();
    await page.getByTestId("native-progress-static-progress").waitFor();
    await page.getByTestId("native-progress-bound-progress").waitFor();
    assert.equal(await page.getByTestId("native-progress-static-progress").getAttribute("aria-valuenow"), "67");
    assert.equal(await page.getByTestId("native-progress-static-progress").getAttribute("data-progress-type"), "linear");
    assert.equal(await page.getByTestId("native-progress-bound-progress").getAttribute("aria-valuenow"), "67");
    assert.equal(await page.getByTestId("native-progress-bound-progress").getAttribute("data-progress-type"), "circular");
    await page.locator('[data-widget-id="unresolved-progress"]')
      .getByText("Dynamic progress unavailable in read-only preview").waitFor();
    await page.locator('[data-widget-id="unresolved-divider"]')
      .getByText("Dynamic divider unavailable in read-only preview").waitFor();
    await page.getByTestId("native-progress-indeterminate-progress").waitFor();
    assert.equal(await page.getByTestId("native-progress-indeterminate-progress").getAttribute("aria-valuenow"), null);
    await page.getByTestId("native-container-statbox-engine-speed-card")
      .getByText("Active cells").waitFor();
    await expect(page.locator('[data-widget-id="image-url-source"]')).toHaveCount(0);
    assert.equal(await page.getByText(/renderer for (IMAGE|DIVIDER|PROGRESS)_WIDGET is not yet available/).count(), 0);
    assert.ok(dashboardDownloads.includes(7));
    assert.ok(dashboardContentReads.includes(7));
    assert.equal(await page.getByRole("button", { name: "Export JSON" }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Preview sample values" }).count(), 0);
    assert.equal(await page.getByLabel("Widget name").count(), 0);
    await page.getByRole("link", { name: "Back to dashboards" }).waitFor();
    if (process.env.BROWSER_SCREENSHOT_DIR) {
      await page.screenshot({
        path: path.join(process.env.BROWSER_SCREENSHOT_DIR, "viewer.png"),
        fullPage: true,
      });
    }

    await page.goto(`http://127.0.0.1:${port}/marketplace/items/7`);
    await page.getByRole("heading", { level: 1, name: "Engine overview" }).waitFor();
    await page.getByRole("link", { name: "View dashboard" }).click();
    await page.getByRole("region", { name: "Dashboard viewer" }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/viewer/items/7");

    await page.getByRole("link", { name: "Back to dashboards" }).click();
    await page.getByRole("heading", { level: 1, name: "Dashboards" }).waitFor();
    await page.getByRole("region", { name: "Marketplace dashboards" })
      .getByRole("button", { name: "Open Engine overview" }).click();
    await page.getByRole("region", { name: "Dashboard viewer" }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/viewer/items/7");

    await page.setViewportSize({ width: 375, height: 800 });
    const viewerWidth = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      canvasScrollWidth: document.querySelector(".published-viewer__workspace")?.scrollWidth,
      canvasClientWidth: document.querySelector(".published-viewer__workspace")?.clientWidth,
    }));
    assert.ok(viewerWidth.document <= viewerWidth.viewport + 1, JSON.stringify(viewerWidth));
    assert.ok(viewerWidth.canvasScrollWidth > viewerWidth.canvasClientWidth, JSON.stringify(viewerWidth));

    await page.goto(`http://127.0.0.1:${port}/viewer/items/999`);
    await page.getByRole("alert").waitFor();
    assert.match(await page.getByRole("alert").innerText(), /HTTP 404/);
    assert.equal(await page.getByTestId("native-text-engine-title").count(), 0);
    assert.ok(dashboardDownloads.includes(999));
    assert.equal(dashboardContentReads.includes(999), false);

    await page.goto(`http://127.0.0.1:${port}/viewer/items/10`);
    await page.getByRole("alert").waitFor();
    assert.match(await page.getByRole("alert").innerText(), /\$\.name: expected a nonempty string/);
    assert.equal(await page.getByTestId("native-text-engine-title").count(), 0);
    assert.ok(dashboardDownloads.includes(10));
    assert.ok(dashboardContentReads.includes(10));
    assert.equal(await countLocalDrafts(page), draftCountBeforeViewer);

    await page.goto(`http://127.0.0.1:${port}/workbench?draftId=${draftIds.unresolved}`);
    await page.getByTestId("native-text-engine-speed-value").waitFor();
    await page.setViewportSize({ width: 375, height: 800 });
    const width = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));

    assert.ok(width.document <= width.viewport + 1, JSON.stringify(width));

    // Editing is confined to the local draft and survives a full page reload.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`http://127.0.0.1:${port}/workbench?draftId=${dashboard.documentId}`);
    await page.getByText("Local draft · revision 1").waitFor();
    await page.getByTestId("native-text-engine-title").waitFor();
    const titleWidget = page.locator('.od-workbench__artboard [data-widget-id="engine-title"]');
    await titleWidget.click();
    await expect(page.getByLabel("Widget name")).toHaveValue("EngineTitle");
    const widthArtboard = page.locator(".od-workbench__artboard");
    await widthArtboard.click({ position: { x: 2, y: 500 } });
    await expect(page.getByText("Canvas size", { exact: true })).toBeVisible();
    const canvasWidths = () => page.evaluate(() => {
      const measure = (selector) => document.querySelector(selector)
        ?.getBoundingClientRect().width ?? 0;
      return {
        artboard: measure(".od-workbench__artboard"),
        root: measure('.od-workbench__artboard [data-widget-id="0"]'),
        editor: measure(".od-editable-canvas"),
      };
    });
    await page.locator('.t--layout-control-wrapper [data-value="MOBILE"]').click();
    await expect.poll(async () => {
      const widths = await canvasWidths();
      return Object.values(widths).every((width) => width >= 350 && width <= 450) &&
        Math.max(...Object.values(widths)) - Math.min(...Object.values(widths)) <= 1;
    }).toBe(true);
    const mobileExportPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export JSON" }).click();
    const mobileExport = await mobileExportPromise;
    const mobileDocument = JSON.parse(fs.readFileSync(await mobileExport.path(), "utf8"));
    assert.equal(mobileDocument.layout.dsl.rightColumn, dashboard.layout.dsl.rightColumn,
      "changing canvas width must not rewrite the authored root DSL columns");
    await page.locator('.t--layout-control-wrapper [data-value="FLUID"]').click();
    await expect.poll(async () => (await canvasWidths()).artboard).toBeGreaterThan(450);
    const fluidWidthBeforeResize = (await canvasWidths()).artboard;
    await page.setViewportSize({ width: 1180, height: 900 });
    await expect.poll(async () => (await canvasWidths()).artboard)
      .toBeLessThan(fluidWidthBeforeResize - 100);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(async () => Math.abs((await canvasWidths()).artboard -
      fluidWidthBeforeResize)).toBeLessThan(2);
    await expect(titleWidget).toHaveAttribute("data-tab-order", "3");
    await expect(titleWidget.getByTestId("t--tab-order-badge")).toHaveCount(0);
    await page.keyboard.press("Alt+t");
    await expect(titleWidget.getByTestId("t--tab-order-badge")).toHaveText("3");
    await page.keyboard.press("Alt+t");
    await expect(titleWidget.getByTestId("t--tab-order-badge")).toHaveCount(0);
    await titleWidget.focus();
    await expect(page.locator(
      '.od-editable-canvas__selection[data-editing-widget-id="engine-title"]',
    )).toBeVisible();
    // Appsmith Fixed's CanvasSelectionArena paints a blue Canvas2D marquee.
    // Its area selection includes intersecting direct children only, and the
    // sibling box uses the exact union of their Fixed grid rectangles.
    await page.locator(".od-workbench__viewport").evaluate((element) => {
      element.scrollTop = 0;
    });
    const rootSelectionCanvas = page.locator('.od-workbench__artboard [data-widget-id="0"]');
    const rootSelectionFrame = await rootSelectionCanvas.boundingBox();
    assert.ok(rootSelectionFrame, "root Fixed canvas must be measurable");
    const outsideStart = { x: rootSelectionFrame.x + 8,
      y: rootSelectionFrame.y - 12 };
    const editorViewportFrame = await page.locator(".od-workbench__viewport").boundingBox();
    assert.ok(editorViewportFrame && outsideStart.y > editorViewportFrame.y,
      "the editor must have a blank margin above the root canvas");
    await page.mouse.move(outsideStart.x, outsideStart.y);
    await page.mouse.down();
    await page.mouse.move(rootSelectionFrame.x + 650,
      rootSelectionFrame.y + 330, { steps: 10 });
    await expect(page.getByTestId("canvas-selection-0")).toBeVisible();
    await page.mouse.up();
    await expect(page.getByRole("heading", { name: "Multiple selected" })).toBeVisible();
    const selectStart = { x: rootSelectionFrame.x + 8, y: rootSelectionFrame.y + 8 };
    const selectEnd = { x: rootSelectionFrame.x + 650, y: rootSelectionFrame.y + 330 };
    await page.mouse.move(selectStart.x, selectStart.y);
    await page.mouse.down();
    await page.mouse.move(selectEnd.x, selectEnd.y, { steps: 10 });
    const marquee = page.getByTestId("canvas-selection-0");
    await expect(marquee).toBeVisible();
    const clippedSize = await marquee.evaluate((canvas) => ({
      width: canvas.width, height: canvas.height,
      devicePixelRatio: window.devicePixelRatio || 1,
    }));
    const viewportSize = await page.locator(".od-workbench__viewport").evaluate((element) => ({
      width: element.clientWidth, height: element.clientHeight,
    }));
    assert.ok(clippedSize.width <= viewportSize.width * clippedSize.devicePixelRatio + 2 &&
      clippedSize.height <= viewportSize.height * clippedSize.devicePixelRatio + 2,
    `marquee backing must clip to visible viewport: ${JSON.stringify({ clippedSize, viewportSize })}`);
    const marqueeFill = await selectionCanvasPixel(page, "0", 200, 120);
    assert.ok(Math.abs(marqueeFill[0] - 84) <= 8 &&
      Math.abs(marqueeFill[1] - 132) <= 8 &&
      Math.abs(marqueeFill[2] - 236) <= 8 &&
      marqueeFill[3] >= 10 && marqueeFill[3] <= 30,
    `Appsmith marquee fill should be translucent blue: ${JSON.stringify(marqueeFill)}`);
    const visibleTopBeforeScroll = await marquee.evaluate((canvas) =>
      Number.parseFloat(canvas.style.top) || 0);
    await page.locator(".od-workbench__viewport").evaluate((element) => {
      element.scrollTop += 80;
    });
    await expect.poll(async () => marquee.evaluate((canvas) =>
      Number.parseFloat(canvas.style.top) || 0))
      .toBeGreaterThan(visibleTopBeforeScroll + 20);
    const scrolledFill = await selectionCanvasPixel(page, "0", 200, 120);
    assert.deepEqual(scrolledFill, marqueeFill,
      "marquee fill must stay aligned with canvas coordinates as viewport scrolls");
    await page.locator(".od-workbench__viewport").evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.mouse.up();
    await expect(marquee).toHaveCount(0);
    // Scroll-driven selection can legitimately reach more widgets. Restore
    // the two intended siblings for the property-pane and action-rail checks.
    await page.locator(".t-multi-widget-property-pane .t-multi-widget-button-engine-title")
      .click();
    await page.getByRole("button", { name: "Select EngineSpeedCard", exact: true })
      .click({ modifiers: ["Control"] });
    const multiPane = page.locator(".t-multi-widget-property-pane");
    await expect(page.getByRole("heading", { name: "Multiple selected" })).toBeVisible();
    await expect(multiPane.locator("button")).toHaveCount(2);
    await expect(multiPane.locator(".t-multi-widget-button-engine-title")).toBeVisible();
    await expect(multiPane.locator(".t-multi-widget-button-engine-speed-card")).toBeVisible();
    const siblingBox = page.getByTestId("t--selection-box");
    await expect(siblingBox).toBeVisible();
    await expectBoxAround(page, siblingBox, ["engine-title", "engine-speed-card"]);
    const border = await siblingBox.locator("div").first().evaluate((element) => ({
      color: getComputedStyle(element).borderTopColor,
      style: getComputedStyle(element).borderTopStyle,
    }));
    assert.deepEqual(border, { color: "rgb(105, 181, 255)", style: "dashed" });
    for (const name of ["Copy", "Cut", "Delete", "Group"]) {
      await expect(siblingBox.getByRole("button", { name: `${name} selected widgets` }))
        .toBeVisible();
    }

    // Modifier clicks extend selection; the selection box only exists when
    // the selected widgets share a parent. The multi-pane can focus one.
    await page.getByRole("button", { name: "Select EngineSpeedChart" })
      .click({ modifiers: ["Control"] });
    await expect(multiPane.locator("button")).toHaveCount(3);
    await expectBoxAround(page, siblingBox,
      ["engine-title", "engine-speed-card", "engine-speed-chart"]);
    await multiPane.locator(".t-multi-widget-button-engine-title").click();
    await expect(siblingBox).toHaveCount(0);
    await page.getByRole("button", { name: "Select EngineSpeedLabel" })
      .click({ modifiers: ["Control"] });
    await expect(multiPane).toHaveCount(0);
    await expect(siblingBox).toHaveCount(0);
    await expect(page.getByLabel("Widget name")).toHaveValue("EngineSpeedLabel");
    await page.getByRole("button", { name: "Select EngineTitle" }).click();
    await expectAppsmithWidgetName(page, "engine-title", "below");
    await page.locator('[data-widget-id="engine-speed-chart"]').hover();
    await expectAppsmithWidgetName(page, "engine-speed-chart", "above");
    await page.getByRole("navigation", { name: "Workbench sections" })
      .getByRole("button", { name: "Widgets", exact: true }).click();
    const canvasWidgetIdsBefore = new Set(await page.locator(".od-workbench__artboard [data-widget-id]")
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-widget-id"))));
    await page.getByRole("button", { name: "Add Text widget" }).press("Enter");
    await page.getByLabel("Widget name").waitFor();
    await page.waitForFunction((beforeIds) => {
      const currentIds = new Set([...document.querySelectorAll(".od-workbench__artboard [data-widget-id]")]
        .map((element) => element.getAttribute("data-widget-id")));
      return [...currentIds].filter((id) => id && !beforeIds.includes(id)).length === 1;
    }, [...canvasWidgetIdsBefore]);
    const canvasWidgetIdsAfter = new Set(await page.locator(".od-workbench__artboard [data-widget-id]")
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-widget-id"))));
    const newWidgetIds = [...canvasWidgetIdsAfter].filter((id) => id && !canvasWidgetIdsBefore.has(id));
    assert.equal(newWidgetIds.length, 1, `expected one new widget, found ${JSON.stringify(newWidgetIds)}`);
    const newWidgetId = newWidgetIds[0];
    await expect(page.locator('[data-property-name="dynamicHeight"] select'))
      .toHaveValue("AUTO_HEIGHT");
    await expect(page.locator(`[data-widget-id="${newWidgetId}"] .auto-height-container`))
      .toHaveCount(1);

    await page.getByLabel("Widget name").fill("BrowserCheckText");
    await page.getByLabel("Widget name").blur();
    await page.getByLabel("Text", { exact: true }).fill("Editable browser check");
    await page.getByLabel("Text", { exact: true }).blur();
    // Appsmith creates Text in Auto Height. Explicit Fixed is needed for the
    // eight-direction geometry checks below (auto-height locks vertical resize).
    await page.locator('[data-property-name="dynamicHeight"] select').selectOption("FIXED");
    await page.getByRole("tab", { name: "Style" }).click();
    await page.getByLabel("Top row").fill("165");
    await page.getByLabel("Top row").blur();
    await page.getByLabel("Left column").fill("2");
    await page.getByLabel("Left column").blur();
    await expectAppsmithWidgetName(page, newWidgetId, "above");
    const initialWidth = Number(await page.getByLabel("Width", { exact: true }).inputValue());
    const initialHeight = Number(await page.getByLabel("Height").inputValue());
    assert.deepEqual(
      new Set(await page.locator(`[data-editing-widget-id="${newWidgetId}"] [data-resize-handle]`)
        .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-resize-handle")))),
      new Set(["left", "top", "right", "bottom", "topLeft", "topRight", "bottomLeft", "bottomRight"]),
      "selected widget exposes all eight resize directions",
    );
    assert.deepEqual(
      new Set(await page.locator(`[data-editing-widget-id="${newWidgetId}"] [data-testid^="t--resizable-handle-"]`)
        .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-testid")))),
      new Set(["LEFT", "TOP", "RIGHT", "BOTTOM", "undefined"]
        .map((direction) => `t--resizable-handle-${direction}`)),
      "resize controls expose Appsmith's edge directions and undirected corners",
    );
    assert.equal(await page.locator(`[data-editing-widget-id="${newWidgetId}"] [data-resize-handle]`)
      .evaluateAll((elements) => elements.every((element) =>
        element.parentElement?.id === `resize-${element.closest("[data-editing-widget-id]")?.getAttribute("data-editing-widget-id")}`)),
      true, "all Fixed resize handles are children of their animated wrapper");
    await dragHandleWithPreview(page,
      page.getByRole("button", { name: "Move BrowserCheckText" }), 78, 30,
      newWidgetId, "0");
    const rootColumnSpace = (rootSelectionFrame.width - 12) / 64;
    const expectedMovedLeftColumn = 2 + Math.round(78 / rootColumnSpace);
    const expectedResizedWidth = initialWidth + Math.round(58 / rootColumnSpace);
    await expect(page.getByLabel("Left column"))
      .toHaveValue(String(expectedMovedLeftColumn));
    // The name now shares Appsmith's positioned widget parent; its grab point
    // re-snaps one row below the authored row for this browser gesture.
    await expect(page.getByLabel("Top row")).toHaveValue("166");
    await dragHandle(page,
      page.getByRole("button", { name: "Resize BrowserCheckText from bottomRight" }), 58, 30);
    await expect(page.getByLabel("Width", { exact: true }))
      .toHaveValue(String(expectedResizedWidth));
    await expect(page.getByLabel("Height")).toHaveValue(String(initialHeight + 3));

    // Appsmith-style palette dragging must add a separate widget on the root canvas.
    await page.locator(".od-workbench__viewport").evaluate((element) => { element.scrollTop = 0; });
    const canvasWidgetIdsBeforeDrag = new Set(await page.locator(".od-workbench__artboard [data-widget-id]")
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-widget-id"))));
    const paletteText = page.getByRole("button", { name: "Add Text widget" });
    const paletteTextBox = await paletteText.boundingBox();
    const paletteArtboardBox = await page.locator(".od-workbench__artboard").boundingBox();
    assert.ok(paletteTextBox && paletteArtboardBox);
    await page.mouse.move(paletteTextBox.x + paletteTextBox.width / 2,
      paletteTextBox.y + paletteTextBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(paletteArtboardBox.x + 700, paletteArtboardBox.y + 400, { steps: 12 });
    await expectAppsmithDragPreview(page, "0");
    await page.mouse.up();
    await expect(page.locator('.drag-layer[data-drop-canvas-id="0"]')).toHaveCount(0);
    await page.waitForFunction((beforeIds) => {
      const currentIds = new Set([...document.querySelectorAll(".od-workbench__artboard [data-widget-id]")]
        .map((element) => element.getAttribute("data-widget-id")));
      return [...currentIds].filter((id) => id && !beforeIds.includes(id)).length === 1;
    }, [...canvasWidgetIdsBeforeDrag]);
    const canvasWidgetIdsAfterDrag = new Set(await page.locator(".od-workbench__artboard [data-widget-id]")
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-widget-id"))));
    const draggedWidgetIds = [...canvasWidgetIdsAfterDrag]
      .filter((id) => id && !canvasWidgetIdsBeforeDrag.has(id));
    assert.equal(draggedWidgetIds.length, 1);
    const draggedWidgetId = draggedWidgetIds[0];
    await expect.poll(async () => (await widgetGridFrame(page, draggedWidgetId)).height)
      .toBe(40);
    await page.getByRole("button", { name: "Select BrowserCheckText" }).click();
    await page.getByRole("tab", { name: "Style" }).click();
    const textTopAfterAutoSibling = Number(await page.getByLabel("Top row").inputValue());
    assert.equal(textTopAfterAutoSibling, 166,
      "Appsmith's four-row Text default is unchanged by its first 40px measurement");

    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 2").waitFor();

    const savedDraft = await readLocalDraft(page, dashboard.documentId);
    assert.equal(savedDraft?.revision, 2);
    const savedWidgets = [];
    const collectWidgets = (widget) => {
      savedWidgets.push(widget);
      widget.children?.forEach(collectWidgets);
    };
    collectWidgets(savedDraft.document.layout.dsl);
    const savedText = savedWidgets.find((widget) => widget.widgetId === newWidgetId);
    assert.ok(savedText, `new widget ${newWidgetId} was not persisted`);
    assert.equal(savedText.type, "TEXT_WIDGET");
    assert.equal(savedText.widgetName, "BrowserCheckText");
    assert.equal(savedText.text, "Editable browser check");
    assert.equal(savedText.topRow, textTopAfterAutoSibling);
    assert.equal(savedText.leftColumn, expectedMovedLeftColumn);
    assert.equal(savedText.bottomRow, textTopAfterAutoSibling + initialHeight + 3);
    assert.equal(savedText.rightColumn, expectedMovedLeftColumn + expectedResizedWidth);
    const draggedText = savedWidgets.find((widget) => widget.widgetId === draggedWidgetId);
    assert.ok(draggedText, `palette drag widget ${draggedWidgetId} was not persisted`);
    assert.equal(draggedText.type, "TEXT_WIDGET");
    assert.equal(draggedText.parentId, savedDraft.document.layout.dsl.widgetId);
    // Appsmith's new-widget grip is near the top-right of the full widget.
    // Derive its saved grid origin from the rendered Fluid/Fixed column size.
    const paletteWidgetColumns = draggedText.rightColumn - draggedText.leftColumn;
    const expectedPaletteLeft = Math.round((700 - 6 -
      paletteWidgetColumns * rootColumnSpace + 20) / rootColumnSpace);
    assert.ok(Math.abs(draggedText.leftColumn - expectedPaletteLeft) <= 1,
      `palette drop snapped to unexpected column ${draggedText.leftColumn}, expected ${expectedPaletteLeft}`);
    assert.ok(draggedText.topRow >= 37 && draggedText.topRow <= 39,
      `palette drop snapped to unexpected row ${draggedText.topRow}`);

    await page.reload();
    await page.getByText("Local draft · revision 2").waitFor();
    await page.locator(`[data-widget-id="${newWidgetId}"]`)
      .getByText("Editable browser check").waitFor();
    await page.getByRole("button", { name: "Select BrowserCheckText" }).click();
    assert.equal(await page.getByLabel("Widget name").inputValue(), "BrowserCheckText");
    assert.equal(await page.getByLabel("Text", { exact: true }).inputValue(), "Editable browser check");
    await page.getByRole("tab", { name: "Style" }).click();
    assert.equal(await page.getByLabel("Left column").inputValue(),
      String(expectedMovedLeftColumn));
    assert.equal(await page.getByLabel("Top row").inputValue(), String(textTopAfterAutoSibling));
    assert.equal(await page.getByLabel("Width", { exact: true }).inputValue(),
      String(expectedResizedWidth));
    assert.equal(await page.getByLabel("Height").inputValue(), String(initialHeight + 3));
    await page.getByRole("button", { name: "Delete widget" }).click();
    await page.locator(`[data-widget-id="${newWidgetId}"]`).waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Undo" }).click();
    await page.locator(`[data-widget-id="${newWidgetId}"]`)
      .getByText("Editable browser check").waitFor();
    await page.getByRole("button", { name: "Select BrowserCheckText" }).click();
    await page.getByRole("tab", { name: "Style" }).click();
    await dragHandle(page,
      page.getByRole("button", { name: "Resize BrowserCheckText from topLeft" }), -19, -10);
    const topLeftColumnDelta = Math.round(-19 / rootColumnSpace);
    await expect(page.getByLabel("Left column"))
      .toHaveValue(String(expectedMovedLeftColumn + topLeftColumnDelta));
    await expect(page.getByLabel("Top row")).toHaveValue(String(textTopAfterAutoSibling - 1));
    await expect(page.getByLabel("Width", { exact: true }))
      .toHaveValue(String(expectedResizedWidth - topLeftColumnDelta));
    await expect(page.getByLabel("Height")).toHaveValue(String(initialHeight + 4));
    if (process.env.BROWSER_SCREENSHOT_DIR) {
      await page.screenshot({
        path: path.join(process.env.BROWSER_SCREENSHOT_DIR, "editable-workbench.png"),
        fullPage: true,
      });
    }

    const draftsBeforeCreation = await countLocalDrafts(page);
    await page.goto(`http://127.0.0.1:${port}/workspace`);
    await page.getByRole("button", { name: "New dashboard" }).click();
    await page.waitForURL(/\/workbench\?draftId=dashboard-/);
    await page.getByText("Local draft · revision 1").waitFor();
    await page.getByTestId("native-text-dashboard-title")
      .getByText("Untitled dashboard").waitFor();
    const newDashboardId = new URL(page.url()).searchParams.get("draftId");
    assert.ok(newDashboardId?.startsWith("dashboard-"));
    assert.equal(await countLocalDrafts(page), draftsBeforeCreation + 1);
    const newDashboardDraft = await readLocalDraft(page, newDashboardId);
    assert.equal(newDashboardDraft?.document.name, "Untitled dashboard");
    assert.deepEqual(newDashboardDraft.document.variables, []);
    assert.deepEqual(newDashboardDraft.document.bindings, []);
    await page.getByRole("button", { name: "Dashboard tools" }).click();
    await page.getByLabel("Dashboard name").fill("Night shift dashboard");
    await page.getByLabel("Dashboard name").blur();
    await page.getByText("Night shift dashboard", { exact: true }).first().waitFor();
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 2").waitFor();
    await page.reload();
    await page.getByText("Local draft · revision 2").waitFor();
    await page.getByText("Night shift dashboard", { exact: true }).first().waitFor();
    await page.getByTestId("native-text-dashboard-title")
      .getByText("Night shift dashboard").waitFor();
    await page.getByRole("button", { name: "Dashboard tools" }).click();
    assert.equal(await page.getByLabel("Dashboard name").inputValue(), "Night shift dashboard");
    const renamedDashboardDraft = await readLocalDraft(page, newDashboardId);
    assert.equal(renamedDashboardDraft?.revision, 2);
    assert.equal(renamedDashboardDraft.document.name, "Night shift dashboard");
    assert.equal(renamedDashboardDraft.document.layout.dsl.children.find((widget) =>
      widget.widgetId === "dashboard-title")?.text, "Night shift dashboard");

    // A palette drop inside a container must target its child canvas.
    await page.getByRole("button", { name: "Widgets", exact: true }).click();
    await page.getByRole("button", { name: "Add Container widget" }).press("Enter");
    const createdContainer = page.locator(
      ".od-workbench__artboard .od-read-only-canvas__widget--container-widget",
    );
    await createdContainer.waitFor();
    const containerId = await createdContainer.getAttribute("data-widget-id");
    assert.ok(containerId?.startsWith("widget-"));
    await expect(page.locator('[data-property-name="dynamicHeight"] select'))
      .toHaveValue("AUTO_HEIGHT");
    const innerCanvasId = `${containerId}-canvas`;
    const innerCanvas = page.locator(`[data-widget-id="${innerCanvasId}"]`);
    await innerCanvas.waitFor();
    const beforeNestedDrop = new Set(await page.locator(".od-workbench__artboard [data-widget-id]")
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-widget-id"))));
    await dragPaletteTo(page, page.getByRole("button", { name: "Add Text widget" }),
      innerCanvas, { x: 40, y: 60,
        onHover: () => expectAppsmithDragPreview(page, innerCanvasId) });
    await page.waitForFunction((beforeIds) => {
      const currentIds = new Set([...document.querySelectorAll(".od-workbench__artboard [data-widget-id]")]
        .map((element) => element.getAttribute("data-widget-id")));
      return [...currentIds].filter((id) => id && !beforeIds.includes(id)).length === 1;
    }, [...beforeNestedDrop]);
    const afterNestedDrop = new Set(await page.locator(".od-workbench__artboard [data-widget-id]")
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-widget-id"))));
    const nestedIds = [...afterNestedDrop].filter((id) => id && !beforeNestedDrop.has(id));
    assert.equal(nestedIds.length, 1);
    const nestedTextId = nestedIds[0];
    const nestedText = innerCanvas.locator(`[data-widget-id="${nestedTextId}"]`);
    await nestedText.waitFor();
    const nestedTextName = await nestedText.getAttribute("data-widget-name");
    assert.ok(nestedTextName?.startsWith("Text"));
    await expect(page.getByLabel("Widget name")).toHaveValue(nestedTextName);
    await expect(page.locator('[data-property-name="dynamicHeight"] select'))
      .toHaveValue("AUTO_HEIGHT");
    await page.locator('[data-property-name="dynamicHeight"] select').selectOption("FIXED");
    await page.getByRole("tab", { name: "Style" }).click();
    await expect(page.getByLabel("Left column")).toHaveValue("0");
    // Appsmith's nested Fixed canvas reserves its 6px container grid padding;
    // a palette pointer at outer y=60 with a 20px grab offset snaps to row 3.
    await expect(page.getByLabel("Top row")).toHaveValue("3");
    // Appsmith getSnappedGrid gives nested canvases 64 columns after 20px
    // total padding, so 39px spans more columns than on the root canvas.
    const nestedColumnSpace = await innerCanvas.evaluate((element) =>
      (element.getBoundingClientRect().width - 20) / 64);
    const nestedHorizontalDelta = Math.round(39 / nestedColumnSpace);
    const nestedInitialWidth = Number(await page.getByLabel("Width", { exact: true }).inputValue());
    assert.ok(nestedInitialWidth >= 2 && nestedInitialWidth < 16,
      "Appsmith's edge rule shrinks this 16-column Text at the nested left edge");
    const nestedInitialHeight = Number(await page.getByLabel("Height").inputValue());
    assert.ok(nestedHorizontalDelta > 0 && nestedHorizontalDelta < 20,
      `nested grid must snap 39px to a valid width: ${nestedHorizontalDelta}`);
    await dragHandle(page, page.getByRole("button", { name: `Move ${nestedTextName}` }), 39, 20);
    // The name shares the positioned widget's origin in this nested canvas.
    await expect(page.getByLabel("Left column"))
      .toHaveValue(String(nestedHorizontalDelta - 1));
    await expect(page.getByLabel("Top row")).toHaveValue("3");
    await dragHandle(page,
      page.getByRole("button", { name: `Resize ${nestedTextName} from bottomRight` }), -39, 20);
    await expect(page.getByLabel("Width", { exact: true }))
      .toHaveValue(String(nestedInitialWidth - nestedHorizontalDelta));
    const nestedFinalHeight = Number(await page.getByLabel("Height").inputValue());
    assert.ok(nestedFinalHeight > nestedInitialHeight &&
      nestedFinalHeight <= nestedInitialHeight + 2,
    "bottom-right drag increases a Fixed nested Text within the auto Container");
    const viewport = page.locator(".od-workbench__viewport");
    const viewportScrollBefore = await viewport.evaluate((element) => element.scrollTop);
    const viewportBox = await viewport.boundingBox();
    const nestedMoveHandle = page.getByRole("button", { name: `Move ${nestedTextName}` });
    const nestedMoveBox = await nestedMoveHandle.boundingBox();
    assert.ok(viewportBox && nestedMoveBox);
    const nestedMoveX = nestedMoveBox.x + nestedMoveBox.width / 2;
    const nestedMoveY = nestedMoveBox.y + nestedMoveBox.height / 2;
    await page.mouse.move(nestedMoveX, nestedMoveY);
    await page.mouse.down();
    await page.mouse.move(nestedMoveX, viewportBox.y + viewportBox.height - 8, { steps: 12 });
    await expectAppsmithDragPreview(page, "0", { widgetId: nestedTextId, paint: false });
    await page.waitForFunction((before) =>
      document.querySelector(".od-workbench__viewport")?.scrollTop > before,
    viewportScrollBefore, { timeout: 5000 });
    await page.mouse.up();
    await expect(innerCanvas.locator(`[data-widget-id="${nestedTextId}"]`)).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(innerCanvas.locator(`[data-widget-id="${nestedTextId}"]`)).toHaveCount(1);
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 3").waitFor();
    const nestedDashboardDraft = await readLocalDraft(page, newDashboardId);
    const savedContainer = nestedDashboardDraft.document.layout.dsl.children.find((widget) =>
      widget.widgetId === containerId);
    const savedInnerCanvas = savedContainer?.children?.find((widget) => widget.widgetId === innerCanvasId);
    const savedNestedText = savedInnerCanvas?.children?.find((widget) => widget.widgetId === nestedTextId);
    assert.equal(savedNestedText?.parentId, innerCanvasId);
    assert.deepEqual({
      left: savedNestedText.leftColumn,
      top: savedNestedText.topRow,
      width: savedNestedText.rightColumn - savedNestedText.leftColumn,
      height: savedNestedText.bottomRow - savedNestedText.topRow,
    }, { left: nestedHorizontalDelta - 1, top: 3,
      width: nestedInitialWidth - nestedHorizontalDelta, height: nestedFinalHeight });
    await page.reload();
    await page.getByText("Local draft · revision 3").waitFor();
    await page.getByRole("button", { name: "Show widget outline" }).click();
    await page.locator(".od-workbench__outline-item")
      .filter({ hasText: nestedTextName }).click();
    await page.getByRole("tab", { name: "Style" }).click();
    assert.deepEqual(await page.locator('.od-read-only-canvas__widget--selected[data-widget-id]')
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-widget-id"))),
      [nestedTextId], "nested name selects its own widget after reload");
    assert.equal(await page.getByLabel("Left column").inputValue(), String(nestedHorizontalDelta - 1));
    assert.equal(await page.getByLabel("Top row").inputValue(), "3");
    assert.equal(await page.getByLabel("Width", { exact: true }).inputValue(),
      String(nestedInitialWidth - nestedHorizontalDelta));
    assert.equal(await page.getByLabel("Height").inputValue(), String(nestedFinalHeight));
    if (process.env.BROWSER_SCREENSHOT_DIR) {
      await page.screenshot({
        path: path.join(process.env.BROWSER_SCREENSHOT_DIR, "nested-workbench.png"),
        fullPage: true,
      });
    }

    // The narrow Text now exposes only three grid columns after resize, so use
    // Appsmith's widget-name drag control to reparent it. The focused
    // cross-container gate separately covers dragging the normal-width body.
    const nestedBody = page.locator(`[data-widget-id="${nestedTextId}"]`);
    await page.locator(".od-workbench__viewport")
      .evaluate((element) => { element.scrollTop = 0; });
    await nestedBody.scrollIntoViewIfNeeded();
    const nestedBodyBox = await nestedBody.boundingBox();
    const rootCanvasBox = await page.locator('[data-widget-id="0"]').boundingBox();
    assert.ok(nestedBodyBox && rootCanvasBox);
    const nestedMoveBadge = page.getByRole("button", { name: `Move ${nestedTextName}` });
    await nestedMoveBadge.scrollIntoViewIfNeeded();
    const nestedBadgeBox = await nestedMoveBadge.boundingBox();
    assert.ok(nestedBadgeBox);
    const bodyX = nestedBadgeBox.x + nestedBadgeBox.width / 2;
    const bodyY = nestedBadgeBox.y + nestedBadgeBox.height / 2;
    const rootDropX = rootCanvasBox.x + 700;
    const rootDropY = Math.max(bodyY + 100, viewportBox.y + 160);
    const dragConsoleEvents = [];
    const captureDragConsole = (message) => dragConsoleEvents.push(message.text());
    page.on("console", captureDragConsole);
    await page.evaluate((widgetId) => {
      window.__crossContainerSourceNode = document.querySelector(`[data-widget-id="${widgetId}"]`);
      window.__crossContainerEventLog = [];
      for (const type of ["pointerdown", "pointermove", "pointerup", "dragstart", "mouseup"]) {
        window.addEventListener(type, (event) => {
          if (window.__crossContainerEventLog.length >= 100) return;
          window.__crossContainerEventLog.push({
            type, x: event.clientX, y: event.clientY,
            target: event.target?.closest?.("[data-widget-id]")?.getAttribute("data-widget-id") ?? null,
            sourceDragging: window.__crossContainerSourceNode?.getAttribute("data-drag-source"),
          });
        }, true);
      }
    }, nestedTextId);
    await page.mouse.move(bodyX, bodyY);
    await page.mouse.down();
    await page.mouse.move(rootDropX, rootDropY, { steps: 12 });
    await expectAppsmithDragPreview(page, "0", { widgetId: nestedTextId });
    const crossContainerBeforeDrop = await crossContainerDragState(page,
      nestedTextId, innerCanvasId, { x: rootDropX, y: rootDropY });
    await page.mouse.up();
    if (await innerCanvas.locator(`[data-widget-id="${nestedTextId}"]`).count()) {
      console.log("Cross-container drag diagnostics:", JSON.stringify({
        beforeDrop: crossContainerBeforeDrop,
        afterDrop: await crossContainerDragState(page,
          nestedTextId, innerCanvasId, { x: rootDropX, y: rootDropY }),
        consoleEvents: dragConsoleEvents,
        pageErrors,
      }, null, 2));
    }
    page.off("console", captureDragConsole);
    await expect(innerCanvas.locator(`[data-widget-id="${nestedTextId}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-widget-id="${nestedTextId}"]`)).toHaveCount(1);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(innerCanvas.locator(`[data-widget-id="${nestedTextId}"]`)).toHaveCount(1);
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(innerCanvas.locator(`[data-widget-id="${nestedTextId}"]`)).toHaveCount(0);
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 4").waitFor();
    const reparentedDraft = await readLocalDraft(page, newDashboardId);
    assert.equal(reparentedDraft.document.layout.dsl.children.find((widget) =>
      widget.widgetId === nestedTextId)?.parentId, "0");
    await page.reload();
    await expect(page.locator(`[data-widget-id="${nestedTextId}"]`)).toHaveCount(1);
    await expect(page.locator(`[data-widget-id="${innerCanvasId}"] [data-widget-id="${nestedTextId}"]`)).toHaveCount(0);

    // Replacing a bound Text value with static text removes its binding metadata.
    await page.goto(`http://127.0.0.1:${port}/workbench?draftId=${draftIds.unresolved}`);
    await page.getByTestId("native-text-engine-speed-value")
      .getByText("Dynamic text unavailable in read-only preview").waitFor();
    await page.getByRole("button", { name: "Select EngineSpeedValue" }).click();
    await page.getByLabel("Text", { exact: true }).fill("Fixed speed reading");
    await page.getByLabel("Text", { exact: true }).blur();
    await page.getByTestId("native-text-engine-speed-value")
      .getByText("Fixed speed reading").waitFor();
    await expect(missingReferenceBadge).not.toHaveAttribute("data-error-count", /.+/);
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 2").waitFor();
    const staticTextDraft = await readLocalDraft(page, draftIds.unresolved);
    const staticTextCard = staticTextDraft.document.layout.dsl.children.find((widget) =>
      widget.widgetId === "engine-speed-card");
    const staticTextWidget = staticTextCard.children[0].children.find((widget) =>
      widget.widgetId === "engine-speed-value");
    assert.equal(staticTextWidget.text, "Fixed speed reading");
    assert.equal(staticTextWidget.dynamicBindingPathList.some((entry) => entry.key === "text"), false);
    await page.reload();
    await page.getByTestId("native-text-engine-speed-value")
      .getByText("Fixed speed reading").waitFor();

    // Property controls follow the selected widget's Appsmith configuration.
    // Exercise every control shape against a non-Text widget and verify the
    // resulting authored DSL, including conditional visibility and reload.
    await page.goto(`http://127.0.0.1:${port}/workbench?draftId=${newDashboardId}`);
    await page.getByText("Local draft · revision 4").waitFor();
    await page.getByRole("button", { name: "Widgets", exact: true }).click();
    await page.getByRole("button", { name: "Add Progress widget" }).press("Enter");
    const propertyProgress = page.locator(
      '.od-workbench__artboard [data-widget-name^="Progress"]',
    ).first();
    await propertyProgress.waitFor();
    const propertyProgressId = await propertyProgress.getAttribute("data-widget-id");
    const propertyProgressName = await propertyProgress.getAttribute("data-widget-name");
    assert.ok(propertyProgressId && propertyProgressName);

    const progressType = page.getByRole("radiogroup", { name: "Type" });
    await progressType.getByRole("radio", { name: "Circular" }).click();
    await expect(progressType.getByRole("radio", { name: "Circular" })).toHaveAttribute("aria-checked", "true");
    await page.getByLabel("Progress", { exact: true }).fill("73");
    await page.getByLabel("Progress", { exact: true }).blur();
    await page.getByLabel("Number of steps").fill("4");
    await page.getByLabel("Number of steps").blur();
    await page.getByText("Counterclockwise", { exact: true }).click();
    await expect(page.getByRole("switch", { name: "Counterclockwise" })).toBeChecked();
    await page.getByText("Show result", { exact: true }).click();
    await expect(page.getByRole("switch", { name: "Show result" })).not.toBeChecked();
    await page.getByText("Infinite loading", { exact: true }).click();
    await expect(page.getByRole("switch", { name: "Infinite loading" })).toBeChecked();
    await expect(page.getByLabel("Progress", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Number of steps")).toHaveCount(0);
    await expect(page.getByRole("switch", { name: "Counterclockwise" })).toHaveCount(0);
    await page.getByText("Infinite loading", { exact: true }).click();
    await expect(page.getByLabel("Progress", { exact: true })).toHaveValue("73");
    await expect(page.getByLabel("Number of steps")).toHaveValue("4");
    await page.getByRole("tab", { name: "Style" }).click();
    await page.getByLabel("Fill color", { exact: true }).fill("#c2410c");
    await page.getByLabel("Fill color", { exact: true }).blur();
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 5").waitFor();
    const propertyDraft = await readLocalDraft(page, newDashboardId);
    const savedProgress = propertyDraft.document.layout.dsl.children.find((widget) =>
      widget.widgetId === propertyProgressId);
    assert.ok(savedProgress, "property-control progress widget must be saved");
    assert.equal(savedProgress.progressType, "circular");
    assert.equal(savedProgress.progress, 73);
    assert.equal(savedProgress.steps, 4);
    assert.equal(savedProgress.counterClockwise, true);
    assert.equal(savedProgress.showResult, false);
    assert.equal(savedProgress.isIndeterminate, false);
    assert.equal(savedProgress.fillColor, "#c2410c");
    await page.reload();
    await page.getByText("Local draft · revision 5").waitFor();
    await page.getByRole("button", { name: `Select ${propertyProgressName}` }).click();
    await expect(page.getByRole("radiogroup", { name: "Type" })
      .getByRole("radio", { name: "Circular" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Progress", { exact: true })).toHaveValue("73");
    await expect(page.getByLabel("Number of steps")).toHaveValue("4");
    await expect(page.getByRole("switch", { name: "Counterclockwise" })).toBeChecked();
    await expect(page.getByRole("switch", { name: "Show result" })).not.toBeChecked();
    await page.getByRole("tab", { name: "Style" }).click();
    await expect(page.getByLabel("Fill color", { exact: true })).toHaveValue("#c2410c");

    // Text's source configuration reveals the truncate color only when its
    // overflow choice is Truncate. A dropdown and segmented choice must also
    // survive the local save path.
    await page.goto(`http://127.0.0.1:${port}/workbench?draftId=${dashboard.documentId}`);
    await page.getByText("Local draft · revision 2").waitFor();
    await page.getByRole("button", { name: "Select EngineTitle" }).click();
    await page.getByPlaceholder("Search properties").fill("Overflow");
    await expect(page.getByRole("radiogroup", { name: "Overflow Text" })).toBeVisible();
    await expect(page.getByLabel("Text", { exact: true })).toHaveCount(0);
    await page.getByPlaceholder("Search properties").fill("");
    const overflow = page.getByRole("radiogroup", { name: "Overflow Text" });
    await overflow.getByRole("radio", { name: "Truncate" }).click();
    await page.getByRole("tab", { name: "Style" }).click();
    await page.getByLabel("Font family").selectOption("Roboto");
    await page.getByRole("radiogroup", { name: "Alignment" })
      .getByRole("radio", { name: "Center" }).click();
    await page.getByLabel("Truncate button color", { exact: true }).fill("#0f766e");
    await page.getByLabel("Truncate button color", { exact: true }).blur();
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 3").waitFor();
    const textPropertyDraft = await readLocalDraft(page, dashboard.documentId);
    const styledText = textPropertyDraft.document.layout.dsl.children.find((widget) =>
      widget.widgetId === "engine-title");
    assert.equal(styledText.overflow, "TRUNCATE");
    assert.equal(styledText.fontFamily, "Roboto");
    assert.equal(styledText.textAlign, "CENTER");
    assert.equal(styledText.truncateButtonColor, "#0f766e");
    await page.reload();
    await page.getByText("Local draft · revision 3").waitFor();
    await page.getByRole("button", { name: "Select EngineTitle" }).click();
    await expect(page.getByRole("radiogroup", { name: "Overflow Text" })
      .getByRole("radio", { name: "Truncate" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("tab", { name: "Style" }).click();
    await expect(page.getByLabel("Font family")).toHaveValue("Roboto");
    await expect(page.getByRole("radiogroup", { name: "Alignment" })
      .getByRole("radio", { name: "Center" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Truncate button color", { exact: true })).toHaveValue("#0f766e");

    // The media draft already contains a safe data URI, so image settings can
    // be checked against a loaded image without an external network request.
    await page.goto(`http://127.0.0.1:${port}/workbench?draftId=${draftIds.media}`);
    await page.getByText("Local draft · revision 1").waitFor();
    const editableImage = page.locator('[data-widget-id="reference-image"]');
    await editableImage.getByRole("img", { name: "ReferenceImage" }).waitFor();
    await page.getByRole("button", { name: "Select ReferenceImage" }).click();
    await page.getByLabel("Max zoom level").selectOption("2");
    await page.getByText("Enable rotation", { exact: true }).click();
    await page.getByText("Enable download", { exact: true }).click();
    await expect(page.getByRole("switch", { name: "Enable rotation" })).toBeChecked();
    await expect(page.getByRole("switch", { name: "Enable download" })).toBeChecked();
    await expect(editableImage.getByRole("button", { name: "Zoom in image" })).toBeVisible();
    await expect(editableImage.getByRole("button", { name: "Rotate image" })).toBeVisible();
    await expect(editableImage.getByRole("link", { name: "Download image" })).toBeVisible();
    await editableImage.getByRole("button", { name: "Zoom in image" }).click();
    await expect(editableImage.getByLabel("Image zoom")).toHaveText("2×");
    await editableImage.getByRole("button", { name: "Rotate image" }).click();
    await expect(editableImage.getByRole("img", { name: "ReferenceImage" }))
      .toHaveAttribute("style", /scale\(2\) rotate\(90deg\)/);
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 2").waitFor();
    const imagePropertyDraft = await readLocalDraft(page, draftIds.media);
    const savedImage = imagePropertyDraft.document.layout.dsl.children.find((widget) =>
      widget.widgetId === "reference-image");
    assert.equal(savedImage.maxZoomLevel, 2);
    assert.equal(savedImage.enableRotation, true);
    assert.equal(savedImage.enableDownload, true);
    assert.match(savedImage.image, /^data:image\/svg\+xml,/);
    await page.reload();
    await page.getByText("Local draft · revision 2").waitFor();
    await page.getByRole("button", { name: "Select ReferenceImage" }).click();
    await expect(page.getByLabel("Max zoom level")).toHaveValue("2");
    await expect(page.getByRole("switch", { name: "Enable rotation" })).toBeChecked();
    await expect(page.getByRole("switch", { name: "Enable download" })).toBeChecked();
    await expect(page.locator('[data-widget-id="reference-image"]')
      .getByRole("button", { name: "Zoom in image" })).toBeVisible();

    // A new Chart's static series editor writes point arrays consumed by the
    // local renderer. Invalid JSON must stay in the input without changing
    // the authored chart.
    await page.goto(`http://127.0.0.1:${port}/workbench?draftId=${newDashboardId}`);
    await page.getByText("Local draft · revision 5").waitFor();
    await page.getByRole("button", { name: "Widgets", exact: true }).click();
    await page.getByRole("button", { name: "Add Chart widget" }).press("Enter");
    const propertyChart = page.locator(
      '.od-workbench__artboard [data-widget-name^="Chart"]',
    ).first();
    await propertyChart.waitFor();
    const propertyChartId = await propertyChart.getAttribute("data-widget-id");
    const propertyChartName = await propertyChart.getAttribute("data-widget-name");
    assert.ok(propertyChartId && propertyChartName);
    const seriesData = page.getByLabel("Series 1 data");
    await seriesData.fill("not json");
    await seriesData.blur();
    await page.getByRole("alert").filter({ hasText: "Series data must be valid JSON." }).first().waitFor();
    assert.equal(await propertyChart.locator('[data-testid="native-basic-chart"] svg').count(), 0);
    const chartPoints = [{ x: "Mon", y: 5 }, { x: "Tue", y: 9 }];
    await seriesData.fill(JSON.stringify(chartPoints));
    await seriesData.blur();
    await propertyChart.locator('[data-testid="native-basic-chart"] svg').waitFor();
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 6").waitFor();
    const chartPropertyDraft = await readLocalDraft(page, newDashboardId);
    const savedChart = chartPropertyDraft.document.layout.dsl.children.find((widget) =>
      widget.widgetId === propertyChartId);
    assert.ok(savedChart, "new chart must be saved");
    assert.deepEqual(savedChart.chartData.series1.data, chartPoints);
    await page.reload();
    await page.getByText("Local draft · revision 6").waitFor();
    await propertyChart.hover();
    await page.getByRole("button", { name: `Move ${propertyChartName}` }).click();
    await expect(page.getByLabel("Widget name")).toHaveValue(propertyChartName);
    await page.getByRole("tab", { name: "Content" }).click();
    assert.deepEqual(JSON.parse(await page.getByLabel("Series 1 data").inputValue()), chartPoints);
    await page.locator(`[data-widget-id="${propertyChartId}"]`)
      .locator('[data-testid="native-basic-chart"] svg').waitFor();

    // Cyflex bindings are authored beside the selected Appsmith property.
    // Undo/redo changes document metadata, while sample values remain transient.
    await page.getByLabel("Series 1 data").fill("[]");
    await page.getByLabel("Series 1 data").blur();
    await propertyChart.getByText("No chart data to display").waitFor();
    await page.getByRole("button", { name: "Select DashboardTitle" }).click();
    const textBindingControl = page.getByTestId("t--binding-control");
    await textBindingControl.getByTestId("t--binding-connect").click();
    await textBindingControl.getByTestId("t--binding-browse-variables").click();
    await textBindingControl.getByTestId("t--binding-discovery-cell").selectOption("6");
    await textBindingControl.getByTestId("t--binding-discovery-result-0").click();
    await expect(textBindingControl.getByTestId("t--binding-selector-kind"))
      .toHaveValue("logicalName");
    await expect(textBindingControl.getByLabel("Exact Cyflex variable label"))
      .toHaveValue("ENGINE_SPEED");
    await expect(textBindingControl.getByLabel("Display label"))
      .toHaveValue("ENGINE_SPEED");
    assert.deepEqual(cyflexDiscoveryRequests, [
      { path: "/operator_display/system/testcells", method: "GET" },
      { path: "/operator_display/system/testcells/6", method: "GET" },
      {
        path: "/operator_display/remote/tc/6/cyflex/variables",
        method: "GET",
        accept: "variables/json_all+output+v1",
      },
    ], "variable discovery must use the Java cell and proxy routes in order");
    await textBindingControl.getByLabel("Display label").fill("Engine speed");
    await textBindingControl.getByLabel("Signed unit code").fill("16");
    await textBindingControl.getByLabel("Text template").fill("{value} rpm");
    await textBindingControl.getByLabel("Decimal places (optional)").fill("0");
    await textBindingControl.getByTestId("t--binding-save").click();
    await expect(textBindingControl.getByTestId("t--binding-summary"))
      .toContainText("Engine speed · latest");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(textBindingControl.getByTestId("t--binding-summary"))
      .toContainText("Connect Cyflex data");
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(textBindingControl.getByTestId("t--binding-summary"))
      .toContainText("Engine speed · latest");
    await page.getByRole("button", { name: "Preview sample values" }).click();
    await page.getByTestId("native-text-dashboard-title").getByText("942 rpm").waitFor();
    await page.getByRole("button", { name: "Clear sample values" }).click();
    await page.getByTestId("native-text-dashboard-title")
      .getByText("Night shift dashboard").waitFor();

    await page.getByRole("button", { name: `Select ${propertyChartName}` }).click();
    const chartBindingControl = page.getByTestId("t--binding-control");
    await chartBindingControl.getByTestId("t--binding-connect").click();
    await chartBindingControl.getByTestId("t--binding-variable-choice")
      .selectOption({ label: "Engine speed" });
    await chartBindingControl.getByLabel("Signed unit code").fill("16");
    await chartBindingControl.getByLabel("Maximum points").fill("2");
    await chartBindingControl.getByLabel("History window (seconds)").fill("30");
    await chartBindingControl.getByTestId("t--binding-save").click();
    await expect(chartBindingControl.getByTestId("t--binding-summary"))
      .toContainText("Engine speed · history");
    if (process.env.BROWSER_SCREENSHOT_DIR) {
      await page.screenshot({
        path: path.join(process.env.BROWSER_SCREENSHOT_DIR, "cyflex-binding-property-pane.png"),
      });
    }
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(chartBindingControl.getByTestId("t--binding-summary"))
      .toContainText("Connect Cyflex data");
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(chartBindingControl.getByTestId("t--binding-summary"))
      .toContainText("Engine speed · history");
    await page.getByRole("button", { name: "Preview sample values" }).click();
    await propertyChart.locator('[data-testid="native-basic-chart"] svg').waitFor();
    await page.getByTestId("native-text-dashboard-title").getByText("942 rpm").waitFor();

    const authoredDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export JSON" }).click();
    const authoredDownload = await authoredDownloadPromise;
    const authored = JSON.parse(fs.readFileSync(await authoredDownload.path(), "utf8"));
    assert.equal(authored.variables.length, 1, "Text and Chart reuse one variable declaration");
    assert.deepEqual(authored.variables[0].selector,
      { kind: "logicalName", name: "ENGINE_SPEED" });
    assert.equal(JSON.stringify(authored).includes("18446744073709551615"), false,
      "authoring-time Cyflex ID must not enter the saved dashboard");
    assert.equal(authored.bindings.length, 2);
    assert.deepEqual(authored.bindings.map((binding) => binding.presentation.kind),
      ["latest", "history"]);
    assert.equal(authored.bindings[0].target.widgetId, "dashboard-title");
    assert.deepEqual(authored.bindings[1].target,
      { widgetId: propertyChartId, propertyPath: "chartData.series1.data" });
    assert.equal(authored.layout.dsl.children.find((widget) =>
      widget.widgetId === "dashboard-title").text, "Night shift dashboard",
    "sample preview must not replace the saved Text fallback");
    assert.deepEqual(authored.layout.dsl.children.find((widget) =>
      widget.widgetId === propertyChartId).chartData.series1.data, [],
    "sample preview must not enter the saved Chart series");

    await page.getByRole("button", { name: "Clear sample values" }).click();
    await propertyChart.getByText("No chart data to display").waitFor();
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 7").waitFor();
    const bindingDraft = await readLocalDraft(page, newDashboardId);
    assert.deepEqual(bindingDraft.document.variables, authored.variables);
    assert.deepEqual(bindingDraft.document.bindings, authored.bindings);
    await page.reload();
    await page.getByText("Local draft · revision 7").waitFor();
    await page.getByRole("button", { name: "Select DashboardTitle" }).click();
    await expect(page.getByTestId("t--binding-summary"))
      .toContainText("Engine speed · latest");
    await page.getByRole("button", { name: `Select ${propertyChartName}` }).click();
    await expect(page.getByTestId("t--binding-summary"))
      .toContainText("Engine speed · history");
    await page.getByTestId("t--binding-connect").click();
    await page.getByTestId("t--binding-remove").click();
    await expect(page.getByTestId("t--binding-summary"))
      .toContainText("Connect Cyflex data");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByTestId("t--binding-summary"))
      .toContainText("Engine speed · history");

    // A palette drag at the bottom of a fresh root canvas reveals more rows.
    // Dropping in that newly visible space persists the larger authored canvas.
    await page.goto(`http://127.0.0.1:${port}/workspace`);
    await page.getByRole("button", { name: "New dashboard" }).click();
    await page.waitForURL(/\/workbench\?draftId=dashboard-/);
    await page.getByText("Local draft · revision 1").waitFor();
    const growingDashboardId = new URL(page.url()).searchParams.get("draftId");
    assert.ok(growingDashboardId);
    await page.getByRole("button", { name: "Widgets", exact: true }).click();
    const growingViewport = page.locator(".od-workbench__viewport");
    const growingArtboard = page.locator(".od-workbench__artboard");
    const initialArtboardHeight = await growingArtboard.evaluate((element) =>
      element.getBoundingClientRect().height);
    assert.equal(initialArtboardHeight, 1200);
    await growingViewport.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const growingSourceBox = await page.getByRole("button", { name: "Add Text widget" }).boundingBox();
    const growingArtboardBox = await growingArtboard.boundingBox();
    assert.ok(growingSourceBox && growingArtboardBox);
    const growingDropX = growingArtboardBox.x + 700;
    await page.mouse.move(growingSourceBox.x + growingSourceBox.width / 2,
      growingSourceBox.y + growingSourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(growingDropX,
      growingArtboardBox.y + growingArtboardBox.height - 20, { steps: 12 });
    await expectAppsmithDragPreview(page, "0");
    await expect.poll(() => growingArtboard.evaluate((element) =>
      element.getBoundingClientRect().height)).toBeGreaterThan(initialArtboardHeight);
    await growingViewport.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const extendedArtboardBox = await growingArtboard.boundingBox();
    assert.ok(extendedArtboardBox);
    await page.mouse.move(growingDropX,
      extendedArtboardBox.y + extendedArtboardBox.height - 40, { steps: 4 });
    await expectAppsmithDragPreview(page, "0");
    await page.mouse.up();
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 2").waitFor();
    const growingDraft = await readLocalDraft(page, growingDashboardId);
    const grownText = growingDraft.document.layout.dsl.children.find((widget) =>
      widget.widgetId !== "dashboard-title");
    assert.ok(grownText);
    // Appsmith extends from the dragged block's bottom edge; the widget may
    // begin at the former last row while its bottom creates new canvas rows.
    assert.ok(grownText.bottomRow > 120,
      `expected the dropped block to extend past row 120, got ${grownText.bottomRow}`);
    assert.equal(growingDraft.document.layout.dsl.minHeight, 1200,
      "Appsmith preserves mainCanvas.minHeight in UI state");
    assert.ok(growingDraft.document.layout.dsl.bottomRow >= grownText.bottomRow,
      "Appsmith saves the canvas content bottom in bottomRow");

    // Appsmith defers reflow of a Container for 500 ms when the dragged
    // widget overlaps it but the pointer is still outside the Container.
    await page.goto(`http://127.0.0.1:${port}/workbench?draftId=${draftIds.containerGate}`);
    await page.getByText("Local draft · revision 1").waitFor();
    const gateText = page.locator('[data-widget-id="engine-title"]');
    const gateContainer = page.locator('[data-widget-id="engine-speed-card"]');
    await gateText.scrollIntoViewIfNeeded();
    const gateTextBox = await gateText.boundingBox();
    const gateContainerBox = await gateContainer.boundingBox();
    const gateRootBox = await page.locator('.od-workbench__artboard [data-widget-id="0"]')
      .boundingBox();
    assert.ok(gateTextBox && gateContainerBox && gateRootBox);
    const gateColumn = (gateRootBox.width - 12) / 64;
    const gateStartX = gateTextBox.x + 20;
    const gateY = gateTextBox.y + 20;
    const gateEndX = gateStartX + gateColumn * 19;
    assert.ok(gateEndX < gateContainerBox.x - 20,
      "Container gate fixture keeps the pointer outside its nested canvas");
    await page.mouse.move(gateStartX, gateY);
    await page.mouse.down();
    await page.mouse.move(gateEndX, gateY, { steps: 10 });
    const gatePreview = page.getByTestId("canvas-dragging-0");
    await expect(gatePreview).toBeVisible();
    assert.equal(await gatePreview.getAttribute("data-drag-preview-valid"), "false",
      "Container collision must be invalid before the 500 ms gate opens");
    assert.equal(await gateContainer.evaluate((element) =>
      getComputedStyle(element).transform), "none",
    "Container must remain in place during the stationary gate delay");
    await page.waitForTimeout(150);
    assert.equal(await gatePreview.getAttribute("data-drag-preview-valid"), "false",
      "Container collision must still be invalid before 500 ms");
    await page.waitForTimeout(400);
    await expect(gatePreview).toHaveAttribute("data-drag-preview-valid", "true",
      { timeout: 1500 });
    await expect.poll(() => gateContainer.evaluate((element) =>
      getComputedStyle(element).transform)).not.toBe("none");
    await page.mouse.move(gateStartX, gateY, { steps: 8 });
    await expect.poll(() => gateContainer.evaluate((element) =>
      getComputedStyle(element).transform)).toBe("none");
    await page.mouse.up();
    await page.getByRole("button", { name: "Widgets", exact: true }).click();
    let occupiedPalettePaint = null;
    let occupiedSiblingPreviewTransform = null;
    await dragPaletteTo(page, page.getByRole("button", { name: "Add Text widget" }),
      gateText, { x: 20, y: 20, onHover: async () => {
        await expectAppsmithDragPreview(page, "0");
        occupiedPalettePaint = await dragPreviewBlueBounds(page, "0");
        assert.ok(occupiedPalettePaint,
          "occupied palette Canvas2D preview must paint a valid block");
        await expect.poll(() => gateText.evaluate((element) =>
          getComputedStyle(element).transform)).not.toBe("none");
        occupiedSiblingPreviewTransform = await gateText.evaluate((element) =>
          element.style.transform);
      } });
    const addedGateText = page.locator('.od-workbench__artboard [data-widget-name^="Text"]');
    await expect(addedGateText).toHaveCount(1);
    await expect.poll(() => addedGateText.evaluate((element) =>
      Number.parseFloat(element.style.height))).toBe(40);
    // Appsmith's four-row Text default measures to the same 40px height.
    // Compare the painted drag preview with settled geometry.
    await expect.poll(async () => (await addedGateText.boundingBox())?.height ?? 0)
      .toBeLessThanOrEqual(40.5);
    const addedGateTextBox = await addedGateText.boundingBox();
    assert.ok(addedGateTextBox && occupiedPalettePaint);
    const occupiedPaletteCommitted = unionFrames([addedGateTextBox]);
    assert.ok(Math.abs(occupiedPalettePaint.x - occupiedPaletteCommitted.x) <= 2 &&
      Math.abs(occupiedPalettePaint.y - occupiedPaletteCommitted.y) <= 2 &&
      Math.abs(occupiedPalettePaint.right - occupiedPaletteCommitted.right) <= 2 &&
      Math.abs(occupiedPalettePaint.bottom - occupiedPaletteCommitted.bottom) <= 2,
    `occupied palette preview must match the four-row Text default: ${JSON.stringify({
      occupiedPalettePaint, occupiedPaletteCommitted,
    })}`);
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 2").waitFor();
    const gateSavedDraft = await readLocalDraft(page, draftIds.containerGate);
    const gateSavedText = gateSavedDraft.document.layout.dsl.children.find((widget) =>
      widget.widgetId === "engine-title");
    assert.ok(gateSavedText.topRow > 40 || gateSavedText.leftColumn > 0,
      "occupied palette drop must commit the same displaced sibling preview");
    const siblingPreviewDelta = /translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/
      .exec(occupiedSiblingPreviewTransform ?? "");
    assert.ok(siblingPreviewDelta,
      `occupied sibling must have an exact preview translation: ${occupiedSiblingPreviewTransform}`);
    assert.ok(Math.abs(Number(siblingPreviewDelta[1]) -
      gateSavedText.leftColumn * gateColumn) <= 2 &&
      Math.abs(Number(siblingPreviewDelta[2]) -
      (gateSavedText.topRow - 40) * 10) <= 2,
    `occupied palette sibling preview must match committed DSL geometry: ${JSON.stringify({
      occupiedSiblingPreviewTransform, saved: {
        leftColumn: gateSavedText.leftColumn, topRow: gateSavedText.topRow,
      },
    })}`);

    // Appsmith reflows the real sibling widget with a CSS transform while a
    // fixed-layout placement is being previewed. The committed DSL then
    // contains both the dragged position and the displaced sibling position.
    await page.goto(`http://127.0.0.1:${port}/workspace`);
    await page.getByRole("button", { name: "New dashboard" }).click();
    await page.waitForURL(/\/workbench\?draftId=dashboard-/);
    await page.getByText("Local draft · revision 1").waitFor();
    const reflowDashboardId = new URL(page.url()).searchParams.get("draftId");
    assert.ok(reflowDashboardId);
    await page.getByRole("button", { name: "Widgets", exact: true }).click();
    const reflowTexts = page.locator('.od-workbench__artboard [data-widget-name^="Text"]');
    await page.getByRole("button", { name: "Add Text widget" }).press("Enter");
    await expect(reflowTexts).toHaveCount(1);
    const movingTextId = await reflowTexts.first().getAttribute("data-widget-id");
    await page.getByRole("button", { name: "Add Text widget" }).press("Enter");
    await expect(reflowTexts).toHaveCount(2);
    const siblingTextId = await reflowTexts.last().getAttribute("data-widget-id");
    assert.ok(movingTextId && siblingTextId && movingTextId !== siblingTextId);
    const movingText = page.locator(`[data-widget-id="${movingTextId}"]`);
    const siblingText = page.locator(`[data-widget-id="${siblingTextId}"]`);
    await movingText.scrollIntoViewIfNeeded();
    const movingTextBox = await movingText.boundingBox();
    assert.ok(movingTextBox);
    const siblingBaselineBox = await siblingText.boundingBox();
    assert.ok(siblingBaselineBox);
    const movingX = movingTextBox.x + 20;
    const movingY = movingTextBox.y + Math.min(20, movingTextBox.height / 2);
    // Appsmith's reflow session must reverse the displaced sibling when the
    // pointer returns to its original snapped position before mouseup.
    await page.mouse.move(movingX, movingY);
    await page.mouse.down();
    await page.mouse.move(movingX, movingY + 80, { steps: 10 });
    await expectAppsmithDragPreview(page, "0", { widgetId: movingTextId });
    await expect.poll(() => siblingText.evaluate((element) =>
      getComputedStyle(element).transform)).not.toBe("none");
    await page.mouse.move(movingX, movingY, { steps: 10 });
    await expect.poll(() => siblingText.evaluate((element) =>
      getComputedStyle(element).transform)).toBe("none");
    await expect(page.locator('.drag-layer[data-drop-canvas-id="0"]')).toBeVisible();
    await page.mouse.up();
    const reversedMovingBox = await movingText.boundingBox();
    const reversedSiblingBox = await siblingText.boundingBox();
    assert.ok(reversedMovingBox && reversedSiblingBox);
    assert.ok(Math.abs(reversedMovingBox.x - movingTextBox.x) <= 2 &&
      Math.abs(reversedMovingBox.y - movingTextBox.y) <= 2 &&
      Math.abs(reversedSiblingBox.x - siblingBaselineBox.x) <= 2 &&
      Math.abs(reversedSiblingBox.y - siblingBaselineBox.y) <= 2,
    "reversed collision must leave both widgets at baseline coordinates");
    await page.mouse.move(movingX, movingY);
    await page.mouse.down();
    await page.mouse.move(movingX, movingY + 80, { steps: 10 });
    await expectAppsmithDragPreview(page, "0", { widgetId: movingTextId });
    await expect.poll(() => siblingText.evaluate((element) =>
      getComputedStyle(element).transform)).not.toBe("none");
    await page.mouse.up();
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 2").waitFor();
    const reflowDraft = await readLocalDraft(page, reflowDashboardId);
    const movedText = reflowDraft.document.layout.dsl.children.find((widget) =>
      widget.widgetId === movingTextId);
    const displacedText = reflowDraft.document.layout.dsl.children.find((widget) =>
      widget.widgetId === siblingTextId);
    assert.ok(movedText && displacedText);
    assert.ok(movedText.topRow >= 16 && movedText.topRow <= 18,
      `dragged text should snap into the sibling's former rows: ${movedText.topRow}`);
    assert.ok(displacedText.topRow > 17,
      `reflowed sibling should move below its original row: ${displacedText.topRow}`);
    await page.reload();
    await expect(page.locator(`[data-widget-id="${movingTextId}"]`)).toHaveCount(1);
    await expect(page.locator(`[data-widget-id="${siblingTextId}"]`)).toHaveCount(1);

    // The Appsmith multi-selection action rail invokes one undoable local
    // document command per Copy/Paste, Cut, Delete, and Group operation.
    const selectReflowPair = async () => {
      const box = page.getByTestId("t--selection-box");
      if (await box.count()) {
        await expectBoxAround(page, box, [movingTextId, siblingTextId]);
        return box;
      }
      const first = page.locator(`[data-widget-id="${movingTextId}"]`);
      const second = page.locator(`[data-widget-id="${siblingTextId}"]`);
      await first.click();
      await second.click({ modifiers: ["Control"] });
      await expect(box).toBeVisible();
      await expectBoxAround(page, box, [movingTextId, siblingTextId]);
      return box;
    };
    let actionBox = await selectReflowPair();
    const groupStartBox = await actionBox.boundingBox();
    const firstBeforeGroupMove = await movingText.boundingBox();
    const secondBeforeGroupMove = await siblingText.boundingBox();
    assert.ok(groupStartBox && firstBeforeGroupMove && secondBeforeGroupMove);
    const groupStartX = groupStartBox.x + groupStartBox.width / 2;
    const groupStartY = groupStartBox.y + groupStartBox.height / 2;
    await page.mouse.move(groupStartX, groupStartY);
    await page.mouse.down();
    await page.mouse.move(groupStartX + 39, groupStartY + 20, { steps: 10 });
    await expectAppsmithDragPreview(page, "0");
    const groupPaintBounds = await dragPreviewBlueBounds(page, "0");
    assert.ok(groupPaintBounds, "group Canvas2D preview must paint valid blocks");
    await page.mouse.up();
    for (const [widget, before] of [
      [movingText, firstBeforeGroupMove], [siblingText, secondBeforeGroupMove],
    ]) {
      await expect.poll(async () => {
        const current = await widget.boundingBox();
        return current ? Math.abs(current.x - before.x - 38.8) : Infinity;
      }).toBeLessThan(3);
    }
    const firstAfterGroupMove = await movingText.boundingBox();
    const secondAfterGroupMove = await siblingText.boundingBox();
    assert.ok(firstAfterGroupMove && secondAfterGroupMove);
    const groupCommittedBounds = unionFrames([firstAfterGroupMove, secondAfterGroupMove]);
    assert.ok(Math.abs(groupPaintBounds.x - groupCommittedBounds.x) <= 2 &&
      Math.abs(groupPaintBounds.y - groupCommittedBounds.y) <= 2 &&
      Math.abs(groupPaintBounds.right - groupCommittedBounds.right) <= 2 &&
      Math.abs(groupPaintBounds.bottom - groupCommittedBounds.bottom) <= 2,
    `group Canvas2D ghost must match committed widget frames: ${JSON.stringify({
      groupPaintBounds, groupCommittedBounds,
    })}`);
    const firstRowShift = firstAfterGroupMove.y - firstBeforeGroupMove.y;
    const secondRowShift = secondAfterGroupMove.y - secondBeforeGroupMove.y;
    assert.ok(firstRowShift >= 9 && firstRowShift <= 30 &&
      Math.abs(firstRowShift - Math.round(firstRowShift / 10) * 10) <= 2 &&
      Math.abs(firstRowShift - secondRowShift) <= 2,
    `Appsmith group drag must move both widgets by one snapped row delta: ${JSON.stringify({
      firstRowShift, secondRowShift,
    })}`);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(async () => {
      const current = await movingText.boundingBox();
      return current ? Math.abs(current.x - firstBeforeGroupMove.x) : Infinity;
    }).toBeLessThan(3);
    actionBox = await selectReflowPair();
    await actionBox.getByRole("button", { name: "Copy selected widgets" }).click();
    await page.keyboard.press("Control+v");
    await expect(reflowTexts).toHaveCount(4);
    const copiedTextIds = await reflowTexts.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-widget-id")));
    const pastedIds = copiedTextIds.filter((id) =>
      id !== movingTextId && id !== siblingTextId);
    assert.equal(pastedIds.length, 2, "paste must assign fresh widget IDs");
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 3").waitFor();
    const copiedDraft = await readLocalDraft(page, reflowDashboardId);
    const originalPair = [movingTextId, siblingTextId].map((id) =>
      reflowDraft.document.layout.dsl.children.find((widget) => widget.widgetId === id));
    const pastedPair = pastedIds.map((id) =>
      copiedDraft.document.layout.dsl.children.find((widget) => widget.widgetId === id));
    assert.ok([...originalPair, ...pastedPair].every(Boolean));
    const ordered = (widgets) => [...widgets].sort((a, b) =>
      a.topRow - b.topRow || a.leftColumn - b.leftColumn);
    const originalOrder = ordered(originalPair);
    const pastedOrder = ordered(pastedPair);
    const originalLeft = Math.min(...originalPair.map((widget) => widget.leftColumn));
    const originalTop = Math.min(...originalPair.map((widget) => widget.topRow));
    const originalBottom = Math.max(...originalPair.map((widget) => widget.bottomRow));
    const pasteLeft = Math.min(...pastedPair.map((widget) => widget.leftColumn));
    const pasteTop = Math.min(...pastedPair.map((widget) => widget.topRow));
    assert.equal(pasteLeft, originalLeft,
      "Appsmith centers the copied group on the selected Fixed bounds");
    assert.equal(pasteTop, originalBottom + 1,
      "Appsmith places the copied group one row below selected widgets");
    for (let index = 0; index < originalOrder.length; index += 1) {
      assert.equal(pastedOrder[index].leftColumn - pasteLeft,
        originalOrder[index].leftColumn - originalLeft);
      assert.equal(pastedOrder[index].topRow - pasteTop,
        originalOrder[index].topRow - originalTop);
    }
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(reflowTexts).toHaveCount(2);

    actionBox = await selectReflowPair();
    await actionBox.getByRole("button", { name: "Cut selected widgets" }).click();
    await expect(reflowTexts).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(reflowTexts).toHaveCount(2);

    actionBox = await selectReflowPair();
    await actionBox.getByRole("button", { name: "Delete selected widgets" }).click();
    await expect(reflowTexts).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(reflowTexts).toHaveCount(2);

    actionBox = await selectReflowPair();
    await actionBox.getByRole("button", { name: "Group selected widgets" }).click();
    const groupedContainer = page.locator(
      ".od-workbench__artboard .od-read-only-canvas__widget--container-widget",
    );
    await expect(groupedContainer).toHaveCount(1);
    const groupId = await groupedContainer.getAttribute("data-widget-id");
    assert.ok(groupId && groupId.startsWith("widget-"));
    for (const widgetId of [movingTextId, siblingTextId]) {
      await expect(groupedContainer.locator(`[data-widget-id="${widgetId}"]`))
        .toHaveCount(1);
    }
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(groupedContainer).toHaveCount(0);
    await expect(reflowTexts).toHaveCount(2);

    // Auto Height is a separate Fixed-widget mode. Content measurements update
    // geometry without adding undo entries; its sibling and Container effects
    // must survive the local draft save path.
    await page.goto(`http://127.0.0.1:${port}/workbench?draftId=${draftIds.autoHeight}`);
    await page.getByText("Local draft · revision 1").waitFor();
    const rootAutoId = "auto-height-root";
    const rootLowerId = "auto-height-root-lower";
    const childAutoId = "auto-height-child";
    const innerLowerId = "auto-height-inner-lower";
    const containerAutoId = "auto-height-container";
    const containerLowerId = "auto-height-container-lower";
    await expect.poll(async () => (await widgetGridFrame(page, rootAutoId)).height)
      .toBe(40);
    await expect.poll(async () => (await widgetGridFrame(page, childAutoId)).height)
      .toBe(40);
    const rootBeforeAuto = await widgetGridFrame(page, rootAutoId);
    const rootLowerBeforeAuto = await widgetGridFrame(page, rootLowerId);
    const rootColumnsBeforeAuto = await widgetGridFrame(page, containerAutoId);
    // A document edit must update the existing Fixed canvas tree. Keeping the
    // actual nodes lets this catch a brief unmount that a screenshot misses.
    await installCanvasMountProbe(page, rootAutoId);
    await page.getByRole("button", { name: "Select AutoHeightRoot", exact: true }).click();
    await assertCanvasMountProbe(page, "selection must retain the Text and measurement nodes");
    await expect(page.locator('[data-property-name="dynamicHeight"] select'))
      .toHaveValue("AUTO_HEIGHT");
    const lowerAutoText = page.locator(`[data-widget-id="${rootLowerId}"]`);
    await lowerAutoText.scrollIntoViewIfNeeded();
    const lowerAutoBox = await lowerAutoText.boundingBox();
    assert.ok(lowerAutoBox, "lower Auto Height sibling must be visible for drag");
    const lowerAutoX = lowerAutoBox.x + 20;
    const lowerAutoY = lowerAutoBox.y + Math.min(20, lowerAutoBox.height / 2);
    await page.mouse.move(lowerAutoX, lowerAutoY);
    await page.mouse.down();
    await page.mouse.move(lowerAutoX, lowerAutoY + 50, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await widgetGridFrame(page, rootLowerId)).top)
      .toBeGreaterThan(rootLowerBeforeAuto.top);
    await assertCanvasMountProbe(page, "sibling drag must retain the Auto Height nodes");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(async () => (await widgetGridFrame(page, rootLowerId)).top)
      .toBe(rootLowerBeforeAuto.top);
    await page.getByRole("button", { name: "Select AutoHeightRoot", exact: true }).click();
    await assertCanvasMountProbe(page, "drag undo and reselection must retain the nodes");
    const longRootText = Array.from({ length: 18 }, (_, index) => `Root line ${index + 1}`).join("\n");
    await page.getByLabel("Text", { exact: true }).fill(longRootText);
    await page.getByLabel("Text", { exact: true }).blur();
    await expect.poll(async () => (await widgetGridFrame(page, rootAutoId)).height,
      { timeout: 10000 }).toBeGreaterThan(rootBeforeAuto.height + 100);
    const rootAfterGrow = await widgetGridFrame(page, rootAutoId);
    await assertCanvasMountProbe(page, "Text property edit and height growth must retain the nodes");
    await expect.poll(async () => (await widgetGridFrame(page, rootLowerId)).top)
      .toBe(rootLowerBeforeAuto.top + rootAfterGrow.height - rootBeforeAuto.height);
    assert.deepEqual(await widgetGridFrame(page, containerAutoId), rootColumnsBeforeAuto,
      "auto-height reflow must preserve nonoverlapping columns");
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 2").waitFor();
    await assertCanvasMountProbe(page, "saving the edited draft must retain the nodes");
    const savedAutoGrowth = await readLocalDraft(page, draftIds.autoHeight);
    const grownDsl = savedAutoGrowth.document.layout.dsl.children.find((widget) =>
      widget.widgetId === rootAutoId);
    assert.equal(grownDsl.dynamicHeight, "AUTO_HEIGHT");
    assert.equal((grownDsl.bottomRow - grownDsl.topRow) * 10, rootAfterGrow.height);

    await page.getByLabel("Text", { exact: true }).fill("Root");
    await page.getByLabel("Text", { exact: true }).blur();
    await expect.poll(async () => (await widgetGridFrame(page, rootAutoId)).height)
      .toBe(rootBeforeAuto.height);
    await assertCanvasMountProbe(page, "Text shrink must retain the nodes");
    await expect.poll(async () => (await widgetGridFrame(page, rootLowerId)).top)
      .toBe(rootLowerBeforeAuto.top);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue(longRootText);
    await expect.poll(async () => (await widgetGridFrame(page, rootAutoId)).height)
      .toBe(rootAfterGrow.height);
    await assertCanvasMountProbe(page, "undo must retain the nodes");
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("Root");
    await expect.poll(async () => (await widgetGridFrame(page, rootAutoId)).height)
      .toBe(rootBeforeAuto.height);
    await assertCanvasMountProbe(page, "redo must retain the nodes");

    await page.locator('[data-property-name="dynamicHeight"] select')
      .selectOption("AUTO_HEIGHT_WITH_LIMITS");
    await assertCanvasMountProbe(page, "changing height mode must retain the Text node",
      { measurement: false });
    // Appsmith adds a scroll wrapper for limits; that legitimately replaces
    // the measurement subtree while the outer Text widget stays mounted.
    await installCanvasMountProbe(page, rootAutoId);
    await expect(page.getByLabel("Minimum height (rows)")).toBeVisible();
    await expect(page.getByLabel("Maximum height (rows)")).toBeVisible();
    await expect(page.locator(`[data-widget-auto-height-overlay="${rootAutoId}"]`))
      .toBeVisible();
    await page.getByLabel("Maximum height (rows)").fill("9");
    await page.getByLabel("Maximum height (rows)").blur();
    await page.getByLabel("Minimum height (rows)").fill("5");
    await page.getByLabel("Minimum height (rows)").blur();
    await expect.poll(async () => (await widgetGridFrame(page, rootAutoId)).height)
      .toBe(50);
    await assertCanvasMountProbe(page, "height mode and limit edits must retain the nodes");
    const maxHandle = page.getByTestId("t--auto-height-overlay-handles-max");
    await expect(maxHandle).toBeVisible();
    await dragHandle(page, maxHandle, 0, 20);
    await expect(page.getByLabel("Maximum height (rows)")).toHaveValue("11");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByLabel("Maximum height (rows)")).toHaveValue("9");
    await page.getByLabel("Text", { exact: true }).fill(longRootText);
    await page.getByLabel("Text", { exact: true }).blur();
    await expect.poll(async () => (await widgetGridFrame(page, rootAutoId)).height)
      .toBe(90);
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 3").waitFor();
    await page.reload();
    await page.getByText("Local draft · revision 3").waitFor();
    await page.getByRole("button", { name: "Select AutoHeightRoot", exact: true }).press("Enter");
    await expect(page.locator('[data-property-name="dynamicHeight"] select'))
      .toHaveValue("AUTO_HEIGHT_WITH_LIMITS");
    await expect(page.getByLabel("Maximum height (rows)")).toHaveValue("9");
    await expect.poll(async () => (await widgetGridFrame(page, rootAutoId)).height)
      .toBe(90);

    // A growing child reflows its inner sibling, expands its auto-height
    // Container, and then moves the root sibling beneath that Container.
    await installCanvasMountProbe(page, childAutoId);
    const childBeforeAuto = await widgetGridFrame(page, childAutoId);
    const innerLowerBeforeAuto = await widgetGridFrame(page, innerLowerId);
    const containerBeforeAuto = await widgetGridFrame(page, containerAutoId);
    const containerLowerBeforeAuto = await widgetGridFrame(page, containerLowerId);
    await page.getByRole("button", { name: "Select AutoHeightChild" }).click();
    await expect(page.locator('[data-property-name="dynamicHeight"] select'))
      .toHaveValue("AUTO_HEIGHT");
    const longChildText = Array.from({ length: 18 }, (_, index) => `Child line ${index + 1}`).join("\n");
    await page.getByLabel("Text", { exact: true }).fill(longChildText);
    await page.getByLabel("Text", { exact: true }).blur();
    await expect.poll(async () => (await widgetGridFrame(page, childAutoId)).height,
      { timeout: 10000 }).toBeGreaterThan(childBeforeAuto.height + 100);
    await assertCanvasMountProbe(page,
      "nested Text property edit and Container expansion must retain the nodes");
    const childAfterAuto = await widgetGridFrame(page, childAutoId);
    await expect.poll(async () => (await widgetGridFrame(page, innerLowerId)).top)
      .toBe(innerLowerBeforeAuto.top + childAfterAuto.height - childBeforeAuto.height);
    await expect.poll(async () => (await widgetGridFrame(page, containerAutoId)).height)
      .toBeGreaterThan(containerBeforeAuto.height);
    const containerAfterAuto = await widgetGridFrame(page, containerAutoId);
    await expect.poll(async () => (await widgetGridFrame(page, containerLowerId)).top)
      .toBe(containerLowerBeforeAuto.top + containerAfterAuto.height - containerBeforeAuto.height);
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 4").waitFor();
    await assertCanvasMountProbe(page, "saving nested growth must retain the nodes");
    const savedNestedAuto = await readLocalDraft(page, draftIds.autoHeight);
    const savedAutoContainer = savedNestedAuto.document.layout.dsl.children.find((widget) =>
      widget.widgetId === containerAutoId);
    const savedAutoChild = savedAutoContainer.children[0].children.find((widget) =>
      widget.widgetId === childAutoId);
    assert.equal((savedAutoContainer.bottomRow - savedAutoContainer.topRow) * 10,
      containerAfterAuto.height);
    assert.equal((savedAutoChild.bottomRow - savedAutoChild.topRow) * 10,
      childAfterAuto.height);
    await page.reload();
    await page.getByText("Local draft · revision 4").waitFor();
    await expect.poll(async () => (await widgetGridFrame(page, childAutoId)).height)
      .toBe(childAfterAuto.height);
    await expect.poll(async () => (await widgetGridFrame(page, containerAutoId)).height)
      .toBe(containerAfterAuto.height);
    await page.getByRole("button", { name: "Select AutoHeightChild", exact: true }).press("Enter");
    await page.getByLabel("Text", { exact: true }).fill("Child");
    await page.getByLabel("Text", { exact: true }).blur();
    await expect.poll(async () => (await widgetGridFrame(page, childAutoId)).height)
      .toBe(childBeforeAuto.height);
    await expect.poll(async () => (await widgetGridFrame(page, innerLowerId)).top)
      .toBe(innerLowerBeforeAuto.top);
    await expect.poll(async () => (await widgetGridFrame(page, containerAutoId)).height)
      .toBe(containerBeforeAuto.height);
    await expect.poll(async () => (await widgetGridFrame(page, containerLowerId)).top)
      .toBe(containerLowerBeforeAuto.top);
    await installCanvasMountProbe(page, childAutoId);
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 5").waitFor();
    await assertCanvasMountProbe(page, "saving nested shrink must retain the nodes");
    await page.reload();
    await page.getByText("Local draft · revision 5").waitFor();
    await expect.poll(async () => (await widgetGridFrame(page, childAutoId)).height)
      .toBe(childBeforeAuto.height);
    await expect.poll(async () => (await widgetGridFrame(page, containerAutoId)).height)
      .toBe(containerBeforeAuto.height);
    await page.goto(`http://127.0.0.1:${port}/workbench?draftId=${draftIds.populated}`);
    await page.getByText("Local draft · revision 1").waitFor();
    await expect(page.locator(`[data-widget-id="${childAutoId}"]`)).toHaveCount(0);
    await page.goto(`http://127.0.0.1:${port}/workbench?draftId=${draftIds.autoHeight}`);
    await page.getByText("Local draft · revision 5").waitFor();
    await expect.poll(async () => (await widgetGridFrame(page, childAutoId)).height)
      .toBe(childBeforeAuto.height);
    await expect.poll(async () => (await widgetGridFrame(page, containerAutoId)).height)
      .toBe(containerBeforeAuto.height);

    // Tabs must use Appsmith's nested Fixed canvases through one local saga
    // document command, then keep the chosen tab transient across editor/view.
    await page.goto(`http://127.0.0.1:${port}/workspace`);
    await page.getByRole("button", { name: "New dashboard" }).click();
    await page.waitForURL(/\/workbench\?draftId=dashboard-/);
    const tabsDraftId = new URL(page.url()).searchParams.get("draftId");
    assert.ok(tabsDraftId);
    await page.getByRole("button", { name: "Add Tabs widget" }).press("Enter");
    const tabsWidget = page.locator('.od-workbench__artboard .od-read-only-canvas__widget--tabs-widget');
    await tabsWidget.waitFor();
    const tabsWidgetId = await tabsWidget.getAttribute("data-widget-id");
    assert.ok(tabsWidgetId);
    await expect(tabsWidget.getByRole("tab", { name: "Tab 1" })).toBeVisible();
    await expect(tabsWidget.getByRole("tab", { name: "Tab 2" })).toBeVisible();
    await page.getByRole("button", { name: "+ Add tab", exact: true }).click();
    await expect(tabsWidget.getByRole("tab", { name: "Tab 3" })).toBeVisible();
    await page.getByLabel("Title for Tab 3").fill("Diagnostics");
    await page.getByLabel("Title for Tab 3").blur();
    const diagnosticsTab = tabsWidget.getByRole("tab", { name: "Diagnostics" });
    await diagnosticsTab.click();
    await expect(diagnosticsTab).toHaveAttribute("aria-selected", "true");
    const diagnosticsCanvasId = (await diagnosticsTab.getAttribute("aria-controls"))
      ?.replace(/^tab-canvas-/, "");
    assert.ok(diagnosticsCanvasId);
    const diagnosticsCanvas = tabsWidget.locator(`[data-widget-id="${diagnosticsCanvasId}"]`);
    await diagnosticsCanvas.waitFor();
    const beforeTabsDrop = new Set(await page.locator(".od-workbench__artboard [data-widget-id]")
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-widget-id"))));
    await dragPaletteTo(page, page.getByRole("button", { name: "Add Text widget" }),
      diagnosticsCanvas, { x: 40, y: 60 });
    await page.waitForFunction((beforeIds) => {
      const currentIds = new Set([...document.querySelectorAll(".od-workbench__artboard [data-widget-id]")]
        .map((element) => element.getAttribute("data-widget-id")));
      return [...currentIds].filter((id) => id && !beforeIds.includes(id)).length === 1;
    }, [...beforeTabsDrop]);
    const afterTabsDrop = new Set(await page.locator(".od-workbench__artboard [data-widget-id]")
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-widget-id"))));
    const tabChildIds = [...afterTabsDrop].filter((id) => id && !beforeTabsDrop.has(id));
    assert.equal(tabChildIds.length, 1);
    const tabChildId = tabChildIds[0];
    await expect(diagnosticsCanvas.locator(`[data-widget-id="${tabChildId}"]`)).toBeVisible();
    await page.getByLabel("Text", { exact: true })
      .fill(Array.from({ length: 28 }, (_, index) => `Line ${index + 1}`).join("\n"));
    await page.getByLabel("Text", { exact: true }).blur();
    await expect.poll(async () => (await widgetGridFrame(page, tabsWidgetId)).height)
      .toBeGreaterThan(250);
    const tallTabsHeight = (await widgetGridFrame(page, tabsWidgetId)).height;
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 2").waitFor();
    const savedTabsDraft = await readLocalDraft(page, tabsDraftId);
    const savedTabs = savedTabsDraft.document.layout.dsl.children.find((widget) =>
      widget.widgetId === tabsWidgetId);
    assert.equal(savedTabs?.type, "TABS_WIDGET");
    assert.equal(Object.keys(savedTabs.tabsObj).length, 3);
    assert.ok(savedTabs.children.some((canvas) => canvas.widgetId === diagnosticsCanvasId &&
      canvas.children.some((widget) => widget.widgetId === tabChildId)));
    await page.getByRole("button", { name: "Preview dashboard" }).click();
    await expect(page.locator(".od-ide--preview [data-native-widget='tabs']"))
      .toBeVisible();
    await tabsWidget.getByRole("tab", { name: "Tab 1" }).click();
    await expect(tabsWidget.getByRole("tab", { name: "Tab 1" }))
      .toHaveAttribute("aria-selected", "true");
    await expect.poll(async () => (await widgetGridFrame(page, tabsWidgetId)).height)
      .toBeLessThan(tallTabsHeight);
    await tabsWidget.getByRole("tab", { name: "Diagnostics" }).click();
    await expect.poll(async () => (await widgetGridFrame(page, tabsWidgetId)).height)
      .toBe(tallTabsHeight);
    await expect(page.locator(`[data-widget-id="${tabChildId}"]`)).toBeVisible();
    await page.getByRole("button", { name: "Return to editor" }).click();
    await page.reload();
    await page.getByText("Local draft · revision 2").waitFor();
    await expect(page.getByRole("tab", { name: "Diagnostics" })).toBeVisible();

    async function verifyModalFlow() {
    // Modal keeps its overlay visibility in editor meta while its nested
    // canvas and static default children remain ordinary saved DSL widgets.
    await page.goto(`http://127.0.0.1:${port}/workspace`);
    await page.getByRole("button", { name: "New dashboard" }).click();
    await page.waitForURL(/\/workbench\?draftId=dashboard-/);
    const modalDraftId = new URL(page.url()).searchParams.get("draftId");
    assert.ok(modalDraftId);
    await page.getByText("Local draft · revision 1").waitFor();
    await page.locator(".od-workbench__artboard").click({ position: { x: 2, y: 50 } });
    await page.locator('.t--layout-control-wrapper [data-value="DESKTOP"]').click();
    await expect.poll(async () => (await page.locator(".od-workbench__artboard")
      .boundingBox()).width).toBeGreaterThan(1150);
    await page.getByRole("button", { name: "Add Modal widget" }).press("Enter");
    const modalOverlay = page.locator('[data-native-widget="modal"]');
    await expect(modalOverlay).toBeVisible();
    const modalDialog = modalOverlay.getByRole("dialog");
    const modalWidgetId = await modalDialog.getAttribute("data-widget-id");
    assert.ok(modalWidgetId);
    await expect(modalDialog.getByText("Modal Title")).toBeVisible();
    await expect(modalDialog.getByText("Close", { exact: true })).toBeVisible();
    await expect(modalDialog.getByText("Confirm", { exact: true })).toBeVisible();
    const modalRightHandle = modalOverlay.locator('[data-modal-resize-handle="right"]');
    const modalLeftHandle = modalOverlay.locator('[data-modal-resize-handle="left"]');
    const modalBottomHandle = modalOverlay.locator('[data-modal-resize-handle="bottom"]');
    await expect(modalRightHandle).toBeVisible();
    await expect(modalLeftHandle).toBeVisible();
    await expect(modalBottomHandle).toBeVisible();
    const initialModalBox = await modalDialog.boundingBox();
    const rightHandleBox = await modalRightHandle.boundingBox();
    assert.ok(initialModalBox && rightHandleBox);
    await page.mouse.move(rightHandleBox.x + rightHandleBox.width / 2,
      rightHandleBox.y + rightHandleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(rightHandleBox.x + rightHandleBox.width / 2 + 20,
      rightHandleBox.y + rightHandleBox.height / 2, { steps: 10 });
    await page.mouse.up();
    // Resizer release may land over the backdrop while panel pointer events
    // are disabled. Only a new pointerdown on the backdrop closes the Modal.
    await expect(modalOverlay).toBeVisible();
    await expect(page.getByLabel("Widget name")).toHaveValue("Modal1");
    await expect.poll(async () => (await modalDialog.boundingBox()).width)
      .toBeGreaterThan(initialModalBox.width + 25);
    const grownModalBox = await modalDialog.boundingBox();
    assert.ok(Math.abs((grownModalBox.x + grownModalBox.width / 2) -
      (initialModalBox.x + initialModalBox.width / 2)) < 4,
    "Appsmith Modal edge resize expands symmetrically around the center");
    await page.setViewportSize({ width: 420, height: 900 });
    await expect.poll(async () => (await modalDialog.boundingBox()).width)
      .toBeGreaterThan(grownModalBox.width - 4);
    await page.setViewportSize({ width: 1440, height: 900 });
    const modalOverlayBox = await modalOverlay.boundingBox();
    const modalPanelBox = await modalDialog.boundingBox();
    assert.ok(modalOverlayBox && modalPanelBox);
    await page.mouse.move(modalOverlayBox.x + 12, modalOverlayBox.y + 12);
    await page.mouse.down();
    await page.mouse.move(modalPanelBox.x + modalPanelBox.width / 2,
      modalPanelBox.y + modalPanelBox.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(modalOverlay).toBeVisible();
    await page.waitForTimeout(0);
    await modalOverlay.locator('[data-modal-backdrop="true"]').dispatchEvent("click");
    await expect(modalOverlay).toBeVisible();
    await expect(page.getByLabel("Widget name")).toHaveValue("Modal1");
    const leftHandleBox = await modalLeftHandle.boundingBox();
    assert.ok(leftHandleBox);
    await page.mouse.move(leftHandleBox.x + leftHandleBox.width / 2,
      leftHandleBox.y + leftHandleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(leftHandleBox.x + leftHandleBox.width / 2 + 10,
      leftHandleBox.y + leftHandleBox.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await modalDialog.boundingBox()).width)
      .toBeLessThan(grownModalBox.width - 10);
    const autoModalHeight = (await modalDialog.boundingBox()).height;
    const disabledBottomBox = await modalBottomHandle.boundingBox();
    assert.ok(disabledBottomBox);
    await page.mouse.move(disabledBottomBox.x + disabledBottomBox.width / 2,
      disabledBottomBox.y + disabledBottomBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(disabledBottomBox.x + disabledBottomBox.width / 2,
      disabledBottomBox.y + disabledBottomBox.height / 2 + 20, { steps: 8 });
    await page.mouse.up();
    assert.equal((await modalDialog.boundingBox()).height, autoModalHeight,
      "Auto Height disables vertical Modal edge resize");
    const modalBeforeHeight = (await modalDialog.boundingBox()).height;
    await modalDialog.getByText("Modal Title", { exact: true }).click();
    await page.getByLabel("Text", { exact: true }).fill(
      Array.from({ length: 22 }, (_, index) => `Modal line ${index + 1}`).join("\n"));
    await page.getByLabel("Text", { exact: true }).blur();
    await expect.poll(async () => (await modalDialog.boundingBox()).height)
      .toBeGreaterThan(modalBeforeHeight);
    await page.getByLabel("Text", { exact: true }).fill("Modal Title");
    await page.getByLabel("Text", { exact: true }).blur();
    await expect.poll(async () => (await modalDialog.boundingBox()).height)
      .toBe(modalBeforeHeight);
    await page.keyboard.press("Escape");
    await expect(modalOverlay).toHaveCount(0);
    await page.getByRole("button", { name: "Outline", exact: true }).click();
    const modalName = `Modal1`;
    await page.getByRole("button", { name: modalName, exact: true }).click();
    await expect(modalOverlay).toBeVisible();
    await page.getByLabel("Height", { exact: true }).selectOption("FIXED");
    const fixedModalBox = await modalDialog.boundingBox();
    const fixedBottomBox = await modalBottomHandle.boundingBox();
    assert.ok(fixedModalBox && fixedBottomBox);
    await page.mouse.move(fixedBottomBox.x + fixedBottomBox.width / 2,
      fixedBottomBox.y + fixedBottomBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(fixedBottomBox.x + fixedBottomBox.width / 2,
      fixedBottomBox.y + fixedBottomBox.height / 2 + 20, { steps: 10 });
    await page.mouse.up();
    await expect.poll(async () => (await modalDialog.boundingBox()).height)
      .toBeGreaterThan(fixedModalBox.height + 25);
    await page.getByRole("navigation", { name: "Workbench sections" })
      .getByRole("button", { name: "Widgets", exact: true }).click();
    const modalCanvas = modalOverlay.locator('.od-read-only-canvas__widget--canvas-widget').first();
    await modalCanvas.waitFor();
    const modalCanvasId = await modalCanvas.getAttribute("data-widget-id");
    assert.ok(modalCanvasId);
    const beforeModalDrop = new Set(await modalOverlay.locator("[data-widget-id]")
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-widget-id"))));
    await dragPaletteTo(page, page.getByRole("button", { name: "Add Text widget" }),
      modalCanvas, { x: 35, y: 120 });
    await page.waitForFunction(({ beforeIds, canvasId }) => {
      const canvas = [...document.querySelectorAll("[data-widget-id]")]
        .find((element) => element.getAttribute("data-widget-id") === canvasId);
      const currentIds = [...(canvas?.querySelectorAll("[data-widget-id]") ?? [])]
        .map((element) => element.getAttribute("data-widget-id"));
      return currentIds.some((id) => id && !beforeIds.includes(id));
    }, { beforeIds: [...beforeModalDrop], canvasId: modalCanvasId });
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 2").waitFor();
    const savedModalDraft = await readLocalDraft(page, modalDraftId);
    const savedModal = savedModalDraft.document.layout.dsl.children.find((widget) =>
      widget.widgetId === modalWidgetId);
    assert.equal(savedModal?.type, "MODAL_WIDGET");
    assert.ok(savedModal.width > 456 && savedModal.height > 240,
      "symmetric edge resize persists detached Modal pixel dimensions");
    assert.ok(savedModal.children[0].minHeight >= savedModal.height,
      "Modal resize synchronizes its nested canvas minimum height");
    assert.ok(savedModal.children[0].children.some((widget) => widget.type === "TEXT_WIDGET" &&
      widget.widgetName !== `${modalName}Title`));
    // A deliberate outside pointerdown and release still dismisses it.
    await modalOverlay.locator('[data-modal-backdrop="true"]')
      .click({ position: { x: 20, y: 20 } });
    await expect(modalOverlay).toHaveCount(0);
    await page.reload();
    await page.getByText("Local draft · revision 2").waitFor();
    await expect(page.locator('[data-native-widget="modal"]')).toHaveCount(0);
    }
    await verifyModalFlow();

    // Appsmith List V2 keeps one authored template; literal listData expands
    // into page-local row clones only at render time.
    await page.goto(`http://127.0.0.1:${port}/workspace`);
    await page.getByRole("button", { name: "New dashboard" }).click();
    await page.waitForURL(/\/workbench\?draftId=dashboard-/);
    const listDraftId = new URL(page.url()).searchParams.get("draftId");
    assert.ok(listDraftId);
    await page.getByRole("button", { name: "Add List widget" }).press("Enter");
    const listView = page.locator('.od-workbench__artboard [data-native-widget="list-v2"]');
    await expect(listView.locator('[data-list-state="items"]')).toBeVisible();
    await expect(listView.locator('[data-list-runtime-row]')).toHaveCount(3);
    const listWidgetId = await listView.evaluate((element) =>
      element.closest('[data-widget-id]')?.getAttribute('data-widget-id'));
    assert.ok(listWidgetId);
    await page.getByLabel("Items", { exact: true }).fill(JSON.stringify([
      { id: "a", name: "Alpha" }, { id: "b", name: "Beta" },
    ]));
    await page.getByLabel("Items", { exact: true }).blur();
    await expect(listView.getByText("Alpha", { exact: true })).toBeVisible();
    await expect(listView.getByText("Beta", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 2").waitFor();
    const savedListDraft = await readLocalDraft(page, listDraftId);
    const savedList = savedListDraft.document.layout.dsl.children.find((widget) =>
      widget.widgetId === listWidgetId);
    assert.equal(savedList?.type, "LIST_WIDGET_V2");
    assert.equal(savedList.children[0].children.length, 1,
      "literal rows must not be copied into the saved List template");
    assert.equal(savedList.listData[0].name, "Alpha");
    await page.reload();
    await page.getByText("Local draft · revision 2").waitFor();
    await expect(page.locator('[data-native-widget="list-v2"]').getByText("Alpha", { exact: true }))
      .toBeVisible();

    // Stats Box uses Appsmith's one-canvas Fixed blueprint. Its three Text
    // children remain editable and propagate Auto Height through the box.
    await page.goto(`http://127.0.0.1:${port}/workspace`);
    await page.getByRole("button", { name: "New dashboard" }).click();
    await page.waitForURL(/\/workbench\?draftId=dashboard-/);
    const statboxDraftId = new URL(page.url()).searchParams.get("draftId");
    assert.ok(statboxDraftId);
    await page.getByRole("button", { name: "Add Stats Box widget" }).press("Enter");
    const newStatbox = page.locator('.od-workbench__artboard .od-read-only-canvas__widget--statbox-widget');
    await expect(newStatbox.getByText("Page Views", { exact: true })).toBeVisible();
    await expect(newStatbox.getByText("2.6 M", { exact: true })).toBeVisible();
    await expect(newStatbox.getByText("21% more than last month", { exact: true })).toBeVisible();
    const statboxId = await newStatbox.getAttribute("data-widget-id");
    assert.ok(statboxId);
    const statboxBeforeHeight = (await widgetGridFrame(page, statboxId)).height;
    await newStatbox.getByText("21% more than last month", { exact: true }).click();
    await page.getByLabel("Text", { exact: true }).fill(
      Array.from({ length: 16 }, (_, index) => `Growth line ${index + 1}`).join("\n"));
    await page.getByLabel("Text", { exact: true }).blur();
    await expect.poll(async () => (await widgetGridFrame(page, statboxId)).height)
      .toBeGreaterThan(statboxBeforeHeight);
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 2").waitFor();
    const savedStatboxDraft = await readLocalDraft(page, statboxDraftId);
    const savedStatbox = savedStatboxDraft.document.layout.dsl.children.find((widget) =>
      widget.widgetId === statboxId);
    assert.equal(savedStatbox?.type, "STATBOX_WIDGET");
    assert.deepEqual(savedStatbox.children[0].children.map((child) => child.type),
      ["TEXT_WIDGET", "TEXT_WIDGET", "ICON_BUTTON_WIDGET", "TEXT_WIDGET"]);
    await page.reload();
    await page.getByText("Local draft · revision 2").waitFor();
    await expect(page.locator('.od-read-only-canvas__widget--statbox-widget')
      .getByText("Growth line 16")).toBeVisible();

    const runPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const runPageErrors = [];
    const runBrowserRequests = [];
    runPage.on("pageerror", (error) => runPageErrors.push(error.message));
    runPage.on("request", (request) => runBrowserRequests.push(request.url()));
    await runPage.addInitScript(() => {
      window.operatorDisplayRunEnvironment = {
        async connectionForCell() {
          return {
            natsConnection: {
              servers: "ws://127.0.0.1:1",
              reconnect: false,
              timeout: 500,
            },
            timestampToMs: (utime) => utime * 1000,
          };
        },
      };
    });
    await runPage.goto(`http://127.0.0.1:${port}/workbench`);
    await runPage.getByRole("button", { name: "Dashboard tools" }).click();
    const runPanel = runPage.getByRole("region", { name: "Dashboard Run" });
    await runPanel.getByLabel("Test cell").selectOption("6");
    await runPanel.getByRole("button", { name: "Start Run" }).click();
    await expect.poll(() => cyflexRunRequests.some((entry) =>
      entry.path === "/operator_display/remote/tc/6/cyflex/streaming" && entry.method === "POST"),
    { timeout: 10000 }).toBe(true);
    const configureRequest = cyflexRunRequests.find((entry) =>
      entry.path === "/operator_display/remote/tc/6/cyflex/streaming" && entry.method === "POST");
    assert.equal(configureRequest.accept, "streaming/json_config+output+v1");
    assert.equal(configureRequest.contentType, "streaming/json_config+input+v1");
    assert.equal(typeof JSON.parse(configureRequest.body).uuid, "string");
    assert.ok(cyflexRunRequests.some((entry) =>
      entry.path === "/operator_display/remote/tc/6/cyflex" &&
      entry.accept === "cyflex/json_info+output+v1"));
    await runPanel.getByText(/Could not start Run:/).waitFor({ timeout: 15000 });
    await runPanel.getByText(/connection refused/).waitFor();
    assert.equal(runBrowserRequests.some((url) => url.includes(":8822/")), false,
      "browser must not call Cyflex HTTP directly");
    assert.deepEqual(runPageErrors, []);
    await runPage.close();

    assert.deepEqual(appsmithRequests, []);
    assert.equal(browserRequests.some((url) => /\{\{|%7B%7B/i.test(url)), false,
      "unresolved bindings must not become image requests");
    assert.deepEqual(pageErrors, []);
    console.log("Stable canvas mount regression passed: Text and Auto Height measurement nodes survive selection, drag, property edits, undo, save, and nested reflow; draft switching reloads the correct document.");
    console.log("Browser flow passed: marketplace, item detail, workspace draft creation and rename, editable local workbench, Appsmith Fluid/Mobile width presets, true edit/view preview, tab-order/focus/error chrome, outside-canvas and clipped Appsmith Canvas2D marquee, sibling selection box within 2px, modifier selection and multi-property pane, reversible sibling reflow, stationary 500 ms Container collision gate, occupied palette preview and Auto Height geometry, group ghost matching committed geometry, Copy/Paste/Cut/Delete/Group action rail with undo, grid and Canvas2D drag preview, hidden drag source, selected/hover name placement, eight Fixed resize handles and top-left resize, nested-widget auto-scroll, cross-container drag and undo/redo, palette root extension, Text Auto Height defaults and growth/shrink, limit controls and overlay drag, nested Container propagation, auto-height undo/save/reload, Tabs add/rename/nested drop/save/preview with active-tab height, Modal overlay/grow/shrink/close/nested drop/save, List V2 literal rows/property/save/reload, Stats Box default children/autoheight/save/reload, static binding replacement, Appsmith-style property controls and static chart series, Cyflex proxy discovery and Run control with unavailable broker, binding authoring/preview/undo/redo/reload, published viewer, editor-dimmed invisible widgets and viewer collapse, text/chart/image/divider/progress widgets, dynamic fallbacks, mobile width");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  server.close();
});
