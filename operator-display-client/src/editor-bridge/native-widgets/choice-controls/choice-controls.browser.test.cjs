const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

const base = process.env.OPERATOR_DISPLAY_DEV_URL || "http://127.0.0.1:3004";
const path = "/src/editor-bridge/native-widgets/choice-controls/browser-harness.html";

(async () => {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome", headless: true,
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    assert.equal((await page.goto(`${base}${path}`))?.status(), 200);
    const select = page.getByTestId("select-host");
    assert.equal(await select.locator(".select-button .bp3-button-text").textContent(), "Green");
    await select.locator("button.select-button").click();
    assert.equal(await page.getByTestId("select-popover").getByRole("option").count(), 3);
    await page.getByTestId("select-popover").getByRole("option", { name: "Red" }).click();
    assert.deepEqual(JSON.parse(await page.getByTestId("select-meta").textContent()),
      { value: "RED", label: "Red", isDirty: true });
    assert.equal(await page.getByTestId("select-popover").count(), 0);
    await select.getByTestId("selectbutton.btn.cancel").click();
    assert.equal(await select.locator(".select-button .bp3-button-text").textContent(), "Select option");
    await select.locator("button.select-button").click();
    await page.getByTestId("select-popover").getByRole("textbox", { name: "Filter options" }).fill("blue");
    assert.equal(await page.getByTestId("select-popover").getByRole("option").count(), 1);
    assert.equal(await page.getByTestId("select-popover").getByRole("option").textContent(), "Blue");
    await page.keyboard.press("Escape");

    const multi = page.getByTestId("multi-host");
    assert.equal(await multi.locator(".rc-select-selection-item").count(), 2);
    await multi.locator(".rc-select-selector").click();
    const multiPopup = page.getByTestId("multiselect-popover");
    assert.equal(await multiPopup.getByRole("option").count(), 3);
    await multiPopup.getByRole("option", { name: "Blue" }).click();
    assert.equal(await multi.locator(".rc-select-selection-item").count(), 3);
    assert.equal((JSON.parse(await page.getByTestId("multi-meta").textContent())).isDirty, true);
    await multiPopup.getByRole("button", { name: "Select all" }).click();
    assert.equal(await multi.locator(".rc-select-selection-item").count(), 0);
    await multiPopup.getByRole("button", { name: "Select all" }).click();
    assert.equal(await multi.locator(".rc-select-selection-item").count(), 3);
    await multiPopup.getByRole("textbox", { name: "Filter options" }).press("Escape");
    assert.equal(await page.getByTestId("multiselect-popover").count(), 0);

    const checkbox = page.getByTestId("checkbox-host");
    assert.equal(await checkbox.locator("label.bp3-checkbox").count(), 3);
    assert.equal(await checkbox.locator("input[value=BLUE]").isChecked(), true);
    await checkbox.locator("label.bp3-checkbox", { has: page.locator("input[value=GREEN]") }).click();
    assert.equal(await checkbox.locator("input[value=GREEN]").isChecked(), true);
    assert.equal((JSON.parse(await page.getByTestId("checkbox-meta").textContent())).isDirty, true);
    await checkbox.locator("label.bp3-checkbox").first().click();
    assert.equal(await checkbox.locator("input[value=BLUE]").isChecked(), false);
    assert.equal(await checkbox.locator("input[value=GREEN]").isChecked(), false);

    const switches = page.getByTestId("switch-host");
    assert.equal(await switches.locator("label.bp3-switch.bp3-align-right").count(), 2);
    assert.equal(await switches.locator("input[value=A]").isChecked(), true);
    await switches.locator("label.bp3-switch", { has: page.locator("input[value=B]") }).click();
    assert.equal(await switches.locator("input[value=B]").isChecked(), true);
    assert.deepEqual((JSON.parse(await page.getByTestId("switch-meta").textContent())).selectedValuesArray, ["A", "B"]);

    const disabled = page.getByTestId("disabled-host");
    assert.equal(await disabled.locator("button.select-button").isDisabled(), true);
    assert.deepEqual(errors, []);
    console.log("Choice widget default, options, meta, filter, select-all, disabled, and Blueprint DOM checks passed");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
