const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

const base = process.env.OPERATOR_DISPLAY_DEV_URL || "http://127.0.0.1:3004";
const path = "/src/editor-bridge/native-widgets/map-embed/browser-harness.html";

(async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome", headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(`${base}${path}`);
    assert.equal(response?.status(), 200);

    const chart = page.getByTestId("map-chart-host").locator('[data-native-widget="map-chart"]');
    await chart.waitFor();
    await page.waitForFunction(() => document.querySelector('[data-native-widget="map-chart"] svg path'));
    assert.equal(await chart.locator("svg path").count() > 0, true);
    assert.equal(await chart.getByText("Map chart unavailable").count(), 0);
    assert.equal(await chart.locator("svg text").filter({ hasText: "Global Population" }).count() > 0, true);

    assert.equal(await page.getByTestId("missing-key-host").getByText("Map Widget disabled").count(), 1);
    const iframe = page.getByTestId("iframe-host").locator("iframe");
    await iframe.waitFor();
    assert.match(await iframe.getAttribute("sandbox"), /allow-scripts/);
    assert.equal(await page.getByTestId("iframe-host").locator('[data-iframe-editor-overlay="true"]').count(), 1);
    await page.waitForFunction(() => document.querySelector('[data-testid="messages"]')?.textContent?.includes("ready from iframe"));
    await page.getByRole("button", { name: "Update iframe" }).click();
    assert.match(await iframe.getAttribute("srcdoc"), /Updated iframe/);

    await page.getByRole("button", { name: "USA map" }).click();
    await page.waitForFunction(() => document.querySelector('[data-native-widget="map-chart"] svg')?.textContent?.includes("Global Population"));
    assert.equal(await chart.getByText("Map chart unavailable").count(), 0);
    assert.deepEqual(errors, []);
    console.log("Iframe, Map, and Map Chart browser contracts passed");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
