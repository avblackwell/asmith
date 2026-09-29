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

    const add = async (name, type) => {
      await page.getByRole("button", { name: `Add ${name} widget` }).press("Enter");
      const host = page.locator(`.od-workbench__artboard .od-read-only-canvas__widget--${type}`);
      await expect(host).toHaveCount(1);
      return host;
    };

    const date = await add("Date Picker", "date-picker-widget2");
    await expect(date.locator('[data-testid="native-special-input"]')).toHaveCount(1);
    await expect(page.locator('[data-property-name="defaultDate"] input')).not.toHaveValue("");

    const phone = await add("Phone Input", "phone-input-widget");
    await expect(phone.locator('[data-testid="native-special-input"]')).toHaveCount(1);
    await expect(page.locator('[data-property-name="defaultDialCode"]')).toHaveCount(1);

    const currency = await add("Currency Input", "currency-input-widget");
    await expect(currency.locator('[data-testid="native-special-input"]')).toHaveCount(1);
    await expect(page.locator('[data-property-name="defaultCurrencyCode"]')).toHaveCount(1);

    const iframe = await add("Iframe", "iframe-widget");
    await expect(iframe.locator('[data-native-widget="iframe"] iframe')).toHaveCount(1);
    await page.locator('[data-property-name="srcDoc"] input').fill("<p>Operator guide</p>");
    await page.locator('[data-property-name="srcDoc"] input').blur();
    await expect(iframe.locator('iframe[srcdoc="<p>Operator guide</p>"]')).toHaveCount(1);

    const map = await add("Map", "map-widget");
    await expect(map.locator('[data-map-state="missing-key"]')).toHaveCount(1);
    await expect(page.locator('[data-property-name="mapCenter"] input')).toBeDisabled();

    const chart = await add("Map Chart", "map-chart-widget");
    await expect(chart.locator('[data-native-widget="map-chart"]')).toHaveCount(1);
    await expect(chart.locator("svg")).toHaveCount(1, { timeout: 15000 });
    await page.locator('[data-property-name="mapTitle"] input').fill("Pump regions");
    await page.locator('[data-property-name="mapTitle"] input').blur();
    await expect(chart.getByText("Pump regions")).toHaveCount(1);

    const card = await add("Card", "card-widget");
    await expect(card.locator('[data-native-widget="card"]')).toHaveCount(1);
    const form = await add("Form", "form-widget");
    await expect(form.locator('.od-read-only-canvas__widget--canvas-widget')).toHaveCount(1);

    const rich = await add("Rich Text Editor", "rich-text-editor-widget");
    await expect(rich.locator('[data-testid="rte-container"]')).toHaveCount(1, { timeout: 15000 });
    await expect(page.locator('[data-property-name="defaultText"] textarea'))
      .toHaveValue("This is the initial <b>content</b> of the editor");

    const jsonForm = await add("JSON Form", "json-form-widget");
    await expect(jsonForm.locator('[data-testid="native-json-form"]')).toHaveCount(1);
    await page.locator('[data-property-name="sourceData"] textarea')
      .fill('{"pump":"Ready","pressure":12}');
    await page.locator('[data-property-name="sourceData"] textarea').blur();
    await expect(jsonForm.getByText("Pump")).toHaveCount(1);
    const shortFormHeight = await jsonForm.evaluate((element) =>
      element.getBoundingClientRect().height);
    const manyFields = Object.fromEntries([
      ["pump", "Ready"],
      ...Array.from({ length: 14 }, (_, index) => [`field${index + 1}`, index]),
    ]);
    await page.locator('[data-property-name="sourceData"] textarea')
      .fill(JSON.stringify(manyFields));
    await page.locator('[data-property-name="sourceData"] textarea').blur();
    await expect.poll(async () => jsonForm.evaluate((element) =>
      element.getBoundingClientRect().height)).toBeGreaterThan(shortFormHeight);

    const menu = await add("Menu Button", "menu-button-widget");
    await expect(menu.locator('[data-testid^="native-menu-button-"]')).toHaveCount(1);
    const tree = await add("TreeSelect", "single-select-tree-widget");
    await expect(tree.locator('[data-testid="treeselect-container"]')).toHaveCount(1);
    const multiTree = await add("Multi TreeSelect", "multi-select-tree-widget");
    await expect(multiTree.locator('[data-testid="multitreeselect-container"]')).toHaveCount(1);

    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByRole("button", { name: "Preview dashboard" }).click();
    await expect(date.locator('[data-testid="native-special-input"]')).toHaveCount(1);
    await expect(chart.locator("svg")).toHaveCount(1, { timeout: 15000 });
    await expect(jsonForm.getByText("Pump")).toHaveCount(1);
    await expect(tree.locator('[data-testid="treeselect-container"]')).toHaveCount(1);
    await card.scrollIntoViewIfNeeded();
    const cardView = card.locator('[data-native-widget="card"]');
    await expect(cardView.locator('[data-card-zone="footer"] .bp3-button')).toHaveCount(2);
    await expect(cardView.locator('[data-card-zone="menu"] .bp3-icon')).toHaveCount(1);
    await cardView.getByRole("button", { name: "Card actions menu" }).click();
    await expect(page.locator(".bp3-popover2-content").getByText("First menu item"))
      .toBeVisible();
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(chart.locator("svg")).toHaveCount(1, { timeout: 15000 });
    await expect(jsonForm.getByText("Pump")).toHaveCount(1);
    assert.deepEqual(errors, []);
    console.log("Expanded widget add, Card Blueprint controls, JSON Form Auto Height, preview, and reload checks passed");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
