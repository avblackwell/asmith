/**
 * Fixed layout auto-height arithmetic from Appsmith:
 * WidgetConstants.tsx, WidgetUtils.ts, autoHeightOverlay/hooks.ts,
 * autoHeightOverlay/utils.ts, AutoHeightContainer.tsx and DropTargetUtils.ts.
 * This module has no editor-store or backend dependency.
 */
export const DEFAULT_GRID_ROW_HEIGHT = 10;
export const WIDGET_PADDING = 4;
export const CONTAINER_GRID_PADDING = 6;
export const DEFAULT_GRID_COLUMNS = 64;
export const MIN_HEIGHT_IN_ROWS = 4;
export const MAX_HEIGHT_IN_ROWS = 9000;
export const MIN_CANVAS_HEIGHT_IN_ROWS = 10;
export const CANVAS_EXTENSION_OFFSET = 2;
export const MAIN_CANVAS_EXTENSION_OFFSET = 8;
export const VIEW_MODE_MAIN_CANVAS_EXTENSION_OFFSET = 5;
export const CANVAS_DEFAULT_MIN_HEIGHT_PX = 380;

export type DynamicHeight = "FIXED" | "AUTO_HEIGHT" | "AUTO_HEIGHT_WITH_LIMITS";

// Active dynamicHeight features in the checked-in Fixed widget getFeatures()
// configs. WidgetFeatures injects the control even when the default is Fixed.
export const DYNAMIC_HEIGHT_FEATURE_TYPES = new Set([
  "TEXT_WIDGET", "CONTAINER_WIDGET", "STATBOX_WIDGET", "TABS_WIDGET",
  "MODAL_WIDGET", "FORM_WIDGET", "CARD_WIDGET", "CHECKBOX_WIDGET",
  "SWITCH_WIDGET", "RADIO_GROUP_WIDGET", "RATE_WIDGET",
  "CHECKBOX_GROUP_WIDGET", "SWITCH_GROUP_WIDGET", "JSON_FORM_WIDGET",
  "INPUT_WIDGET_V2", "SELECT_WIDGET", "MULTI_SELECT_WIDGET_V2",
  "DATE_PICKER_WIDGET2", "PHONE_INPUT_WIDGET", "CURRENCY_INPUT_WIDGET",
  "SINGLE_SELECT_TREE_WIDGET", "MULTI_SELECT_TREE_WIDGET",
  "RICH_TEXT_EDITOR_WIDGET", "CUSTOM_WIDGET",
]);

export interface AutoHeightWidget {
  dynamicHeight?: DynamicHeight;
  isFlexChild?: boolean;
  isCanvas?: boolean;
  minDynamicHeight?: number;
  maxDynamicHeight?: number;
  topRow: number;
  bottomRow: number;
}

export interface DynamicHeightFeatureWidget extends AutoHeightWidget {
  shouldScrollContents?: boolean;
  overflow?: string;
  scrollContents?: boolean;
  fixedFooter?: boolean;
}

/** WidgetFeaturePropertyEnhancements defaults for an active feature. */
export function defaultDynamicHeightProperties(isCanvas: boolean): {
  dynamicHeight: DynamicHeight;
  minDynamicHeight: number;
  maxDynamicHeight: number;
  shouldScrollContents?: boolean;
} {
  return {
    dynamicHeight: "AUTO_HEIGHT",
    minDynamicHeight: isCanvas ? MIN_CANVAS_HEIGHT_IN_ROWS : MIN_HEIGHT_IN_ROWS,
    maxDynamicHeight: MAX_HEIGHT_IN_ROWS,
    ...(isCanvas ? { shouldScrollContents: true } : {}),
  };
}

