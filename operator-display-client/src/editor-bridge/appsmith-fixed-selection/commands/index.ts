import { nanoid } from "nanoid";
import {
  parseDashboardDocument,
  type AppsmithWidgetDsl,
  type DashboardBinding,
  type DashboardDocument,
  type DashboardVariable,
  type ComponentDependency,
} from "../../../document";
import { reflow } from "../../editable-store/appsmith-reflow";
import type { BlockSpace, PrevReflowState } from "../../editable-store/appsmith-reflow/reflowTypes";
import { ReflowDirection } from "../../editable-store/appsmith-reflow/reflowTypes";
import { preferredDirections, type GridRect } from "../../editable-store/fixedLayoutPlanner";
import {
  DEFAULT_GRID_COLUMNS,
  DEFAULT_GRID_ROW_HEIGHT,
  MAX_HEIGHT_IN_ROWS,
  defaultDynamicHeightProperties,
  getCanvasSnapRows,
  getFixedCanvasSnapGrid,
  normalizedMainCanvasBottomRow,
} from "../../appsmith-fixed-autoheight/autoHeightRules";
import { assertOutsideListV2Template } from "../../native-widgets/list-v2/listV2EditBoundary";

const MAX_CANVAS_ROWS = MAX_HEIGHT_IN_ROWS;

export interface MultiWidgetEditResult {
  documentJson: string;
  selectedWidgetIds: string[];
}

/** A local equivalent of Appsmith's selected-widget clipboard payload. */
export interface FixedWidgetClipboard {
  sourceDocumentId: string;
  sourceLayoutSystem: "FIXED";
  sourceCanvasId: string;
  sourceColumnSpace: number;
  sourceRowSpace: number;
  widgets: AppsmithWidgetDsl[];
  variables: DashboardVariable[];
  bindings: DashboardBinding[];
  componentDependencies: ComponentDependency[];
}

export interface FixedPasteTarget {
  parentId: string;
  leftColumn: number;
  topRow: number;
}

export interface FixedPasteTargetOptions {
  /** A host-resolved grid point on the selected destination canvas. */
  gridPosition?: { leftColumn: number; topRow: number };
}

export interface GroupPlacementRequest {
  widgetIds: readonly string[];
  parentId: string;
  /** Position of the group's top-left widget bounds on its parent canvas. */
  leftColumn: number;
  topRow: number;
}

