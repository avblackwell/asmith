/** @jest-environment node */

import { exampleDashboardDocument } from "../document";
import {
  appThemeFromThemeAsset,
  applyThemeAsset,
  importThemeAssetJson,
  parseThemeAsset,
  serializeThemeAsset,
  ThemeAssetValidationError,
  themeAssetFromDocument,
} from "./ThemeAsset";

const asset = {
  assetKind: "theme" as const,
  schemaVersion: 1 as const,
  name: "Night shift",
  properties: {
    colors: {
      primaryColor: "#1731b0",
      backgroundColor: "#101820",
      accentColor: "#ffc857",
    },
    borderRadius: { appBorderRadius: "0.5rem" },
    boxShadow: { appBoxShadow: "0 2px 6px #000" },
    fontFamily: { appFont: "Inter", codeFont: "Monaco" },
  },
};

describe("ThemeAsset", () => {
  it("round-trips selected properties and converts them to Appsmith", () => {
    const parsed = importThemeAssetJson(serializeThemeAsset(asset));

    expect(parsed).toEqual(asset);
    const appTheme = appThemeFromThemeAsset(parsed, "marketplace-43");

    expect(appTheme.id).toBe("marketplace-43");
    expect(appTheme.displayName).toBe("Night shift");
    expect(appTheme.properties.colors.accentColor).toBe("#ffc857");
    expect(appTheme.properties.fontFamily.codeFont).toBe("Monaco");
    expect(appTheme.config.colors.primaryColor).toBe("#1731b0");
  });

  it("rejects malformed packages before the renderer sees them", () => {
    expect(() => parseThemeAsset({ ...asset, schemaVersion: 2 })).toThrow(
      ThemeAssetValidationError,
    );
    expect(() =>
      parseThemeAsset({
        ...asset,
        properties: { ...asset.properties, colors: {} },
      }),
    ).toThrow("$.properties.colors.primaryColor");
    expect(() =>
      parseThemeAsset({
        ...asset,
        properties: { ...asset.properties, sessionUuid: "secret" },
      }),
    ).toThrow("$.properties.sessionUuid");
    expect(() => importThemeAssetJson("{")).toThrow(ThemeAssetValidationError);
  });

  it("applies a copied inline theme and keeps the source document unchanged", () => {
    const original = JSON.parse(JSON.stringify(exampleDashboardDocument));
    const installed = applyThemeAsset(original, asset);

    expect(installed.theme).toEqual({
      kind: "inline",
      name: "Night shift",
      properties: asset.properties,
    });
    expect(original.theme).toEqual(exampleDashboardDocument.theme);

    if (installed.theme.kind === "inline") {
      installed.theme.properties.colors.primaryColor = "#ffffff";
    }

    expect(asset.properties.colors.primaryColor).toBe("#1731b0");
    expect(original.theme).toEqual(exampleDashboardDocument.theme);
  });

  it("extracts the current inline theme for a new marketplace publication", () => {
    const installed = applyThemeAsset(exampleDashboardDocument, asset);

    expect(themeAssetFromDocument(installed)).toEqual(asset);
    expect(() =>
      themeAssetFromDocument({
        ...installed,
        theme: { kind: "marketplace", itemId: "43", revision: "1" },
      }),
    ).toThrow("resolve the marketplace theme");
  });
});
