import type { AppsmithWidgetDsl } from "../../../document";
import {
  DEFAULT_GRID_COLUMNS,
  DEFAULT_GRID_ROW_HEIGHT,
  MAX_HEIGHT_IN_ROWS,
  MIN_HEIGHT_IN_ROWS,
} from "../../appsmith-fixed-autoheight/autoHeightRules";

export interface ModalBlueprintOptions {
  widgetId: string;
  widgetName: string;
  parentId: string;
  topRow: number;
  bottomRow: number;
  leftColumn: number;
  rightColumn: number;
  parentColumnSpace: number;
  parentRowSpace: number;
  /** IDs/names are allocated and checked against the whole DSL by the caller. */
  childIds: {
    canvas: string;
    closeIcon: string;
    title: string;
    closeButton: string;
    confirmButton: string;
  };
  childNames: {
    canvas: string;
    closeIcon: string;
    title: string;
    closeButton: string;
    confirmButton: string;
  };
}

function child(options: ModalBlueprintOptions, key: keyof ModalBlueprintOptions["childIds"],
  type: string, leftColumn: number, rightColumn: number,
  topRow: number, bottomRow: number,
  properties: Record<string, string | number | boolean | unknown[]>): AppsmithWidgetDsl {
  return {
    widgetId: options.childIds[key],
    widgetName: options.childNames[key],
    type,
    version: 1,
    parentId: options.childIds.canvas,
    topRow, bottomRow, leftColumn, rightColumn,
    isVisible: true,
    dynamicBindingPathList: [],
    ...properties,
  };
}

/**
 * Materialized Fixed ModalWidget.getDefaults() blueprint. The upstream
 * close-icon and Close-button blueprint operations add `onClick` strings;
 * those operations are deliberately omitted until product actions exist.
 */
export function createModalWidgetBlueprint(options: ModalBlueprintOptions): AppsmithWidgetDsl {
  const controls: AppsmithWidgetDsl[] = [
    child(options, "closeIcon", "ICON_BUTTON_WIDGET", 58, 64, 0, 4, {
      buttonColor: "#858282",
      buttonVariant: "TERTIARY",
      borderRadius: "SHARP",
      iconName: "cross",
      iconSize: 24,
      isDisabled: false,
      dynamicTriggerPathList: [],
    }),
    child(options, "title", "TEXT_WIDGET", 1, 41, 1, 5, {
      text: "Modal Title",
      fontSize: "1.25rem",
      fontStyle: "BOLD",
      textAlign: "LEFT",
      textColor: "#231F20",
      dynamicHeight: "AUTO_HEIGHT",
      minDynamicHeight: MIN_HEIGHT_IN_ROWS,
      maxDynamicHeight: MAX_HEIGHT_IN_ROWS,
      overflow: "NONE",
    }),
    child(options, "closeButton", "BUTTON_WIDGET", 31, 47, 18, 22, {
      text: "Close",
      buttonStyle: "PRIMARY",
      buttonVariant: "SECONDARY",
      isDisabled: false,
      isDefaultClickDisabled: true,
      dynamicTriggerPathList: [],
    }),
    child(options, "confirmButton", "BUTTON_WIDGET", 47, 63, 18, 22, {
      text: "Confirm",
      buttonStyle: "PRIMARY_BUTTON",
      buttonVariant: "PRIMARY",
      isDisabled: false,
      isDefaultClickDisabled: true,
      dynamicTriggerPathList: [],
    }),
  ];
  const canvas: AppsmithWidgetDsl = {
    widgetId: options.childIds.canvas,
    widgetName: options.childNames.canvas,
    type: "CANVAS_WIDGET",
    version: 1,
    parentId: options.widgetId,
    topRow: 0,
    bottomRow: 24,
    leftColumn: 0,
    // ModalComponent overrides rendered rightColumn to modalWidth + 8px.
    // Structural DSL uses Appsmith's 64-column grid for its four controls.
    rightColumn: DEFAULT_GRID_COLUMNS,
    parentColumnSpace: 1,
    parentRowSpace: 1,
    minHeight: DEFAULT_GRID_ROW_HEIGHT * 24,
    detachFromLayout: true,
    canExtend: true,
    isVisible: true,
    isDisabled: false,
    shouldScrollContents: false,
    dynamicBindingPathList: [],
    children: controls,
  };

  return {
    widgetId: options.widgetId,
    widgetName: options.widgetName,
    type: "MODAL_WIDGET",
    version: 2,
    parentId: options.parentId,
    topRow: options.topRow,
    bottomRow: options.bottomRow,
    leftColumn: options.leftColumn,
    rightColumn: options.rightColumn,
    parentColumnSpace: options.parentColumnSpace,
    parentRowSpace: options.parentRowSpace,
    width: 456,
    height: DEFAULT_GRID_ROW_HEIGHT * 24,
    dynamicHeight: "AUTO_HEIGHT",
    minDynamicHeight: 24,
    maxDynamicHeight: MAX_HEIGHT_IN_ROWS,
    detachFromLayout: true,
    canEscapeKeyClose: true,
    canOutsideClickClose: true,
    shouldScrollContents: true,
    animateLoading: true,
    isVisible: false,
    borderRadius: "{{appsmith.theme.borderRadius.appBorderRadius}}",
    boxShadow: "none",
    dynamicBindingPathList: [{ key: "borderRadius" }],
    dynamicTriggerPathList: [],
    children: [canvas],
  };
}
