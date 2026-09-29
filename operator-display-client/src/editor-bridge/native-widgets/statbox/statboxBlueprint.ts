import type { AppsmithWidgetDsl } from "../../../document";
import {
  DEFAULT_GRID_COLUMNS,
  DEFAULT_GRID_ROW_HEIGHT,
  MAX_HEIGHT_IN_ROWS,
  MIN_CANVAS_HEIGHT_IN_ROWS,
  MIN_HEIGHT_IN_ROWS,
} from "../../appsmith-fixed-autoheight/autoHeightRules";

export interface StatboxChildIds {
  canvas: string;
  label: string;
  value: string;
  icon: string;
  caption: string;
}

export interface StatboxBlueprintOptions {
  widgetId: string;
  widgetName: string;
  parentId: string;
  topRow: number;
  bottomRow: number;
  leftColumn: number;
  rightColumn: number;
  parentColumnSpace: number;
  parentRowSpace: number;
  /** The caller allocates IDs and names in the document's uniqueness scope. */
  childIds: StatboxChildIds;
  childNames: StatboxChildIds;
}

function requireUnique(values: string[], label: string): void {
  if (values.some((value) => !value.trim()) || new Set(values).size !== values.length) {
    throw new Error(`${label} must be nonempty and unique within the Statbox subtree`);
  }
}

function textChild(
  options: StatboxBlueprintOptions,
  role: "label" | "value" | "caption",
  text: string,
  topRow: number,
  bottomRow: number,
  fontSize: string,
  textColor: string,
): AppsmithWidgetDsl {
  return {
    widgetId: options.childIds[role],
    widgetName: options.childNames[role],
    type: "TEXT_WIDGET",
    version: 1,
    parentId: options.childIds.canvas,
    topRow,
    bottomRow,
    leftColumn: 1,
    rightColumn: 37,
    text,
    fontSize,
    fontStyle: "BOLD",
    textAlign: "LEFT",
    textColor,
    shouldTruncate: false,
    overflow: "NONE",
    dynamicHeight: "AUTO_HEIGHT",
    minDynamicHeight: MIN_HEIGHT_IN_ROWS,
    maxDynamicHeight: MAX_HEIGHT_IN_ROWS,
    animateLoading: true,
    isVisible: true,
    dynamicBindingPathList: [],
    dynamicTriggerPathList: [],
  };
}

/**
 * Materializes the Fixed branch of StatboxWidget.getDefaults().blueprint.
 * Appsmith's WidgetAdditionSagas generate a nested canvas sized in pixels.
 * The local Fixed DSL keeps nested canvases on a 64-column grid, while its
 * renderer derives their pixel size from the enclosing Statbox.
 */
export function createStatboxWidgetBlueprint(options: StatboxBlueprintOptions): AppsmithWidgetDsl {
  const {
    widgetId, widgetName, parentId, topRow, bottomRow, leftColumn,
    rightColumn, parentColumnSpace, parentRowSpace, childIds, childNames,
  } = options;
  requireUnique([widgetId, ...Object.values(childIds)], "widget IDs");
  requireUnique([widgetName, ...Object.values(childNames)], "widget names");
  if (!Number.isFinite(parentColumnSpace) || parentColumnSpace <= 0 ||
    !Number.isFinite(parentRowSpace) || parentRowSpace <= 0 ||
    bottomRow <= topRow || rightColumn <= leftColumn) {
    throw new Error("Statbox bounds and parent grid spaces must be positive");
  }

  const heightRows = bottomRow - topRow;
  const canvas: AppsmithWidgetDsl = {
    widgetId: childIds.canvas,
    widgetName: childNames.canvas,
    type: "CANVAS_WIDGET",
    version: 1,
    parentId: widgetId,
    topRow: 0,
    bottomRow: heightRows,
    leftColumn: 0,
    rightColumn: DEFAULT_GRID_COLUMNS,
    parentColumnSpace: 1,
    parentRowSpace: 1,
    minHeight: heightRows * DEFAULT_GRID_ROW_HEIGHT,
    containerStyle: "none",
    canExtend: false,
    detachFromLayout: true,
    isVisible: true,
    dynamicBindingPathList: [],
    dynamicTriggerPathList: [],
    children: [
      textChild(options, "label", "Page Views", 0, 4, "0.875rem", "#999999"),
      textChild(options, "value", "2.6 M", 4, 8, "1.25rem", "#231F20"),
      {
        widgetId: childIds.icon,
        widgetName: childNames.icon,
        type: "ICON_BUTTON_WIDGET",
        version: 1,
        parentId: childIds.canvas,
        topRow: 2,
        bottomRow: 10,
        leftColumn: 46,
        rightColumn: 62,
        iconName: "arrow-top-right",
        buttonStyle: "PRIMARY",
        buttonVariant: "PRIMARY",
        buttonColor: "{{appsmith.theme.colors.primaryColor}}",
        borderRadius: "{{appsmith.theme.borderRadius.appBorderRadius}}",
        boxShadow: "none",
        isDisabled: false,
        animateLoading: true,
        isVisible: true,
        dynamicBindingPathList: [
          { key: "buttonColor" },
          { key: "borderRadius" },
        ],
        dynamicTriggerPathList: [],
      },
      textChild(options, "caption", "21% more than last month", 8, 12,
        "0.875rem", "#03B365"),
    ],
  };

  return {
    widgetId,
    widgetName,
    type: "STATBOX_WIDGET",
    version: 1,
    parentId,
    topRow,
    bottomRow,
    leftColumn,
    rightColumn,
    parentColumnSpace,
    parentRowSpace,
    backgroundColor: "white",
    borderWidth: "1",
    borderColor: "#E0DEDE",
    borderRadius: "{{appsmith.theme.borderRadius.appBorderRadius}}",
    boxShadow: "{{appsmith.theme.boxShadow.appBoxShadow}}",
    positioning: "fixed",
    responsiveBehavior: "fill",
    flexVerticalAlignment: "stretch",
    dynamicHeight: "AUTO_HEIGHT",
    minDynamicHeight: MIN_CANVAS_HEIGHT_IN_ROWS,
    maxDynamicHeight: MAX_HEIGHT_IN_ROWS,
    shouldScrollContents: true,
    animateLoading: true,
    isVisible: true,
    dynamicBindingPathList: [
      { key: "borderRadius" },
      { key: "boxShadow" },
    ],
    dynamicTriggerPathList: [],
    children: [canvas],
  };
}
