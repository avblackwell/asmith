const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = process.env.OPERATOR_DISPLAY_DEV_URL || "http://127.0.0.1:3004";
const fixture = fs.readFileSync(path.resolve(__dirname,
  "../../app/client/src/pages/Editor/WidgetSidebar/tests/UIEntitySidebar.fixture.ts"), "utf8");
const sourceTypes = [...fixture.matchAll(/^    type: "([A-Z_0-9]+)"/gm)]
  .map((match) => match[1]);
const fixedTypes = sourceTypes.slice(0, sourceTypes.indexOf("BUILDING_BLOCK"));
assert.equal(fixedTypes.length, 46);
// This 2024 sidebar test fixture predates Appsmith's 2026 Card registration.
// The live sidebar selector includes Card for Fixed layout.

(async () => {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const types = [...fixedTypes, "CARD_WIDGET"];
    for (let start = 0; start < types.length; start += 8) {
      const batch = types.slice(start, start + 8);
      assert.equal((await page.goto(`${base}/workspace`))?.status(), 200);
      await page.getByRole("button", { name: "New dashboard" }).click();
      await page.waitForURL(/\/workbench\?draftId=dashboard-/);
      await page.getByRole("button", { name: "Widgets", exact: true }).click();
      const renderedCounts = new Map();

      for (const type of batch) {
        const card = page.locator(`#widget-card-draggable-${type.replace(/_/g, "").toLowerCase()}`);
        await expect(card, `${type} palette card`).toHaveCount(1);
        const host = page.locator(`.od-workbench__artboard .od-read-only-canvas__widget--${type.toLowerCase().replace(/_/g, "-")}`);
        const before = await host.count();
        await card.press("Enter");
        if (type === "MODAL_WIDGET") {
          await expect(page.locator('[data-native-widget="modal"]')).toHaveCount(1);
        } else {
          await expect.poll(() => host.count(), `${type} rendered widget`)
            .toBeGreaterThan(before);
          await expect(host.getByText(`renderer for ${type} is not yet available`))
            .toHaveCount(0);
        }
        await page.keyboard.press("Escape");
        await expect(page.getByLabel("Widget name")).toHaveCount(0);
      }

      for (const type of batch.filter((type) => type !== "MODAL_WIDGET")) {
        renderedCounts.set(type, await page.locator(
          `.od-workbench__artboard .od-read-only-canvas__widget--${type.toLowerCase().replace(/_/g, "-")}`,
        ).count());
      }
      await page.getByRole("button", { name: "Save draft" }).click();
      await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
      await page.reload();
      const savedTypes = await page.evaluate(async () => {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open("operator-display-drafts", 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const records = await new Promise((resolve, reject) => {
          const request = db.transaction("drafts", "readonly")
            .objectStore("drafts").getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const id = new URL(location.href).searchParams.get("draftId");
        return records.find((record) => record.documentId === id)
          ?.document.layout.dsl.children.map((child) => child.type) ?? [];
      });
      for (const type of batch) {
        assert.ok(savedTypes.includes(type), `${type} persisted after reload`);
      }
      for (const type of batch.filter((type) => type !== "MODAL_WIDGET")) {
        const host = page.locator(`.od-workbench__artboard .od-read-only-canvas__widget--${type.toLowerCase().replace(/_/g, "-")}`);
        try {
          await expect(host, `${type} reloaded widget`)
            .toHaveCount(renderedCounts.get(type));
        } catch (error) {
          console.error("Reload mismatch", { type, batch, expected: renderedCounts.get(type),
            actual: await host.count(), savedTypes, errors });
          throw error;
        }
      }
      if (batch.includes("MODAL_WIDGET")) {
        await page.getByRole("button", { name: "Outline", exact: true }).click();
        await page.locator(".od-workbench__outline-item")
          .filter({ hasText: /Modal\d+/ }).first().click();
        await expect(page.locator('[data-native-widget="modal"]')).toHaveCount(1);
      }
    }
    assert.deepEqual(errors, []);
    console.log("All 47 current Appsmith Fixed widgets add, render, save, and reload");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
