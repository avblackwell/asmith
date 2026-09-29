/* Reproduce one-step Fixed gestures against the running local workbench.
 * Usage: node scripts/verify-fast-fixed-gestures.cjs
 */
const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");

async function run() {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome", headless: true,
  });
  try {
    for (const steps of [1, 12]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto("http://127.0.0.1:3004/workspace");
      await page.getByRole("button", { name: "New dashboard" }).click();
      await page.waitForURL(/\/workbench\?draftId=dashboard-/);
      const palette = page.getByRole("button", { name: "Add Text widget" });
      await palette.waitFor();
      const source = await palette.boundingBox();
      const canvas = await page.locator('[data-widget-id="0"]').boundingBox();
      if (!source || !canvas) throw new Error("Palette/canvas geometry unavailable");
      const widgetIds = () => page.locator('[data-widget-id]').evaluateAll((elements) =>
        [...new Set(elements.map((element) => element.getAttribute('data-widget-id')))]);
      const before = await widgetIds();
      const from = { x: source.x + source.width / 2,
        y: source.y + source.height / 2 };
      const to = { x: canvas.x + 500, y: canvas.y + 280 };
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps });
      const preview = await page.locator('[data-drag-preview-valid]').evaluateAll((elements) =>
        elements.map((element) => ({ valid: element.getAttribute('data-drag-preview-valid'),
          canvas: element.getAttribute('data-drop-canvas-id') })));
      const feedback = await page.locator('.od-editable-canvas__feedback').allTextContents();
      const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.outerHTML.slice(0, 170), to);
      if (steps === 12) {
        await page.evaluate(() => {
          window.__paletteHitProbe = document.elementsFromPoint;
          document.elementsFromPoint = () => [];
        });
      }
      await page.mouse.up();
      if (steps === 12) {
        await page.evaluate(() => {
          document.elementsFromPoint = window.__paletteHitProbe;
          delete window.__paletteHitProbe;
        });
      }
      await page.waitForTimeout(100);
      const after = await widgetIds();
      const errors = await page.locator('.od-workbench__preview-error').allTextContents();
      const added = after.filter((id) => !before.includes(id));
      if (steps === 12) {
        assert.equal(added.length, 1, 'Palette drag must add one Text widget');
        assert.deepEqual(errors, []);
      }
      console.log(JSON.stringify({ gesture: "palette", steps, canvas, from, to, preview, feedback, hit,
        added, errors }));
      if (added.length) {
        const widget = page.locator(`[data-widget-id="${added[0]}"]`);
        await widget.click();
        const name = await widget.getAttribute('data-widget-name');
        const handle = page.getByRole('button', { name: `Move ${name}` });
        const oldBox = await widget.boundingBox();
        const handleBox = await handle.boundingBox();
        if (!handleBox || !oldBox) throw new Error('Move handle geometry unavailable');
        const start = { x: handleBox.x + handleBox.width / 2,
          y: handleBox.y + handleBox.height / 2 };
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(start.x + 120, start.y + 60, { steps: 12 });
        const active = await page.locator('[data-drag-preview-valid]').evaluateAll((elements) =>
          elements.map((element) => ({ valid: element.getAttribute('data-drag-preview-valid'),
            canvas: element.getAttribute('data-drop-canvas-id') })));
        await page.mouse.up();
        await page.waitForTimeout(100);
        const newBox = await widget.boundingBox();
        assert.ok(newBox.x > oldBox.x + 50 && newBox.y > oldBox.y + 20,
          'Selected-widget move must commit the preview');
        console.log(JSON.stringify({ gesture: 'move', steps, oldBox, newBox, active,
          errors: await page.locator('.od-workbench__preview-error').allTextContents() }));
        const fixed = page.locator('[data-property-name="dynamicHeight"] select');
        if (await fixed.count()) await fixed.selectOption('FIXED');
        const resize = page.getByRole('button', { name: `Resize ${name} from bottomRight` });
        const resizeBox = await resize.boundingBox();
        if (resizeBox) {
          const startResize = { x: resizeBox.x + resizeBox.width / 2,
            y: resizeBox.y + resizeBox.height / 2 };
          const beforeResize = await widget.boundingBox();
          const liveWrapper = page.locator(`[data-live-resize-wrapper="${added[0]}"]`);
          const beforeLiveResize = await liveWrapper.boundingBox();
          await page.mouse.move(startResize.x, startResize.y);
          await page.mouse.down();
          await page.mouse.move(startResize.x + 60, startResize.y + 60, { steps: 12 });
          await page.waitForTimeout(100);
          const duringLiveResize = await liveWrapper.boundingBox();
          const duringOuterResize = await widget.boundingBox();
          assert.ok(duringLiveResize.width > beforeLiveResize.width + 30 &&
            duringLiveResize.height > beforeLiveResize.height + 30,
          'The actual widget wrapper must resize before release');
          assert.deepEqual(duringOuterResize, beforeResize,
            'The authored positioned layer should retain its frame during resize');
          await page.mouse.up();
          await page.waitForTimeout(100);
          const afterResize = await widget.boundingBox();
          assert.ok(afterResize.width > beforeResize.width + 30 &&
            afterResize.height > beforeResize.height + 30,
          'Selected-widget resize must commit both axes');
          console.log(JSON.stringify({ gesture: 'resize', steps, beforeResize,
            afterResize,
            errors: await page.locator('.od-workbench__preview-error').allTextContents() }));
          const scrollHandle = await resize.boundingBox();
          if (scrollHandle) {
            const beforeScrollResize = await widget.boundingBox();
            const resizeStart = { x: scrollHandle.x + scrollHandle.width / 2,
              y: scrollHandle.y + scrollHandle.height / 2 };
            await page.mouse.move(resizeStart.x, resizeStart.y);
            await page.mouse.down();
            await page.locator('.od-workbench__viewport').evaluate((node) => {
              node.scrollTop += 50;
            });
            await page.waitForTimeout(60);
            await page.mouse.move(resizeStart.x, resizeStart.y + 10, { steps: 3 });
            await page.mouse.up();
            await page.waitForTimeout(100);
            const afterScrollResize = await widget.boundingBox();
            assert.ok(afterScrollResize.height >= beforeScrollResize.height + 50,
              'Resize snapping must include parent canvas scroll delta');
            console.log(JSON.stringify({ gesture: 'resize-with-scroll', steps,
              beforeScrollResize, afterScrollResize }));
          }
        }
        const outsideHandle = await handle.boundingBox();
        if (outsideHandle) {
          const beforeOutside = await widget.boundingBox();
          const startOutside = { x: outsideHandle.x + outsideHandle.width / 2,
            y: outsideHandle.y + outsideHandle.height / 2 };
          await page.mouse.move(startOutside.x, startOutside.y);
          await page.mouse.down();
          await page.mouse.move(15, startOutside.y + 70, { steps: 12 });
          const outsidePreview = await page.locator('[data-drag-preview-valid="true"], [data-drag-preview-valid="false"]').count();
          await page.mouse.up();
          await page.waitForTimeout(100);
          const afterOutside = await widget.boundingBox();
          assert.deepEqual(afterOutside, beforeOutside,
            'Dropping outside the canvas must leave widget geometry unchanged');
          assert.equal(outsidePreview, 0,
            'Leaving the Fixed drag arena must clear its preview');
          assert.equal(await handle.count(), 1,
            'Window release must restore the widget move handle');
          console.log(JSON.stringify({ gesture: 'move-outside', steps, beforeOutside,
            afterOutside, outsidePreview,
            moveHandleCount: await handle.count() }));
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