/** Port of WidgetFeatures.updateMinMaxDynamicHeight's related-property patch. */
export function dynamicHeightModeUpdates(
  widget: DynamicHeightFeatureWidget,
  nextMode: DynamicHeight,
): Array<{ propertyPath: string; propertyValue: string | number | boolean | undefined }> {
  const updates: Array<{ propertyPath: string; propertyValue: string | number | boolean | undefined }> = [
    { propertyPath: "dynamicHeight", propertyValue: nextMode },
  ];
  if (nextMode === "AUTO_HEIGHT_WITH_LIMITS") {
    const min = Number.parseInt(String(widget.minDynamicHeight), 10);
    if (Number.isNaN(min) || min < MIN_HEIGHT_IN_ROWS) {
      updates.push({ propertyPath: "minDynamicHeight", propertyValue: MIN_HEIGHT_IN_ROWS });
    }
    const max = Number.parseInt(String(widget.maxDynamicHeight), 10);
    if (Number.isNaN(max) || max === MAX_HEIGHT_IN_ROWS || max <= MIN_HEIGHT_IN_ROWS) {
      updates.push({
        propertyPath: "maxDynamicHeight",
        propertyValue: widget.bottomRow - widget.topRow + CANVAS_EXTENSION_OFFSET,
      });
    }
    if (Number.isNaN(max) || max === 0) {
      updates.push({
        propertyPath: "maxDynamicHeight",
        propertyValue: widget.bottomRow - widget.topRow,
      });
    }
  } else if (nextMode === "AUTO_HEIGHT") {
    updates.push(
      { propertyPath: "minDynamicHeight", propertyValue: widget.isCanvas
        ? MIN_CANVAS_HEIGHT_IN_ROWS : MIN_HEIGHT_IN_ROWS },
      { propertyPath: "maxDynamicHeight", propertyValue: MAX_HEIGHT_IN_ROWS },
    );
  }
  if (nextMode === "FIXED") {
    updates.push(
      { propertyPath: "originalBottomRow", propertyValue: undefined },
      { propertyPath: "originalTopRow", propertyValue: undefined },
    );
  }
  if (nextMode === "AUTO_HEIGHT" || nextMode === "AUTO_HEIGHT_WITH_LIMITS") {
    if (widget.dynamicHeight === "FIXED") {
      updates.push(
        { propertyPath: "originalBottomRow", propertyValue: widget.bottomRow },
        { propertyPath: "originalTopRow", propertyValue: widget.topRow },
      );
    }
    if (!widget.shouldScrollContents) {
      updates.push({ propertyPath: "shouldScrollContents", propertyValue: true });
    }
    if (widget.overflow !== undefined) {
      updates.push({ propertyPath: "overflow", propertyValue: "NONE" });
    }
    if (widget.scrollContents === true) {
      updates.push({ propertyPath: "scrollContents", propertyValue: false });
    }
    if (widget.fixedFooter === true) {
      updates.push({ propertyPath: "fixedFooter", propertyValue: false });
    }
  }
  return updates;
}

export function isAutoHeightEnabledForWidget(widget: AutoHeightWidget): boolean {
  return widget.isFlexChild !== true &&
    (widget.dynamicHeight === "AUTO_HEIGHT" || widget.dynamicHeight === "AUTO_HEIGHT_WITH_LIMITS");
}

export function isAutoHeightEnabledForWidgetWithLimits(widget: AutoHeightWidget): boolean {
  return widget.isFlexChild !== true && widget.dynamicHeight === "AUTO_HEIGHT_WITH_LIMITS";
}

export function getWidgetMaxAutoHeight(widget: AutoHeightWidget): number | undefined {
  if (widget.dynamicHeight === "AUTO_HEIGHT") return MAX_HEIGHT_IN_ROWS;
  if (widget.dynamicHeight === "AUTO_HEIGHT_WITH_LIMITS") {
    return widget.maxDynamicHeight || MAX_HEIGHT_IN_ROWS;
  }
  return undefined;
}

export function getWidgetMinAutoHeight(widget: AutoHeightWidget): number | undefined {
  if (widget.dynamicHeight !== "FIXED") {
    return widget.minDynamicHeight || MIN_HEIGHT_IN_ROWS;
  }
  return undefined;
}

/** Appsmith AutoHeightContainer: content + 4px top/bottom, rounded to 10px rows. */
export function paddedContentHeight(height: number): number {
  return Math.ceil(
    Math.ceil(height + WIDGET_PADDING * 2) / DEFAULT_GRID_ROW_HEIGHT,
  ) * DEFAULT_GRID_ROW_HEIGHT;
}

