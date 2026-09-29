const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

const base = process.env.OPERATOR_DISPLAY_DEV_URL || "http://127.0.0.1:3004";
const path = "/src/editor-bridge/native-widgets/special-inputs/browser-harness.html";

(async () => {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome", headless: true,
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    assert.equal((await page.goto(`${base}${path}`))?.status(), 200);

    const date = page.getByTestId("date-host");
    assert.equal(await date.locator(".bp3-popover-wrapper.od-special-input__date-control input.bp3-input").count(), 1);
    assert.equal(await date.locator("input.bp3-input").inputValue(), "2025-06-15");
    await date.locator("input.bp3-input").click();
    assert.equal(await page.locator(".bp3-datepicker").count(), 1);
    assert.equal(await page.locator(".bp3-datepicker-month-select select").inputValue(), "5");
    assert.equal(await page.locator(".bp3-datepicker-year-select select").inputValue(), "2025");
    assert.equal(await page.locator(".DayPicker-Weekday").count() > 0, true);
    await page.getByRole("gridcell", { name: "Fri Jun 20 2025" }).click();
    assert.equal(await date.locator("input.bp3-input").inputValue(), "2025-06-20");
    assert.match(await page.getByTestId("date-meta").textContent(), /"value":"2025-06-20T/);
    assert.match(await page.getByTestId("date-meta").textContent(), /"isDirty":true/);

    const phone = page.getByTestId("phone-host");
    assert.equal(await phone.locator("input[type=tel]").count(), 1);
    assert.equal(await phone.locator(".isd-change-dropdown-trigger").count(), 1);
    await phone.locator("input[type=tel]").fill("2025550123");
    assert.equal(await phone.locator("input[type=tel]").inputValue(), "(202) 555-0123");
    assert.match(await page.getByTestId("phone-meta").textContent(), /"value":"2025550123"/);
    await phone.locator(".isd-change-dropdown-trigger").click();
    assert.equal(await page.getByPlaceholder("Search by ISD code or country").count(), 1);
    await page.getByPlaceholder("Search by ISD code or country").fill("India");
    await page.getByRole("button", { name: "India (+91)" }).click();
    assert.match(await page.getByTestId("phone-meta").textContent(), /"dialCode":"\+91"/);

    const currency = page.getByTestId("currency-host");
    assert.equal(await currency.locator(".bp3-numeric-input input.bp3-input").count(), 1);
    assert.equal(await currency.locator(".currency-change-dropdown-trigger").count(), 1);
    assert.equal(await currency.locator("input.bp3-input").inputValue(), "100.50");
    await currency.locator("input.bp3-input").fill("1234.567");
    assert.equal(await currency.locator("input.bp3-input").inputValue(), "1234.56");
    await currency.locator("input.bp3-input").blur();
    assert.equal(await currency.locator("input.bp3-input").inputValue(), "1,234.56");
    await currency.locator(".currency-change-dropdown-trigger").click();
    await page.getByPlaceholder("Search by currency or country").fill("USD");
    await page.getByRole("button", { name: /USD - US Dollar/ }).first().click();
    assert.match(await page.getByTestId("currency-meta").textContent(), /"currencyCode":"USD"/);

    const editor = page.getByTestId("editor-phone-host");
    await editor.locator("input[type=tel]").fill("9999999999");
    assert.equal(await page.getByTestId("editor-meta").textContent(), "{}");
    assert.equal(await editor.locator("input[type=tel]").inputValue(), "(202) 555-0123");
    assert.deepEqual(errors, []);
    console.log("Date, phone, and currency Blueprint browser behavior passed");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
