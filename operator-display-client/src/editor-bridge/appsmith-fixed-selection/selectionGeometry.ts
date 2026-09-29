/**
 * Fixed-layout area selection adapted from Appsmith's
 * SelectionCanvasSagas.ts and WidgetSelectUtils.ts. Coordinates are in the
 * destination canvas; callers provide the direct child occupancy list.
 */
export interface SelectionRectangle {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface OccupiedWidget {
  id: string;
  parentId: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  detachFromLayout?: boolean;
}

export interface SelectionAreaRequest {
  canvasId: string;
  occupiedWidgets: readonly OccupiedWidget[];
  /** Selection frozen when the drag starts, as in Appsmith's selection saga. */
  startingSelection: readonly string[];
  rectangle: SelectionRectangle;
  snapColumnSpace: number;
  snapRowSpace: number;
  /** The names mirror Appsmith's action payload. */
  snapToNextColumn: boolean;
  snapToNextRow: boolean;
  isMultiSelect: boolean;
}

export function normalizedSelectionRectangle(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): SelectionRectangle {
  return {
    left: Math.min(startX, endX),
    top: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

function areIntersecting(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
): boolean {
  return !(b.left >= a.right || b.right <= a.left ||
    b.top >= a.bottom || b.bottom <= a.top);
}

/** Appsmith's startCanvasSelectionSaga drops a selected parent/other canvas. */
export function selectionStartSnapshot(
  canvasId: string,
  selectedIds: readonly string[],
  occupiedWidgets: readonly OccupiedWidget[],
): string[] {
  const siblings = new Set(occupiedWidgets.filter((widget) =>
    widget.parentId === canvasId && !widget.detachFromLayout,
  ).map((widget) => widget.id));
  return selectedIds.filter((id) => siblings.has(id));
}

/**
 * Appsmith's SELECT_WIDGETS_IN_AREA saga, including its inverse-direction grid
 * snap and Ctrl/Cmd/Shift toggle semantics. Selection stays within siblings.
 */
export function selectWidgetsInArea(request: SelectionAreaRequest): string[] {
  const {
    canvasId, occupiedWidgets, startingSelection, rectangle,
    snapColumnSpace, snapRowSpace, snapToNextColumn, snapToNextRow,
    isMultiSelect,
  } = request;
  if (!(snapColumnSpace > 0 && snapRowSpace > 0)) return [];

  const selection = {
    left: Math.round((rectangle.left - (snapToNextRow ? snapColumnSpace : 0)) / snapColumnSpace),
    top: Math.round((rectangle.top - (snapToNextColumn ? snapRowSpace : 0)) / snapRowSpace),
    right: Math.round((rectangle.left + rectangle.width) / snapColumnSpace),
    bottom: Math.round((rectangle.top + rectangle.height) / snapRowSpace),
  };
  const selectedInside = occupiedWidgets.filter((widget) =>
    widget.parentId === canvasId && !widget.detachFromLayout &&
    areIntersecting(widget, selection),
  ).map((widget) => widget.id);
  if (!isMultiSelect) return selectedInside;

  const inside = new Set(selectedInside);
  const started = new Set(startingSelection);
  return [
    ...startingSelection.filter((id) => !inside.has(id)),
    ...selectedInside.filter((id) => !started.has(id)),
  ];
}

/** Direct port of Appsmith WidgetSelectUtils.shiftSelectWidgets. */
export function shiftSelectWidgets(
  widgetId: string,
  siblingWidgetIds: readonly string[],
  currentlySelectedWidgetIds: readonly string[],
  lastSelectedWidgetId: string | null,
): string[] {
  const selectedWidgetIndex = siblingWidgetIds.indexOf(widgetId);
  const lastIndex = siblingWidgetIds.indexOf(lastSelectedWidgetId ?? "");
  if (lastIndex === -1) return [widgetId];
  if (currentlySelectedWidgetIds.includes(widgetId)) {
    return currentlySelectedWidgetIds.filter((id) => id !== widgetId);
  }
  const start = Math.min(lastIndex, selectedWidgetIndex);
  const end = Math.max(lastIndex, selectedWidgetIndex);
  const range = siblingWidgetIds.slice(start, end + 1);
  return [...new Set([...currentlySelectedWidgetIds, widgetId, ...range])];
}

/** Direct port of Appsmith WidgetSelectUtils.pushPopWidgetSelection. */
export function pushPopWidgetSelection(
  widgetId: string,
  currentlySelectedWidgetIds: readonly string[],
  siblingWidgetIds: readonly string[],
): string[] {
  if (currentlySelectedWidgetIds.includes(widgetId)) {
    return currentlySelectedWidgetIds.filter((id) => id !== widgetId);
  }
  const siblings = new Set(siblingWidgetIds);
  return [...currentlySelectedWidgetIds, widgetId].filter((id) => siblings.has(id));
}
