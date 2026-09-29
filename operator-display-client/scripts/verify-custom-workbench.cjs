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

    await page.getByRole("button", { name: "Add Custom widget" }).press("Enter");
    const custom = page.locator(
      ".od-workbench__artboard .od-read-only-canvas__widget--custom-widget",
    );
    await expect(custom).toHaveCount(1);
    await expect(custom.locator("iframe")).toHaveCount(1);
    await expect(page.locator('[data-property-name="defaultModel"]')).toHaveCount(1);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(custom).toHaveCount(0);
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(custom).toHaveCount(1);
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.reload();
    await expect(custom).toHaveCount(1);
    await expect(custom.locator("iframe")).toHaveCount(1);
    await page.getByRole("button", { name: "Preview dashboard" }).click();
    await expect(custom).toHaveCount(1);
    assert.deepEqual(errors, []);
    console.log("Custom widget add, undo, redo, save, reload, and preview passed");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
