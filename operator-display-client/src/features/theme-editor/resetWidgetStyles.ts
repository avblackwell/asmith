import { parseDashboardDocument, type AppsmithWidgetDsl } from "../../document";
import sourceBindings from "./appsmithStylesheetBindings.json";

/** Appsmith's getPropertiesToUpdateForReset payload, without WidgetFactory or its server. */
export interface ThemeStyleResetPatch {
  widgetId: string;
  updates: { modify: Record<string, string> };
}

type StyleTree = { [key: string]: string | StyleTree };
const widgetStylesheets = sourceBindings as Record<string, StyleTree>;
const themeBinding = /^\{\{(appsmith\.theme\.[a-zA-Z0-9_.]+)\}\}$/;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function atPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => object(value)?.[key], source);
}

function setPath(source: Record<string, unknown>, path: string, value: string): void {
  const segments = path.split(".");
  let current = source;
  for (const key of segments.slice(0, -1)) {
    const next = object(current[key]);
    if (!next) return;
    current = next;
  }
  current[segments[segments.length - 1]] = value;
}

function themeExpression(binding: string): string | null {
  return themeBinding.exec(binding)?.[1] ?? null;
}

function fieldBinding(binding: string, widgetName: string): string | null {
  const expression = themeExpression(binding);
  if (!expression) return null;
  // JSONFormWidget/constants.ts:getBindingTemplate and helper.ts:getFieldStylesheet.
  return `{{((sourceData, formData, fieldState) => ((${expression})))(${widgetName}.sourceData, ${widgetName}.formData, ${widgetName}.fieldState)}}`;
}

function tableColumnBinding(binding: string, widgetName: string): string {
  // AppTheming/utils.ts wraps every table child stylesheet value, including
  // literals such as `none`, through combineDynamicBindings.
  const expression = themeExpression(binding);
  const js = expression ? `(${expression})` : JSON.stringify(binding);
  return `{{${widgetName}.sanitizedTableData.map((currentRow) => ( ${js}))}}`;
}

function collectJsonFormFields(
  schemaItem: Record<string, unknown>,
  path: string,
  childStylesheet: StyleTree,
  widgetName: string,
  modify: Record<string, string>,
): void {
  const fieldType = schemaItem.fieldType;
  const fieldKey = typeof fieldType === "string"
    ? fieldType.toUpperCase().replace(/\s+/g, "_") : "";
  const defaults = object(childStylesheet[fieldKey]);
  if (defaults) {
    for (const [name, binding] of Object.entries(defaults)) {
      if (typeof binding !== "string") continue;
      const reset = fieldBinding(binding, widgetName);
      if (reset && schemaItem[name] !== reset) modify[`${path}.${name}`] = reset;
    }
  }
  const children = object(schemaItem.children);
  if (!children) return;
  for (const [key, value] of Object.entries(children)) {
    const child = object(value);
    if (child) collectJsonFormFields(child, `${path}.children.${key}`,
      childStylesheet, widgetName, modify);
  }
}

/** Follows AppTheming/utils.ts:getPropertiesToUpdateForReset for Fixed widgets. */
export function getThemeStyleResetPatches(root: AppsmithWidgetDsl): ThemeStyleResetPatch[] {
  const patches: ThemeStyleResetPatch[] = [];
  function visit(widget: AppsmithWidgetDsl): void {
    const stylesheet = widgetStylesheets[widget.type];
    if (stylesheet) {
      const modify: Record<string, string> = {};
      for (const [name, binding] of Object.entries(stylesheet)) {
        if (typeof binding === "string" && themeExpression(binding) && widget[name] !== binding) {
          modify[name] = binding;
        }
      }

      if (widget.type === "BUTTON_GROUP_WIDGET") {
        const groupButtons = object(widget.groupButtons);
        const buttonStyles = object(object(stylesheet.childStylesheet)?.button);
        if (groupButtons && buttonStyles) {
          for (const [buttonId, buttonValue] of Object.entries(groupButtons)) {
            const button = object(buttonValue);
            if (!button) continue;
            for (const [name, binding] of Object.entries(buttonStyles)) {
              if (typeof binding === "string" && themeExpression(binding) && button[name] !== binding) {
                modify[`groupButtons.${buttonId}.${name}`] = binding;
              }
            }
          }
        }
      }

      if (widget.type === "TABLE_WIDGET") {
        const columns = object(widget.primaryColumns);
        const childStyles = object(widget.childStylesheet);
        if (columns && childStyles) {
          for (const [columnId, columnValue] of Object.entries(columns)) {
            const column = object(columnValue);
            if (!column || typeof column.columnType !== "string") continue;
            const defaults = object(childStyles[column.columnType]);
            if (!defaults) continue;
            for (const [name, binding] of Object.entries(defaults)) {
              if (typeof binding !== "string") continue;
              const reset = tableColumnBinding(binding, widget.widgetName);
              if (column[name] !== reset) {
                modify[`primaryColumns.${columnId}.${name}`] = reset;
              }
            }
          }
        }
      }

      if (widget.type === "JSON_FORM_WIDGET") {
        const schema = object(widget.schema);
        const rootField = object(schema?.__root_schema__);
        const childStyles = object(stylesheet.childStylesheet) as StyleTree | null;
        if (rootField && childStyles) collectJsonFormFields(rootField,
          "schema.__root_schema__", childStyles, widget.widgetName, modify);
        for (const buttonStyleKey of ["submitButtonStyles", "resetButtonStyles"]) {
          const defaults = object(stylesheet[buttonStyleKey]);
          const buttonStyles = object(widget[buttonStyleKey]);
          if (!defaults || !buttonStyles) continue;
          for (const [name, binding] of Object.entries(defaults)) {
            if (typeof binding === "string" && themeExpression(binding) && buttonStyles[name] !== binding) {
              modify[`${buttonStyleKey}.${name}`] = binding;
            }
          }
        }
      }

      if (Object.keys(modify).length > 0) {
        patches.push({ widgetId: widget.widgetId, updates: { modify } });
      }
    }
    for (const child of widget.children ?? []) visit(child);
  }
  visit(root);
  return patches;
}

/** Applies the whole reset as one document change for the existing undo/save pipeline. */
export function resetWidgetStylesInDocument(sourceJson: string): {
  documentJson: string;
  changedWidgetIds: string[];
} {
  const document = parseDashboardDocument(JSON.parse(sourceJson));
  const patches = getThemeStyleResetPatches(document.layout.dsl);
  if (!patches.length) return { documentJson: sourceJson, changedWidgetIds: [] };
  const byId = new Map(patches.map((patch) => [patch.widgetId, patch]));
  function visit(widget: AppsmithWidgetDsl): void {
    const patch = byId.get(widget.widgetId);
    if (patch) {
      for (const [path, value] of Object.entries(patch.updates.modify)) {
        setPath(widget as Record<string, unknown>, path, value);
      }
    }
    for (const child of widget.children ?? []) visit(child);
  }
  visit(document.layout.dsl);
  parseDashboardDocument(document);
  return {
    documentJson: JSON.stringify(document),
    changedWidgetIds: patches.map((patch) => patch.widgetId),
  };
}
