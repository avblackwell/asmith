import { parseDashboardDocument } from "../../document";
import type { DashboardDocument, InlineDashboardTheme, MarketplaceDashboardTheme } from "../../document";
import type { EditResult } from "../editable-store/editDocument";
import { fixedThemePreset } from "./presets";

type ThemeProperties = InlineDashboardTheme["properties"];

function finishThemeEdit(
  sourceJson: string,
  document: DashboardDocument,
  selectedWidgetId: string | null,
  selectedWidgetIds: readonly string[],
): EditResult {
  const documentJson = JSON.stringify(parseDashboardDocument(document));
  return {
    documentJson: documentJson === sourceJson ? sourceJson : documentJson,
    selectedWidgetId,
    selectedWidgetIds: [...selectedWidgetIds],
  };
}

/** Appsmith updateSelectedAppThemeAction, with the selected values in our draft. */
export function updateThemePropertiesInDocument(
  sourceJson: string,
  properties: ThemeProperties,
  selectedWidgetId: string | null,
  selectedWidgetIds: readonly string[],
): EditResult {
  const document = parseDashboardDocument(JSON.parse(sourceJson));
  if (document.theme.kind !== "inline") {
    throw new Error("Choose a theme before editing this marketplace theme reference.");
  }
  if (JSON.stringify(document.theme.properties) === JSON.stringify(properties)) {
    return { documentJson: sourceJson, selectedWidgetId, selectedWidgetIds: [...selectedWidgetIds] };
  }
  document.theme = {
    ...document.theme,
    properties: JSON.parse(JSON.stringify(properties)) as ThemeProperties,
  };
  return finishThemeEdit(sourceJson, document, selectedWidgetId, selectedWidgetIds);
}

/** The first edit copies a resolved Marketplace theme into this local draft. */
export function updateReferencedThemePropertiesInDocument(
  sourceJson: string,
  reference: MarketplaceDashboardTheme,
  resolvedTheme: InlineDashboardTheme,
  properties: ThemeProperties,
  selectedWidgetId: string | null,
  selectedWidgetIds: readonly string[],
): EditResult {
  const document = parseDashboardDocument(JSON.parse(sourceJson));
  if (document.theme.kind !== "marketplace" ||
    document.theme.itemId !== reference.itemId ||
    document.theme.revision !== reference.revision) {
    throw new Error("The referenced theme changed before this edit could be applied.");
  }

  document.theme = {
    kind: "inline",
    name: resolvedTheme.name,
    properties: JSON.parse(JSON.stringify(properties)) as ThemeProperties,
  };
  return finishThemeEdit(sourceJson, document, selectedWidgetId, selectedWidgetIds);
}

/** Appsmith changeSelectedAppThemeAction, using a checked-in system preset. */
export function selectThemePresetInDocument(
  sourceJson: string,
  presetName: string,
  selectedWidgetId: string | null,
  selectedWidgetIds: readonly string[],
): EditResult {
  const preset = fixedThemePreset(presetName);
  if (!preset) throw new Error(`Unknown Appsmith theme: ${presetName}`);
  const document = parseDashboardDocument(JSON.parse(sourceJson));
  document.theme = {
    kind: "inline",
    name: preset.name,
    properties: JSON.parse(JSON.stringify(preset.properties)) as ThemeProperties,
  };
  return finishThemeEdit(sourceJson, document, selectedWidgetId, selectedWidgetIds);
}

/** Appsmith changeSelectedAppThemeAction for a saved, non-system theme. */
export function applySavedThemeInDocument(
  sourceJson: string,
  theme: InlineDashboardTheme,
  selectedWidgetId: string | null,
  selectedWidgetIds: readonly string[],
): EditResult {
  const document = parseDashboardDocument(JSON.parse(sourceJson));
  document.theme = JSON.parse(JSON.stringify(theme)) as InlineDashboardTheme;
  return finishThemeEdit(sourceJson, document, selectedWidgetId, selectedWidgetIds);
}
