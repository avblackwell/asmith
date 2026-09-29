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
    await page.getByRole("button", { name: "Add Table widget" }).press("Enter");
    const table = page.locator(".od-workbench__artboard [data-table-kind=TABLE_WIDGET_V2]");
    await expect(table).toHaveCount(1);
    const tableData = page.locator('[data-property-name="tableData"] textarea');
    await tableData.fill('[{"name":"Ada","rpm":1200},{"name":"Ben","rpm":900}]');
    await tableData.blur();
    await expect(table.locator("tbody tr[data-table-row]")).toHaveCount(2);
    await expect(table.locator("th")).toHaveCount(2);
    await expect(table.locator("tbody")).toContainText("Ada");
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByText("Local draft · revision 2").waitFor();
    await page.reload();
    await expect(table.locator("tbody tr[data-table-row]")).toHaveCount(2);
    await page.getByRole("button", { name: "Select Table" }).click();
    await expect(page.locator('[data-property-name="tableData"] textarea'))
      .toHaveValue(/"Ada"/);
    await page.getByRole("button", { name: "Preview dashboard" }).click();
    await table.getByRole("searchbox", { name: "Search table" }).fill("Ben");
    await expect(table.locator("tbody tr[data-table-row]")).toHaveCount(1);
    await expect(table.locator("tbody")).toContainText("Ben");
    await expect(table.locator("tbody")).not.toContainText("Ada");
    assert.deepEqual(errors, []);
    console.log("TableV2 workbench data, render, and client search checks passed");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