export interface GroupPlacementPreview {
  valid: boolean;
  error?: string;
  parentId: string;
  targets: Record<string, GridRect>;
  reflowed: Record<string, GridRect>;
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parse(sourceJson: string): DashboardDocument {
  return parseDashboardDocument(JSON.parse(sourceJson));
}

function finish(document: DashboardDocument, selectedWidgetIds: string[]): MultiWidgetEditResult {
  document.layout.dsl.bottomRow = normalizedMainCanvasBottomRow(
    document.layout.dsl.children ?? [],
  );
  parseDashboardDocument(document);
  return { documentJson: JSON.stringify(document), selectedWidgetIds };
}

function walk(root: AppsmithWidgetDsl): AppsmithWidgetDsl[] {
  return [root, ...(root.children ?? []).flatMap(walk)];
}

function find(root: AppsmithWidgetDsl, id: string): AppsmithWidgetDsl | undefined {
  return walk(root).find((widget) => widget.widgetId === id);
}

function bounds(widgets: readonly AppsmithWidgetDsl[]): GridRect {
  return {
    leftColumn: Math.min(...widgets.map((widget) => widget.leftColumn)),
    topRow: Math.min(...widgets.map((widget) => widget.topRow)),
    rightColumn: Math.max(...widgets.map((widget) => widget.rightColumn)),
    bottomRow: Math.max(...widgets.map((widget) => widget.bottomRow)),
  };
}

function rect(widget: AppsmithWidgetDsl): GridRect {
  return {
    leftColumn: widget.leftColumn, topRow: widget.topRow,
    rightColumn: widget.rightColumn, bottomRow: widget.bottomRow,
  };
}

function translated(widget: AppsmithWidgetDsl, dx: number, dy: number): GridRect {
  return {
    leftColumn: widget.leftColumn + dx,
    rightColumn: widget.rightColumn + dx,
    topRow: widget.topRow + dy,
    bottomRow: widget.bottomRow + dy,
  };
}

function space(id: string, rectangle: GridRect): BlockSpace {
  return {
    id, left: rectangle.leftColumn, right: rectangle.rightColumn,
    top: rectangle.topRow, bottom: rectangle.bottomRow,
  };
}

function selection(root: AppsmithWidgetDsl, widgetIds: readonly string[]) {
  if (!widgetIds.length || new Set(widgetIds).size !== widgetIds.length) {
    throw new Error("Select distinct widgets on one canvas.");
  }
  const selected = widgetIds.map((id) => find(root, id));
  widgetIds.forEach((id) => assertOutsideListV2Template(root, id));
  if (selected.some((widget) => !widget || widget.type === "CANVAS_WIDGET")) {
    throw new Error("Canvas widgets are structural and cannot be selected for this action.");
  }
  const widgets = selected as AppsmithWidgetDsl[];
  const parentId = widgets[0].parentId;
  const parent = parentId ? find(root, parentId) : undefined;
  if (!parent || parent.type !== "CANVAS_WIDGET" ||
    widgets.some((widget) => widget.parentId !== parentId) ||
    widgets.some((widget) => !(parent.children ?? []).some((child) => child.widgetId === widget.widgetId))) {
    throw new Error("Selected widgets must share one fixed canvas.");
  }
  // Appsmith's occupied spaces and group drag use canvas child order.
  const ids = new Set(widgetIds);
  return { parent, widgets: (parent.children ?? []).filter((widget) => ids.has(widget.widgetId)) };
}

function descendants(widgets: readonly AppsmithWidgetDsl[]): Set<string> {
  return new Set(widgets.flatMap(walk).map((widget) => widget.widgetId));
}

function columns(canvas: AppsmithWidgetDsl, root: AppsmithWidgetDsl): number {
  // FixedLayoutEditorCanvas gets 64 columns from getSnappedGrid on every canvas.
  void canvas;
  void root;
  return DEFAULT_GRID_COLUMNS;
}

function rowLimit(canvas: AppsmithWidgetDsl, root: AppsmithWidgetDsl): number {
  if (canvas.widgetId === root.widgetId) return MAX_CANVAS_ROWS;
  const container = canvas.parentId ? find(root, canvas.parentId) : undefined;
  if (!container) return MAX_CANVAS_ROWS;
  if (container.shouldScrollContents === true) return MAX_CANVAS_ROWS;
  const componentHeight = (container.bottomRow - container.topRow) *
    DEFAULT_GRID_ROW_HEIGHT;
  return Math.max(1, getCanvasSnapRows(componentHeight));
}

function canvasWidthInPixels(canvas: AppsmithWidgetDsl, root: AppsmithWidgetDsl): number {
  if (canvas.widgetId === root.widgetId) {
    return root.rightColumn - root.leftColumn;
  }
  const parentContainer = canvas.parentId ? find(root, canvas.parentId) : undefined;
  const outerCanvas = parentContainer?.parentId
    ? find(root, parentContainer.parentId) : undefined;
  if (parentContainer && outerCanvas?.type === "CANVAS_WIDGET") {
    return (parentContainer.rightColumn - parentContainer.leftColumn) *
      gridSpaces(outerCanvas, root).columnSpace;
  }
  return (canvas.rightColumn - canvas.leftColumn) *
    (Number(canvas.parentColumnSpace) || 1);
}

function gridSpaces(canvas: AppsmithWidgetDsl, root: AppsmithWidgetDsl) {
  const width = canvasWidthInPixels(canvas, root);
  const snap = getFixedCanvasSnapGrid(width, {
    isMainCanvas: canvas.widgetId === root.widgetId,
    noPad: canvas.noPad === true,
  });
  return { columnSpace: snap.columnSpace, rowSpace: snap.rowSpace };
}

function inside(rectangle: GridRect, maxColumns: number, maxRows: number): boolean {
  return Number.isSafeInteger(rectangle.leftColumn) &&
    Number.isSafeInteger(rectangle.rightColumn) &&
    Number.isSafeInteger(rectangle.topRow) &&
    Number.isSafeInteger(rectangle.bottomRow) &&
    rectangle.leftColumn >= 0 && rectangle.topRow >= 0 &&
    rectangle.rightColumn > rectangle.leftColumn &&
    rectangle.bottomRow > rectangle.topRow &&
    rectangle.rightColumn <= maxColumns && rectangle.bottomRow <= maxRows;
}

function intersects(a: GridRect, b: GridRect): boolean {
  return a.leftColumn < b.rightColumn && b.leftColumn < a.rightColumn &&
    a.topRow < b.bottomRow && b.topRow < a.bottomRow;
}

function applyRect(widget: AppsmithWidgetDsl, target: GridRect) {
  Object.assign(widget, target);
  const childCanvas = widget.children?.find((child) => child.type === "CANVAS_WIDGET");
  if (childCanvas) {
    if (widget.type === "LIST_WIDGET_V2") {
      childCanvas.rightColumn = (target.rightColumn - target.leftColumn) *
        (Number(widget.parentColumnSpace) || 1);
      childCanvas.bottomRow = (target.bottomRow - target.topRow) *
        (Number(widget.parentRowSpace) || DEFAULT_GRID_ROW_HEIGHT);
      childCanvas.minHeight = childCanvas.bottomRow;
      return;
    }
    childCanvas.rightColumn = DEFAULT_GRID_COLUMNS;
    childCanvas.bottomRow = target.bottomRow - target.topRow;
  }
}

function canReflowWidget(widget: AppsmithWidgetDsl, target: GridRect,
  parentCanvas: AppsmithWidgetDsl, root: AppsmithWidgetDsl): boolean {
  if (widget.type === "LIST_WIDGET_V2") return true;
  const canvas = widget.children?.find((child) => child.type === "CANVAS_WIDGET");
  if (!canvas) return true;
  const width = target.rightColumn - target.leftColumn;
  const height = target.bottomRow - target.topRow;
  const proposedWidthPx = width * gridSpaces(parentCanvas, root).columnSpace;
  const innerGrid = getFixedCanvasSnapGrid(proposedWidthPx, {
    isMainCanvas: false, noPad: canvas.noPad === true,
  });
  if (innerGrid.columnSpace <= 0) return false;
  if (widget.shouldScrollContents === true) return true;
  return (canvas.children ?? []).every((child) =>
    child.bottomRow <= height - 1);
}

function extendRoot(root: AppsmithWidgetDsl, canvas: AppsmithWidgetDsl, bottom: number) {
  if (canvas.widgetId === root.widgetId && bottom > MAX_CANVAS_ROWS) {
    throw new Error(`A widget cannot extend beyond ${MAX_CANVAS_ROWS} canvas rows.`);
  }
}

function scaleNestedSpaces(widget: AppsmithWidgetDsl, columnRatio: number, rowRatio: number) {
  for (const child of widget.children ?? []) {
    if (typeof child.parentColumnSpace === "number") {
      child.parentColumnSpace *= columnRatio;
    }
    if (typeof child.parentRowSpace === "number") {
      child.parentRowSpace *= rowRatio;
    }
    scaleNestedSpaces(child, columnRatio, rowRatio);
  }
}

function destinationCanvas(root: AppsmithWidgetDsl, id: string): AppsmithWidgetDsl {
  assertOutsideListV2Template(root, id);
  const target = find(root, id);
  if (!target || target.type !== "CANVAS_WIDGET") {
    throw new Error("Choose an existing fixed canvas.");
  }
  return target;
}

function planGroup(
  root: AppsmithWidgetDsl,
  canvas: AppsmithWidgetDsl,
  selected: readonly AppsmithWidgetDsl[],
  targetLeft: number,
  targetTop: number,
  isNew: boolean,
  options: { groupContainer?: boolean; shouldReflowDropTarget?: boolean;
    committedPlan?: GroupPlacementPreview } = {},
): GroupPlacementPreview {
  const originalBounds = bounds(selected);
  const dx = targetLeft - originalBounds.leftColumn;
  const dy = targetTop - originalBounds.topRow;
  const targets = Object.fromEntries(selected.map((widget) =>
    [widget.widgetId, translated(widget, dx, dy)]));
  const canvasColumns = columns(canvas, root);
  const canvasRows = rowLimit(canvas, root);
  if (Object.values(targets).some((target) => !inside(target, canvasColumns, canvasRows))) {
    return { valid: false, error: "The selected widgets extend beyond the canvas.",
      parentId: canvas.widgetId, targets, reflowed: {} };
  }
  const selectedIds = new Set(selected.map((widget) => widget.widgetId));
  const occupiedWidgets = (canvas.children ?? []).filter((widget) =>
    !selectedIds.has(widget.widgetId) && widget.detachFromLayout !== true);
  if (options.committedPlan) {
    const committed = options.committedPlan;
    const proposedIds = Object.keys(committed.targets);
    const displacedIds = Object.keys(committed.reflowed);
    const occupiedById = new Map(occupiedWidgets.map((widget) =>
      [widget.widgetId, widget]));
    const same = (a: GridRect, b: GridRect) =>
      a.leftColumn === b.leftColumn && a.topRow === b.topRow &&
      a.rightColumn === b.rightColumn && a.bottomRow === b.bottomRow;
    const invalid = !committed.valid || committed.parentId !== canvas.widgetId ||
      proposedIds.length !== selected.length ||
      proposedIds.some((id) => !targets[id] || !same(committed.targets[id], targets[id])) ||
      displacedIds.some((id) => !occupiedById.has(id));
    if (invalid) return { valid: false,
      error: "The group drag preview no longer matches this canvas.",
      parentId: canvas.widgetId, targets, reflowed: {} };
    const finalOccupied = occupiedWidgets.map((widget) =>
      committed.reflowed[widget.widgetId] ?? rect(widget));
    if (occupiedWidgets.some((widget, item) =>
      !inside(finalOccupied[item], canvasColumns, canvasRows) ||
      !canReflowWidget(widget, finalOccupied[item], canvas, root)) ||
      Object.values(targets).some((target) =>
        finalOccupied.some((other) => intersects(target, other))) ||
      finalOccupied.some((item, i) => committed.reflowed[occupiedWidgets[i].widgetId] &&
        finalOccupied.some((other, j) => i !== j && intersects(item, other)))) {
      return { valid: false, error: "The group drag reflow overlaps or exceeds this canvas.",
        parentId: canvas.widgetId, targets, reflowed: {} };
    }
    return { valid: true, parentId: canvas.widgetId, targets,
      reflowed: committed.reflowed };
  }
  const occupied = occupiedWidgets.map((widget) => ({
    ...space(widget.widgetId, rect(widget)),
    type: widget.type,
    isDropTarget: widget.type === "CONTAINER_WIDGET" || widget.type === "STATBOX_WIDGET",
  }));
  const next = selected.map((widget) => space(widget.widgetId, targets[widget.widgetId]));
  const previous = selected.map((widget) => space(widget.widgetId,
    isNew ? targets[widget.widgetId] : rect(widget)));
  const originalGroup = originalBounds;
  const targetGroup = {
    leftColumn: originalBounds.leftColumn + dx,
    rightColumn: originalBounds.rightColumn + dx,
    topRow: originalBounds.topRow + dy,
    bottomRow: originalBounds.bottomRow + dy,
  };
  const { columnSpace, rowSpace } = gridSpaces(canvas, root);
  const directions = options.groupContainer
    ? [ReflowDirection.BOTTOM]
    : preferredDirections(isNew ? undefined : originalGroup,
      targetGroup, isNew ? "add" : "move");
  for (const [index, direction] of directions.entries()) {
    try {
      const prevState: PrevReflowState = {
        prevSpacesMap: options.groupContainer ? {}
          : Object.fromEntries(previous.map((item) => [item.id, item])),
        prevCollidingSpaceMap: { horizontal: {}, vertical: {} },
        prevMovementMap: {},
        prevSecondOrderCollisionMap: {},
      };
      const { movementMap } = reflow(next, previous, occupied,
        direction as ReflowDirection,
        { parentColumnSpace: columnSpace, parentRowSpace: rowSpace,
          maxGridColumns: canvasColumns },
        index > 0 || !!options.groupContainer, !options.groupContainer,
        prevState, undefined, undefined, options.shouldReflowDropTarget ?? true);
      const reflowed: Record<string, GridRect> = {};
      for (const widget of occupiedWidgets) {
        const movement = movementMap?.[widget.widgetId];
        if (!movement) continue;
        const old = rect(widget);
        const leftColumn = Math.round(old.leftColumn + (movement.X ?? 0) / columnSpace);
        const topRow = Math.round(old.topRow + (movement.Y ?? 0) / rowSpace);
        const width = movement.width === undefined
          ? old.rightColumn - old.leftColumn
          : Math.round(movement.width / columnSpace);
        const height = movement.height === undefined
          ? old.bottomRow - old.topRow
          : Math.round(movement.height / rowSpace);
        reflowed[widget.widgetId] = { leftColumn, topRow,
          rightColumn: leftColumn + width, bottomRow: topRow + height };
      }
      const finalOccupied = occupiedWidgets.map((widget) =>
        reflowed[widget.widgetId] ?? rect(widget));
      if (occupiedWidgets.some((widget, item) =>
        !inside(finalOccupied[item], canvasColumns, canvasRows) ||
        !canReflowWidget(widget, finalOccupied[item], canvas, root))) continue;
      if (Object.values(targets).some((target) =>
        finalOccupied.some((other) => intersects(target, other)))) continue;
      if (finalOccupied.some((item, i) => reflowed[occupiedWidgets[i].widgetId] &&
        finalOccupied.some((other, j) => i !== j && intersects(item, other)))) continue;
      return { valid: true, parentId: canvas.widgetId, targets, reflowed };
    } catch {
      // Try Appsmith's next permitted direction when the canvas is bounded.
    }
  }
  return { valid: false,
    error: "There is not enough space to place the selected widgets without overlap.",
    parentId: canvas.widgetId, targets, reflowed: {} };
}

export function previewGroupMove(
  sourceJson: string,
  request: GroupPlacementRequest,
  options: { shouldReflowDropTarget?: boolean;
    committedPlan?: GroupPlacementPreview } = {},
): GroupPlacementPreview {
  const document = parse(sourceJson);
  const { parent, widgets } = selection(document.layout.dsl, request.widgetIds);
  try {
    const canvas = destinationCanvas(document.layout.dsl, request.parentId);
    if (widgets.some((widget) => descendants([widget]).has(canvas.widgetId))) {
      throw new Error("A selected container cannot move inside itself.");
    }
    if (canvas.dropDisabled === true && canvas.widgetId !== parent.widgetId) {
      throw new Error("This canvas does not accept dropped widgets.");
    }
    return planGroup(document.layout.dsl, canvas, widgets,
      request.leftColumn, request.topRow, canvas.widgetId !== parent.widgetId,
      options);
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : "Invalid group move.",
      parentId: request.parentId, targets: {}, reflowed: {} };
  }
}

