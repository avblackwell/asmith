const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

const base = process.env.OPERATOR_DISPLAY_DEV_URL || "http://127.0.0.1:3004";
const path = "/src/editor-bridge/native-widgets/sliders/browser-harness.html";

(async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome", headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(`${base}${path}`);
    assert.equal(response?.status(), 200);

    const rate = page.locator('[data-native-widget="rate"]');
    await rate.waitFor();
    assert.equal(await rate.getAttribute("data-meta-rate"), "3");
    assert.equal(await rate.locator("[data-star-index]").count(), 5);
    const fourth = rate.locator('[data-star-index="4"]');
    const starBox = await fourth.boundingBox();
    await page.mouse.click(starBox.x + 2, starBox.y + starBox.height / 2);
    assert.equal(await rate.getAttribute("data-meta-rate"), "3.5");
    await page.mouse.click(starBox.x + 2, starBox.y + starBox.height / 2);
    assert.equal((await page.getByTestId("events").textContent()).match(/rate:3\.5/g)?.length, 1);

    const number = page.getByTestId("number-host").locator('[data-native-widget="number-slider"]');
    const numberThumb = number.locator('[data-testid="slider-thumb"]');
    await numberThumb.focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await number.getAttribute("data-meta-value"), "11");
    assert.equal(await number.getAttribute("data-meta-dirty"), "true");
    assert.match(await page.getByTestId("events").textContent(), /number:11/);

    const range = page.locator('[data-native-widget="range-slider"]');
    await range.locator('[data-testid="slider-thumb"]').first().focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await range.getAttribute("data-meta-start"), "11");
    assert.match(await page.getByTestId("events").textContent(), /start:11/);

    const category = page.locator('[data-native-widget="category-slider"]');
    assert.equal(await category.getAttribute("data-meta-value"), "md");
    await category.locator('[data-testid="slider-thumb"]').focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await category.getAttribute("data-meta-value"), "lg");

    await page.getByRole("button", { name: "Reset number default" }).click();
    assert.equal(await number.getAttribute("data-meta-value"), "20");
    assert.equal(await number.getAttribute("data-meta-dirty"), "false");

    const trackBox = await number.locator("[data-slider-root]").boundingBox();
    const trackY = trackBox.y + trackBox.height / 2;
    await page.mouse.move(trackBox.x + trackBox.width * 0.2, trackY);
    await page.mouse.down();
    await page.mouse.move(trackBox.x + trackBox.width * 0.75, trackY, { steps: 5 });
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('[data-testid="number-host"] [data-native-widget="number-slider"]')
      ?.getAttribute("data-meta-value") === "75", { timeout: 5000 });
    assert.match(await page.getByTestId("events").textContent(), /number:75/);

    const disabled = page.getByTestId('disabled-host').locator('[data-native-widget="number-slider"]');
    assert.equal(await disabled.locator('[data-slider-mark]').count(), 0);
    assert.equal(await disabled.locator('[data-slider-mark] p').count(), 0);
    assert.equal(await disabled.locator('[data-slider-bar]').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(169, 167, 167)');
    assert.equal(await disabled.locator('[data-slider-track]').evaluate((element) => getComputedStyle(element, '::before').backgroundColor), 'rgb(224, 222, 222)');
    await disabled.locator('[data-testid="slider-thumb"]').focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await disabled.getAttribute("data-meta-value"), "10");

    const thumbBox = await numberThumb.boundingBox();
    const dragTrack = await number.locator('[data-slider-root]').boundingBox();
    await page.mouse.move(thumbBox.x + thumbBox.width / 2, thumbBox.y + thumbBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(dragTrack.x + dragTrack.width * 0.5, thumbBox.y + thumbBox.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('[data-testid="number-host"] [data-native-widget="number-slider"]')
      ?.getAttribute("data-meta-value") === "50", { timeout: 5000 });

    const firstRangeThumb = range.locator('[data-testid="slider-thumb"]').first();
    const firstRangeBox = await firstRangeThumb.boundingBox();
    const rangeTrack = await range.locator('[data-slider-root]').boundingBox();
    await page.mouse.move(firstRangeBox.x + firstRangeBox.width / 2, firstRangeBox.y + firstRangeBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(rangeTrack.x + rangeTrack.width * 0.3, firstRangeBox.y + firstRangeBox.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(() => Number(document.querySelector('[data-native-widget="range-slider"]')
      ?.getAttribute("data-meta-start")) >= 25, { timeout: 5000 });

    const controlled = page.getByTestId('controlled-host').locator('[data-native-widget="number-slider"]');
    await controlled.locator('[data-testid="slider-thumb"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await controlled.getAttribute('data-meta-value'), '21');
    assert.equal(await page.getByTestId('controlled-value').textContent(), '21');
    assert.deepEqual(errors, []);
    console.log("Rate and Slider browser interactions passed");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
