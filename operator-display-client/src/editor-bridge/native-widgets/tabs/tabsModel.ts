/**
 * Appsmith TabsWidget's visible-tab ordering and selected-canvas fallback.
 * Source: app/client/src/widgets/TabsWidget/widget/index.tsx (getVisibleTabs,
 * getSelectedTabWidgetId, setDefaultSelectedTabWidgetId).
 */
export interface TabDescriptor {
  id: string;
  label: string;
  widgetId: string;
  index: number;
  isVisible?: boolean;
  positioning?: string;
}

function descriptor(value: unknown): TabDescriptor | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const tab = value as Record<string, unknown>;
  if (typeof tab.id !== "string" || !tab.id ||
    typeof tab.label !== "string" ||
    typeof tab.widgetId !== "string" || !tab.widgetId) return null;
  return {
    id: tab.id,
    label: tab.label,
    widgetId: tab.widgetId,
    index: typeof tab.index === "number" && Number.isFinite(tab.index)
      ? tab.index : 0,
    isVisible: tab.isVisible === false ? false : true,
    positioning: typeof tab.positioning === "string" ? tab.positioning : undefined,
  };
}

export function orderedTabs(tabsObj: unknown): TabDescriptor[] {
  if (!tabsObj || typeof tabsObj !== "object" || Array.isArray(tabsObj)) return [];
  return Object.values(tabsObj).map(descriptor)
    .filter((tab): tab is TabDescriptor => tab !== null)
    .sort((left, right) => left.index - right.index);
}

export function orderedVisibleTabs(tabsObj: unknown): TabDescriptor[] {
  return orderedTabs(tabsObj).filter((tab) => tab.isVisible !== false);
}

export function resolveSelectedTabCanvasId(
  tabsObj: unknown,
  defaultTab: string | undefined,
  selectedTabWidgetId?: string | null,
  selectedWidgetAncestry?: readonly string[],
): string | null {
  const allTabs = orderedTabs(tabsObj);
  // In the editor Appsmith reveals the tab containing the selected widget,
  // even when that tab is not the active viewer tab.
  const ancestryTab = allTabs.find((tab) => selectedWidgetAncestry?.includes(tab.widgetId));
  if (ancestryTab) return ancestryTab.widgetId;

  const visible = allTabs.filter((tab) => tab.isVisible !== false);
  if (selectedTabWidgetId && visible.some((tab) => tab.widgetId === selectedTabWidgetId)) {
    return selectedTabWidgetId;
  }
  return visible.find((tab) => tab.label === defaultTab)?.widgetId ??
    visible[0]?.widgetId ?? null;
}

/** TabsWidget.getCanvasHeightOffset; the tab strip occupies four 10px rows. */
export function tabsCanvasHeightOffsetRows(
  borderWidth: string | number | undefined,
  shouldShowTabs: boolean,
): number {
  const numericWidth = Number(borderWidth ?? 0);
  const parsedWidth = Number.parseInt(String(borderWidth ?? 0), 10);
  const borderRows = Number.isFinite(numericWidth) && numericWidth > 1 &&
    Number.isFinite(parsedWidth)
    ? Math.ceil((2 * parsedWidth) / 10) : 0;
  return borderRows + (shouldShowTabs ? 4 : 0);
}
