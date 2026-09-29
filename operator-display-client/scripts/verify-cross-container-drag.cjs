// Focused reproduction for a widget dragged from a Container to the root canvas.
// Run after `node scripts/vite.cjs build` with `node scripts/verify-cross-container-drag.cjs`.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const dist = path.resolve(__dirname, "../dist");
const repeats = Number(process.env.CROSS_CONTAINER_REPEATS || 20);
const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/operator_display/system/userInfo") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      id: 1,
      username: "operator@example.com",
      isSystemAdmin: false,
      groupMemberships: [],
    }));
    return;
  }
  const file = path.resolve(dist, `.${url.pathname}`);
  if (file.startsWith(`${dist}${path.sep}`) && fs.existsSync(file) &&
      fs.statSync(file).isFile()) {
    response.writeHead(200, {
      "Content-Type": {
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
      }[path.extname(file)] || "application/octet-stream",
    });
    fs.createReadStream(file).pipe(response);
    return;
  }
  response.writeHead(200, { "Content-Type": "text/html" });
  fs.createReadStream(path.join(dist, "index.html")).pipe(response);
});

async function dragPaletteTo(page, card, target, x, y) {
  await card.scrollIntoViewIfNeeded();
  const sourceBox = await card.boundingBox();
  const targetBox = await target.boundingBox();
  assert.ok(sourceBox && targetBox);
  await page.mouse.move(sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + x, targetBox.y + y, { steps: 12 });
  await page.mouse.up();
}

async function dragHandle(page, handle, deltaX, deltaY) {
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  assert.ok(box);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX, y + deltaY, { steps: 5 });
  await page.mouse.up();
}

async function diagnostics(page, body, innerCanvas, canvasId) {
  return {
    body: await body.boundingBox(),
    innerCanvas: await innerCanvas.boundingBox(),
    rootCanvas: await page.locator('[data-widget-id="0"]').boundingBox(),
    viewport: await page.locator(".od-workbench__viewport").evaluate((node) => ({
      scrollTop: node.scrollTop,
      scrollLeft: node.scrollLeft,
      box: node.getBoundingClientRect().toJSON(),
    })),
    dragLayers: await page.locator(".drag-layer[data-drop-canvas-id]")
      .evaluateAll((nodes) => nodes.map((node) => ({
        id: node.getAttribute("data-drop-canvas-id"),
        box: node.getBoundingClientRect().toJSON(),
      }))),
    preview: await page.getByTestId(`canvas-dragging-${canvasId}`)
      .evaluateAll((nodes) => nodes.map((node) => ({
        valid: node.getAttribute("data-drag-preview-valid"),
        box: node.getBoundingClientRect().toJSON(),
      }))),
    errors: await page.locator(".od-workbench__preview-error").allTextContents(),
  };
}

