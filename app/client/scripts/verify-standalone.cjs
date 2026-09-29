/* Run against a local webpack dev server serving /standalone. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const baseUrl = process.env.STANDALONE_URL || "http://127.0.0.1:3002";
const appsmithPath = /^\/(api|v1|rts|oauth2|login|logout|user)(?:\/|$)/;

async function main() {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
    headless: true,
  });

  try {
    const page = await browser.newPage();
    const appsmithRequests = [];
    const pageErrors = [];
    const consoleErrors = [];

    page.on("request", (request) => {
      const url = new URL(request.url());

      if (appsmithPath.test(url.pathname)) {
        appsmithRequests.push(request.url());
      }
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto(`${baseUrl}/standalone`, { waitUntil: "domcontentloaded" });
    const title = page.getByRole("textbox", { name: "Title text" });
    const canvas = page.getByTestId("t--canvas-artboard");

    try {
      await title.waitFor({ timeout: 30_000 });
    } catch (error) {
      const screenshot = path.join(
        os.tmpdir(),
        "asmith-standalone-failure.png",
      );

      await page.screenshot({ path: screenshot, fullPage: true });
      process.stderr.write(`Screenshot: ${screenshot}\n`);
      process.stderr.write(`Page errors: ${JSON.stringify(pageErrors)}\n`);
      process.stderr.write(
        `Console errors: ${JSON.stringify(consoleErrors)}\n`,
      );
      process.stderr.write(
        `Body: ${(await page.locator("body").innerText()).slice(0, 3000)}\n`,
      );
      process.stderr.write(
        `Appsmith requests: ${JSON.stringify(appsmithRequests)}\n`,
      );
      throw error;
    }
    await canvas.waitFor();
    await canvas.getByText("Engine overview").waitFor();
    await canvas.locator("#engine-speed-chart").waitFor();
    await page.evaluate(async () => {
      try {
        await fetch("/api/v1/users/me");
      } catch {
        // The standalone guard must reject this request before network dispatch.
      }
    });
    await page
      .getByRole("status")
      .getByText(/Appsmith API requests blocked: 1/)
      .waitFor();
    const properties = page.locator('aside[aria-label="Widget properties"]');

    await properties.waitFor();
    await properties.getByRole("button", { name: "Select title" }).click();
    await properties.getByText("EngineTitle").waitFor();
    const textEditor = properties.locator(".CodeMirror").first();

    await textEditor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("Verified local title");
    await page.waitForFunction(
      () =>
        document.querySelector('input[aria-label="Title text"]')?.value ===
        "Verified local title",
    );
    await page.getByRole("button", { name: "Save local draft" }).click();
    await page
      .getByRole("status")
      .getByText(/Saved locally as revision 1/)
      .waitFor();
    await page.reload({ waitUntil: "domcontentloaded" });
    await title.waitFor({ timeout: 90_000 });
    assert.equal(await title.inputValue(), "Verified local title");
    await canvas.getByText("Verified local title").waitFor();
    await page
      .getByRole("status")
      .getByText(/Local draft revision 1 loaded/)
      .waitFor();

    await title.fill("Second local title");
    await canvas.getByText("Second local title").waitFor();
    await page.getByTestId("t--standalone-save").click();
    await page
      .getByRole("status")
      .getByText(/Saved locally as revision 2/)
      .waitFor();
    await page.getByTestId("t--workbench-nav-tools").click();
    await page.getByTestId("t--standalone-history").locator("summary").click();
    await page.getByTestId("t--standalone-restore-1").click();
    await page
      .getByRole("status")
      .getByText(/Restored revision 1 as new local revision 3/)
      .waitFor();
    assert.equal(await title.inputValue(), "Verified local title");

    await title.fill("Exported unsaved title");
    await canvas.getByText("Exported unsaved title").waitFor();
    const downloadPromise = page.waitForEvent("download");

    await page.getByTestId("t--standalone-export").click();
    const download = await downloadPromise;
    const exported = JSON.parse(
      await fs.readFile(await download.path(), "utf8"),
    );

    assert.equal(
      exported.layout.dsl.children.find(
        (widget) => widget.widgetId === "engine-title",
      ).text,
      "Exported unsaved title",
    );
    const unsupported = structuredClone(exported);

    unsupported.layout.dsl.children.find(
      (widget) => widget.widgetId === "engine-title",
    ).onClick = "{{GetReadings.run()}}";
    await page.getByTestId("t--standalone-import").setInputFiles({
      name: "unsupported-action.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(unsupported)),
    });
    await page
      .getByRole("alert")
      .getByText(/Import failed/)
      .waitFor();
    assert.match(
      await page.getByRole("alert").innerText(),
      /Appsmith event handlers are unavailable/,
    );
    assert.equal(await title.inputValue(), "Exported unsaved title");

    exported.documentId = "imported-smoke-document";
    exported.name = "Imported smoke";
    exported.layout.dsl.children.find(
      (widget) => widget.widgetId === "engine-title",
    ).text = "Imported from JSON";
    await page.getByTestId("t--standalone-import").setInputFiles({
      name: "imported-smoke-document.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(exported)),
    });
    await page
      .getByRole("status")
      .getByText(/Imported imported-smoke-document.json/)
      .waitFor();
    assert.equal(await title.inputValue(), "Imported from JSON");
    await canvas.getByText("Imported from JSON").waitFor();
    await page.getByTestId("t--standalone-save").click();
    await page
      .getByRole("status")
      .getByText(/Saved locally as revision 1/)
      .waitFor();
    await page.reload({ waitUntil: "domcontentloaded" });
    await title.waitFor({ timeout: 90_000 });
    assert.equal(await title.inputValue(), "Imported from JSON");
    await canvas.getByText("Imported from JSON").waitFor();
    await page
      .getByRole("status")
      .getByText(/Local draft revision 1 loaded/)
      .waitFor();
    assert.deepEqual(
      appsmithRequests,
      [],
      "Appsmith API network requests were sent",
    );
    assert.deepEqual(
      pageErrors,
      [],
      "The standalone page raised browser errors",
    );

    if (process.env.STANDALONE_SCREENSHOT) {
      await page.screenshot({
        path: process.env.STANDALONE_SCREENSHOT,
        fullPage: true,
      });
    }

    process.stdout.write(
      "Standalone edit/history/export/import/reload checks passed\n",
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