/** Validate a history-aware group drag with the same bounds as commit. */
export function previewCommittedGroupMove(sourceJson: string,
  request: GroupPlacementRequest, proposedPlan: GroupPlacementPreview): GroupPlacementPreview {
  return previewGroupMove(sourceJson, request, { committedPlan: proposedPlan });
}

/** Appsmith dispatches one WIDGETS_MOVE action for every dragged block. */
export function moveSelectedWidgets(
  sourceJson: string,
  request: GroupPlacementRequest,
  committedPlan?: GroupPlacementPreview,
): MultiWidgetEditResult {
  const document = parse(sourceJson);
  const root = document.layout.dsl;
  const { parent: sourceCanvas, widgets } = selection(root, request.widgetIds);
  const destination = destinationCanvas(root, request.parentId);
  if (widgets.some((widget) => descendants([widget]).has(destination.widgetId))) {
    throw new Error("A selected container cannot move inside itself.");
  }
  if (destination.dropDisabled === true && destination.widgetId !== sourceCanvas.widgetId) {
    throw new Error("This canvas does not accept dropped widgets.");
  }
  if (widgets.some((widget) => widget.dragDisabled === true)) {
    throw new Error("One or more selected widgets cannot be moved.");
  }
  const changingCanvas = destination.widgetId !== sourceCanvas.widgetId;
  const plan = planGroup(root, destination, widgets,
    request.leftColumn, request.topRow, changingCanvas, { committedPlan });
  if (!plan.valid) throw new Error(plan.error);
  if (!changingCanvas && widgets.every((widget) => {
    const target = plan.targets[widget.widgetId];
    return target.leftColumn === widget.leftColumn && target.topRow === widget.topRow;
  })) return { documentJson: sourceJson, selectedWidgetIds: widgets.map((widget) => widget.widgetId) };
  for (const sibling of destination.children ?? []) {
    const target = plan.reflowed[sibling.widgetId] ?? plan.targets[sibling.widgetId];
    if (target) applyRect(sibling, target);
  }
  if (changingCanvas) {
    const moving = new Set(widgets.map((widget) => widget.widgetId));
    sourceCanvas.children = (sourceCanvas.children ?? []).filter((widget) =>
      !moving.has(widget.widgetId));
    const oldSpaces = gridSpaces(sourceCanvas, root);
    const nextSpaces = gridSpaces(destination, root);
    for (const widget of widgets) {
      const oldColumn = Number(widget.parentColumnSpace) || oldSpaces.columnSpace;
      const oldRow = Number(widget.parentRowSpace) || oldSpaces.rowSpace;
      widget.parentId = destination.widgetId;
      widget.parentColumnSpace = nextSpaces.columnSpace;
      widget.parentRowSpace = nextSpaces.rowSpace;
      scaleNestedSpaces(widget,
        nextSpaces.columnSpace / oldColumn,
        nextSpaces.rowSpace / oldRow);
      (destination.children ??= []).push(widget);
    }
  }
  for (const widget of widgets) applyRect(widget, plan.targets[widget.widgetId]);
  extendRoot(root, destination, Math.max(...Object.values(plan.targets).map((item) => item.bottomRow),
    ...Object.values(plan.reflowed).map((item) => item.bottomRow)));
  return finish(document, widgets.map((widget) => widget.widgetId));
}

