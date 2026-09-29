const assert = require("node:assert/strict");
const { chromium, expect } = require("@playwright/test");

const base = process.env.OPERATOR_DISPLAY_DEV_URL || "http://127.0.0.1:3004";

(async () => {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    assert.equal((await page.goto(`${base}/workspace`))?.status(), 200);
    await page.getByRole("button", { name: "New dashboard" }).click();
    await page.waitForURL(/\/workbench\?draftId=dashboard-/);
    await page.getByRole("button", { name: "Widgets", exact: true }).click();

    await page.getByRole("button", { name: "Add Checkbox widget" }).press("Enter");
    const checkbox = page.locator(".od-workbench__artboard .od-read-only-canvas__widget--checkbox-widget");
    await expect(checkbox).toHaveCount(1);
    await expect(checkbox.locator("input[type=checkbox]")).toBeChecked();
    await page.locator('[data-property-name="label"] input').fill("Pump enabled");
    await page.locator('[data-property-name="label"] input').blur();
    await expect(checkbox.locator(".t--checkbox-widget-label")).toHaveText("Pump enabled");

    await page.getByRole("button", { name: "Add Switch widget" }).press("Enter");
    const toggle = page.locator(".od-workbench__artboard .od-read-only-canvas__widget--switch-widget");
    await expect(toggle).toHaveCount(1);
    await expect(toggle.locator("input[role=switch]")).toBeChecked();

    await page.getByRole("button", { name: "Preview dashboard" }).click();
    await checkbox.locator("label.bp3-control").click();
    await toggle.locator("label.bp3-control").click();
    await expect(checkbox.locator("input[type=checkbox]")).not.toBeChecked();
    await expect(toggle.locator("input[role=switch]")).not.toBeChecked();
    await page.getByRole("button", { name: "Return to editor" }).click();
    await page.getByRole("button", { name: "Preview dashboard" }).click();
    await expect(checkbox.locator("input[type=checkbox]")).not.toBeChecked();
    await expect(toggle.locator("input[role=switch]")).not.toBeChecked();
    assert.deepEqual(errors, []);
    console.log("Checkbox/Switch workbench add, property, and preview checks passed");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
