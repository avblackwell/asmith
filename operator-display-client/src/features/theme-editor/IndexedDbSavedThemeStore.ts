import { nanoid } from "nanoid";
import { parseThemeAsset } from "../../api/themeAsset";
import type { InlineDashboardTheme } from "../../document";
import { fixedThemePreset } from "../../editor-bridge/appsmith-theme/presets";
import type { ThemePreset } from "../../editor-bridge/appsmith-theme/presets";

const DATABASE_NAME = "operator-display-saved-themes";
const DATABASE_VERSION = 2;
const STORE_NAME = "themes";
const OWNER_INDEX = "byDocumentOwner";

export interface SavedThemeScope {
  deploymentId: string;
  accountId: string;
  documentId: string;
}

export interface SaveThemeInput {
  displayName: string;
  basePresetName: string;
  properties: InlineDashboardTheme["properties"];
}

/** Appsmith's named theme copy, scoped to this operator-display dashboard. */
export interface SavedTheme extends ThemePreset {
  isSystemTheme: false;
  basePresetName: string;
  savedAt: string;
}

interface StoredSavedTheme extends SavedTheme, SavedThemeScope {
  key: string;
}

function nonempty(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a nonempty string`);
  }
  return value.trim();
}

function normalizedScope(scope: SavedThemeScope): SavedThemeScope {
  return {
    deploymentId: nonempty(scope.deploymentId, "deploymentId"),
    accountId: nonempty(scope.accountId, "accountId"),
    documentId: nonempty(scope.documentId, "documentId"),
  };
}

function keyFor(scope: SavedThemeScope, id: string): string {
  return JSON.stringify([scope.deploymentId, scope.accountId, scope.documentId, id]);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringMap(value: unknown, field: string): Record<string, string> {
  const map = record(value, field);
  for (const [key, entry] of Object.entries(map)) nonempty(entry, `${field}.${key}`);
  return map as Record<string, string>;
}

function optionMap(value: unknown, field: string): Record<string, Record<string, string>> {
  const map = record(value, field);
  for (const [key, entry] of Object.entries(map)) stringMap(entry, `${field}.${key}`);
  return map as Record<string, Record<string, string>>;
}

function parseConfig(value: unknown): ThemePreset["config"] {
  const config = record(value, "Saved theme config");
  if (typeof config.order !== "number" || !Number.isFinite(config.order)) {
    throw new Error("Saved theme config.order must be a number");
  }
  if (config.isDeprecated !== undefined && typeof config.isDeprecated !== "boolean") {
    throw new Error("Saved theme config.isDeprecated must be a boolean");
  }
  stringMap(config.colors, "Saved theme config.colors");
  optionMap(config.borderRadius, "Saved theme config.borderRadius");
  optionMap(config.boxShadow, "Saved theme config.boxShadow");
  const fonts = record(config.fontFamily, "Saved theme config.fontFamily");
  for (const [key, entry] of Object.entries(fonts)) {
    if (!Array.isArray(entry) || entry.some((option) => typeof option !== "string" || !option.trim())) {
      throw new Error(`Saved theme config.fontFamily.${key} must be a string array`);
    }
  }
  return config as unknown as ThemePreset["config"];
}

function parseStoredTheme(value: unknown, scope: SavedThemeScope): SavedTheme {
  const stored = record(value, "Saved theme");
  const id = nonempty(stored.id, "Saved theme id");
  const name = nonempty(stored.name, "Saved theme name");
  if (
    stored.key !== keyFor(scope, id) ||
    stored.deploymentId !== scope.deploymentId ||
    stored.accountId !== scope.accountId ||
    stored.documentId !== scope.documentId ||
    name !== `saved:${id}` ||
    stored.isSystemTheme !== false
  ) {
    throw new Error("Saved theme identity does not match its owner");
  }
  const displayName = nonempty(stored.displayName, "Saved theme displayName");
  const basePresetName = nonempty(stored.basePresetName, "Saved theme basePresetName");
  const savedAt = nonempty(stored.savedAt, "Saved theme savedAt");
  if (!Number.isFinite(Date.parse(savedAt))) throw new Error("Saved theme savedAt is invalid");
  const config = parseConfig(stored.config);
  const asset = parseThemeAsset({
    assetKind: "theme",
    schemaVersion: 1,
    name,
    properties: stored.properties,
  });
  return {
    id,
    name,
    displayName,
    isSystemTheme: false,
    basePresetName,
    savedAt,
    config: structuredClone(config),
    properties: structuredClone(asset.properties),
  };
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable; saved themes cannot be stored."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains(STORE_NAME)
        ? request.transaction?.objectStore(STORE_NAME)
        : request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      if (!store) throw new Error("Saved theme storage upgrade failed.");
      // Keep the v1 account-only records and index intact. Their document
      // ownership cannot be inferred, so v2 does not show or alter them.
      if (!store.indexNames.contains(OWNER_INDEX)) {
        store.createIndex(OWNER_INDEX, ["deploymentId", "accountId", "documentId"]);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Opening saved themes failed."));
    request.onblocked = () => reject(new Error("Saved theme storage is blocked by another tab."));
  });
}

/** A local library; saving here never publishes or alters a dashboard draft. */
export class IndexedDbSavedThemeStore {
  async list(scopeInput: SavedThemeScope): Promise<SavedTheme[]> {
    const scope = normalizedScope(scopeInput);
    const database = await openDatabase();
    try {
      return await new Promise<SavedTheme[]>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).index(OWNER_INDEX)
          .getAll(IDBKeyRange.only([scope.deploymentId, scope.accountId, scope.documentId]));
        request.onsuccess = () => {
          try {
            resolve(request.result.map((entry: unknown) => parseStoredTheme(entry, scope))
              .sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
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

  async save(scopeInput: SavedThemeScope, input: SaveThemeInput): Promise<SavedTheme> {
    const scope = normalizedScope(scopeInput);
    const displayName = nonempty(input.displayName, "Theme displayName");
    const basePresetName = nonempty(input.basePresetName, "Theme basePresetName");
    const basePreset = fixedThemePreset(basePresetName);
    if (!basePreset) throw new Error(`Unknown Appsmith theme preset: ${basePresetName}`);

    const id = nanoid(16);
    const name = `saved:${id}`;
    const asset = parseThemeAsset({
      assetKind: "theme",
      schemaVersion: 1,
      name,
      properties: input.properties,
    });
    const saved: SavedTheme = {
      id,
      name,
      displayName,
      isSystemTheme: false,
      basePresetName,
      savedAt: new Date().toISOString(),
      config: structuredClone(basePreset.config),
      properties: structuredClone(asset.properties),
    };
    const stored: StoredSavedTheme = { ...saved, ...scope, key: keyFor(scope, id) };
    const database = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).add(stored);
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => {
          // Abort reports the transaction error after rollback.
        };
      });
      return saved;
    } finally {
      database.close();
    }
  }

  async delete(scopeInput: SavedThemeScope, idInput: string): Promise<void> {
    const scope = normalizedScope(scopeInput);
    const id = nonempty(idInput, "Saved theme id");
    const database = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).delete(keyFor(scope, id));
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => {
          // Abort reports the transaction error after rollback.
        };
      });
    } finally {
      database.close();
    }
  }
}
