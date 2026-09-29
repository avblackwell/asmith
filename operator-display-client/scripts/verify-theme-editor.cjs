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
    await page.locator("#widget-card-draggable-textwidget").press("Enter");
    const sampleText = page.locator('[data-testid^="native-text-"]').last();
    await expect(sampleText).toBeVisible();
    await page.getByTestId("t--binding-connect").click();
    await page.getByTestId("t--binding-variable-label").fill("Theme sample");
    await page.getByTestId("t--binding-selector-value").fill("theme.sample");
    await page.getByTestId("t--binding-unit-code").fill("16");
    await page.getByTestId("t--binding-save").click();
    await page.getByRole("button", { name: "Preview sample values" }).click();
    await expect(sampleText).toContainText("942.1");
    await page.getByRole("button", { name: "App settings" }).click();
    await page.locator(".od-app-settings__section").filter({ hasText: "Theme" }).click();
    await expect(page.getByText("Theme properties")).toBeVisible();
    await expect(sampleText).toContainText("942.1");
    await expect(page.getByLabel("Operations light theme")).toBeVisible();
    await expect(page.getByRole("button", { name: "Font", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("theme-primaryColor")).toBeVisible();

    await page.locator(".od-theme-card").first().hover();
    await page.locator(".t--change-theme-btn").click();
    const featured = page.getByTestId("t--featured-themes");
    await expect(featured.locator(".t--theme-card")).toHaveCount(8);
    await featured.getByTestId("t--theme-card-Pacific").click();
    await expect.poll(() => liveButton.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe("rgb(8, 145, 178)");
    await expect(sampleText).toContainText("942.1");
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByText("Theme properties")).toBeVisible();
    await page.locator(".od-theme-font-control .rc-select").click();
    await page.locator(".t--theme-font-dropdown .rc-select-item-option")
      .filter({ hasText: "Inter" }).click();
    await expect(page.locator(".od-theme-font-control .rc-select-selection-item")).toContainText("Inter");
    const borderSection = page.locator(".od-theme-editor__border-section")
      .filter({ has: page.getByRole("button", { name: "Border", exact: true }) });
    await borderSection.locator('[data-value="none"]').click();
    await expect(borderSection.locator('[data-value="none"]')).toHaveAttribute("data-selected", "true");
    const shadowSection = page.locator(".od-theme-editor__border-section")
      .filter({ has: page.getByRole("button", { name: "Shadow", exact: true }) });
    await shadowSection.locator('[data-value="S"]').click();
    await expect(shadowSection.locator('[data-value="S"]')).toHaveAttribute("data-selected", "true");
    await page.getByTestId("theme-primaryColor").click();
    await expect(page.getByTestId("t--all-colors")).toBeVisible();
    await expect(sampleText).toContainText("942.1");
    const colorInput = page.getByTestId("t--color-picker-input");
    const swatches = page.locator(".od-theme-color-picker__palette-color");
    await colorInput.focus();
    await page.keyboard.press("Tab");
    await expect(swatches.first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(swatches.nth(10)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("color-picker")).toBeHidden();
    await expect(colorInput).toBeFocused();
    await colorInput.click();
    await expect(page.getByTestId("t--all-colors")).toBeVisible();
    await liveButton.evaluate((element) => {
      window.__themeCanvasProbe = {
        artboard: element.closest(".od-workbench__artboard"),
        widget: element.closest("[data-widget-id]"),
        button: element,
        sampleText: [...document.querySelectorAll('[data-testid^="native-text-"]')].at(-1),
      };
    });
    await page.getByRole("button", { name: "blue 500 #3b82f6" }).click();
    await expect(page.getByTestId("t--color-picker-input")).toHaveValue("#3b82f6");
    await expect.poll(() => liveButton.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe("rgb(59, 130, 246)");
    assert.deepEqual(await liveButton.evaluate((element) => ({
      artboard: window.__themeCanvasProbe.artboard === element.closest(".od-workbench__artboard"),
      widget: window.__themeCanvasProbe.widget === element.closest("[data-widget-id]"),
      button: window.__themeCanvasProbe.button === element,
      sampleText: window.__themeCanvasProbe.sampleText === [...document.querySelectorAll('[data-testid^="native-text-"]')].at(-1),
      sampleValue: [...document.querySelectorAll('[data-testid^="native-text-"]')].at(-1)?.textContent?.includes("942.1"),
    })), { artboard: true, widget: true, button: true, sampleText: true, sampleValue: true });
    await page.getByRole("button", { name: "Theme actions" }).click();
    await page.getByRole("menuitem", { name: "Reset widget styles" }).click();
    await expect.poll(() => liveButton.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe("rgb(59, 130, 246)");
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.reload();
    await page.getByRole("button", { name: "App settings" }).click();
    await page.locator(".od-app-settings__section").filter({ hasText: "Theme" }).click();
    await expect(page.getByTestId("t--color-picker-input")).toHaveValue("#3b82f6");
    await expect(page.locator(".od-theme-font-control .rc-select-selection-item")).toContainText("Inter");
    await expect(page.locator(".od-theme-editor__border-section").filter({ has: page.getByRole("button", { name: "Border", exact: true }) }).locator('[data-value="none"]'))
      .toHaveAttribute("data-selected", "true");
    await expect(page.locator(".od-theme-editor__border-section").filter({ has: page.getByRole("button", { name: "Shadow", exact: true }) }).locator('[data-value="S"]'))
      .toHaveAttribute("data-selected", "true");

    const screenshot = path.join(os.tmpdir(), "operator-display-theme-editor-smoke.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    assert.deepEqual(errors, []);
    console.log(`Theme editor preset/color/save/reload browser smoke passed; screenshot: ${screenshot}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
