import type { AppsmithWidgetDsl } from "../../../document";
import { compileSrcDoc, type CompileResult } from "./compileSrcDoc";
import type { CustomSrcDoc } from "./customWidgetModel";
export { CUSTOM_WIDGET_BUILDER_EVENTS, eventReferences } from "./builderProtocol";

// Literal Appsmith CustomWidgetAddEventButtonControl reserved property names.
export const RESTRICTED_EVENT_NAMES = [
  "onReset", "ENTITY_TYPE", "isVisible", "widgetName", "events",
  "defaultModel", "srcDoc", "uncompiledSrcDoc", "key", "isCanvas",
  "isSearchWildcard", "widgetId", "isLoading", "parentColumnSpace",
  "parentRowSpace", "leftColumn", "rightColumn", "topRow", "bottomRow",
  "mobileLeftColumn", "mobileRightColumn", "mobileTopRow",
  "mobileBottomRow", "model", "meta", "componentHeight",
  "componentWidth", "type", "__evaluation__",
] as const;

export function widgetEventNames(widget: AppsmithWidgetDsl): string[] {
  return Array.isArray(widget.events)
    ? widget.events.filter((value): value is string => typeof value === "string") : [];
}

export function sanitizeEventName(value: string): string {
  return value.split(/\W+/).join("_");
}

export function eventNameError(widget: AppsmithWidgetDsl, value: string):
  "empty" | "duplicate" | "restricted" | null {
  const name = value.trim();
  if (!name) return "empty";
  if (Object.prototype.hasOwnProperty.call(widget, name) ||
    widgetEventNames(widget).includes(name)) return "duplicate";
  if (RESTRICTED_EVENT_NAMES.includes(name as typeof RESTRICTED_EVENT_NAMES[number])) {
    return "restricted";
  }
  return null;
}

export function addEventPatch(widget: AppsmithWidgetDsl, value: string):
  { events: string[] } | null {
  const name = sanitizeEventName(value).trim();
  if (eventNameError(widget, name)) return null;
  return { events: [...widgetEventNames(widget), name] };
}

export function renameEventPatch(widget: AppsmithWidgetDsl, previous: string,
  next: string): { modify: { events: string[] }; triggerPaths: string[] } | null {
  const name = sanitizeEventName(next).trim();
  if (!widgetEventNames(widget).includes(previous) ||
    (name !== previous && eventNameError(widget, name))) return null;
  const paths = Array.isArray(widget.dynamicTriggerPathList)
    ? widget.dynamicTriggerPathList : [];
  return {
    modify: { events: widgetEventNames(widget).map((event) =>
      event === previous ? name : event) },
    triggerPaths: paths.some((entry) =>
      typeof entry === "object" && entry !== null &&
      !Array.isArray(entry) && entry.key === previous) ? [name] : [],
  };
}

export function deleteEventPatch(widget: AppsmithWidgetDsl, eventName: string):
  { events: string[] } {
  return { events: widgetEventNames(widget).filter((name) => name !== eventName) };
}

export function sourceUpdatePatch(uncompiledSrcDoc: CustomSrcDoc):
  CompileResult & { patch: { srcDoc: CustomSrcDoc; uncompiledSrcDoc: CustomSrcDoc } } {
  const result = compileSrcDoc(uncompiledSrcDoc);
  return { ...result, patch: {
    srcDoc: result.code,
    uncompiledSrcDoc,
  } };
}
