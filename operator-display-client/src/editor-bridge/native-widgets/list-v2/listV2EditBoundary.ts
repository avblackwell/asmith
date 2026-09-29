import type { AppsmithWidgetDsl } from "../../../document";

/**
 * Appsmith edits a List's first template row through meta-widget selection and
 * replicates it to the visible rows. Until that editor path is available, the
 * authored template is a locked implementation detail of the List widget.
 */
export function listV2TemplateOwner(
  root: AppsmithWidgetDsl,
  widgetId: string,
): AppsmithWidgetDsl | null {
  function visit(widget: AppsmithWidgetDsl, listOwner: AppsmithWidgetDsl | null): AppsmithWidgetDsl | null {
    if (widget.widgetId === widgetId) return listOwner;
    const owner = widget.type === "LIST_WIDGET_V2" ? widget : listOwner;
    for (const child of widget.children ?? []) {
      const found = visit(child, owner);
      if (found) return found;
    }
    return null;
  }
  return visit(root, null);
}

export function assertOutsideListV2Template(root: AppsmithWidgetDsl, widgetId: string): void {
  if (listV2TemplateOwner(root, widgetId)) {
    throw new Error("List template editing requires Appsmith meta widgets and is unavailable here.");
  }
}

export function assertStaticListV2Data(value: unknown): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error("List data must be a literal JSON array.");
  }
  // parseDashboardDocument validates every nested value before the edit is
  // committed. The property control parses JSON, never JavaScript.
}
