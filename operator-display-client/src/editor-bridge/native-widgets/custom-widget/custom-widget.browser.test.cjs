const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

const base = process.env.OPERATOR_DISPLAY_DEV_URL || "http://127.0.0.1:3004";
const path = "/src/editor-bridge/native-widgets/custom-widget/browser-harness.html";

(async () => {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome", headless: true,
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    assert.equal((await page.goto(`${base}${path}`))?.status(), 200);
    const host = page.getByTestId("custom-host");
    const iframe = host.locator("iframe");
    await iframe.waitFor();
    assert.equal(await iframe.getAttribute("sandbox"),
      "allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-scripts");
    const frame = page.frameLocator('iframe[title="Custom1"]');
    await frame.locator("#value").getByText("1").waitFor();
    assert.equal(await frame.locator("#root").evaluate(() => window.__mountCount), 1);
    assert.equal(await host.getByTestId("iframe-overlay").count(), 1);
    await page.locator("#select-widget").click();
    assert.equal(await host.getByTestId("iframe-overlay").count(), 0);
    await frame.locator("#update").click();
    await page.getByTestId("meta").getByText(/"count":2/).waitFor();
    await frame.locator("#value").getByText("2").waitFor();
    assert.equal(await frame.locator("#root").evaluate(() => window.__mountCount), 1);
    await page.evaluate(() => window.postMessage({
      type: "CUSTOM_WIDGET_UPDATE_MODEL", data: { count: 99 }, key: 123,
    }, "*"));
    assert.match(await page.getByTestId("meta").textContent(), /"count":2/);
    await frame.locator("#event").click();
    await page.getByTestId("event").getByText("onPing:iframe").waitFor();
    await page.locator("#change-width").click();
    await frame.locator("#dimensions").getByText("492").waitFor();
    await page.locator("#change-theme").click();
    await frame.locator("#theme").getByText("#cc2200").waitFor();
    assert.equal(await frame.locator("#root").evaluate(() => window.__mountCount), 1);
    await page.locator("#change-default").click();
    await frame.locator("#value").getByText("2").waitFor();
    const autoHost = page.getByTestId("custom-auto-host");
    const autoFrame = autoHost.locator('iframe[title="CustomAuto"]');
    await page.waitForFunction(() => {
      const iframe = document.querySelector('[data-testid="custom-auto-host"] iframe');
      return iframe && iframe.getBoundingClientRect().height === 180;
    });
    const autoGeometry = await autoHost.evaluate((element) => ({
      host: element.getBoundingClientRect().height,
      outer: element.querySelector('[data-native-widget="custom"]').getBoundingClientRect().height,
      iframe: element.querySelector('iframe').getBoundingClientRect().height,
    }));
    assert.equal(await autoFrame.count(), 1);
    assert.equal(autoGeometry.iframe, 180);
    assert.ok(autoGeometry.outer < autoGeometry.host,
      `Auto-height Custom should expose intrinsic iframe height: ${JSON.stringify(autoGeometry)}`);
    assert.deepEqual(errors, []);
    console.log("Custom widget sandbox, bridge, meta, editor, UI and theme browser behavior passed");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
