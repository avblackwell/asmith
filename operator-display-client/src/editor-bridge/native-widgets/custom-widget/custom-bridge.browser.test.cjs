const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

const base = process.env.OPERATOR_DISPLAY_DEV_URL || "http://127.0.0.1:3004";

(async () => {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome", headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    assert.equal((await page.goto(`${base}/src/editor-bridge/native-widgets/custom-widget/bridge-parent-harness.html`))?.status(), 200);
    const [popup] = await Promise.all([
      page.waitForEvent("popup"), page.locator("#open").click(),
    ]);
    await popup.getByTestId("custom-widget-builder").waitFor();
    const frame = popup.frameLocator('iframe[title="Custom1"]');
    await frame.locator("#marker").getByText("Bridge model").waitFor();
    await popup.getByTestId("custom-builder-html-editor").locator(".CodeMirror").click();
    await popup.keyboard.press("ControlOrMeta+A");
    await popup.keyboard.type('<h1 id="marker">Edited</h1>');
    await frame.locator("h1#marker").getByText("Bridge model").waitFor();
    await page.locator("#message").getByText(/UPDATE_SRCDOC/).waitFor();
    assert.match(await page.locator("#message").textContent(), /uncompiledSrcDoc/);
    await page.locator("#pause").click();
    await popup.locator(".od-custom-builder__connection-lost").waitFor();
    await page.locator("#resume").click();
    await popup.locator(".od-custom-builder__connection-lost").waitFor({ state: "hidden" });
    console.log("Custom builder popup READY, source save, PAUSE and RESUME passed");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
