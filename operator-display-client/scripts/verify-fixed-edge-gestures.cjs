/* Appsmith Fixed modifyBlockDimension browser contract for palette edges. */
const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");

async function main() {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome", headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto("http://127.0.0.1:3004/workspace");
    await page.getByRole("button", { name: "New dashboard" }).click();
    await page.waitForURL(/\/workbench\?draftId=dashboard-/);
    const palette = page.getByRole("button", { name: "Add Text widget" });
    const canvas = page.locator('[data-widget-id="0"]');
    const paletteBox = await palette.boundingBox();
    const canvasBox = await canvas.boundingBox();
    if (!paletteBox || !canvasBox) throw new Error("Missing Fixed canvas geometry");
    const colSpace = (canvasBox.width - 12) / 64;
    const ids = () => page.locator('[data-widget-id]').evaluateAll((nodes) =>
      [...new Set(nodes.map((node) => node.getAttribute('data-widget-id')))]);
    const from = { x: paletteBox.x + paletteBox.width / 2,
      y: paletteBox.y + paletteBox.height / 2 };

    async function addAt(x, y) {
      const before = await ids();
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(x, y, { steps: 16 });
      const active = page.locator('[data-drag-preview-canvas-id="0"][data-drag-preview-valid="true"]');
      assert.ok(await active.count() > 0, "The root arena must paint a valid block");
      await page.mouse.up();
      const after = await ids();
      const added = after.filter((id) => !before.includes(id));
      assert.equal(added.length, 1, "The adjusted block must commit once");
      const box = await page.locator(`[data-widget-id="${added[0]}"]`).boundingBox();
      if (!box) throw new Error("Dropped widget not rendered");
      return { id: added[0], box };
    }

    const left = await addAt(canvasBox.x + 12, canvasBox.y + 340);
    assert.ok(left.box.width >= 2 * colSpace - 2 &&
      left.box.width <= 3 * colSpace + 2,
    `Left edge should shrink Text to the Appsmith 2-column minimum: ${left.box.width}`);
    const right = await addAt(canvasBox.x + canvasBox.width - 8,
      canvasBox.y + 470);
    assert.ok(right.box.width < 16 * colSpace - 4 &&
      right.box.width >= 2 * colSpace - 2,
    `Right edge should shrink Text instead of shifting its origin: ${right.box.width}`);
    const moved = page.locator(`[data-widget-id="${right.id}"]`);
    await moved.click();
    const moveName = await moved.getAttribute('data-widget-name');
    const badge = page.getByRole('button', { name: `Move ${moveName}` });
    const badgeBox = await badge.boundingBox();
    if (!badgeBox) throw new Error('Missing Appsmith widget name control');
    await page.mouse.move(badgeBox.x + badgeBox.width / 2,
      badgeBox.y + badgeBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 12, canvasBox.y + 565, { steps: 20 });
    assert.ok(await page.locator('[data-drag-preview-canvas-id="0"][data-drag-preview-valid="true"]').count() > 0,
      'Moving a widget against the left edge must paint its adjusted block');
    await page.mouse.up();
    const movedBox = await moved.boundingBox();
    assert.ok(movedBox && movedBox.width < right.box.width - colSpace &&
      movedBox.x >= canvasBox.x,
      `Moving at the left edge should save a narrower block in bounds: ${movedBox?.width}`);
    assert.deepEqual(await page.locator('.od-workbench__preview-error').allTextContents(), []);
    console.log(JSON.stringify({ left: left.box, right: right.box, moved: movedBox, colSpace }));
    await page.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
