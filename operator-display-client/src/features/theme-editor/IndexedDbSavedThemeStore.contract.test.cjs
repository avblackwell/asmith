/* Run from operator-display-client: node src/features/theme-editor/IndexedDbSavedThemeStore.contract.test.cjs */
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const esbuild = require("esbuild");
const { chromium } = require("@playwright/test");

async function main() {
  const entry = path.join(__dirname, "IndexedDbSavedThemeStore.ts");
  const bundle = await esbuild.build({
    entryPoints: [entry], bundle: true, format: "iife",
    globalName: "SavedThemeModule", platform: "browser", write: false,
    logLevel: "silent",
  });
  const presets = require("../../editor-bridge/appsmith-theme/systemThemes.json");
  const modern = presets.find((preset) => preset.name === "Default-New");
  assert.ok(modern);

  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>Saved theme contract</title>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  let browser;

  try {
    browser = await chromium.launch({
      channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
      headless: true,
    });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await page.evaluate(async () => {
      // The v1 store had account scope only. Upgrading must retain its bytes.
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("operator-display-saved-themes", 1);
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore("themes", { keyPath: "key" });
          store.createIndex("byOwner", ["deploymentId", "accountId"]);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = database.transaction("themes", "readwrite");
        transaction.objectStore("themes").add({
          key: JSON.stringify(["site-a/operator_display", "7", "legacy-id"]),
          deploymentId: "site-a/operator_display", accountId: "7", legacy: true,
        });
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });

    const result = await page.evaluate(async ({ properties, config }) => {
      const Store = window.SavedThemeModule.IndexedDbSavedThemeStore;
      const store = new Store();
      const owner = { deploymentId: "site-a/operator_display", accountId: "7",
        documentId: "dashboard-a" };
      const otherAccount = { ...owner, accountId: "8" };
      const otherDeployment = { ...owner, deploymentId: "site-b/operator_display" };
      const otherDocument = { ...owner, documentId: "dashboard-b" };
      const first = await store.save(owner, {
        displayName: "  Line A  ", basePresetName: "Default-New", properties,
      });
      properties.colors.primaryColor = "#000000";
      const second = await store.save(owner, {
        displayName: "Line B", basePresetName: "Default-New",
        properties: { ...first.properties, colors: { ...first.properties.colors, primaryColor: "#123456" } },
      });

      let invalidRejected = false;
      try {
        await store.save(owner, {
          displayName: "Broken", basePresetName: "Default-New",
          properties: { ...first.properties, colors: { backgroundColor: "#fff" } },
        });
      } catch {
        invalidRejected = true;
      }

      await store.delete(otherAccount, first.id);
      await store.delete(otherDocument, first.id);
      const beforeDelete = await store.list(owner);
      const accountIsolation = await store.list(otherAccount);
      const deploymentIsolation = await store.list(otherDeployment);
      const documentIsolation = await store.list(otherDocument);
      await store.delete(owner, first.id);
      const afterDelete = await store.list(owner);

      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("operator-display-saved-themes", 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const legacyRecord = await new Promise((resolve, reject) => {
        const request = database.transaction("themes", "readonly")
          .objectStore("themes").get(JSON.stringify([
            "site-a/operator_display", "7", "legacy-id",
          ]));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();

      return {
        first, second, beforeDelete, afterDelete, accountIsolation,
        deploymentIsolation, documentIsolation, invalidRejected, expectedConfig: config,
        legacyRecord,
      };
    }, { properties: structuredClone(modern.properties), config: modern.config });

    assert.equal(result.first.displayName, "Line A");
    assert.match(result.first.name, /^saved:[A-Za-z0-9_-]{16}$/);
    assert.equal(result.first.isSystemTheme, false);
    assert.equal(result.first.basePresetName, "Default-New");
    assert.deepEqual(result.first.config, result.expectedConfig);
    assert.equal(result.first.properties.colors.primaryColor, modern.properties.colors.primaryColor);
    assert.notEqual(result.first.id, result.second.id);
    assert.equal(result.invalidRejected, true);
    assert.deepEqual(result.beforeDelete.map((theme) => theme.id).sort(),
      [result.first.id, result.second.id].sort());
    assert.deepEqual(result.accountIsolation, []);
    assert.deepEqual(result.deploymentIsolation, []);
    assert.deepEqual(result.documentIsolation, []);
    assert.deepEqual(result.afterDelete.map((theme) => theme.id), [result.second.id]);
    assert.equal(result.legacyRecord.legacy, true);

    console.log("Saved-theme IndexedDB contract passed: copy, validation, dashboard isolation, v1 preservation, delete.");
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
