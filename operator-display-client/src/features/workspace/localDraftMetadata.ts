/**
 * Read-only view of the draft store used by the existing dashboard editor.
 * The store/schema come from integration/drafts/IndexedDbDraftStore.ts.
 * Document bytes remain in IndexedDB and never enter the product Redux store.
 */

const DATABASE_NAME = "operator-display-drafts";
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";
const OWNER_INDEX = "byOwner";

export interface LocalDraftSummary {
  documentId: string;
  name: string;
  revision: number;
  savedAt: string;
}

export interface LocalDraftSummaryList {
  drafts: LocalDraftSummary[];
  damagedCount: number;
}

function recordSummary(
  input: unknown,
  deploymentId: string,
  accountId: string,
): LocalDraftSummary {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid draft record");
  }

  const record = input as Record<string, unknown>;
  const document = record.document;

  if (!document || typeof document !== "object") {
    throw new Error("Invalid draft document");
  }

  const body = document as Record<string, unknown>;

  if (
    record.deploymentId !== deploymentId ||
    record.accountId !== accountId ||
    typeof record.documentId !== "string" ||
    !record.documentId ||
    record.key !==
      JSON.stringify([deploymentId, accountId, record.documentId]) ||
    !Number.isSafeInteger(record.revision) ||
    (record.revision as number) < 1 ||
    typeof record.savedAt !== "string" ||
    !Number.isFinite(Date.parse(record.savedAt)) ||
    body.assetKind !== "dashboard" ||
    body.documentId !== record.documentId ||
    typeof body.name !== "string" ||
    !body.name.trim()
  ) {
    throw new Error("Invalid draft metadata");
  }

  return {
    documentId: record.documentId,
    name: body.name,
    revision: record.revision as number,
    savedAt: record.savedAt,
  };
}

function openDraftDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Local draft storage is unavailable."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      // Match the existing editor's first-use schema exactly. This permits the
      // standalone catalog to load before the editor has saved its first draft.
      const store = request.result.createObjectStore(STORE_NAME, {
        keyPath: "key",
      });

      store.createIndex(OWNER_INDEX, ["deploymentId", "accountId"]);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Local draft storage failed."));
    request.onblocked = () =>
      reject(new Error("Local draft storage is blocked by another tab."));
  });
}

export async function listLocalDraftMetadata(
  deploymentId: string,
  accountId: string,
): Promise<LocalDraftSummaryList> {
  if (!deploymentId.trim() || !accountId.trim()) {
    throw new TypeError("Draft owner is required.");
  }

  const database = await openDraftDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction
        .objectStore(STORE_NAME)
        .index(OWNER_INDEX)
        .getAll(IDBKeyRange.only([deploymentId, accountId]));

      request.onsuccess = () => {
        const result: LocalDraftSummaryList = { drafts: [], damagedCount: 0 };

        request.result.forEach((record: unknown) => {
          try {
            result.drafts.push(recordSummary(record, deploymentId, accountId));
          } catch {
            result.damagedCount += 1;
          }
        });
        result.drafts.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
        resolve(result);
      };
      request.onerror = () => reject(request.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}
