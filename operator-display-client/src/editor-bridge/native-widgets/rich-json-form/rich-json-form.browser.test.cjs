const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

const base = process.env.OPERATOR_DISPLAY_DEV_URL || "http://127.0.0.1:3004";
const path = "/src/editor-bridge/native-widgets/rich-json-form/browser-harness.html";

(async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome", headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    assert.equal((await page.goto(`${base}${path}`))?.status(), 200);
    const rich = page.getByTestId("rich-host");
    await rich.locator(".tox-tinymce").waitFor();
    assert.equal(await rich.locator(".tox-toolbar__primary").count(), 1,
      (await rich.locator(".tox-tinymce").getAttribute("class")) || "TinyMCE missing toolbar");
    const body = page.frameLocator("iframe.tox-edit-area__iframe").locator("body");
    await body.getByText("Hello world").waitFor();
    await body.click();
    await body.press("ControlOrMeta+A");
    await body.type("Updated notes");
    await page.getByTestId("rich-meta").getByText(/Updated notes/).waitFor();

    const form = page.getByTestId("json-host");
    const formGeometry = await form.evaluate((host) => ({
      authored: host.getBoundingClientRect().height,
      intrinsic: host.querySelector('[data-testid="native-json-form"]').getBoundingClientRect().height,
    }));
    assert.ok(formGeometry.intrinsic > formGeometry.authored,
      `Auto-height JSON Form should expose all fields: ${JSON.stringify(formGeometry)}`);
    await form.evaluate((host) => { host.style.height = "auto"; });
    assert.equal(await form.getByText("Person").count(), 1);
    assert.equal(await form.getByLabel("Name").inputValue(), "Ada");
    assert.equal(await form.getByLabel("Age").inputValue(), "31");
    await form.getByLabel("Name").fill("");
    await page.waitForTimeout(230);
    assert.equal(await form.getByTestId("t--jsonform-submit-btn").isDisabled(), true);
    await form.getByLabel("Name").fill("Grace");
    await form.getByLabel("Age").fill("32");
    await page.waitForTimeout(230);
    const meta = JSON.parse(await page.getByTestId("json-meta").textContent());
    assert.equal(meta.formData.name, "Grace");
    assert.equal(meta.formData.age, 32);
    assert.equal(meta.formData.address.city, "London");
    await form.getByTestId("t--jsonform-submit-btn").click();
    assert.equal(JSON.parse(await page.getByTestId("submitted").textContent()).name, "Grace");
    await form.getByTestId("t--jsonform-reset-btn").click();
    assert.equal(await form.getByLabel("Name").inputValue(), "Ada");
    assert.deepEqual(errors, []);
    console.log("Rich Text TinyMCE and nested JSON Form browser behavior passed");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
