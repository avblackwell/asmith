// Copied from app/client/src/integration/drafts/IndexedDbDraftStore.ts.
// This pure browser store preserves the existing draft schema and revision checks.
import type { DashboardDocument } from "../document";
import { parseDashboardDocument } from "../document";

const DATABASE_NAME = "operator-display-drafts";
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";
const OWNER_INDEX = "byOwner";
const MAX_HISTORY_ENTRIES = 20;

/** The deployment id must distinguish installations that could share an account id. */
export interface DraftScope {
  deploymentId: string;
  accountId: string;
  documentId: string;
}

export interface DraftSnapshot {
  revision: number;
  savedAt: string;
  document: DashboardDocument;
}

export interface DraftRecord extends DraftScope {
  key: string;
  revision: number;
  savedAt: string;
  document: DashboardDocument;
  history: DraftSnapshot[];
  /** The current document is readable, but raw history needs manual recovery. */
  historyIssue?: string;
}

export interface DraftListResult {
  drafts: DraftRecord[];
  errors: Array<{ key: string; message: string }>;
}

export class DraftConflictError extends Error {
  constructor() {
    super(
      "The local draft changed since it was loaded. Reload it before saving.",
    );
    this.name = "DraftConflictError";
  }
}

export class DraftStorageUnavailableError extends Error {
  constructor() {
    super(
      "IndexedDB is unavailable; export this document to avoid losing changes.",
    );
    this.name = "DraftStorageUnavailableError";
  }
}

export class DraftCorruptHistoryError extends Error {
  constructor() {
    super(
      "Draft history is damaged. Export the current document before repairing it.",
    );
    this.name = "DraftCorruptHistoryError";
  }
}

const nonEmpty = (value: unknown, field: keyof DraftScope): string => {
  if (typeof value !== "string") {
    throw new Error(`Draft ${field} must be a string`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`Draft ${field} must be nonempty`);
  }

  return trimmed;
};

const normalizeScope = (scope: DraftScope): DraftScope => ({
  deploymentId: nonEmpty(scope.deploymentId, "deploymentId"),
  accountId: nonEmpty(scope.accountId, "accountId"),
  documentId: nonEmpty(scope.documentId, "documentId"),
});

const keyFor = (scope: DraftScope): string =>
  JSON.stringify([scope.deploymentId, scope.accountId, scope.documentId]);

const openDatabase = async (): Promise<IDBDatabase> => {
  if (typeof indexedDB === "undefined") {
    throw new DraftStorageUnavailableError();
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let settled = false;

    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.createObjectStore(STORE_NAME, { keyPath: "key" });

      store.createIndex(OWNER_INDEX, ["deploymentId", "accountId"]);
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
      } else {
        settled = true;
        resolve(request.result);
      }
    };
    request.onerror = () => {
      settled = true;
      reject(request.error ?? new DraftStorageUnavailableError());
    };
    request.onblocked = () => {
      settled = true;
      reject(new DraftStorageUnavailableError());
    };
  });
};

const parseStoredRecord = (value: unknown): DraftRecord => {
  if (!value || typeof value !== "object") {
    throw new Error("Stored draft is invalid");
  }

  const record = value as DraftRecord;
  const scope = normalizeScope(record);

  if (
    record.key !== keyFor(scope) ||
    !Number.isSafeInteger(record.revision) ||
    record.revision < 1 ||
    typeof record.savedAt !== "string"
  ) {
    throw new Error("Stored draft metadata is invalid");
  }

  const document = parseDashboardDocument(record.document);

  if (document.documentId !== scope.documentId) {
    throw new Error("Stored draft document ID does not match its key");
  }

  let history: DraftSnapshot[] = [];
  let historyIssue: string | undefined;

  try {
    if (!Array.isArray(record.history)) {
      throw new Error("Stored draft history is invalid");
    }

    let priorRevision = 0;

    history = record.history.map((snapshot) => {
      if (
        !snapshot ||
        !Number.isSafeInteger(snapshot.revision) ||
        snapshot.revision <= priorRevision ||
        snapshot.revision >= record.revision ||
        typeof snapshot.savedAt !== "string"
      ) {
        throw new Error("Stored draft history is invalid");
      }

      priorRevision = snapshot.revision;
      const historicalDocument = parseDashboardDocument(snapshot.document);

      if (historicalDocument.documentId !== scope.documentId) {
        throw new Error(
          "Stored draft history document ID does not match its key",
        );
      }

      return {
        revision: snapshot.revision,
        savedAt: snapshot.savedAt,
        document: historicalDocument,
      };
    });
  } catch (error) {
    // Do not overwrite the raw record: the current working copy can still be
    // exported even when an older snapshot cannot be read by this client.
    historyIssue = error instanceof Error ? error.message : String(error);
  }

  return {
    ...record,
    document,
    history,
    historyIssue,
  };
};