export function deleteSelectedWidgets(
  sourceJson: string,
  widgetIds: readonly string[],
): MultiWidgetEditResult {
  const document = parse(sourceJson);
  const root = document.layout.dsl;
  const { parent, widgets } = selection(root, widgetIds);
  if (widgets.some((widget) => widget.isDeletable === false)) {
    throw new Error("One or more selected widgets cannot be deleted.");
  }
  const ids = new Set(widgets.map((widget) => widget.widgetId));
  const removed = descendants(widgets);
  parent.children = (parent.children ?? []).filter((child) => !ids.has(child.widgetId));
  document.bindings = document.bindings.filter((binding) =>
    !removed.has(binding.target.widgetId));
  document.componentDependencies = document.componentDependencies.filter((dependency) =>
    !removed.has(dependency.rootWidgetId));
  const parentContainer = parent.parentId ? find(root, parent.parentId) : undefined;
  const nextId = parentContainer?.type === "CONTAINER_WIDGET" ||
    parentContainer?.type === "STATBOX_WIDGET"
    ? parentContainer.widgetId : parent.widgetId;
  return finish(document, [nextId]);
}

export function copySelectedWidgets(
  sourceJson: string,
  widgetIds: readonly string[],
): FixedWidgetClipboard {
  const document = parse(sourceJson);
  const { parent, widgets } = selection(document.layout.dsl, widgetIds);
  if (widgets.some((widget) => widget.disallowCopy === true)) {
    throw new Error("One or more selected widgets cannot be copied.");
  }
  const copiedIds = descendants(widgets);
  const bindings = document.bindings.filter((binding) =>
    copiedIds.has(binding.target.widgetId));
  const copiedVariableKeys = new Set(bindings.map((binding) => binding.variableKey));
  const spaces = gridSpaces(parent, document.layout.dsl);
  return copy({
    sourceDocumentId: document.documentId,
    sourceLayoutSystem: document.compatibility.layoutSystem,
    sourceCanvasId: parent.widgetId,
    sourceColumnSpace: spaces.columnSpace,
    sourceRowSpace: spaces.rowSpace,
    widgets,
    variables: document.variables.filter((variable) =>
      copiedVariableKeys.has(variable.key)),
    bindings,
    componentDependencies: document.componentDependencies.filter((dependency) =>
      copiedIds.has(dependency.rootWidgetId)),
  });
}

