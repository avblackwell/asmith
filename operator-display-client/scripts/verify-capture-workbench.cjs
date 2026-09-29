const assert = require("node:assert/strict");
const { chromium, expect } = require("@playwright/test");

const base = process.env.OPERATOR_DISPLAY_DEV_URL || "http://127.0.0.1:3004";

(async () => {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
    headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  try {
    const context = await browser.newContext({ permissions: ["camera", "microphone"] });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    assert.equal((await page.goto(`${base}/workspace`))?.status(), 200);
    await page.getByRole("button", { name: "New dashboard" }).click();
    await page.waitForURL(/\/workbench\?draftId=dashboard-/);
    await page.getByRole("button", { name: "Widgets", exact: true }).click();

    const widgets = [
      ["File Picker", "file-picker-widget-v2", "file-picker"],
      ["Audio Recorder", "audio-recorder-widget", "audio-recorder"],
      ["Camera", "camera-widget", "camera"],
      ["Code Scanner", "code-scanner-widget", "code-scanner"],
    ];
    for (const [name, type, marker] of widgets) {
      await page.getByRole("button", { name: `Add ${name} widget` }).press("Enter");
      const widget = page.locator(`.od-workbench__artboard .od-read-only-canvas__widget--${type}`);
      await expect(widget.locator(`[data-native-widget="${marker}"]`)).toHaveCount(1);
    }
    await expect(page.locator('[data-property-name="scannerLayout"]')).toHaveCount(1);
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByRole("button", { name: "Preview dashboard" }).click();
    for (const [, type, marker] of widgets) {
      await expect(page.locator(`.od-workbench__artboard .od-read-only-canvas__widget--${type}`)
        .locator(`[data-native-widget="${marker}"]`)).toHaveCount(1);
    }
    await page.reload();
    await expect(page.locator('.od-workbench__artboard [data-native-widget="file-picker"]'))
      .toHaveCount(1);
    assert.deepEqual(errors, []);
    console.log("Capture/upload widget add, property, preview, and reload checks passed");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
