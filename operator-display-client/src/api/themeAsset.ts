import {
  parseDashboardDocument,
  serializeDashboardDocument,
} from "../document";
import type { DashboardDocument, InlineDashboardTheme } from "../document";

/** Adapted from app/client/src/integration/theme-assets/ThemeAsset.ts (Apache-2.0). */
export interface ThemeAsset {
  assetKind: "theme";
  schemaVersion: 1;
  name: string;
  properties: InlineDashboardTheme["properties"];
}

export class ThemeAssetValidationError extends Error {
  constructor(readonly path: string, message: string) {
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

  return value;
}

function exactKeys(
  value: Record<string, unknown>,
  path: string,
  expected: readonly string[],
): void {
  for (const key of Object.keys(value)) {
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

/** Validate a downloaded theme package before it can change renderer values. */
export function parseThemeAsset(input: unknown): ThemeAsset {
  const asset = record(input, "$");

  exactKeys(asset, "$", ["assetKind", "schemaVersion", "name", "properties"]);

  if (asset.assetKind !== "theme") fail("$.assetKind", 'expected "theme"');
  if (asset.schemaVersion !== 1) fail("$.schemaVersion", "expected 1");

  nonemptyString(asset.name, "$.name");
  const properties = record(asset.properties, "$.properties");

  exactKeys(properties, "$.properties", [
    "colors",
    "borderRadius",
    "boxShadow",
    "fontFamily",
  ]);

  for (const [groupName, required] of [
    ["colors", ["primaryColor", "backgroundColor"]],
    ["borderRadius", ["appBorderRadius"]],
    ["boxShadow", ["appBoxShadow"]],
    ["fontFamily", ["appFont"]],
  ] as const) {
    const path = `$.properties.${groupName}`;
    const group = stringMap(properties[groupName], path);

    for (const key of required) {
      nonemptyString(group[key], `${path}.${key}`);
    }
  }

  return asset as unknown as ThemeAsset;
}

/** Copies a resolved theme into the display document; the saved bytes stay intact. */
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