export function cutSelectedWidgets(
  sourceJson: string,
  widgetIds: readonly string[],
): MultiWidgetEditResult & { clipboard: FixedWidgetClipboard } {
  const clipboard = copySelectedWidgets(sourceJson, widgetIds);
  return { ...deleteSelectedWidgets(sourceJson, widgetIds), clipboard };
}

/**
 * Appsmith's getParentWidgetIdForPasting / getNewPositions path for the Fixed
 * widgets supported by this product. The host resolves mouse pixels to a
 * canvas grid point; without that point Appsmith falls back to the next row.
 */
export function resolveFixedPasteTarget(
  sourceJson: string,
  clipboard: FixedWidgetClipboard,
  selectedWidgetIds: readonly string[],
  options: FixedPasteTargetOptions = {},
): FixedPasteTarget {
  const root = parse(sourceJson).layout.dsl;
  if (!clipboard.widgets.length) {
    throw new Error("The widget clipboard is empty.");
  }
  const copiedBounds = bounds(clipboard.widgets);
  const copiedWidth = copiedBounds.rightColumn - copiedBounds.leftColumn;
  const selected = selectedWidgetIds.map((id) => find(root, id)).filter(
    (widget): widget is AppsmithWidgetDsl => widget !== undefined,
  );
  // getSelectedWidgetWhenPasting uses Appsmith's last selected widget (or focus)
  // for the parent choice. Its position helper then examines all selected IDs.
  const firstSelected = selected[selected.length - 1];
  let destination = root;
  if (firstSelected) {
    if (firstSelected.type === "CANVAS_WIDGET") {
      destination = firstSelected;
    } else if (firstSelected.type === "CONTAINER_WIDGET" ||
      firstSelected.type === "STATBOX_WIDGET") {
      destination = firstSelected.children?.find((child) =>
        child.type === "CANVAS_WIDGET") ?? root;
    } else if (firstSelected.parentId) {
      const parent = find(root, firstSelected.parentId);
      if (parent?.type === "CANVAS_WIDGET") destination = parent;
    }
  }

  const soleSelectionIsDropTarget = selected.length === 1 &&
    (selected[0].type === "CANVAS_WIDGET" ||
      selected[0].type === "CONTAINER_WIDGET" ||
      selected[0].type === "STATBOX_WIDGET");
  const selectedParent = selected[0]?.parentId
    ? find(root, selected[0].parentId) : undefined;
  const selectedAreWidgetsOnDestination = selected.length > 0 &&
    !soleSelectionIsDropTarget &&
    selectedParent?.type === "CANVAS_WIDGET" &&
    selected.every((widget) => widget.parentId === selectedParent.widgetId);
  if (selectedAreWidgetsOnDestination) {
    // PasteWidgetUtils returns selected[0].parentId as canvasId, overriding
    // getParentWidgetIdForPasting's initial choice in WidgetOperationSagas.
    destination = selectedParent;
    // PasteWidgetUtils.getNewPositionsBasedOnSelectedWidgets centers the copied
    // group on the selected bounds, then moves it below any selected collision.
    const selectedBounds = bounds(selected);
    const selectedWidth = selectedBounds.rightColumn - selectedBounds.leftColumn;
    const maxThickness = Math.max(...selected.map((widget) =>
      widget.bottomRow - widget.topRow));
    let left = Math.round(selectedBounds.leftColumn -
      (copiedWidth - selectedWidth) / 2);
    if (left < 0) left = 0;
    if (left + copiedWidth > DEFAULT_GRID_COLUMNS) {
      left = DEFAULT_GRID_COLUMNS - copiedWidth;
    }
    const leftOffset = copiedBounds.leftColumn - left;
    const topOffset = copiedBounds.topRow - selectedBounds.topRow;
    const copiedSpaces = [...clipboard.widgets].sort((a, b) =>
      b.bottomRow - a.bottomRow).map((widget) => ({
      leftColumn: widget.leftColumn - leftOffset,
      rightColumn: widget.rightColumn - leftOffset,
      topRow: widget.topRow - topOffset,
      bottomRow: widget.bottomRow - topOffset,
    }));
    const selectedForCollision = [...selected].sort((a, b) =>
      (b.bottomRow - b.topRow) - (a.bottomRow - a.topRow));
    let verticalOffset = maxThickness;
    // This preserves getVerticallyAdjustedPositions' loop and one-row padding.
    for (let i = 0; i < copiedSpaces.length; i += 1) {
      const copiedSpace = { ...copiedSpaces[i],
        topRow: copiedSpaces[i].topRow + verticalOffset,
        bottomRow: copiedSpaces[i].bottomRow + verticalOffset };
      for (let j = 0; j < selectedForCollision.length; j += 1) {
        if (intersects(copiedSpace, rect(selectedForCollision[j]))) {
          const increment = selectedForCollision[j].bottomRow - copiedSpace.topRow;
          if (increment <= 0) break;
          verticalOffset += increment;
          i = 0;
          j = 0;
          break;
        }
      }
    }
    verticalOffset += 1; // WIDGET_PASTE_PADDING
    return { parentId: destination.widgetId, leftColumn: left,
      topRow: selectedBounds.topRow + verticalOffset };
  }

  if (options.gridPosition) {
    // getNewPositionsBasedOnMousePositions places a copied group below any
    // occupied space containing the pointer, then clamps it to 64 columns.
    let top = options.gridPosition.topRow;
    let left = options.gridPosition.leftColumn;
    for (const widget of destination.children ?? []) {
      if (widget.topRow < top && widget.leftColumn < left &&
        widget.bottomRow > top && widget.rightColumn > left) {
        top = widget.bottomRow + 1; // WIDGET_PASTE_PADDING
        left = widget.leftColumn -
          (copiedWidth - (widget.rightColumn - widget.leftColumn)) / 2;
        break;
      }
    }
    left = Math.round(left);
    if (left < 0) left = 0;
    if (left + copiedWidth > DEFAULT_GRID_COLUMNS) {
      left = DEFAULT_GRID_COLUMNS - copiedWidth;
    }
    return { parentId: destination.widgetId, leftColumn: left, topRow: top };
  }

  // WidgetOperationSagas.calculateNewWidgetPosition preserves copied columns
  // and offsets the normalized top row by nextAvailableRowInContainer.
  const nextAvailableRow = Math.max(0, ...(destination.children ?? []).map(
    (widget) => widget.bottomRow)) + 1;
  return { parentId: destination.widgetId,
    leftColumn: copiedBounds.leftColumn, topRow: nextAvailableRow };
}

