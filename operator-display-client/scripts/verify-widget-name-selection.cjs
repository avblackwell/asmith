/* Focused Fixed WidgetNameLayer gesture probe against the local workbench. */
const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

async function run() {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
    headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto("http://127.0.0.1:3004/workspace");
    await page.getByRole("button", { name: "New dashboard" }).click();
    await page.waitForURL(/\/workbench\?draftId=dashboard-/);
    await page.getByRole("button", { name: "Add Text widget" }).press("Enter");
    await page.getByRole("button", { name: "Add Chart widget" }).press("Enter");
    const chart = page.locator('.od-workbench__artboard [data-widget-name^="Chart"]').first();
    const textWidget = page.locator('.od-workbench__artboard [data-widget-name^="Text"]').first();
    await textWidget.click();
    await chart.hover();
    const name = await chart.getAttribute("data-widget-name");
    const badge = page.getByRole("button", { name: `Move ${name}` });
    await badge.waitFor();
    const box = await badge.boundingBox();
    const hit = box && await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return { hit: element?.outerHTML.slice(0, 220) };
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await badge.click();
    const selected = await page.locator('[data-widget-id]').evaluateAll((elements) =>
      elements.filter((element) => element.classList.contains('od-read-only-canvas__widget--selected'))
        .map((element) => element.getAttribute('data-widget-name')));
    assert.ok(selected.includes(name), "Clicking the hovered name badge must select the widget");
    console.log(JSON.stringify({ box, hit, selected,
      chartBadgeCount: await badge.count() }));
    await page.close();
  } finally { await browser.close(); }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
