import type { AppsmithWidgetDsl } from "../../../document";
import defaultApp from "./defaultApp";

// Appsmith CustomWidget/constants.ts and CustomWidget/widget/index.tsx.
export const DEFAULT_MODEL = `{
  "tips": [
    "Pass data to this widget in the default model field",
    "Access data in the javascript file using the appsmith.model variable",
    "Create events in the widget and trigger them in the javascript file using appsmith.triggerEvent('eventName')",
    "Access data in CSS as var(--appsmith-model-{property-name})"
  ]
}`;

export interface CustomSrcDoc {
  html: string;
  css: string;
  js: string;
}

export function customWidgetDefaults(): Record<string, unknown> {
  return {
    widgetName: "Custom",
    rows: 30,
    columns: 23,
    version: 1,
    onResetClick: "{{showAlert('Successfully reset!!', '');}}",
    events: ["onResetClick"],
    isVisible: true,
    defaultModel: DEFAULT_MODEL,
    srcDoc: { ...defaultApp.srcDoc },
    uncompiledSrcDoc: { ...defaultApp.uncompiledSrcDoc },
    theme: "{{appsmith.theme}}",
    dynamicBindingPathList: [{ key: "theme" }],
    dynamicTriggerPathList: [{ key: "onResetClick" }],
    borderColor: "#E0DEDE",
    borderWidth: "1",
    backgroundColor: "#FFFFFF",
    dynamicHeight: "FIXED",
  };
}

export const CUSTOM_WIDGET_DEFAULT_PROPERTIES = { model: "defaultModel" } as const;
export const CUSTOM_WIDGET_SANDBOX =
  "allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-scripts";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveCustomSrcDoc(value: unknown): CustomSrcDoc {
  if (!isRecord(value)) return defaultApp.srcDoc;
  return {
    html: typeof value.html === "string" ? value.html : "",
    css: typeof value.css === "string" ? value.css : "",
    js: typeof value.js === "string" ? value.js : "",
  };
}

export function resolveCustomModel(widget: AppsmithWidgetDsl,
  meta?: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(meta?.model)) return meta.model;
  if (isRecord(widget.model)) return widget.model;
  if (isRecord(widget.defaultModel)) return widget.defaultModel;
  if (typeof widget.defaultModel === "string") {
    try {
      const value: unknown = JSON.parse(widget.defaultModel);
      if (isRecord(value)) return value;
    } catch {
      // An unresolved Appsmith binding is evaluated by the document binding layer.
    }
  }
  return {};
}