/**
 * These operations never call the marketplace. The caller must supply the current
 * revision, or null for a new draft, so parallel tabs cannot silently overwrite it.
 */
export class IndexedDbDraftStore {
  async load(scopeInput: DraftScope): Promise<DraftRecord | null> {
    const scope = normalizeScope(scopeInput);
    const database = await openDatabase();

    try {
      return await new Promise<DraftRecord | null>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).get(keyFor(scope));

        request.onsuccess = () => {
          try {
            resolve(request.result ? parseStoredRecord(request.result) : null);
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

  async list(
    deploymentId: string,
    accountId: string,
  ): Promise<DraftListResult> {
    const owner = [
      nonEmpty(deploymentId, "deploymentId"),
      nonEmpty(accountId, "accountId"),
    ];
    const database = await openDatabase();

    try {
      return await new Promise<DraftListResult>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const request = transaction
          .objectStore(STORE_NAME)
          .index(OWNER_INDEX)
          .getAll(IDBKeyRange.only(owner));

        request.onsuccess = () => {
          const result: DraftListResult = { drafts: [], errors: [] };

          request.result.forEach((value: unknown) => {
            try {
              result.drafts.push(parseStoredRecord(value));
            } catch (error) {
              const raw = value as { key?: unknown };

              result.errors.push({
                key: typeof raw?.key === "string" ? raw.key : "(unknown)",
                message: error instanceof Error ? error.message : String(error),
              });
            }
          });
          resolve(result);
        };
        request.onerror = () => reject(request.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }

  async save(
    scopeInput: DraftScope,
    input: DashboardDocument,
    expectedRevision: number | null,
  ): Promise<DraftRecord> {
    const scope = normalizeScope(scopeInput);
    // Validation happens before the transaction, so an invalid document cannot
    // damage the most recent good working copy.
    const document = parseDashboardDocument(
      JSON.parse(JSON.stringify(parseDashboardDocument(input))),
    );

    if (document.documentId !== scope.documentId) {
      throw new Error("Draft document ID must match its scope");
    }

    const database = await openDatabase();

    try {
      return await new Promise<DraftRecord>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(keyFor(scope));
        let next: DraftRecord | undefined;
        let conflict = false;
        let invalidRecord: unknown;
        let writeError: unknown;

        request.onsuccess = () => {
          let existing: DraftRecord | undefined;

          try {
            existing = request.result
              ? parseStoredRecord(request.result)
              : undefined;
          } catch (error) {
            invalidRecord = error;
            transaction.abort();

            return;
          }

          if (existing?.historyIssue) {
            invalidRecord = new DraftCorruptHistoryError();
            transaction.abort();

            return;
          }

          if ((existing?.revision ?? null) !== expectedRevision) {
            conflict = true;
            transaction.abort();

            return;
          }

          const savedAt = new Date().toISOString();
          const history = existing
            ? [
                ...existing.history,
                {
                  revision: existing.revision,
                  savedAt: existing.savedAt,
                  document: existing.document,
                },
              ].slice(-MAX_HISTORY_ENTRIES)
            : [];

          next = {
            ...scope,
            key: keyFor(scope),
            revision: (existing?.revision ?? 0) + 1,
            savedAt,
            document,
            history,
          };
          try {
            store.put(next);
          } catch (error) {
            writeError = error;
            transaction.abort();
          }
        };
        transaction.oncomplete = () => resolve(next as DraftRecord);
        transaction.onabort = () =>
          reject(
            conflict
              ? new DraftConflictError()
              : invalidRecord ??
                  writeError ??
                  transaction.error ??
                  new DraftStorageUnavailableError(),
          );
        transaction.onerror = () => {
          // The abort handler reports the transaction error after rollback.
        };
      });
    } finally {
      database.close();
    }
  }

  async restore(
    scope: DraftScope,
    historyRevision: number,
    expectedRevision: number,
  ): Promise<DraftRecord> {
    const current = await this.load(scope);

    if (!current || current.revision !== expectedRevision) {
      throw new DraftConflictError();
    }

    const snapshot = current.history.find(
      ({ revision }) => revision === historyRevision,
    );

    if (!snapshot) {
      throw new Error(`Draft revision ${historyRevision} is unavailable`);
    }

    return this.save(scope, snapshot.document, expectedRevision);
  }
}