/** Exact decision order in widgets/WidgetUtils.shouldUpdateWidgetHeightAutomatically. */
export function shouldUpdateWidgetHeightAutomatically(
  expectedHeightInPixels: number,
  widget: AutoHeightWidget,
): boolean {
  const currentHeightInRows = widget.bottomRow - widget.topRow;
  const expectedHeightInRows = Math.ceil(expectedHeightInPixels / DEFAULT_GRID_ROW_HEIGHT);
  if (!isAutoHeightEnabledForWidget(widget)) return false;
  const max = getWidgetMaxAutoHeight(widget) ?? MAX_HEIGHT_IN_ROWS;
  const min = getWidgetMinAutoHeight(widget) ?? MIN_HEIGHT_IN_ROWS;
  if (currentHeightInRows < expectedHeightInRows &&
      max >= currentHeightInRows &&
      Math.abs(currentHeightInRows - expectedHeightInRows) >= 1) return true;
  if (currentHeightInRows > expectedHeightInRows &&
      min < currentHeightInRows &&
      currentHeightInRows - expectedHeightInRows >= 1) return true;
  if (currentHeightInRows > max) return true;
  if (currentHeightInRows !== min) return true;
  return false;
}

export interface HeightLimitDragState {
  maxY: number;
  maxdY: number;
  minY: number;
  mindY: number;
}

export function initialHeightLimitDragState(minRows: number, maxRows: number): HeightLimitDragState {
  return {
    maxY: maxRows * DEFAULT_GRID_ROW_HEIGHT,
    maxdY: 0,
    minY: minRows * DEFAULT_GRID_ROW_HEIGHT,
    mindY: 0,
  };
}

export function snapToGrid(delta: number, rowSpace: number): number {
  return Math.round(delta / rowSpace) * rowSpace;
}

/** Port of useDragCallbacksForHandles.onMaxUpdate; `dy` is total pointer movement. */
export function moveMaxHeightLimit(
  state: HeightLimitDragState,
  dy: number,
  rowSpace: number,
): HeightLimitDragState {
  const snappedY = snapToGrid(dy, rowSpace);
  if (snappedY === state.maxdY) return state;
  if (state.maxY + dy <= (MIN_HEIGHT_IN_ROWS + 1) * DEFAULT_GRID_ROW_HEIGHT) return state;
  let mindY = state.mindY;
  if (state.maxY + snappedY <= state.minY + state.mindY) {
    mindY = snappedY + (state.maxY - state.minY) - DEFAULT_GRID_ROW_HEIGHT;
  } else if (
    snappedY - state.maxdY > 0 && state.mindY < 0 &&
    state.maxY + state.maxdY - DEFAULT_GRID_ROW_HEIGHT >= state.minY + state.mindY
  ) {
    mindY = Math.min(state.mindY + (snappedY - state.maxdY), 0);
  }
  return { ...state, maxdY: snappedY, mindY };
}

/** Port of useDragCallbacksForHandles.onMinUpdate; `dy` is total pointer movement. */
export function moveMinHeightLimit(
  state: HeightLimitDragState,
  dy: number,
  rowSpace: number,
): HeightLimitDragState {
  const snappedY = snapToGrid(dy, rowSpace);
  if (snappedY === state.mindY) return state;
  if (state.minY + dy <= MIN_HEIGHT_IN_ROWS * DEFAULT_GRID_ROW_HEIGHT) return state;
  let maxdY = state.maxdY;
  if (state.minY + snappedY >= state.maxY + state.maxdY) {
    maxdY = DEFAULT_GRID_ROW_HEIGHT + snappedY - (state.maxY - state.minY);
  } else if (
    snappedY - state.mindY < 0 && state.maxdY > 0 &&
    state.minY + state.mindY + DEFAULT_GRID_ROW_HEIGHT <= state.maxY + state.maxdY
  ) {
    maxdY = Math.max(state.maxdY + (snappedY - state.mindY), 0);
  }
  return { ...state, mindY: snappedY, maxdY };
}

export function heightLimitRowsAfterDrag(state: HeightLimitDragState): { minRows: number; maxRows: number } {
  return {
    minRows: Math.floor((state.minY + state.mindY) / DEFAULT_GRID_ROW_HEIGHT),
    maxRows: Math.floor((state.maxY + state.maxdY) / DEFAULT_GRID_ROW_HEIGHT),
  };
}

