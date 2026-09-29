const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

const base = process.env.OPERATOR_DISPLAY_DEV_URL || "http://127.0.0.1:3004";
const path = "/src/editor-bridge/native-widgets/capture-upload/browser-harness.html";

(async () => {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome", headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  try {
    const page = await browser.newPage({ permissions: ["camera", "microphone"] });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(`${base}${path}`);
    assert.equal(response?.status(), 200);
    const csvRows = await page.evaluate(async () => {
      const parser = await import("/src/editor-bridge/native-widgets/capture-upload/FileParser.ts");
      return parser.default(new Blob(["name,age\nAlex,30"], { type: "text/csv" }),
        "Array", "text/csv", "csv", false);
    });
    assert.equal(csvRows[0].name, "Alex");

    const picker = page.getByTestId("file-host");
    await picker.locator('[data-native-widget="file-picker"]').waitFor();
    assert.equal(await picker.getByRole("button").textContent(), "Select Files");
    await picker.getByRole("button").click();
    await page.locator(".uppy-Dashboard-inner").waitFor();
    const fileInput = page.locator('.uppy-Dashboard input[type="file"]').first();
    await fileInput.setInputFiles({ name: "example.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await page.waitForFunction(() => document.querySelector('[data-testid="file-count"]')?.textContent === "1");
    assert.equal(await picker.getByRole("button").textContent(), "1 files selected");
    assert.equal(await page.getByTestId("file-data").textContent(), "hello");
    await page.locator(".uppy-StatusBar-actionBtn--upload").click();
    await page.waitForFunction(() => document.querySelector('[data-testid="file-events"]')?.textContent === "1");
    await page.locator(".uppy-Dashboard--modal").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Remount picker" }).click();
    assert.equal(await picker.getByRole("button").textContent(), "1 files selected");
    await picker.getByRole("button").click();
    await page.locator(".uppy-Dashboard-inner").waitFor();
    assert.equal(await page.locator(".uppy-Dashboard-Item").count(), 1);
    await page.locator(".uppy-Dashboard-close").click();

    const audio = page.getByTestId("audio-host");
    await audio.locator('[data-native-widget="audio-recorder"]').waitFor();
    await audio.getByRole("button", { name: "Press to get permission" }).click();
    await audio.getByText("Press to start recording").waitFor();
    await audio.getByRole("button", { name: "Press to start recording" }).click();
    await audio.getByText("Recording...").waitFor();
    assert.equal(await page.getByTestId("audio-dirty").textContent(), "true");
    await audio.locator('button[title="stop"]').click();
    await audio.getByText("Recording complete").waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid="audio-data"]')?.textContent === "true");

    const camera = page.getByTestId("camera-host");
    await camera.locator('[data-native-widget="camera"]').waitFor();
    await camera.locator("video").first().waitFor();
    await camera.getByRole("button", { name: "Capture image" }).click();
    await camera.locator('[data-capture-status="IMAGE_CAPTURED"]').waitFor();
    assert.equal(await page.getByTestId("camera-image").textContent(), "true");
    await camera.getByRole("button", { name: "Save image" }).click();
    await camera.locator('[data-capture-status="IMAGE_SAVED"]').waitFor();

    const video = page.getByTestId("video-host");
    await video.locator('[data-native-widget="camera"]').waitFor();
    await video.getByRole("button", { name: "Start recording" }).click();
    await video.locator('[data-capture-status="VIDEO_RECORDING"]').waitFor();
    await video.getByRole("button", { name: "Stop recording" }).click();
    await video.locator('[data-capture-status="VIDEO_CAPTURED"]').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid="video-data"]')?.textContent === "true");
    await video.getByRole("button", { name: "Save video" }).click();
    await video.locator('[data-capture-status="VIDEO_SAVED"]').waitFor();

    await page.getByTestId("scanner-host").getByRole("button", { name: "Scan a QR/Barcode" }).click();
    await page.locator(".od-capture-scanner-modal").waitFor();
    await page.getByRole("button", { name: "Close scanner" }).click();
    assert.equal(await page.locator(".od-capture-scanner-modal").count(), 0);
    assert.deepEqual(errors, []);
    console.log("Capture and upload browser interactions passed");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
