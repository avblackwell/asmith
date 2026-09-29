/* Browser check for the frontend-only Appsmith-style dashboard workbench. */
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const baseUrl = process.env.STANDALONE_URL || "http://127.0.0.1:3002";
const appsmithPath = /^\/(api|v1|rts|oauth2|login|logout|user)(?:\/|$)/;

async function main() {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
    headless: true,
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    const pageErrors = [];
    const appsmithRequests = [];

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => {
      const url = new URL(request.url());

      if (appsmithPath.test(url.pathname)) appsmithRequests.push(request.url());
    });

    await page.goto(`${baseUrl}/standalone`, {
      waitUntil: "domcontentloaded",
    });

    // The header operates on a local document and exposes no backend-only
    // Appsmith or marketplace action in the standalone fixture.
    try {
      await page
        .getByRole("textbox", { name: "Dashboard name" })
        .waitFor({ timeout: 30_000 });
    } catch (error) {
      process.stderr.write(`Page errors: ${JSON.stringify(pageErrors)}\n`);
      process.stderr.write(
        `Body: ${(await page.locator("body").innerText()).slice(0, 2000)}\n`,
      );
      throw error;
    }
    assert.equal(
      await page.getByRole("textbox", { name: "Dashboard name" }).inputValue(),
      "Engine overview",
    );
    assert.equal(
      await page.getByRole("textbox", { name: "Title text" }).inputValue(),
      "Engine overview",
    );
    await page.getByTestId("t--standalone-save").waitFor();
    await page.getByTestId("t--standalone-export").waitFor();
    await page.getByTestId("t--standalone-import").waitFor();
    assert.equal(await page.getByRole("button", { name: "Run" }).count(), 0);
    await page.getByTestId("t--canvas-artboard").waitFor();

    const widgetsNav = page.getByTestId("t--workbench-nav-widgets");
    const outlineNav = page.getByTestId("t--workbench-nav-outline");
    const toolsNav = page.getByTestId("t--workbench-nav-tools");
    const palette = page.getByRole("region", { name: "Add display widgets" });

    assert.equal(await widgetsNav.getAttribute("aria-pressed"), "true");
    await palette.waitFor();

    for (const type of ["text", "chart", "container"]) {
      await page.getByTestId(`t--palette-add-${type}`).waitFor();
      await palette
        .locator(`.t--widget-card-draggable-${type}widget`)
        .waitFor();
    }

    const scrollArea = page.getByTestId("t--canvas-scroll-area");
    const scrollRight = page.getByTestId("t--canvas-scroll-right");
    const scrollLeft = page.getByTestId("t--canvas-scroll-left");

    await page.waitForFunction(() => {
      const area = document.querySelector(
        '[data-testid="t--canvas-scroll-area"]',
      );
      const button = document.querySelector(
        '[data-testid="t--canvas-scroll-right"]',
      );

      return area && area.scrollWidth > area.clientWidth && !button?.disabled;
    });
    await scrollRight.click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="t--canvas-scroll-area"]')
          ?.scrollLeft > 0,
    );
    assert.ok((await scrollArea.evaluate((element) => element.scrollLeft)) > 0);
    await scrollLeft.click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="t--canvas-scroll-area"]')
          ?.scrollLeft < 1,
    );

    const resizer = page.getByTestId("t--workbench-explorer-resizer");

    await resizer.focus();
    assert.equal(await resizer.getAttribute("aria-valuenow"), "320");
    await resizer.press("ArrowRight");
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="t--workbench-explorer-resizer"]')
          ?.getAttribute("aria-valuenow") === "330",
    );
    await resizer.press("ArrowLeft");
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="t--workbench-explorer-resizer"]')
          ?.getAttribute("aria-valuenow") === "320",
    );

    const resizerBox = await resizer.boundingBox();

    assert.ok(resizerBox, "explorer resize handle should be visible");
    const dragStartX = resizerBox.x + resizerBox.width / 2;
    const dragY = resizerBox.y + 120;

    await page.mouse.move(dragStartX, dragY);
    await page.mouse.down();
    await page.mouse.move(dragStartX + 50, dragY, { steps: 5 });
    await page.mouse.up();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="t--workbench-explorer-resizer"]')
          ?.getAttribute("aria-valuenow") === "370",
    );
    assert.ok(
      (await page.locator(".standalone-editor__palette").boundingBox()).width >=
        369,
      "explorer should grow after pointer drag",
    );
    await page.getByTestId("t--canvas-artboard").waitFor();
    await page.locator('aside[aria-label="Widget properties"]').waitFor();

    const screenshot = path.join(os.tmpdir(), "asmith-workbench-shell.png");

    await page.screenshot({ path: screenshot, fullPage: false });

    await outlineNav.click();
    assert.equal(await outlineNav.getAttribute("aria-pressed"), "true");
    assert.equal(await palette.isVisible(), false);

    const outline = page.getByRole("region", { name: "Widget outline" });

    await outline.waitFor();
    for (const widgetId of [
      "engine-title",
      "engine-speed-card",
      "engine-speed-value",
      "engine-speed-chart",
    ]) {
      await page.getByTestId(`t--widget-outline-${widgetId}`).waitFor();
    }
    assert.equal(
      await page.getByTestId("t--widget-outline-0").count(),
      0,
      "root canvas should not appear in the widget outline",
    );
    assert.equal(
      await page
        .getByTestId("t--widget-outline-engine-speed-card-canvas")
        .count(),
      0,
      "internal container canvas should not appear in the widget outline",
    );
    const nestedUnderCard = await page.evaluate(() => {
      const parent = document.querySelector(
        '[data-testid="t--widget-outline-engine-speed-card"]',
      );
      const child = document.querySelector(
        '[data-testid="t--widget-outline-engine-speed-value"]',
      );

      return Boolean(
        parent?.closest('[role="treeitem"]')?.parentElement?.contains(child),
      );
    });

    assert.equal(
      nestedUnderCard,
      true,
      "value should nest beneath its container",
    );

    await outline
      .getByRole("textbox", { name: "Search widgets" })
      .fill("EngineSpeedValue");
    await page.getByTestId("t--widget-outline-engine-speed-value").waitFor();
    assert.equal(
      await page.getByTestId("t--widget-outline-engine-speed-chart").count(),
      0,
    );
    await page.getByTestId("t--widget-outline-engine-speed-value").click();
    await page
      .locator('aside[aria-label="Widget properties"] .t--propertypane')
      .getByText("EngineSpeedValue")
      .waitFor();

    await outline
      .getByRole("textbox", { name: "Search widgets" })
      .fill("chart");
    await page.getByTestId("t--widget-outline-engine-speed-chart").click();
    await page
      .locator('aside[aria-label="Widget properties"] .t--propertypane')
      .getByText("EngineSpeedChart")
      .waitFor();

    await page.getByTestId("t--standalone-save").click();
    await page
      .getByRole("status")
      .getByText(/Saved locally as revision 1/)
      .waitFor();
    await page
      .getByRole("textbox", { name: "Dashboard name" })
      .fill("Workbench shell check");
    await page.getByTestId("t--standalone-save").click();
    await page
      .getByRole("status")
      .getByText(/Saved locally as revision 2/)
      .waitFor();

    await toolsNav.click();
    assert.equal(await toolsNav.getAttribute("aria-pressed"), "true");
    const tools = page.getByRole("region", { name: "Dashboard tools" });

    await tools.waitFor();
    await tools
      .getByTestId("t--standalone-history")
      .getByText("Local history (1)")
      .waitFor();

    await widgetsNav.click();
    assert.equal(await widgetsNav.getAttribute("aria-pressed"), "true");
    await palette.waitFor();
    assert.equal(await outline.isVisible(), false);
    assert.deepEqual(appsmithRequests, []);
    assert.deepEqual(pageErrors, []);
    process.stdout.write(
      `Workbench shell browser check passed. Screenshot: ${screenshot}\n`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
