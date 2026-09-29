const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

const base = process.env.OPERATOR_DISPLAY_DEV_URL || "http://127.0.0.1:3004";

(async () => {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome", headless: true,
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1600,
      height: 950 } });
    await context.route("**/operator_display/system/userInfo", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body:
        JSON.stringify({ id: 7, username: "builder-test", isSystemAdmin: true,
          groupMemberships: [] }) }));
    const page = await context.newPage();
    assert.equal((await page.goto(`${base}/workbench`))?.status(), 200);
    const palette = page.getByRole("button", { name: "Add Custom widget" });
    await palette.waitFor();
    await palette.focus();
    await page.keyboard.press("Enter");
    const editSource = page.locator(".t--edit-custom-widget-source");
    await editSource.waitFor();
    assert.match(await editSource.textContent(), /Edit source/);
    const [popup] = await Promise.all([
      page.waitForEvent("popup"), editSource.click(),
    ]);
    assert.match(popup.url(), /\/workbench\/builder/);
    const builder = popup.getByTestId("custom-widget-builder");
    await builder.waitFor();
    await builder.getByRole("tab", { name: "JS" }).click();
    const jsEditor = builder.getByTestId("custom-builder-js-editor");
    await jsEditor.locator(".CodeMirror").click();
    await popup.keyboard.press("ControlOrMeta+A");
    await popup.keyboard.type('appsmith.onReady(() => { document.getElementById("root").textContent = "Workbench source saved"; });');
    await popup.frameLocator('iframe[title^="Custom"]').locator("#root")
      .getByText("Workbench source saved").waitFor();
    await page.frameLocator('iframe[title^="Custom"]').locator("#root")
      .getByText("Workbench source saved").waitFor();
    await page.bringToFront();
    await page.keyboard.press("Escape");
    await popup.locator(".od-custom-builder__connection-lost").waitFor();
    await page.getByRole("button", { name: "Outline", exact: true }).click();
    await page.locator(".od-workbench__outline-item").filter({ hasText: "Custom1" })
      .click();
    await popup.locator(".od-custom-builder__connection-lost")
      .waitFor({ state: "hidden" });
    await Promise.all([
      popup.waitForEvent("close"),
      builder.getByRole("button", { name: "Close" })
        .evaluate((button) => button.click()),
    ]);
    await editSource.getByText(/Edit source/).waitFor();
    const [reopened] = await Promise.all([
      page.waitForEvent("popup"), editSource.click(),
    ]);
    const reopenedBuilder = reopened.getByTestId("custom-widget-builder");
    await reopenedBuilder.waitFor();
    await reopenedBuilder.getByRole("tab", { name: "JS" }).click();
    assert.match(await reopenedBuilder.getByTestId("custom-builder-js-editor")
      .locator(".CodeMirror-code").textContent(), /Workbench source saved/);
    console.log("Workbench Custom Edit source, popup bridge, and paired source save passed");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
