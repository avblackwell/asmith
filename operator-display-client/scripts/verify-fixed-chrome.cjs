/* Run against the local Vite workbench: node scripts/verify-fixed-chrome.cjs */
const assert = require("node:assert/strict");
const { chromium, expect } = require("@playwright/test");

const origin = process.env.WORKBENCH_ORIGIN || "http://127.0.0.1:3004";

async function main() {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome", headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/workspace`);
    await page.getByRole("button", { name: "New dashboard" }).click();
    await page.waitForURL(/\/workbench\?draftId=dashboard-/);
    await page.getByRole("button", { name: "Widgets", exact: true }).click();
    await page.getByRole("button", { name: "Add Text widget" }).press("Enter");

    const selected = page.locator(
      '.od-read-only-canvas__widget--selected[data-widget-id]',
    );
    await expect(selected).toHaveCount(1);
    assert.notEqual(await selected.getAttribute("data-widget-id"), "dashboard-title");
    await expect(selected.locator("[data-resize-handle]")).toHaveCount(8);
    await expect(selected.locator('[data-resize-handle="top"]'))
      .toHaveAttribute("aria-disabled", "true");
    await expect(selected.locator('[data-resize-handle="bottom"]'))
      .toHaveAttribute("aria-disabled", "true");

    const title = page.locator('[data-widget-id="dashboard-title"]');
    await title.hover();
    await expect(title.locator("[data-resize-handle]")).toHaveCount(8);
    await expect(title.locator("#resize-dashboard-title"))
      .toHaveClass(/show-boundary/);
    assert.deepEqual(await title.evaluate((element) => {
      const name = element.querySelector("#widget_name_dashboard-title");
      const wrapper = element.querySelector("#resize-dashboard-title");
      return {
        nameBesideWrapper: !!name && name.parentElement === wrapper?.parentElement,
        handlesInsideWrapper: !!wrapper && [...wrapper.querySelectorAll("[data-resize-handle]")]
          .every((handle) => handle.parentElement === wrapper),
      };
    }), { nameBesideWrapper: true, handlesInsideWrapper: true });

    const wrapper = title.locator("#resize-dashboard-title");
    const before = await wrapper.boundingBox();
    const grip = await title.locator('[data-resize-handle="left"]').boundingBox();
    assert.ok(before && grip);
    const point = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await expect(title).toHaveClass(/od-read-only-canvas__widget--selected/);
    await expect(title.locator("#widget_name_dashboard-title")).toHaveCount(0);
    await page.mouse.move(point.x + 40, point.y, { steps: 5 });
    await expect.poll(async () => (await wrapper.boundingBox())?.width ?? 0)
      .toBeLessThan(before.width - 20);
    await page.mouse.up();
    await expect(title.locator("#widget_name_dashboard-title")).toHaveCount(1);
    assert.deepEqual(errors, []);
    console.log("Fixed chrome passed: wrapper child handles, sibling name, auto-height disabled dots, hover resize selection and live wrapper");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