function nextName(existing: Set<string>, oldName: string): string {
  const base = oldName.replace(/\d+$/, "") || oldName;
  let index = 1;
  while (existing.has(`${base}${index}`) || existing.has(`${base}${index}Canvas`)) index += 1;
  const name = `${base}${index}`;
  existing.add(name);
  return name;
}

/**
 * WidgetOperationSagas calls getNextWidgetName with the copied widget's full
 * name as prefix and startWithoutIndex=true. This is the corresponding pure
 * path through AppsmithUtils.getNextEntityName. The product has no Appsmith
 * evaluation tree, so only widget names are in the collision set.
 */
function copiedWidgetName(existing: Set<string>, oldName: string): string {
  const prefix = `${oldName}${existing.has(oldName) ? "Copy" : ""}`;
  const existingNames = [...existing];
  const regex = new RegExp(`^${prefix}(\\d+)$`);
  const usedIndices = existingNames.map((name) => {
    if (name && regex.test(name)) {
      const matches = name.match(regex);
      const index = matches && Array.isArray(matches) ? parseInt(matches[1], 10) : 0;
      return Number.isNaN(index) ? 0 : index;
    }
    return 0;
  });
  const lastIndex = Math.max(...usedIndices, 0);
  let name = prefix + (lastIndex + 1);
  if (lastIndex === 0) {
    const exactMatchFound = existingNames.some((candidate) =>
      prefix && candidate.trim() === prefix.trim());
    if (!exactMatchFound) name = prefix.trim();
  }
  existing.add(name);
  return name;
}

/**
 * Appsmith's groupWidgetsIntoContainer math, normalized to the product's
 * nested-canvas DSL: 64 logical columns occupy exactly the selected group's
 * outer pixel width, preserving every child's rendered X position.
 */
