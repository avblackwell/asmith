/* A small browser check for the local draft contract; no backend is contacted. */
const assert = require("node:assert/strict");
const esbuild = require("esbuild");
const { chromium } = require("@playwright/test");

async function main() {
  const bundle = await esbuild.build({
    stdin: {
      contents: [
        'export { IndexedDbDraftStore } from "./src/integration/drafts/IndexedDbDraftStore";',
        'export { exampleDashboardDocument } from "./src/integration/document/exampleDashboardDocument";',
      ].join("\n"),
      resolveDir: process.cwd(),
      sourcefile: "draft-verification-entry.ts",
      loader: "ts",
    },
    bundle: true,
    format: "iife",
    globalName: "OperatorDraftCheck",
    platform: "browser",
    target: "es2020",
    write: false,
  });
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome",
    headless: true,
  });

  try {
    const page = await browser.newPage();

    await page.route("http://draft-check.example/", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>Draft verification</title>",
      }),
    );
    await page.goto("http://draft-check.example/");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });

    const initialRevision = await page.evaluate(async () => {
      const { IndexedDbDraftStore, exampleDashboardDocument } =
        window.OperatorDraftCheck;
      const store = new IndexedDbDraftStore();
      const scope = {
        deploymentId: "deployment-one",
        accountId: "alice",
        documentId: exampleDashboardDocument.documentId,
      };
      const mutableInput = structuredClone(exampleDashboardDocument);
      const save = store.save(scope, mutableInput, null);

      mutableInput.name = "Changed after save started";

      return (await save).revision;
    });

    await page.reload();
    await page.addScriptTag({ content: bundle.outputFiles[0].text });

    const result = await page.evaluate(async () => {
      const { IndexedDbDraftStore, exampleDashboardDocument } =
        window.OperatorDraftCheck;
      const store = new IndexedDbDraftStore();
      const scope = {
        deploymentId: "deployment-one",
        accountId: "alice",
        documentId: exampleDashboardDocument.documentId,
      };
      const afterReload = await store.load(scope);
      const otherAccount = await store.load({ ...scope, accountId: "bob" });
      const otherDeployment = await store.load({
        ...scope,
        deploymentId: "deployment-two",
      });
      const editedDocument = structuredClone(exampleDashboardDocument);

      editedDocument.name = "Edited engine overview";

      const second = await store.save(scope, editedDocument, 1);
      let conflict = false;

      try {
        await store.save(scope, exampleDashboardDocument, 1);
      } catch (error) {
        conflict = error.name === "DraftConflictError";
      }

      const restored = await store.restore(scope, 1, 2);
      const invalidDocument = structuredClone(exampleDashboardDocument);
      let invalidRejected = false;

      invalidDocument.schemaVersion = 999;

      try {
        await store.save(scope, invalidDocument, 3);
      } catch (error) {
        invalidRejected = error.name === "DashboardDocumentValidationError";
      }

      const originalPut = IDBObjectStore.prototype.put;
      let quotaError = false;

      IDBObjectStore.prototype.put = function () {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      };

      try {
        await store.save(scope, exampleDashboardDocument, 3);
      } catch (error) {
        quotaError = error.name === "QuotaExceededError";
      } finally {
        IDBObjectStore.prototype.put = originalPut;
      }

      const afterFailedWrite = await store.load(scope);
      let abortedWrite = false;

      IDBObjectStore.prototype.put = function (...args) {
        const request = originalPut.apply(this, args);
        const transaction = this.transaction;

        queueMicrotask(() => transaction.abort());

        return request;
      };

      try {
        await store.save(scope, exampleDashboardDocument, 3);
      } catch (error) {
        abortedWrite = error.name === "DraftStorageUnavailableError";
      } finally {
        IDBObjectStore.prototype.put = originalPut;
      }

      const afterAbortedWrite = await store.load(scope);

      async function writeRaw(record) {
        const database = await new Promise((resolve, reject) => {
          const request = indexedDB.open("operator-display-drafts", 1);

          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

        try {
          await new Promise((resolve, reject) => {
            const transaction = database.transaction("drafts", "readwrite");

            transaction.objectStore("drafts").put(record);
            transaction.oncomplete = resolve;
            transaction.onabort = () => reject(transaction.error);
          });
        } finally {
          database.close();
        }
      }

      const damagedHistory = structuredClone(afterAbortedWrite);

      damagedHistory.history[0].document.schemaVersion = 999;
      await writeRaw(damagedHistory);

      const readableCurrent = await store.load(scope);
      let damagedHistoryBlocksSave = false;

      try {
        await store.save(scope, exampleDashboardDocument, 3);
      } catch (error) {
        damagedHistoryBlocksSave = error.name === "DraftCorruptHistoryError";
      }

      await writeRaw({
        key: JSON.stringify(["deployment-one", "alice", "broken-doc"]),
        deploymentId: "deployment-one",
        accountId: "alice",
        documentId: "broken-doc",
        revision: 1,
        savedAt: new Date().toISOString(),
        document: { assetKind: "unknown" },
        history: [],
      });

      const ownerDrafts = await store.list("deployment-one", "alice");
      const otherOwnerDrafts = await store.list("deployment-one", "bob");

      return {
        recoveredRevision: afterReload?.revision,
        recoveredName: afterReload?.document.name,
        otherAccount,
        otherDeployment,
        secondRevision: second.revision,
        historyAfterSecondSave: second.history.length,
        conflict,
        restoredRevision: restored.revision,
        restoredName: restored.document.name,
        invalidRejected,
        quotaError,
        revisionAfterFailedWrite: afterFailedWrite?.revision,
        abortedWrite,
        revisionAfterAbortedWrite: afterAbortedWrite?.revision,
        readableCurrentRevision: readableCurrent?.revision,
        historyIssue: Boolean(readableCurrent?.historyIssue),
        damagedHistoryBlocksSave,
        ownerCount: ownerDrafts.drafts.length,
        ownerErrorCount: ownerDrafts.errors.length,
        otherOwnerCount: otherOwnerDrafts.drafts.length,
      };
    });

    assert.deepStrictEqual(
      { initialRevision, ...result },
      {
        initialRevision: 1,
        recoveredRevision: 1,
        recoveredName: "Engine overview",
        otherAccount: null,
        otherDeployment: null,
        secondRevision: 2,
        historyAfterSecondSave: 1,
        conflict: true,
        restoredRevision: 3,
        restoredName: "Engine overview",
        invalidRejected: true,
        quotaError: true,
        revisionAfterFailedWrite: 3,
        abortedWrite: true,
        revisionAfterAbortedWrite: 3,
        readableCurrentRevision: 3,
        historyIssue: true,
        damagedHistoryBlocksSave: true,
        ownerCount: 1,
        ownerErrorCount: 1,
        otherOwnerCount: 0,
      },
    );
    process.stdout.write("IndexedDB draft checks passed\n");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
