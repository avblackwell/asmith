const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

const base = process.env.OPERATOR_DISPLAY_DEV_URL || "http://127.0.0.1:3004";
const path = "/src/editor-bridge/native-widgets/custom-widget/builder-harness.html";

(async () => {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome", headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    assert.equal((await page.goto(`${base}${path}`))?.status(), 200);
    const builder = page.getByTestId("custom-widget-builder");
    await builder.waitFor();
    const frame = page.frameLocator('iframe[title="Custom1"]');
    await frame.locator("#marker").getByText("Original model").waitFor();
    assert.equal(await builder.locator(".CodeMirror").count(), 3);
    assert.equal(await builder.getByRole("tab", { name: "HTML" }).count(), 1);
    assert.equal(await builder.getByRole("tab", { name: "Style" }).count(), 1);
    assert.equal(await builder.getByRole("tab", { name: "JS" }).count(), 1);
    assert.equal(await builder.getByTestId("custom-builder-references").count(), 1);
    const html = builder.getByTestId("custom-builder-html-editor");
    await html.locator(".CodeMirror").click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type('<h1 id="marker">Original</h1>');
    await frame.locator("h1#marker").getByText("Original model").waitFor();
    assert.match(await page.getByTestId("builder-patch").textContent(), /uncompiledSrcDoc/);

    await builder.getByRole("tab", { name: "Style" }).click();
    const style = builder.getByTestId("custom-builder-css-editor");
    await style.locator(".CodeMirror").click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("#marker { color: rgb(255, 0, 0); }");
    await page.waitForFunction(() => {
      const iframe = document.querySelector('iframe[title="Custom1"]');
      return iframe instanceof HTMLIFrameElement && iframe.contentWindow;
    });
    await frame.locator("#marker").getByText("Original model").waitFor();
    assert.equal(await frame.locator("#marker").evaluate((element) =>
      getComputedStyle(element).color), "rgb(255, 0, 0)");

    await builder.getByRole("tab", { name: "JS" }).click();
    const js = builder.getByTestId("custom-builder-js-editor");
    await js.locator(".CodeMirror").click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type('appsmith.onReady(() => { document.getElementById("marker").textContent = "JS saved"; });');
    await frame.locator("#marker").getByText("JS saved").waitFor();
    // Appsmith recompiles each keystroke, so intermediate incomplete JS can
    // briefly throw while a test types. The final compiled source must render.
    assert.equal(await frame.locator("#marker").textContent(), "JS saved");
    console.log("Custom builder ADS tabs, CodeMirror, live compile and iframe preview passed");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
