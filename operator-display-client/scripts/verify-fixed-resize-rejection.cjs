/* Run against the local Vite workbench: node scripts/verify-fixed-resize-rejection.cjs */
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
    await page.getByRole("button", { name: "Add Container widget" }).press("Enter");
    const container = page.locator(
      ".od-workbench__artboard .od-read-only-canvas__widget--container-widget",
    );
    await container.waitFor();
    const containerId = await container.getAttribute("data-widget-id");
    const containerName = await container.getAttribute("data-widget-name");
    assert.ok(containerId && containerName);
    await page.locator('[data-property-name="dynamicHeight"] select')
      .selectOption("FIXED");
    await page.getByRole("tab", { name: "Style" }).click();
    await page.getByLabel("Height").fill("30");
    await page.getByLabel("Height").blur();
    await expect(page.getByLabel("Height")).toHaveValue("30");
    // ResizableComponent rejects a pointer sample under four rows;
    // FixedLayoutResizable retains the previous accepted newDimensions.
    const wrapper = container.locator(`[data-live-resize-wrapper="${containerId}"]`);
    const handle = container.getByRole("button", {
      name: `Resize ${containerName} from bottom`, exact: true,
    });
    const box = await handle.boundingBox();
    assert.ok(box);
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const original = await wrapper.boundingBox();
    assert.ok(original);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x, point.y - 100, { steps: 8 });
    await expect.poll(async () => (await wrapper.boundingBox())?.height ?? 0)
      .toBeLessThan(original.height - 70);
    const accepted = await wrapper.boundingBox();
    assert.ok(accepted);
    await page.mouse.move(point.x, point.y - 280, { steps: 1 });
    await page.waitForTimeout(250);
    const rejected = await wrapper.boundingBox();
    assert.ok(rejected);
    assert.ok(Math.abs(rejected.height - accepted.height) <= 3,
      `Rejected resize must keep last accepted wrapper height: ${JSON.stringify({
        original, accepted, rejected,
      })}`);
    await page.mouse.up();
    await expect.poll(async () => (await container.boundingBox())?.height ?? 0)
      .toBeLessThan(original.height - 70);
    const committed = await container.boundingBox();
    // Appsmith's resize wrapper is four pixels shorter than its positioned
    // widget layer (two 4px padding offsets plus the 4px border buffer).
    assert.ok(committed && Math.abs(committed.height - (accepted.height + 4)) <= 3,
      `Release must commit last accepted rectangle: ${JSON.stringify({
        accepted, committed,
      })}`);
    assert.deepEqual(errors, []);
    console.log("Fixed resize rejection passed: last accepted rectangle remains live and commits");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
