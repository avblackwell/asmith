/* Run with the local Vite and mock Java servers: node scripts/verify-referenced-theme.cjs */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { chromium, expect } = require("@playwright/test");

const base = process.env.OPERATOR_DISPLAY_DEV_URL || "http://127.0.0.1:3004";
const reference = { kind: "marketplace", itemId: "43", revision: "smoke-1" };

async function readDraft(page, documentId) {
  return page.evaluate(async (id) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("operator-display-drafts", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const key = JSON.stringify([`${window.location.origin}/operator_display`, "1", id]);
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction("drafts", "readonly")
          .objectStore("drafts").get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }, documentId);
}

async function replaceSavedTheme(page, documentId) {
  return page.evaluate(async ({ documentId, reference }) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("operator-display-drafts", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const key = JSON.stringify([
      `${window.location.origin}/operator_display`, "1", documentId,
    ]);
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction("drafts", "readwrite");
        const store = transaction.objectStore("drafts");
        const request = store.get(key);
        let initialTheme;
        request.onsuccess = () => {
          const record = request.result;
          if (!record) {
            reject(new Error("New local draft was not stored"));
            return;
          }
          initialTheme = record.document.theme;
          record.document.theme = reference;
          store.put(record);
        };
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => resolve(initialTheme);
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }, { documentId, reference });
}

async function exportDocument(page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await pending;
  return JSON.parse(await fs.readFile(await download.path(), "utf8"));
}

(async () => {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(`${base}/workspace`);
    await page.getByRole("button", { name: "New dashboard" }).click();
    await page.waitForURL(/\/workbench\?draftId=dashboard-/);
    const documentId = new URL(page.url()).searchParams.get("draftId");
    assert.ok(documentId);
    const original = await replaceSavedTheme(page, documentId);
    const asset = {
      assetKind: "theme", schemaVersion: 1, name: "Marketplace Smoke",
      properties: structuredClone(original.properties),
    };
    asset.properties.colors.primaryColor = "#7c3aed";
    asset.properties.colors.backgroundColor = "#e0f2fe";

    let downloads = 0;
    await page.route("**/operator_display/marketplace/items/43/download", async (route) => {
      assert.equal(route.request().method(), "POST");
      downloads++;
      await route.fulfill({ json: {
        downloadUrl: "/operator_display/asset/theme-43.json",
        metadata: { id: 43, name: asset.name, typeId: 3, type: "theme" },
      } });
    });
    await page.route("**/operator_display/asset/theme-43.json", (route) =>
      route.fulfill({ json: asset }));

    await page.reload();
    await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
    await page.getByRole("button", { name: "App settings" }).click();
    await page.locator(".od-app-settings__section").filter({ hasText: "Theme" }).click();
    await expect(page.getByTestId("t--color-picker-input")).toHaveValue("#7c3aed");
    await expect.poll(() => page.locator(".od-workbench__artboard")
      .evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe("rgb(224, 242, 254)");
    assert.ok(downloads >= 1);
    assert.deepEqual((await readDraft(page, documentId)).document.theme, reference);
    assert.deepEqual((await exportDocument(page)).theme, reference,
      "resolved preview must leave the working document referenced");
    await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();

    await page.getByTestId("theme-primaryColor").click();
    await page.getByRole("button", { name: "blue 500 #3b82f6" }).click();
    await expect(page.getByTestId("t--color-picker-input")).toHaveValue("#3b82f6");
    await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
    const edited = await exportDocument(page);
    assert.equal(edited.theme.kind, "inline");
    assert.equal(edited.theme.name, asset.name);
    assert.equal(edited.theme.properties.colors.primaryColor, "#3b82f6");
    assert.deepEqual((await readDraft(page, documentId)).document.theme, reference,
      "the first edit remains local until saved");

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByTestId("t--color-picker-input")).toHaveValue("#7c3aed");
    await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
    assert.deepEqual((await exportDocument(page)).theme, reference,
      "one undo restores the original Marketplace reference");
    assert.deepEqual(pageErrors, []);
    console.log("Referenced Marketplace theme browser smoke passed");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