async function main() {
  assert.ok(fs.existsSync(path.join(dist, "index.html")), "Build the frontend first");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome", headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    await page.goto(`http://127.0.0.1:${port}/workspace`);
    await page.getByRole("button", { name: "New dashboard" }).click();
    await page.waitForURL(/\/workbench\?draftId=dashboard-/);
    await page.getByRole("button", { name: "Widgets", exact: true }).click();
    await page.getByRole("button", { name: "Add Container widget" }).press("Enter");
    const createdContainer = page.locator(
      ".od-workbench__artboard .od-read-only-canvas__widget--container-widget");
    await createdContainer.waitFor();
    const containerId = await createdContainer.getAttribute("data-widget-id");
    const innerCanvasId = `${containerId}-canvas`;
    const innerCanvas = page.locator(`[data-widget-id="${innerCanvasId}"]`);
    await innerCanvas.waitFor();
    const beforeIds = new Set(await page.locator(".od-workbench__artboard [data-widget-id]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-widget-id"))));
    await dragPaletteTo(page,
      page.getByRole("button", { name: "Add Text widget" }), innerCanvas, 40, 60);
    const afterIds = new Set(await page.locator(".od-workbench__artboard [data-widget-id]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-widget-id"))));
    const [textId] = [...afterIds].filter((id) => id && !beforeIds.has(id));
    assert.ok(textId, "Nested Text was not created");
    const body = page.locator(`[data-widget-id="${textId}"]`);
    await body.waitFor();
    const textName = await body.getAttribute("data-widget-name");
    assert.ok(textName);
    await page.locator('[data-property-name="dynamicHeight"] select').selectOption("FIXED");
    await page.getByRole("tab", { name: "Style" }).click();
    await dragHandle(page, page.getByRole("button", { name: `Move ${textName}` }), 39, 20);
    await dragHandle(page,
      page.getByRole("button", { name: `Resize ${textName} from bottomRight` }), -39, 20);
    const viewport = page.locator(".od-workbench__viewport");
    const viewportScrollBefore = await viewport.evaluate((node) => node.scrollTop);
    const viewportBox = await viewport.boundingBox();
    const moveBox = await page.getByRole("button", { name: `Move ${textName}` }).boundingBox();
    assert.ok(viewportBox && moveBox);
    const moveX = moveBox.x + moveBox.width / 2;
    const moveY = moveBox.y + moveBox.height / 2;
    await page.mouse.move(moveX, moveY);
    await page.mouse.down();
    await page.mouse.move(moveX, viewportBox.y + viewportBox.height - 8, { steps: 12 });
    await page.waitForFunction((before) =>
      document.querySelector(".od-workbench__viewport")?.scrollTop > before,
    viewportScrollBefore, { timeout: 5000 });
    await page.mouse.up();
    await expect(innerCanvas.locator(`[data-widget-id="${textId}"]`)).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(innerCanvas.locator(`[data-widget-id="${textId}"]`)).toHaveCount(1);
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 2").waitFor();
    const draftUrl = page.url();
    // generateDragStateForFixedLayout measures the grip from the inner widget
    // bounds and bounds it in source grid units. On a canvas jump,
    // getRelativeStartPoints re-applies those units using destination spacing.
    await page.goto(draftUrl);
    await expect(innerCanvas.locator(`[data-widget-id="${textId}"]`)).toHaveCount(1);
    await body.click();
    const badge = page.getByRole("button", { name: `Move ${textName}` });
    await badge.scrollIntoViewIfNeeded();
    const [badgeBox, sourceBox, sourceCanvasBox, rootCanvasBox] = await Promise.all([
      badge.boundingBox(), body.boundingBox(), innerCanvas.boundingBox(),
      page.locator('[data-widget-id="0"]').boundingBox(),
    ]);
    assert.ok(badgeBox && sourceBox && sourceCanvasBox && rootCanvasBox);
    const sourceColumnSpace = (sourceCanvasBox.width - 20) / 64;
    const rootColumnSpace = (rootCanvasBox.width - 12) / 64;
    assert.notEqual(sourceColumnSpace, rootColumnSpace,
      "source and destination must have different column spacing");
    const badgeStart = { x: badgeBox.x + badgeBox.width / 2,
      y: badgeBox.y + badgeBox.height / 2 };
    const gripColumns = Math.min(Math.max(
      (badgeStart.x - sourceBox.x - 4) / sourceColumnSpace, 0),
    sourceBox.width / sourceColumnSpace - 1);
    const gripRows = Math.min(Math.max((badgeStart.y - sourceBox.y - 4) / 10, 0),
      sourceBox.height / 10 - 1);
    assert.equal(gripRows, 0, "the name badge starts above the body");
    const badgeEnd = { x: rootCanvasBox.x + 450, y: rootCanvasBox.y + 400 };
    await page.mouse.move(badgeStart.x, badgeStart.y);
    await page.mouse.down();
    await page.mouse.move(badgeEnd.x, badgeEnd.y, { steps: 12 });
    await expect(page.getByTestId("canvas-dragging-0"))
      .toHaveAttribute("data-drag-preview-valid", "true");
    await page.mouse.up();
    await expect(innerCanvas.locator(`[data-widget-id="${textId}"]`)).toHaveCount(0);
    const rootMovedBox = await body.boundingBox();
    assert.ok(rootMovedBox);
    const expectedColumn = Math.round(
      (badgeEnd.x - rootCanvasBox.x - 12) / rootColumnSpace - gripColumns);
    const expectedRow = Math.round((badgeEnd.y - rootCanvasBox.y - 12) / 10 - gripRows);
    assert.ok(Math.abs(rootMovedBox.x - rootCanvasBox.x -
      (expectedColumn * rootColumnSpace + 6)) < 1,
    `badge drag must re-snap its bounded grip in root columns: ${JSON.stringify({
      expectedColumn, rootMovedBox, rootCanvasBox, gripColumns,
    })}`);
    assert.ok(Math.abs(rootMovedBox.y - rootCanvasBox.y -
      (expectedRow * 10 + 6)) < 1,
    `badge drag must re-snap its bounded grip in root rows: ${JSON.stringify({
      expectedRow, rootMovedBox, rootCanvasBox, gripRows,
    })}`);
    console.log("badge grip: bounded in nested grid, re-snapped in root grid");
    let failures = 0;

    for (let iteration = 1; iteration <= repeats; iteration += 1) {
      await page.goto(draftUrl);
      await expect(innerCanvas.locator(`[data-widget-id="${textId}"]`)).toHaveCount(1);
      if (iteration === 4) {
        await page.locator(".od-workbench__viewport").evaluate((node) => {
          node.scrollTop = 140;
        });
      }
      await body.scrollIntoViewIfNeeded();
      const edgeScrollBefore = iteration === 4
        ? await page.locator(".od-workbench__viewport").evaluate((node) => node.scrollTop)
        : null;
      if (iteration === 4) assert.ok(edgeScrollBefore >= 120,
        "top-edge auto-scroll starts with the dragged widget still visible");
      const bodyBox = await body.boundingBox();
      const rootBox = await page.locator('[data-widget-id="0"]').boundingBox();
      assert.ok(bodyBox && rootBox);
      // Appsmith enables edge handles for a focused widget. This Text is only
      // three nested columns wide, so its edge hit areas cover its body.
      // Move it by WidgetNameLayer's drag grip instead.
      await page.mouse.move(bodyBox.x + bodyBox.width / 2,
        bodyBox.y + bodyBox.height / 2);
      const moveBadge = page.getByRole("button", { name: `Move ${textName}` });
      await moveBadge.waitFor();
      const moveBadgeBox = await moveBadge.boundingBox();
      assert.ok(moveBadgeBox);
      const start = { x: moveBadgeBox.x + moveBadgeBox.width / 2,
        y: moveBadgeBox.y + moveBadgeBox.height / 2 };
      const end = { x: rootBox.x + 700,
        y: iteration === 4 ? viewportBox.y + 8 : start.y };
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 12 });
      const beforeDrop = await diagnostics(page, body, innerCanvas, "0");
      if (iteration !== 4) assert.equal(beforeDrop.preview[0]?.valid, "true",
        `iteration ${iteration} must have a valid root preview before release: ${JSON.stringify({
          start, end, body: beforeDrop.body, root: beforeDrop.rootCanvas,
          layers: beforeDrop.dragLayers, preview: beforeDrop.preview,
        })}`);
      if (iteration === 3) {
        await page.mouse.move(10, start.y, { steps: 8 });
        await expect(page.getByTestId("canvas-dragging-0"))
          .toHaveAttribute("data-drag-preview-valid", "none");
        await page.mouse.up();
        await expect(innerCanvas.locator(`[data-widget-id="${textId}"]`)).toHaveCount(1);
        console.log("iteration 3: explicit pointer move outside canvas cancelled drop");
        continue;
      }
      // FixedCanvasDraggingArena commits the last drawn rectangle on release.
      // Its scroll listener recalculates that rectangle, and arena exit clears
      // it before release.
      if (iteration === 1) {
        await page.evaluate(() => {
          const host = document.querySelector(".od-editable-canvas");
          if (!host) throw new Error("Editable canvas host missing");
          const marker = document.createElement("div");
          marker.dataset.nativeWidget = "list-v2";
          marker.style.display = "none";
          host.append(marker);
          window.__crossContainerHitProbe = {
            marker,
            original: document.elementsFromPoint.bind(document),
          };
          document.elementsFromPoint = () => [marker];
        });
      } else if (iteration === 2) {
        const scrollBefore = beforeDrop.viewport.scrollTop;
        await page.locator(".od-workbench__viewport").evaluate((node) => {
          node.scrollTop += 40;
        });
        await page.waitForFunction((before) =>
          document.querySelector(".od-workbench__viewport")?.scrollTop > before,
        scrollBefore, { timeout: 1000 });
        await page.waitForTimeout(120);
        const afterScroll = await diagnostics(page, body, innerCanvas, "0");
        assert.equal(afterScroll.preview[0]?.valid, "true",
          "root preview must remain valid after scrolling while drag is held");
        console.log(`iteration 2: viewport scrolled ${scrollBefore} → ${afterScroll.viewport.scrollTop}`);
      } else if (iteration === 4) {
        await page.waitForFunction((before) =>
          document.querySelector(".od-workbench__viewport")?.scrollTop < before,
        edgeScrollBefore, { timeout: 1500 });
        const afterAutoScroll = await diagnostics(page, body, innerCanvas, "0");
        assert.notEqual(afterAutoScroll.preview[0]?.valid, "true",
          "top-edge auto-scroll must recalculate and invalidate the former root preview");
        console.log(`iteration 4: top-edge auto-scroll ${beforeDrop.viewport.scrollTop}` +
          ` → ${afterAutoScroll.viewport.scrollTop}, pointer y=${start.y}`);
      }
      await page.mouse.up();
      if (iteration === 1) {
        await page.evaluate(() => {
          const probe = window.__crossContainerHitProbe;
          document.elementsFromPoint = probe.original;
          probe.marker.remove();
          delete window.__crossContainerHitProbe;
        });
      }
      await page.waitForTimeout(150);
      const stillNested = await innerCanvas.locator(`[data-widget-id="${textId}"]`).count();
      if (iteration === 4) {
        assert.equal(stillNested, 1,
          "mouse release after auto-scroll invalidates the preview must cancel the move");
        console.log("iteration 4: auto-scroll invalidation cancelled drop");
        continue;
      }
      if (stillNested) {
        failures += 1;
        console.error(JSON.stringify({ iteration, result: "still nested", start, end,
          beforeDrop, afterDrop: await diagnostics(page, body, innerCanvas, "0"),
          pageErrors }, null, 2));
      } else {
        console.log(`iteration ${iteration}: moved to root`);
      }
    }
    console.log(`Cross-container drag: ${failures}/${repeats} failed`);
    assert.equal(failures, 0);
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
