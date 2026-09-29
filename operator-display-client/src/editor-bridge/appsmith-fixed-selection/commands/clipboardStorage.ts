import type { FixedWidgetClipboard } from "./index";

const DATABASE_NAME = "operator-display-widget-clipboard";
const DATABASE_VERSION = 1;
const STORE_NAME = "clipboard";

/** One Appsmith-style clipboard shared by this account's Fixed draft editors. */
export interface FixedClipboardScope {
  deploymentId: string;
  accountId: string;
}

export interface FixedWidgetClipboardStore {
  save(scope: FixedClipboardScope, clipboard: FixedWidgetClipboard): Promise<void>;
  load(scope: FixedClipboardScope): Promise<FixedWidgetClipboard | null>;
}

interface StoredClipboard extends FixedClipboardScope {
  key: string;
  version: 1;
  clipboard: FixedWidgetClipboard;
}

function owner(scope: FixedClipboardScope): FixedClipboardScope {
  const deploymentId = scope.deploymentId.trim();
  const accountId = scope.accountId.trim();
  if (!deploymentId || !accountId) {
    throw new Error("Widget clipboard requires a deployment and account.");
  }
  return { deploymentId, accountId };
}

function keyFor(scope: FixedClipboardScope): string {
  return JSON.stringify([scope.deploymentId, scope.accountId]);
}

function isFixedClipboard(value: unknown): value is FixedWidgetClipboard {
  if (value === null || typeof value !== "object") return false;
  const clipboard = value as Partial<FixedWidgetClipboard>;
  return clipboard.sourceLayoutSystem === "FIXED" &&
    typeof clipboard.sourceDocumentId === "string" &&
    typeof clipboard.sourceCanvasId === "string" &&
    typeof clipboard.sourceColumnSpace === "number" &&
    clipboard.sourceColumnSpace > 0 &&
    typeof clipboard.sourceRowSpace === "number" &&
    clipboard.sourceRowSpace > 0 &&
    Array.isArray(clipboard.widgets) &&
    Array.isArray(clipboard.variables) &&
    Array.isArray(clipboard.bindings) &&
    Array.isArray(clipboard.componentDependencies);
}

function parseStored(value: unknown, scope: FixedClipboardScope): FixedWidgetClipboard {
  if (value === null || typeof value !== "object") {
    throw new Error("Stored widget clipboard is invalid.");
  }
  const record = value as Partial<StoredClipboard>;
  if (record.version !== 1 || record.key !== keyFor(scope) ||
    record.deploymentId !== scope.deploymentId ||
    record.accountId !== scope.accountId || !isFixedClipboard(record.clipboard)) {
    throw new Error("Stored widget clipboard is invalid.");
  }
  return record.clipboard;
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is unavailable for widget clipboard persistence.");
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Widget clipboard storage failed."));
    request.onblocked = () => reject(new Error("Widget clipboard storage is blocked."));
  });
}

/** IndexedDB replacement for Appsmith's localforage CopiedWidget entry. */
export class IndexedDbFixedWidgetClipboardStore implements FixedWidgetClipboardStore {
  async save(scopeInput: FixedClipboardScope, clipboard: FixedWidgetClipboard): Promise<void> {
    const scope = owner(scopeInput);
    if (!isFixedClipboard(clipboard)) {
      throw new Error("The copied widgets are invalid.");
    }
    const database = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        const record: StoredClipboard = { ...scope, key: keyFor(scope),
          version: 1, clipboard };
        transaction.objectStore(STORE_NAME).put(record);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }

  async load(scopeInput: FixedClipboardScope): Promise<FixedWidgetClipboard | null> {
    const scope = owner(scopeInput);
    const database = await openDatabase();
    try {
      return await new Promise<FixedWidgetClipboard | null>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).get(keyFor(scope));
        request.onsuccess = () => {
          try {
            resolve(request.result ? parseStored(request.result, scope) : null);
          } catch (error) {
            reject(error);
          }
        };
        request.onerror = () => reject(request.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }
}
