import type { AppsmithWidgetDsl } from "../../../document";

// Appsmith CustomWidgetBuilder/constants.ts. Kept outside the compiler bundle
// so the workbench can run the property control without loading Babel/Sass.
export const CUSTOM_WIDGET_BUILDER_EVENTS = {
  READY: "READY",
  READY_ACK: "READY_ACK",
  UPDATE_SRCDOC: "UPDATE_SRCDOC",
  UPDATE_REFERENCES: "UPDATE_REFERENCES",
  UPDATE_REFERENCES_ACK: "UPDATE_REFERENCES_ACK",
  PAUSE: "PAUSE",
  RESUME: "RESUME",
  DISCONNECTED: "DISCONNECTED",
  CLOSE: "CLOSE",
} as const;

export function eventReferences(widget: AppsmithWidgetDsl): Record<string, string> {
  const names = Array.isArray(widget.events)
    ? widget.events.filter((value): value is string => typeof value === "string") : [];
  return Object.fromEntries(names.map((name) =>
    [name, typeof widget[name] === "string" ? widget[name] : ""]));
}
