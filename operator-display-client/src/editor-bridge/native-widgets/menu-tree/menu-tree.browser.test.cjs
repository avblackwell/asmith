const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

const base = process.env.OPERATOR_DISPLAY_DEV_URL || "http://127.0.0.1:3004";
const harness = "/src/editor-bridge/native-widgets/menu-tree/browser-harness.html";

(async () => {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome", headless: true,
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    const requestErrors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") requestErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) requestErrors.push(`${response.status()} ${response.url()}`);
    });
    assert.equal((await page.goto(`${base}${harness}`))?.status(), 200);
    const menu = page.getByTestId("menu-host");
    await menu.locator(".od-menu-button__target").waitFor({ timeout: 5000 }).catch(() => {
      throw new Error(`Menu did not render: ${[...errors, ...requestErrors].join(" | ")}`);
    });
    assert.equal(await menu.locator(".od-menu-button__target").textContent(), "Open Menu");
    await menu.locator(".od-menu-button__target").click();
    const popup = page.locator(".od-menu-button__popover");
    assert.deepEqual(await popup.locator(".bp3-menu-item").allTextContents(), ["First", "Later"]);
    await popup.getByText("First").click();
    assert.equal(JSON.parse(await page.getByTestId("menu-action").textContent()).source, "runFirst");

    const single = page.getByTestId("single-host");
    assert.ok((await single.textContent()).includes("Blue"));
    await single.locator(".rc-tree-select-selector").click();
    const singlePopup = page.locator(".single-tree-select-dropdown");
    assert.equal((await singlePopup.locator(".rc-tree-select-tree-treenode").allTextContents()).filter(Boolean).length, 3);
    await singlePopup.locator(".rc-tree-select-tree-switcher").first().click();
    assert.equal((await singlePopup.locator(".rc-tree-select-tree-treenode").allTextContents()).filter(Boolean).length, 5);
    await singlePopup.getByText("Dark Blue").click();
    assert.equal(JSON.parse(await page.getByTestId("single-meta").textContent()).selectedOption, "DARK BLUE");

    const multi = page.getByTestId("multi-host");
    await multi.locator(".rc-tree-select-selector").click();
    const multiPopup = page.locator(".tree-multiselect-dropdown");
    await multiPopup.getByText("Red").click();
    assert.deepEqual(JSON.parse(await page.getByTestId("multi-meta").textContent()).selectedOptionValueArr,
      ["GREEN", "RED"]);
    assert.equal(await page.getByTestId("disabled-host").locator(".rc-tree-select-disabled").count(), 1);
    assert.equal(await page.getByTestId("editor-host").locator(".rc-tree-select-disabled").count(), 1);
    assert.deepEqual(errors, []);
    console.log("Menu/tree Blueprint and rc-tree-select default, order, expand, select, meta, disabled checks passed");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
