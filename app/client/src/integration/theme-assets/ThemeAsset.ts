import type { AppTheme } from "entities/AppTheming";
import {
  parseDashboardDocument,
  serializeDashboardDocument,
} from "../document";
import type { DashboardDocument, InlineDashboardTheme } from "../document";

export const THEME_ASSET_SCHEMA_VERSION = 1 as const;

/** Selected Appsmith theme values, independent of marketplace metadata. */
export interface ThemeAsset {
  assetKind: "theme";
  schemaVersion: typeof THEME_ASSET_SCHEMA_VERSION;
  name: string;
  properties: InlineDashboardTheme["properties"];
}

export class ThemeAssetValidationError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = "ThemeAssetValidationError";
  }
}

function fail(path: string, message: string): never {
  throw new ThemeAssetValidationError(path, message);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    fail(path, "expected a plain object");
  }

  return value as Record<string, unknown>;
}

function nonemptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    fail(path, "expected a nonempty string");
  }

  return value as string;
}

function exactKeys(
  value: Record<string, unknown>,
  path: string,
  expected: readonly string[],
): void {
  for (const [key] of Object.entries(value)) {
    if (!expected.includes(key)) fail(`${path}.${key}`, "unknown field");
  }

  for (const key of expected) {
    if (!(key in value)) fail(`${path}.${key}`, "missing field");
  }
}

function stringMap(value: unknown, path: string): Record<string, string> {
  const map = record(value, path);

  for (const [key, entry] of Object.entries(map)) {
    nonemptyString(entry, `${path}.${key}`);
  }

  return map as Record<string, string>;
}

/** Validate the full, versioned JSON package before it reaches the editor. */
export function parseThemeAsset(input: unknown): ThemeAsset {
  const asset = record(input, "$");

  exactKeys(asset, "$", ["assetKind", "schemaVersion", "name", "properties"]);

  if (asset.assetKind !== "theme") fail("$.assetKind", 'expected "theme"');

  if (asset.schemaVersion !== THEME_ASSET_SCHEMA_VERSION) {
    fail("$.schemaVersion", `expected ${THEME_ASSET_SCHEMA_VERSION}`);
  }

  nonemptyString(asset.name, "$.name");

  const properties = record(asset.properties, "$.properties");

  exactKeys(properties, "$.properties", [
    "colors",
    "borderRadius",
    "boxShadow",
    "fontFamily",
  ]);

  const groups = [
    ["colors", ["primaryColor", "backgroundColor"]],
    ["borderRadius", ["appBorderRadius"]],
    ["boxShadow", ["appBoxShadow"]],
    ["fontFamily", ["appFont"]],
  ] as const;

  for (const [groupName, required] of groups) {
    const path = `$.properties.${groupName}`;
    const group = stringMap(properties[groupName], path);

    for (const key of required) {
      nonemptyString(group[key], `${path}.${key}`);
    }
  }

  return asset as unknown as ThemeAsset;
}

export function serializeThemeAsset(input: unknown): string {
  return JSON.stringify(parseThemeAsset(input), null, 2);
}

export function importThemeAssetJson(json: string): ThemeAsset {
  let input: unknown;

  try {
    input = JSON.parse(json);
  } catch {
    fail("$", "expected valid JSON");
  }

  return parseThemeAsset(input);
}

/** Create an uploadable asset from the dashboard's current inline theme. */
export function themeAssetFromDocument(input: unknown): ThemeAsset {
  const document = parseDashboardDocument(input);

  if (document.theme.kind !== "inline") {
    fail("$.theme", "resolve the marketplace theme before uploading");
  }

  return importThemeAssetJson(
    JSON.stringify({
      assetKind: "theme",
      schemaVersion: THEME_ASSET_SCHEMA_VERSION,
      name: document.theme.name,
      properties: document.theme.properties,
    }),
  );
}

/** Install a copy of a theme so saved dashboards render without another fetch. */
export function applyThemeAsset(
  input: unknown,
  assetInput: unknown,
): DashboardDocument {
  const asset = parseThemeAsset(assetInput);
  const document = JSON.parse(
    serializeDashboardDocument(input),
  ) as DashboardDocument;

  document.theme = {
    kind: "inline",
    name: asset.name,
    properties: JSON.parse(JSON.stringify(asset.properties)),
  };

  return parseDashboardDocument(document);
}

/** Adapt selected package values for Appsmith's existing ThemeProvider. */
export function appThemeFromThemeAsset(
  assetInput: unknown,
  id = "marketplace-theme",
): AppTheme {
  const asset = parseThemeAsset(assetInput);

  nonemptyString(id, "$.id");
  const properties = JSON.parse(
    JSON.stringify(asset.properties),
  ) as AppTheme["properties"];

  return {
    id,
    name: asset.name,
    displayName: asset.name,
    created_by: "marketplace",
    created_at: "",
    config: {
      order: 0,
      colors: { ...properties.colors },
      borderRadius: {},
      boxShadow: {},
      fontFamily: {},
    },
    properties,
    stylesheet: {},
  };
}
