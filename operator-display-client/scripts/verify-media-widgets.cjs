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

    await page.getByRole("button", { name: "Add Audio widget" }).press("Enter");
    const audio = page.locator(".od-workbench__artboard .od-read-only-canvas__widget--audio-widget");
    await expect(audio).toHaveCount(1);
    await expect(audio.locator("audio[controls]")).toHaveCount(1);
    await expect(page.locator('[data-property-name="url"] input'))
      .toHaveValue("https://assets.appsmith.com/widgets/birds_chirping.mp3");

    await page.getByRole("button", { name: "Add Video widget" }).press("Enter");
    const video = page.locator(".od-workbench__artboard .od-read-only-canvas__widget--video-widget");
    await expect(video).toHaveCount(1);
    await expect(video.locator("video[controls]")).toHaveCount(1);
    await expect(page.locator('[data-property-name="url"] input'))
      .toHaveValue("https://assets.appsmith.com/widgets/bird.mp4");

    await page.getByRole("button", { name: "Add Document Viewer widget" }).press("Enter");
    const documentViewer = page.locator(
      ".od-workbench__artboard .od-read-only-canvas__widget--document-viewer-widget",
    );
    await expect(documentViewer).toHaveCount(1);
    await expect(documentViewer.locator('iframe[data-document-viewer="url"]')).toHaveCount(1);
    await expect(page.locator('[data-property-name="docUrl"] input'))
      .toHaveValue("https://www.learningcontainer.com/wp-content/uploads/2019/09/sample-pdf-file.pdf");

    await page.getByRole("button", { name: "Preview dashboard" }).click();
    await expect(audio.locator("audio[controls]")).toHaveCount(1);
    await expect(video.locator("video[controls]")).toHaveCount(1);
    await expect(documentViewer.locator("iframe")).toHaveCount(1);
    assert.deepEqual(errors, []);
    console.log("Audio/Video/Document Viewer workbench and preview checks passed");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