export function groupSelectedWidgets(
  sourceJson: string,
  widgetIds: readonly string[],
): MultiWidgetEditResult {
  if (widgetIds.length < 2) throw new Error("Select at least two widgets to group.");
  const document = parse(sourceJson);
  const root = document.layout.dsl;
  const { parent, widgets } = selection(root, widgetIds);
  const groupBounds = bounds(widgets);
  const groupWidth = groupBounds.rightColumn - groupBounds.leftColumn;
  const groupHeight = groupBounds.bottomRow - groupBounds.topRow;
  const containerRect: GridRect = { ...groupBounds,
    bottomRow: groupBounds.bottomRow + 2 };
  if (!inside(containerRect, columns(parent, root), rowLimit(parent, root))) {
    throw new Error("The group needs two additional rows below the selected widgets.");
  }
  const all = walk(root);
  const usedIds = new Set(all.map((widget) => widget.widgetId));
  const names = new Set(all.map((widget) => widget.widgetName));
  let containerId = `widget-${nanoid(12)}`;
  while (usedIds.has(containerId) || usedIds.has(`${containerId}-canvas`)) {
    containerId = `widget-${nanoid(12)}`;
  }
  const canvasId = `${containerId}-canvas`;
  const containerName = nextName(names, "Container");
  const canvasName = nextName(names, "Canvas");
  const { columnSpace, rowSpace } = gridSpaces(parent, root);
  const widthPerColumn = groupWidth * columnSpace / 64;
  const percentageIncrease = columnSpace / widthPerColumn;
  const groupedChildren = widgets.map((widget) => {
    widget.leftColumn = (widget.leftColumn - groupBounds.leftColumn) * percentageIncrease;
    widget.rightColumn = (widget.rightColumn - groupBounds.leftColumn) * percentageIncrease;
    widget.topRow -= groupBounds.topRow;
    widget.bottomRow -= groupBounds.topRow;
    widget.parentId = canvasId;
    widget.parentColumnSpace = widthPerColumn;
    widget.parentRowSpace = rowSpace;
    return widget;
  });
  const innerCanvas: AppsmithWidgetDsl = {
    widgetId: canvasId, widgetName: canvasName, type: "CANVAS_WIDGET",
    version: root.version, parentId: containerId,
    topRow: 0, bottomRow: groupHeight,
    leftColumn: 0, rightColumn: 64,
    minHeight: groupHeight * rowSpace,
    parentColumnSpace: widthPerColumn, parentRowSpace: rowSpace,
    detachFromLayout: true, canExtend: false, backgroundColor: "none",
    dynamicBindingPathList: [], children: groupedChildren,
  };
  const container: AppsmithWidgetDsl = {
    widgetId: containerId, widgetName: containerName, type: "CONTAINER_WIDGET",
    version: 1, parentId: parent.widgetId,
    ...containerRect,
    ...defaultDynamicHeightProperties(true),
    parentColumnSpace: columnSpace, parentRowSpace: rowSpace,
    containerStyle: "card", backgroundColor: "#ffffff",
    borderColor: "#d8e1e8", borderWidth: "1",
    isVisible: true, isLoading: false,
    tabId: "", renderMode: "CANVAS", dynamicBindingPathList: [],
    children: [innerCanvas],
  };

  const selectedIds = new Set(widgetIds);
  const remaining = (parent.children ?? []).filter((widget) =>
    !selectedIds.has(widget.widgetId));
  const temporaryCanvas: AppsmithWidgetDsl = { ...parent, children: remaining };
  const placement = planGroup(root, temporaryCanvas, [container],
    containerRect.leftColumn, containerRect.topRow, true,
    { groupContainer: true });
  if (!placement.valid) throw new Error(placement.error);
  for (const widget of remaining) {
    const target = placement.reflowed[widget.widgetId];
    if (target) applyRect(widget, target);
  }
  const firstIndex = (parent.children ?? []).findIndex((widget) =>
    selectedIds.has(widget.widgetId));
  remaining.splice(Math.max(0, firstIndex), 0, container);
  parent.children = remaining;
  extendRoot(root, parent, Math.max(container.bottomRow,
    ...Object.values(placement.reflowed).map((item) => item.bottomRow)));
  return finish(document, [containerId]);
}

function remapCopy(
  widgets: AppsmithWidgetDsl[], root: AppsmithWidgetDsl, parentId: string,
): { widgets: AppsmithWidgetDsl[]; ids: Map<string, string> } {
  const existing = walk(root);
  const existingIds = new Set(existing.map((widget) => widget.widgetId));
  const names = new Set(existing.map((widget) => widget.widgetName));
  const ids = new Map<string, string>();
  const originalNames = new Map<string, string>();
  const cloned = copy(widgets);
  for (const widget of cloned.flatMap(walk)) {
    originalNames.set(widget.widgetId, widget.widgetName);
    let newId = `widget-${nanoid(12)}`;
    while (existingIds.has(newId)) newId = `widget-${nanoid(12)}`;
    existingIds.add(newId);
    ids.set(widget.widgetId, newId);
    widget.widgetName = copiedWidgetName(names, widget.widgetName);
  }
  for (const widget of cloned.flatMap(walk)) {
    if (widget.type === "LIST_WIDGET_V2") {
      const oldName = originalNames.get(widget.widgetId);
      const oldPrimaryKeys = oldName &&
        `{{${oldName}.listData.map((currentItem, currentIndex) => currentItem["id"] )}}`;
      if (widget.primaryKeys === oldPrimaryKeys) {
        widget.primaryKeys =
          `{{${widget.widgetName}.listData.map((currentItem, currentIndex) => currentItem["id"] )}}`;
      }
      if (typeof widget.mainCanvasId === "string") {
        widget.mainCanvasId = ids.get(widget.mainCanvasId) ?? widget.mainCanvasId;
      }
      if (typeof widget.mainContainerId === "string") {
        widget.mainContainerId = ids.get(widget.mainContainerId) ?? widget.mainContainerId;
      }
    }
    widget.parentId = ids.get(widget.parentId ?? "") ?? parentId;
    widget.widgetId = ids.get(widget.widgetId) as string;
  }
  return { widgets: cloned, ids };
}

