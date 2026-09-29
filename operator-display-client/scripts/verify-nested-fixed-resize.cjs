/* Run against the local Vite workbench: node scripts/verify-nested-fixed-resize.cjs */
const assert = require("node:assert/strict");
const { chromium, expect } = require("@playwright/test");

const origin = process.env.WORKBENCH_ORIGIN || "http://127.0.0.1:3004";

async function draftFor(page, documentId) {
  return page.evaluate(async (id) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("operator-display-drafts", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const key = JSON.stringify([`${location.origin}/operator_display`, "1", id]);
    const draft = await new Promise((resolve, reject) => {
      const request = database.transaction("drafts", "readonly")
        .objectStore("drafts").get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return draft;
  }, documentId);
}

async function main() {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    await page.goto(`${origin}/workspace`);
    await page.getByRole("button", { name: "New dashboard" }).click();
    await page.waitForURL(/\/workbench\?draftId=dashboard-/);
    const documentId = new URL(page.url()).searchParams.get("draftId");
    assert.ok(documentId);
    await page.getByRole("button", { name: "Widgets", exact: true }).click();
    await page.getByRole("button", { name: "Add Container widget" }).press("Enter");
    const container = page.locator(
      ".od-workbench__artboard .od-read-only-canvas__widget--container-widget",
    );
    await container.waitFor();
    const containerId = await container.getAttribute("data-widget-id");
    assert.ok(containerId);
    const innerCanvasId = `${containerId}-canvas`;
    const innerCanvas = page.locator(`[data-widget-id="${innerCanvasId}"]`);
    await innerCanvas.waitFor();
    assert.equal(await container.locator(`[data-live-resize-wrapper="${containerId}"]`)
      .evaluate((element) => element.style.height), "auto",
    "Appsmith uses auto-height ResizeWrapper for canvas-owning Containers");
    const freshHeightChain = await container.evaluate((element) => {
      const wrapper = element.querySelector("[data-live-resize-wrapper]");
      const surface = element.querySelector("[data-native-widget=container]");
      const canvas = element.querySelector("[data-widget-id$=canvas]");
      return { wrapper: wrapper?.getBoundingClientRect().height,
        surface: surface?.getBoundingClientRect().height,
        canvas: canvas?.getBoundingClientRect().height,
        canvasPosition: canvas ? getComputedStyle(canvas).position : null };
    });
    assert.ok(freshHeightChain.wrapper >= 90 && freshHeightChain.surface >= 90 &&
      freshHeightChain.canvas >= 90 && freshHeightChain.canvasPosition === "relative",
    `Appsmith's in-flow DropTarget holds open a fresh Auto Height Container: ${JSON.stringify(freshHeightChain)}`);
    await page.locator('[data-property-name="dynamicHeight"] select')
      .selectOption("FIXED");

    const before = new Set(await page.locator(".od-workbench__artboard [data-widget-id]")
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-widget-id"))));
    const card = page.getByRole("button", { name: "Add Text widget" });
    const source = await card.boundingBox();
    const target = await innerCanvas.boundingBox();
    assert.ok(source && target);
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + 40, target.y + 42, { steps: 12 });
    await page.mouse.up();
    await page.waitForFunction((ids) => {
      const elements = [...document.querySelectorAll(".od-workbench__artboard [data-widget-id]")];
      return elements.some((element) => !ids.includes(element.getAttribute("data-widget-id")));
    }, [...before]);
    const after = await page.locator(".od-workbench__artboard [data-widget-id]")
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-widget-id")));
    const textId = after.find((id) => id && !before.has(id));
    assert.ok(textId);
    const text = innerCanvas.locator(`[data-widget-id="${textId}"]`);
    await text.waitFor();
    const textName = await text.getAttribute("data-widget-name");
    assert.ok(textName);
    assert.notEqual(await text.locator(`[data-live-resize-wrapper="${textId}"]`)
      .evaluate((element) => element.style.height), "auto",
    "Appsmith leaves Text ResizeWrapper at its grid height in Auto Height mode");
    await page.locator('[data-property-name="dynamicHeight"] select')
      .selectOption("FIXED");
    await page.getByRole("tab", { name: "Style" }).click();
    const oldHeight = Number(await page.getByLabel("Height").inputValue());
    const oldCanvasHeight = await innerCanvas.evaluate((element) =>
      element.getBoundingClientRect().height);
    const handle = page.getByRole("button", {
      name: `Resize ${textName} from bottomRight`,
    });
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    assert.ok(box);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 140, { steps: 8 });
    await expect.poll(() => innerCanvas.evaluate((element) =>
      element.getBoundingClientRect().height)).toBeGreaterThan(oldCanvasHeight);
    const live = await page.evaluate(({ textId, innerCanvasId }) => ({
      innerHeight: document.querySelector(`[data-widget-id="${innerCanvasId}"]`)
        ?.getBoundingClientRect().height,
      wrapper: document.querySelector(`[data-live-resize-wrapper="${textId}"]`)
        ?.getBoundingClientRect().height,
    }), { textId, innerCanvasId });
    assert.ok(live.wrapper && live.wrapper > oldHeight * 10,
      `the widget content wrapper grows during drag: ${JSON.stringify(live)}`);
    await page.mouse.up();
    const finalHeight = Number(await page.getByLabel("Height").inputValue());
    assert.ok(finalHeight > oldHeight);
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 2").waitFor();
    const saved = await draftFor(page, documentId);
    const savedContainer = saved.document.layout.dsl.children.find((item) =>
      item.widgetId === containerId);
    const savedCanvas = savedContainer?.children?.find((item) =>
      item.widgetId === innerCanvasId);
    const savedText = savedCanvas?.children?.find((item) => item.widgetId === textId);
    assert.ok(savedText && savedCanvas);
    assert.equal(savedContainer.shouldScrollContents, true);
    assert.equal(savedText.bottomRow - savedText.topRow, finalHeight);
    assert.equal(savedCanvas.bottomRow, (savedText.bottomRow + 2) * 10);
    const releasedCanvasHeight = await innerCanvas.evaluate((element) =>
      element.getBoundingClientRect().height);
    assert.equal(releasedCanvasHeight, savedCanvas.bottomRow - 10,
      "Container renders its authored child canvas bottomRow through getCanvasSnapRows");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByLabel("Height")).toHaveValue(String(oldHeight));
    assert.deepEqual(pageErrors, []);
    console.log("Nested Fixed live resize, saved canvas extension, and undo passed");
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