/** Port of DropTargetUtils.calculateDropTargetRows. */
export function calculateDropTargetRows(
  excludedWidgetIds: readonly string[],
  droppedWidgetBottomRow: number,
  occupiedSpaces: readonly { id: string; bottom: number }[] | undefined,
  isMainCanvas: boolean,
): number {
  let minBottomRow = droppedWidgetBottomRow;
  for (const space of occupiedSpaces ?? []) {
    if (!excludedWidgetIds.includes(space.id) && space.bottom > minBottomRow) {
      minBottomRow = space.bottom;
    }
  }
  return Math.ceil(minBottomRow +
    (isMainCanvas ? MAIN_CANVAS_EXTENSION_OFFSET : CANVAS_EXTENSION_OFFSET));
}

/** Fixed branch of WidgetPropsUtils.getCanvasSnapRows (DSL bottomRow is pixels). */
export function getCanvasSnapRows(bottomRowInPixels: number): number {
  return Math.floor(bottomRowInPixels / DEFAULT_GRID_ROW_HEIGHT) - 1;
}

/** FIXED branch of WidgetOperationUtils.getSnappedGrid. */
export function getFixedCanvasSnapGrid(
  canvasWidth: number,
  options: { isMainCanvas: boolean; isContainerWidget?: boolean; noPad?: boolean },
): { columnSpace: number; rowSpace: number; padding: number } {
  let padding = (CONTAINER_GRID_PADDING + WIDGET_PADDING) * 2;
  if (options.isMainCanvas || options.isContainerWidget) {
    padding = CONTAINER_GRID_PADDING * 2;
  }
  if (options.noPad) padding = WIDGET_PADDING * 2;
  return {
    columnSpace: canvasWidth ? (canvasWidth - padding) / DEFAULT_GRID_COLUMNS : 0,
    rowSpace: DEFAULT_GRID_ROW_HEIGHT,
    padding: padding / 2,
  };
}

/**
 * Root branch of WidgetSizeUtils.getCanvasBottomRow, used by
 * canvasWidgetsReducer.INIT_CANVAS_LAYOUT before widget hydration.
 */
export function normalizedMainCanvasBottomRow(
  children: readonly { topRow: number; bottomRow: number; detachFromLayout?: boolean }[],
): number {
  let bottom = CANVAS_DEFAULT_MIN_HEIGHT_PX / DEFAULT_GRID_ROW_HEIGHT;
  for (const child of children) {
    if (child.detachFromLayout || child.bottomRow === child.topRow) continue;
    bottom = Math.max(bottom, child.bottomRow);
  }
  return bottom * DEFAULT_GRID_ROW_HEIGHT;
}

/** Root branch of withWidgetProps: render props are distinct from stored DSL. */
export function mainCanvasRenderBottomRow(
  normalizedBottomRowInPixels: number,
  mainCanvasMinHeightInPixels: number,
  mode: "editor" | "viewer",
): number {
  return mode === "editor"
    ? Math.max(
      mainCanvasMinHeightInPixels,
      normalizedBottomRowInPixels +
        MAIN_CANVAS_EXTENSION_OFFSET * DEFAULT_GRID_ROW_HEIGHT,
    )
    : Math.max(
      CANVAS_DEFAULT_MIN_HEIGHT_PX,
      normalizedBottomRowInPixels +
        VIEW_MODE_MAIN_CANVAS_EXTENSION_OFFSET * DEFAULT_GRID_ROW_HEIGHT,
    );
}

/** canvasDraggingUtils.updateBottomRow only asks the drop target near its edge. */
export function shouldExtendDropTarget(widgetBottomRow: number, currentRows: number): boolean {
  return widgetBottomRow > currentRows - CANVAS_EXTENSION_OFFSET;
}

/** DropTargetComponent's temporary `rowRef` grows monotonically while dragging. */
export function nextTemporaryDropTargetRows(
  currentRows: number,
  excludedWidgetIds: readonly string[],
  draggedWidgetBottomRow: number,
  occupiedSpaces: readonly { id: string; bottom: number }[] | undefined,
  isMainCanvas: boolean,
): number {
  if (!shouldExtendDropTarget(draggedWidgetBottomRow, currentRows)) return currentRows;
  return Math.max(currentRows, calculateDropTargetRows(
    excludedWidgetIds, draggedWidgetBottomRow, occupiedSpaces, isMainCanvas,
  ));
}
