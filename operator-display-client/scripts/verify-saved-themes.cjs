const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = process.env.OPERATOR_DISPLAY_DEV_URL || "http://127.0.0.1:3004";

(async () => {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/workspace`);
    await page.getByRole("button", { name: "New dashboard" }).click();
    await page.waitForURL(/\/workbench\?draftId=dashboard-/);
    await page.getByRole("button", { name: "Widgets", exact: true }).click();
    await page.locator("#widget-card-draggable-buttonwidget").press("Enter");
    const liveButton = page.locator('[data-native-button-control="button"] button').first();
    await expect(liveButton).toBeVisible();

    await page.getByRole("button", { name: "App settings" }).click();
    await page.locator(".od-app-settings__section").filter({ hasText: "Theme" }).click();
    await page.locator(".od-theme-card").first().hover();
    await page.locator(".t--change-theme-btn").click();
    await page.getByTestId("t--featured-themes").getByTestId("t--theme-card-Pacific").click();
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByTestId("theme-primaryColor").click();
    await page.getByRole("button", { name: "blue 500 #3b82f6" }).click();
    await expect.poll(() => liveButton.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe("rgb(59, 130, 246)");

    await page.getByRole("button", { name: "Theme actions" }).click();
    await page.getByRole("menuitem", { name: "Save theme" }).click();
    const saveDialog = page.getByRole("dialog", { name: "Save theme" });
    await expect(saveDialog).toBeVisible();
    await saveDialog.getByLabel("Theme name").fill("Shift blue");
    await saveDialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(saveDialog).toBeHidden();
    await page.locator(".od-theme-card").first().hover();
    await page.locator(".t--change-theme-btn").click();
    const savedList = page.getByTestId("t--saved-themes");
    await expect(savedList.getByText("Shift blue")).toBeVisible();
    await expect(savedList.locator(".t--theme-card")).toHaveCount(1);
    const screenshot = path.join(os.tmpdir(), "operator-display-saved-theme-selector.png");
    await page.screenshot({ path: screenshot, fullPage: true });

    await page.getByTestId("t--featured-themes").getByTestId("t--theme-card-Default-New").click();
    await expect.poll(() => liveButton.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe("rgb(59, 130, 246)");
    await savedList.getByRole("button", { name: "Apply Shift blue theme" }).click();
    await expect.poll(() => liveButton.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe("rgb(59, 130, 246)");
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.reload();
    await page.getByRole("button", { name: "App settings" }).click();
    await page.locator(".od-app-settings__section").filter({ hasText: "Theme" }).click();
    await page.locator(".od-theme-card").first().hover();
    await page.locator(".t--change-theme-btn").click();
    await expect(page.getByTestId("t--saved-themes").getByText("Shift blue")).toBeVisible();
    await expect(page.getByText("Shift blue", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Delete Shift blue theme" }).click();
    const deleteDialog = page.getByRole("dialog", { name: "Delete Shift blue theme" });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: "No" }).click();
    await expect(page.getByTestId("t--saved-themes").getByText("Shift blue")).toBeVisible();
    await page.getByRole("button", { name: "Delete Shift blue theme" }).click();
    await deleteDialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByTestId("t--saved-themes")).toHaveCount(0);
    await expect.poll(() => liveButton.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe("rgb(59, 130, 246)");
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.locator(".od-theme-editor__header").getByLabel("Shift blue theme"))
      .toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "App settings" }).click();
    await page.locator(".od-app-settings__section").filter({ hasText: "Theme" }).click();
    await expect(page.locator(".od-theme-editor__header").getByLabel("Shift blue theme"))
      .toBeVisible();
    await page.locator(".od-theme-card").first().hover();
    await page.locator(".t--change-theme-btn").click();
    await expect(page.getByTestId("t--saved-themes")).toHaveCount(0);
    await expect(page.getByTestId("t--featured-themes").locator(".t--theme-card")).toHaveCount(8);
    assert.deepEqual(errors, []);
    console.log(`Saved theme browser smoke passed: save, list, apply, reload, confirm delete; screenshot: ${screenshot}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