function sameVariableDefinition(left: DashboardVariable, right: DashboardVariable): boolean {
  if (left.label !== right.label || left.valueType !== right.valueType) return false;
  if (left.selector.kind === "logicalName" &&
    right.selector.kind === "logicalName") {
    return left.selector.name === right.selector.name;
  }
  if (left.selector.kind === "cyflexId" && right.selector.kind === "cyflexId") {
    return left.selector.id === right.selector.id;
  }
  return false;
}

/** Preserve existing Cyflex declarations and map copied binding keys to them. */
function mergeCopiedVariables(
  destination: DashboardDocument,
  clipboard: FixedWidgetClipboard,
): Map<string, string> {
  const mapping = new Map<string, string>();
  const variablesByKey = new Map(destination.variables.map((variable) =>
    [variable.key, variable]));
  const copiedVariableKeys = new Set(clipboard.bindings.map((binding) =>
    binding.variableKey));
  for (const source of clipboard.variables) {
    if (!copiedVariableKeys.has(source.key)) continue;
    const existing = variablesByKey.get(source.key);
    if (!existing || sameVariableDefinition(existing, source)) {
      if (!existing) {
        const added = copy(source);
        destination.variables.push(added);
        variablesByKey.set(added.key, added);
      }
      mapping.set(source.key, source.key);
      continue;
    }
    let suffix = 0;
    while (true) {
      const candidate = `${source.key}Copy${suffix || ""}`;
      const current = variablesByKey.get(candidate);
      if (!current || sameVariableDefinition(current, source)) {
        if (!current) {
          const added = { ...copy(source), key: candidate };
          destination.variables.push(added);
          variablesByKey.set(candidate, added);
        }
        mapping.set(source.key, candidate);
        break;
      }
      suffix += 1;
    }
  }
  return mapping;
}

/** Paste selected DSL subtrees as one undoable edit on a Fixed canvas. */
export function pasteSelectedWidgets(
  sourceJson: string,
  clipboard: FixedWidgetClipboard,
  target: { parentId: string; leftColumn: number; topRow: number },
): MultiWidgetEditResult {
  const document = parse(sourceJson);
  const root = document.layout.dsl;
  if (clipboard.sourceLayoutSystem !== document.compatibility.layoutSystem) {
    throw new Error("The copied widgets require a Fixed layout.");
  }
  const parent = destinationCanvas(root, target.parentId);
  if (!clipboard.widgets.length || parent.dropDisabled === true) {
    throw new Error("Choose an existing canvas and a nonempty widget clipboard.");
  }
  const { widgets, ids } = remapCopy(clipboard.widgets, root, parent.widgetId);
  if (parent.widgetId !== clipboard.sourceCanvasId) {
    const source = find(root, clipboard.sourceCanvasId);
    const oldSpaces = source?.type === "CANVAS_WIDGET" ? gridSpaces(source, root) : {
      columnSpace: clipboard.sourceColumnSpace,
      rowSpace: clipboard.sourceRowSpace,
    };
    const nextSpaces = gridSpaces(parent, root);
    for (const widget of widgets) {
      const oldColumn = Number(widget.parentColumnSpace) || oldSpaces.columnSpace;
      const oldRow = Number(widget.parentRowSpace) || oldSpaces.rowSpace;
      widget.parentColumnSpace = nextSpaces.columnSpace;
      widget.parentRowSpace = nextSpaces.rowSpace;
      scaleNestedSpaces(widget,
        nextSpaces.columnSpace / oldColumn,
        nextSpaces.rowSpace / oldRow);
    }
  }
  const plan = planGroup(root, parent, widgets,
    target.leftColumn, target.topRow, true);
  if (!plan.valid) throw new Error(plan.error);
  for (const sibling of parent.children ?? []) {
    const newRect = plan.reflowed[sibling.widgetId];
    if (newRect) applyRect(sibling, newRect);
  }
  for (const widget of widgets) applyRect(widget, plan.targets[widget.widgetId]);
  parent.children = [...(parent.children ?? []), ...widgets];
  const variableKeyMap = mergeCopiedVariables(document, clipboard);
  const bindingIds = new Set(document.bindings.map((binding) => binding.id));
  for (const binding of clipboard.bindings) {
    const newTarget = ids.get(binding.target.widgetId);
    if (!newTarget) continue;
    let newId = `binding-${nanoid(12)}`;
    while (bindingIds.has(newId)) newId = `binding-${nanoid(12)}`;
    bindingIds.add(newId);
    document.bindings.push({ ...copy(binding), id: newId,
      variableKey: variableKeyMap.get(binding.variableKey) ?? binding.variableKey,
      target: { ...binding.target, widgetId: newTarget } });
  }
  const dependencyKeys = new Set(document.componentDependencies.map((dependency) => dependency.key));
  for (const dependency of clipboard.componentDependencies) {
    const newRoot = ids.get(dependency.rootWidgetId);
    if (newRoot) {
      let newKey = `${dependency.key}-copy-${nanoid(8)}`;
      while (dependencyKeys.has(newKey)) newKey = `${dependency.key}-copy-${nanoid(8)}`;
      dependencyKeys.add(newKey);
      document.componentDependencies.push({ ...copy(dependency), key: newKey,
        rootWidgetId: newRoot });
    }
  }
  extendRoot(root, parent, Math.max(...Object.values(plan.targets).map((item) => item.bottomRow),
    ...Object.values(plan.reflowed).map((item) => item.bottomRow)));
  return finish(document, widgets.map((widget) => widget.widgetId));
}
