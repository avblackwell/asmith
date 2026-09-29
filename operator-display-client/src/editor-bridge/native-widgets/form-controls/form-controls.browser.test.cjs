const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

const base = process.env.OPERATOR_DISPLAY_DEV_URL || "http://127.0.0.1:3004";
const path = "/src/editor-bridge/native-widgets/form-controls/browser-harness.html";

(async () => {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    assert.equal((await page.goto(`${base}${path}`))?.status(), 200);
    const checkbox = page.getByTestId("checkbox-host");
    const checkboxControl = checkbox.locator("label.bp3-control.bp3-checkbox.bp3-align-right");
    assert.equal(await checkboxControl.count(), 1);
    assert.equal(await checkboxControl.locator(":scope > input + .bp3-control-indicator + .label-container").count(), 1);
    assert.equal(await checkbox.locator("input").isChecked(), false);
    assert.equal(await checkbox.locator("input").getAttribute("required"), "");
    await checkboxControl.click();
    assert.equal(await checkbox.locator("input").isChecked(), true);
    assert.equal(await checkbox.locator(".bp3-control-indicator").evaluate((node) =>
      getComputedStyle(node).backgroundColor), "rgb(34, 85, 170)");

    const switchHost = page.getByTestId("switch-host");
    assert.equal(await switchHost.locator("label.bp3-control.bp3-switch:not(.bp3-align-right)").count(), 1);
    assert.equal(await switchHost.locator("input[role=switch]").isChecked(), true);
    await switchHost.locator("label.bp3-control").click();
    assert.equal(await switchHost.locator("input").isChecked(), false);

    const editor = page.getByTestId("editor-host");
    await editor.locator("label.bp3-control").click();
    assert.equal(await editor.locator("input").isChecked(), false);

    const input = page.getByTestId("input-host");
    assert.equal(await input.locator(".bp3-control-group.bp3-fill[data-testid=input-container]").count(), 1);
    assert.equal(await input.locator(".text-input-wrapper > .bp3-input-group > input.bp3-input").count(), 1);
    assert.equal(await input.locator("input.bp3-input").inputValue(), "Live text");
    await input.locator("input.bp3-input").fill("Updated text");
    assert.equal(await input.locator("input.bp3-input").inputValue(), "Updated text");
    const inputFrame = await input.locator(".text-input-wrapper").boundingBox();
    assert.ok(inputFrame && inputFrame.height >= 32 && inputFrame.height <= 34,
      `Appsmith Input control should be 32px tall; received ${inputFrame?.height}`);
    assert.equal(await input.locator(".text-input-wrapper").evaluate((node) =>
      getComputedStyle(node).borderColor), "rgb(34, 85, 170)");

    const number = page.getByTestId("number-host");
    assert.equal(await number.locator(".bp3-numeric-input .bp3-input-group > input.bp3-input").count(), 1);
    assert.equal(await number.locator(".bp3-button-group.bp3-fixed.bp3-vertical .bp3-icon-chevron-up svg").count(), 1);
    await number.getByRole("button", { name: "Increment" }).click();
    assert.equal(await number.locator("input.bp3-input").inputValue(), "5");
    assert.equal(await number.getByRole("button", { name: "Increment" }).isDisabled(), true);
    await number.locator("input.bp3-input").press("ArrowDown");
    assert.equal(await number.locator("input.bp3-input").inputValue(), "4");
    await number.locator("input.bp3-input").press("a");
    assert.equal(await number.locator("input.bp3-input").inputValue(), "4");

    const password = page.getByTestId("password-host");
    assert.equal(await password.locator("input.bp3-input").getAttribute("type"), "password");
    assert.equal(await password.locator(".bp3-icon-eye-on svg[viewBox='0 0 20 20']").count(), 1);
    await password.getByRole("button", { name: "Show password" }).click();
    assert.equal(await password.locator("input.bp3-input").getAttribute("type"), "text");
    assert.equal(await password.locator(".bp3-icon-eye-off svg[viewBox='0 0 20 20']").count(), 1);

    const multiline = page.getByTestId("multiline-host");
    assert.equal(await multiline.locator("textarea.od-native-form__input-textarea").inputValue(),
      "First line\nSecond line");
    const multilineFrame = await multiline.locator(".text-input-wrapper").boundingBox();
    assert.ok(multilineFrame && multilineFrame.height > 75 && multilineFrame.height < 110,
      `Appsmith fixed multiline input should fill the widget below its label; received ${multilineFrame?.height}`);
    await multiline.locator("textarea").fill("Updated\nnotes");
    assert.equal(await multiline.locator("textarea").inputValue(), "Updated\nnotes");

    const autoMultiline = page.getByTestId("auto-multiline-host");
    const autoTextarea = autoMultiline.locator("textarea.od-native-form__input-textarea");
    const expandedHeight = (await autoTextarea.boundingBox())?.height || 0;
    assert.ok(expandedHeight > 120, `Auto-height multiline input should grow with its value; received ${expandedHeight}`);
    await autoTextarea.fill("Short");
    await page.waitForFunction(() => {
      const textarea = document.querySelector('[data-testid="auto-multiline-host"] textarea');
      return textarea && textarea.getBoundingClientRect().height < 80;
    });
    const shortenedHeight = (await autoTextarea.boundingBox())?.height || 0;
    assert.ok(shortenedHeight < expandedHeight);

    const radio = page.getByTestId("radio-host");
    assert.equal(await radio.locator(".od-native-form__radio-options > label.bp3-control.bp3-radio.bp3-inline").count(), 2);
    assert.equal(await radio.locator("input[value='1']").isChecked(), true);
    await radio.locator("label.bp3-radio").nth(1).click();
    assert.equal(await radio.locator("input[value='2']").isChecked(), true);
    assert.equal(await radio.locator("input[value='1']").isChecked(), false);
    const radioLabelFrame = await radio.locator(".radiogroup-label").boundingBox();
    const radioHostFrame = await radio.boundingBox();
    assert.ok(radioLabelFrame && radioHostFrame &&
      Math.abs(radioLabelFrame.x - radioHostFrame.x) < 1,
    "Appsmith's top-position Radio label should align with the widget left edge");

    const rightRadio = page.getByTestId("radio-right-host");
    assert.equal(await rightRadio.locator("label.bp3-radio.bp3-align-right").count(), 2);
    await rightRadio.locator("label.bp3-radio").first().click();
    assert.equal(await rightRadio.locator("input[value='Y']").isChecked(), true);
    assert.deepEqual(errors, []);
    console.log("Appsmith Checkbox, Switch, Input V2, and Radio DOM and controlled-meta browser checks passed");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
