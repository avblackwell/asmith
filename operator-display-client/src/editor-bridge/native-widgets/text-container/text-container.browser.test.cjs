const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

const base = process.env.OPERATOR_DISPLAY_DEV_URL || "http://127.0.0.1:3004";
const path = "/src/editor-bridge/native-widgets/text-container/browser-harness.html";

(async () => {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    const appsmithRequests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (/\/api\/v1\/|\/api\/v2\/|\/api\/cyflex\//.test(request.url())) {
        appsmithRequests.push(request.url());
      }
    });

    const response = await page.goto(`${base}${path}`);
    assert.equal(response?.status(), 200);
    const text = page.getByTestId("native-text-text-1");
    const container = page.getByTestId("native-container-container-1");
    await text.locator("strong").getByText("Motor speed").waitFor();
    assert.equal(await text.locator("a").getAttribute("href"), "http://status.example");
    assert.equal(await page.getByTestId("native-text-auto-link").locator("a").getAttribute("href"), "https://example.org/status");
    assert.equal(await container.evaluate((node) => getComputedStyle(node).backgroundColor), "rgb(243, 244, 245)");
    assert.equal(await text.locator(".bp3-ui-text").evaluate((node) => getComputedStyle(node).fontSize), "18px");
    await page.getByTestId("native-text-truncated").getByRole("button", { name: "Show more text" }).click();
    await page.getByRole("dialog", { name: "Full text" }).getByText("Fifth line").waitFor();
    await page.getByRole("button", { name: "Close full text" }).click();
    assert.equal(await page.getByRole("dialog", { name: "Full text" }).count(), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(appsmithRequests, []);
    console.log("Text and Container browser render passed");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
