import type { AppsmithWidgetDsl } from "../../../document";
import {
  MIN_CANVAS_HEIGHT_IN_ROWS,
  MAX_HEIGHT_IN_ROWS,
  DEFAULT_GRID_COLUMNS,
} from "../../appsmith-fixed-autoheight/autoHeightRules";

export interface TabsBlueprintOptions {
  widgetId: string;
  widgetName: string;
  parentId: string;
  topRow: number;
  bottomRow: number;
  leftColumn: number;
  rightColumn: number;
  parentColumnSpace: number;
  parentRowSpace: number;
  /** The caller allocates IDs and names in the same uniqueness scope as the DSL. */
  childCanvasIds: readonly [string, string];
  childCanvasNames: readonly [string, string];
  canvasVersion: number;
}

export interface TabCanvasBlueprintOptions {
  widgetId: string;
  widgetName: string;
  parentId: string;
  tabId: string;
  tabName: string;
  parentColumnSpace: number;
  parentRowSpace: number;
  canvasVersion: number;
}

export function createTabCanvasBlueprint(options: TabCanvasBlueprintOptions): AppsmithWidgetDsl {
  return {
    widgetId: options.widgetId,
    widgetName: options.widgetName,
    type: "CANVAS_WIDGET",
    version: options.canvasVersion,
    parentId: options.parentId,
    topRow: 0,
    bottomRow: MIN_CANVAS_HEIGHT_IN_ROWS,
    leftColumn: 0,
    rightColumn: DEFAULT_GRID_COLUMNS,
    parentColumnSpace: options.parentColumnSpace,
    parentRowSpace: options.parentRowSpace,
    detachFromLayout: true,
    canExtend: true,
    isVisible: true,
    isDisabled: false,
    shouldScrollContents: false,
    tabId: options.tabId,
    tabName: options.tabName,
    dynamicBindingPathList: [],
    children: [],
  };
}

/**
 * Materialized Appsmith TabsWidget blueprint. Appsmith's WidgetFactory creates
 * two canvas children, then a MODIFY_PROPS blueprint operation places their
 * generated IDs in tabsObj. Here the caller provides those allocated IDs and
 * the pure builder performs the same link in one local document transaction.
 */
export function createTabsWidgetBlueprint(options: TabsBlueprintOptions): AppsmithWidgetDsl {
  const {
    widgetId, widgetName, parentId, topRow, bottomRow, leftColumn, rightColumn,
    parentColumnSpace, parentRowSpace, childCanvasIds, childCanvasNames,
    canvasVersion,
  } = options;
  const tabs = [
    { id: "tab1", label: "Tab 1", index: 0, widgetId: childCanvasIds[0] },
    { id: "tab2", label: "Tab 2", index: 1, widgetId: childCanvasIds[1] },
  ] as const;
  const children: AppsmithWidgetDsl[] = tabs.map((tab, index) =>
    createTabCanvasBlueprint({
      widgetId: tab.widgetId,
      widgetName: childCanvasNames[index],
      parentId: widgetId,
      tabId: tab.id,
      tabName: tab.label,
      parentColumnSpace,
      parentRowSpace,
      canvasVersion,
    }));

  return {
    widgetId,
    widgetName,
    type: "TABS_WIDGET",
    version: 3,
    parentId,
    topRow, bottomRow, leftColumn, rightColumn,
    parentColumnSpace, parentRowSpace,
    flexVerticalAlignment: "stretch",
    responsiveBehavior: "fill",
    animateLoading: true,
    borderWidth: 1,
    borderColor: "#E0DEDE",
    backgroundColor: "#FFFFFF",
    shouldShowTabs: true,
    defaultTab: "Tab 1",
    // WidgetFeaturePropertyEnhancements overrides getDefaults for an
    // isCanvas widget with dynamic-height enabled.
    dynamicHeight: "AUTO_HEIGHT",
    minDynamicHeight: MIN_CANVAS_HEIGHT_IN_ROWS + 5,
    maxDynamicHeight: MAX_HEIGHT_IN_ROWS,
    shouldScrollContents: true,
    isVisible: true,
    dynamicBindingPathList: [],
    tabsObj: {
      tab1: { ...tabs[0], isVisible: true, positioning: "vertical" },
      tab2: { ...tabs[1], isVisible: true, positioning: "vertical" },
    },
    children,
  };
}
