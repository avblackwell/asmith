import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { throttle } from "lodash";
import type { CompatCanvasWidget, ReadOnlyCompatState } from "../compat-store";
import { AppsmithDragVisuals } from "../appsmith-fixed-drag/DragVisuals";
import {
  getDraggingSpacesFromBlocks,
  generateDragStartPoints,
  getParentDiff,
  getRelativeStartPoints,
  modifyBlockDimension,
} from "../appsmith-fixed-drag/canvasDraggingUtils";
import {
  FixedCanvasDraggingArena,
  type FixedCanvasArenaPosition,
} from "../appsmith-fixed-drag/arena/FixedCanvasDraggingArena";
import { paintFixedCanvasBlocks } from "../appsmith-fixed-drag/arena/paintFixedCanvasBlocks";
import {
  getFixedCanvasSnapGrid,
  nextTemporaryDropTargetRows,
} from "../appsmith-fixed-autoheight/autoHeightRules";
import { selectFixedRootCanvasMetrics } from "../compat-store";
import { ContainerReflowGate } from "../appsmith-fixed-drag/container-hover/ContainerReflowGate";
import {
  AppsmithReflowSession,
  getEdgeDirection,
  getMoveDirection,
  reflowedGridRects,
  type ReflowSessionResult,
} from "../appsmith-fixed-drag/reflow-session";
import type { BlockSpace } from "../editable-store/appsmith-reflow/reflowTypes";
import { ReflowDirection } from "../editable-store/appsmith-reflow/reflowTypes";
import { type AppsmithWidgetChromeProps, type Handle } from "../appsmith-fixed-drag/WidgetChrome";
import { AppsmithAutoHeightOverlay } from "../appsmith-fixed-autoheight";
import {
  AppsmithCanvasSelectionMarquee,
  AppsmithWidgetsMultiSelectBox,
  normalizedSelectionRectangle,
  selectionStartSnapshot,
  selectWidgetsInArea,
  type SelectionRectangle,
} from "../appsmith-fixed-selection";
import { outsideCanvasSelectionStart } from "../appsmith-fixed-selection/outsideSelection";
import {
  previewCommittedGroupMove,
  type GroupPlacementRequest,
  type GroupPlacementPreview,
} from "../appsmith-fixed-selection/commands";
import type { EditorDragSession } from "../editable-store";
import {
  defaultWidgetGridSize,
  previewCommittedLayoutChange,
  previewLayoutChange,
  type AddWidgetRequest,
  type GridRect,
  type LayoutChange,
  type LayoutPreview,
} from "../editable-store/editDocument";
import {
  NativeReadOnlyCanvas,
  type NativeReadOnlyCanvasProps,
} from "../read-only/NativeReadOnlyCanvas";
import "./editableCanvas.css";

const MAX_CANVAS_ROWS = 9000;
const WIDGET_PADDING = 4;
// The Fixed palette's newWidget.isDynamicHeight comes from each widget's
// defaults. These authored defaults enable dynamicHeight in this client.
const AUTO_HEIGHT_PALETTE_TYPES = new Set<AddWidgetRequest["type"]>([
  "TEXT_WIDGET", "CONTAINER_WIDGET", "STATBOX_WIDGET", "TABS_WIDGET", "MODAL_WIDGET",
  "FORM_WIDGET", "CARD_WIDGET", "JSON_FORM_WIDGET",
  "CHECKBOX_WIDGET", "SWITCH_WIDGET", "RADIO_GROUP_WIDGET", "RATE_WIDGET",
  "CHECKBOX_GROUP_WIDGET", "SWITCH_GROUP_WIDGET",
]);
type Widgets = ReadOnlyCompatState["entities"]["canvasWidgets"];
interface PixelRect { left: number; top: number; width: number; height: number }
interface PointerSignal {
  pointerId: number;
  clientX: number;
  clientY: number;
  preventDefault(): void;
  stopPropagation(): void;
}
interface CanvasTarget {
  widget: CompatCanvasWidget;
  element: HTMLElement;
  columnSpace: number;
  rowSpace: number;
  columns: number;
  widgetOffset: number;
}
interface Interaction {
  pointerId: number;
  widgetId: string;
  kind: "move" | "resize";
  handle?: Handle;
  sourceParentId: string;
  original: GridRect;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  grabColumns: number;
  grabRows: number;
  columnSpace: number;
  rowSpace: number;
  scrollParent: HTMLElement | null;
  startScrollTop: number;
  moved: boolean;
  plan: LayoutPreview | null;
  change: LayoutChange | null;
}
interface VisualPreview {
  source: EditorDragSession;
  parentId: string | null;
  target: GridRect | null;
  plan: LayoutPreview;
}
interface SelectionInteraction {
  canvasId: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  lastClientX: number;
  lastClientY: number;
  moved: boolean;
  multiple: boolean;
  startSelection: string[];
  columnSpace: number;
  rowSpace: number;
  occupied: Array<{ id: string; parentId: string; left: number; right: number;
    top: number; bottom: number; detachFromLayout?: boolean }>;
}
interface SelectionVisual {
  canvasId: string;
  frame: PixelRect;
  rectangle: SelectionRectangle;
}
interface OutsideSelectionStart {
  clientX: number;
  clientY: number;
  multiple: boolean;
}
interface GroupInteraction {
  parentId: string;
  widgetIds: string[];
  grabColumns: number;
  grabRows: number;
  startLeft: number;
  startTop: number;
  lastX: number;
  lastY: number;
  preview: GroupPlacementPreview | null;
}
interface GroupVisual {
  parentId: string;
  plan: GroupPlacementPreview;
}
interface DragReflowPreview {
  session: AppsmithReflowSession;
  identity: string | null;
  canvasId: string | null;
  previousPositions: BlockSpace[] | null;
  positionsKey: string | null;
  direction: ReflowDirection;
  result: ReflowSessionResult | null;
  documentJson: string | null;
  exitContainer?: string;
}

export interface EditableCanvasProps extends NativeReadOnlyCanvasProps {
  documentJson: string;
  selectedWidgetIds: readonly string[];
  onSelectMany: (widgetIds: string[]) => void;
  dragSession: EditorDragSession | null;
  onBeginDrag: (session: EditorDragSession) => void;
  onDragCanvasChange: (canvasId: string | null) => void;
  onEndDrag: () => void;
  onAddAt: (request: AddWidgetRequest) => void;
  /** Grid coordinates are relative to the destination canvas. */
  onMove: (widgetId: string, leftColumn: number, topRow: number, parentId?: string) => void;
  /** North and west handles also update the widget's anchored position. */
  onResize: (widgetId: string, leftColumn: number, topRow: number, width: number, height: number) => void;
  onCopyMany: (widgetIds: string[]) => void;
  onCutMany: (widgetIds: string[]) => void;
  onDeleteMany: (widgetIds: string[]) => void;
  onGroupMany: (widgetIds: string[]) => void;
  onMoveGroup: (widgetIds: string[], parentId: string, leftColumn: number, topRow: number) => void;
  /** Commit the exact displacement plan that was drawn during this drag. */
  onCommitLayoutPlan: (change: LayoutChange, preview: LayoutPreview) => void;
  onCommitGroupPlan: (request: GroupPlacementRequest, preview: GroupPlacementPreview) => void;
  onHeightLimitsChange: (widgetId: string, limits: { minRows?: number; maxRows?: number }) => void;
  /** WidgetNameLayer's evaluated error count, keyed by widget ID. */
  evaluationErrorCounts?: Readonly<Record<string, number>>;
}

function positive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
function gridRect(widget: CompatCanvasWidget): GridRect {
  return { leftColumn: widget.leftColumn, topRow: widget.topRow,
    rightColumn: widget.rightColumn, bottomRow: widget.bottomRow };
}
function blockSpace(widgetId: string, rect: GridRect): BlockSpace {
  return { id: widgetId, left: rect.leftColumn, top: rect.topRow,
    right: rect.rightColumn, bottom: rect.bottomRow };
}
function isDropTarget(widget: CompatCanvasWidget): boolean {
  return widget.type === "CONTAINER_WIDGET" || widget.type === "STATBOX_WIDGET" ||
    widget.type === "TABS_WIDGET" || widget.type === "MODAL_WIDGET" ||
    widget.type === "LIST_WIDGET_V2";
}
function resizeDirection(handle: Handle | undefined): ReflowDirection {
  switch (handle) {
    case "left": return ReflowDirection.LEFT;
    case "right": return ReflowDirection.RIGHT;
    case "top": return ReflowDirection.TOP;
    case "bottom": return ReflowDirection.BOTTOM;
    case "topLeft": return ReflowDirection.TOPLEFT;
    case "topRight": return ReflowDirection.TOPRIGHT;
    case "bottomLeft": return ReflowDirection.BOTTOMLEFT;
    case "bottomRight": return ReflowDirection.BOTTOMRIGHT;
    default: return ReflowDirection.UNSET;
  }
}
function sameRect(a: GridRect, b: GridRect): boolean {
  return a.leftColumn === b.leftColumn && a.topRow === b.topRow &&
    a.rightColumn === b.rightColumn && a.bottomRow === b.bottomRow;
}
function elementForWidget(host: HTMLElement, widgetId: string): HTMLElement | null {
  // The ID comes from saved DSL. Avoid interpolating it into a CSS selector.
  for (const element of host.querySelectorAll<HTMLElement>("[data-widget-id]")) {
    if (element.dataset.widgetId === widgetId) return element;
  }
  return null;
}
function measuredRect(host: HTMLElement, widgetId: string): PixelRect | null {
  const element = elementForWidget(host, widgetId);
  if (!element) return null;
  const hostRect = host.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return { left: rect.left - hostRect.left, top: rect.top - hostRect.top,
    width: rect.width, height: rect.height };
}
function isDescendant(widgets: Widgets, widgetId: string, ancestorId: string): boolean {
  let widget: CompatCanvasWidget | undefined = widgets[widgetId];
  while (widget) {
    if (widget.widgetId === ancestorId) return true;
    widget = widget.parentId ? widgets[widget.parentId] : undefined;
  }
  return false;
}
function isListTemplateDescendant(widgets: Widgets, widgetId: string): boolean {
  let widget: CompatCanvasWidget | undefined = widgets[widgetId];
  while (widget?.parentId) {
    widget = widgets[widget.parentId];
    if (widget?.type === "LIST_WIDGET_V2") return true;
  }
  return false;
}
function canvasTarget(host: HTMLElement, canvas: CompatCanvasWidget, rootWidgetId: string): CanvasTarget | null {
  const element = elementForWidget(host, canvas.widgetId);
  if (!element) return null;
  const isMainCanvas = canvas.widgetId === rootWidgetId;
  const width = element.getBoundingClientRect().width;
  const grid = getFixedCanvasSnapGrid(width, {
    isMainCanvas, noPad: canvas.noPad === true,
  });
  return { widget: canvas, element,
    columnSpace: positive(grid.columnSpace, 19.4),
    rowSpace: grid.rowSpace,
    columns: 64,
    widgetOffset: canvas.noPad === true ? 0 : 6,
  };
}
function gridToPixels(
  host: HTMLElement, widgets: Widgets, rootWidgetId: string, parentId: string, rect: GridRect,
): PixelRect | null {
  const parent = widgets[parentId];
  const target = parent ? canvasTarget(host, parent, rootWidgetId) : null;
  if (!target) return null;
  const hostRect = host.getBoundingClientRect();
  const parentRect = target.element.getBoundingClientRect();
  return { left: parentRect.left - hostRect.left + target.widgetOffset +
      rect.leftColumn * target.columnSpace,
    top: parentRect.top - hostRect.top + target.widgetOffset + rect.topRow * target.rowSpace,
    width: (rect.rightColumn - rect.leftColumn) * target.columnSpace,
    height: (rect.bottomRow - rect.topRow) * target.rowSpace };
}
function resizedRect(original: GridRect, handle: Handle, dx: number, dy: number): GridRect {
  const next = { ...original };
  if (handle === "left" || handle.endsWith("Left")) next.leftColumn += dx;
  if (handle === "right" || handle.endsWith("Right")) next.rightColumn += dx;
  if (handle === "top" || handle.startsWith("top")) next.topRow += dy;
  if (handle === "bottom" || handle.startsWith("bottom")) next.bottomRow += dy;
  return next;
}
function boundedResize(original: GridRect, previous: GridRect, handle: Handle,
  dx: number, dy: number, columns: number): GridRect {
  const next = resizedRect(original, handle, dx, dy);
  // ResizableComponent.getResizedPositions rejects an axis outside the Fixed
  // canvas or below its minimum; FixedLayoutResizable keeps that axis's last
  // accepted newDimensions instead of clamping the pointer sample.
  if (next.leftColumn < 0 || next.rightColumn > columns ||
    next.rightColumn - next.leftColumn < 2) {
    next.leftColumn = previous.leftColumn;
    next.rightColumn = previous.rightColumn;
  }
  if (next.topRow < 0 || next.bottomRow - next.topRow < 4) {
    next.topRow = previous.topRow;
    next.bottomRow = previous.bottomRow;
  }
  return next;
}
function scrollablesAt(hit: Element | null, fallback: HTMLElement | null): HTMLElement[] {
  const candidates: HTMLElement[] = [];
  let element = hit;
  while (element) {
    if (element instanceof HTMLElement && element.scrollHeight > element.clientHeight + 2) {
      const overflow = window.getComputedStyle(element).overflowY;
      if (overflow === "auto" || overflow === "scroll") candidates.push(element);
    }
    element = element.parentElement;
  }
  if (fallback && !candidates.includes(fallback)) candidates.push(fallback);
  return candidates;
}

/** Canvas interaction shell. The Appsmith-derived placement planner is shared by preview and commit. */
export function EditableCanvas({
  documentJson, dragSession, onBeginDrag, onDragCanvasChange, onEndDrag,
  store, rootWidgetId, selectedWidgetId, selectedWidgetIds, onSelectMany,
  onSelect, onMove, onResize, onCopyMany, onCutMany, onDeleteMany,
  onGroupMany, onCommitLayoutPlan, onCommitGroupPlan, onHeightLimitsChange,
  onWidgetHeightChange, measurementRetryEpoch, theme, overlay,
  showTabOrder, evaluationErrorCounts, activeTabCanvasIds, onTabChange,
  openModalIds, onModalClose, onModalResize, onModalResizeStart, onModalResizeEnd,
}: EditableCanvasProps): React.ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const operationRef = useRef<Interaction | null>(null);
  const containerReflowGateRef = useRef(new ContainerReflowGate());
  const reflowPreviewRef = useRef<DragReflowPreview>({
    session: new AppsmithReflowSession(), identity: null, canvasId: null,
    previousPositions: null, positionsKey: null,
    direction: ReflowDirection.BOTTOM, result: null, documentJson: null,
  });
  const selectionRef = useRef<SelectionInteraction | null>(null);
  const outsideSelectionRef = useRef<OutsideSelectionStart | null>(null);
  const selectionScrollTimerRef = useRef<number | null>(null);
  const groupRef = useRef<GroupInteraction | null>(null);
  const selectionThrottleRef = useRef<ReturnType<typeof throttle> | null>(null);
  const selectionMoveRef = useRef<(x: number, y: number) => void>(() => undefined);
  const outsideSelectionMoveRef = useRef<(x: number, y: number) => void>(() => undefined);
  const selectionFinishRef = useRef<() => void>(() => undefined);
  const dragSessionRef = useRef(dragSession);
  const activeDragCanvasRef = useRef<string | null>(null);
  const dragScrollTimerRef = useRef<number | null>(null);
  const dragScrollDirectionRef = useRef(0);
  const palettePointerRef = useRef<{ x: number; y: number } | null>(null);
  const palettePlanRef = useRef<LayoutPreview | null>(null);
  const arenaDropHandledRef = useRef(false);
  const temporaryRowsRef = useRef<number | null>(null);
  const temporaryCanvasRowsRef = useRef<Record<string, number>>({});
  const suppressClickRef = useRef(false);
  const pendingResizeHeightsRef = useRef(new Map<string, number>());
  const resizeHeightFlushEpochRef = useRef<number | null>(null);
  const [selectedFrame, setSelectedFrame] = useState<PixelRect | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const focusedWidgetId = hoveredId ?? focusedId;
  const [visual, setVisual] = useState<VisualPreview | null>(null);
  const [selectionVisual, setSelectionVisual] = useState<SelectionVisual | null>(null);
  const [groupVisual, setGroupVisual] = useState<GroupVisual | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [temporaryRows, setTemporaryRows] = useState<number | null>(null);
  const [temporaryCanvasRows, setTemporaryCanvasRows] = useState<Record<string, number>>({});
  const [snapshot, setSnapshot] = useState(() => ({ store, state: store.getState() }));
  const state = snapshot.store === store ? snapshot.state : store.getState();
  const widgets = state.entities.canvasWidgets;
  const root = widgets[rootWidgetId];
  const renderedCanvasWidth = positive(state.ui.mainCanvas.width, 1242);
  const rootMetrics = root ? selectFixedRootCanvasMetrics(state, rootWidgetId, "editor") : null;
  const selected = selectedWidgetId ? widgets[selectedWidgetId] : undefined;
  const parent = selected?.parentId ? widgets[selected.parentId] : undefined;
  const canManipulate = !!selected && selected.type !== "CANVAS_WIDGET" &&
    selected.type !== "MODAL_WIDGET" &&
    !isListTemplateDescendant(widgets, selected.widgetId) &&
    !!parent && parent.type === "CANVAS_WIDGET" && !!root;
  const canMove = canManipulate && selected?.dragDisabled !== true;
  const canResize = canManipulate && selected?.resizeDisabled !== true;
  const selectedAutoHeight = selected?.dynamicHeight === "AUTO_HEIGHT" ||
    selected?.dynamicHeight === "AUTO_HEIGHT_WITH_LIMITS";
  dragSessionRef.current = dragSession;

  useEffect(() => {
    setSnapshot({ store, state: store.getState() });
    return store.subscribe(() => setSnapshot({ store, state: store.getState() }));
  }, [store]);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !selectedWidgetId || !canManipulate) {
      setSelectedFrame(null);
      return;
    }
    const refresh = () => setSelectedFrame(measuredRect(host, selectedWidgetId));
    refresh();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(refresh) : null;
    if (observer) {
      observer.observe(host);
      const element = elementForWidget(host, selectedWidgetId);
      if (element) observer.observe(element);
    }
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    host.addEventListener("scroll", refresh, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
      host.removeEventListener("scroll", refresh, true);
    };
  }, [canManipulate, selectedWidgetId, store, state]);
  useEffect(() => () => {
    if (dragScrollTimerRef.current !== null) window.clearTimeout(dragScrollTimerRef.current);
    containerReflowGateRef.current.reset();
    reflowPreviewRef.current.session.reset();
  }, []);

  function flushResizeHeights() {
    const pending = [...pendingResizeHeightsRef.current];
    pendingResizeHeightsRef.current.clear();
    for (const [widgetId, paddedHeightPx] of pending) {
      onWidgetHeightChange?.(widgetId, paddedHeightPx);
    }
  }

  // Appsmith queues auto-height measurements while a widget is dragging or
  // resizing. Replaying after the committed layout has been projected keeps
  // those measurements from invalidating the resize's document snapshot.
  useEffect(() => {
    if (resizeHeightFlushEpochRef.current === null ||
      measurementRetryEpoch === resizeHeightFlushEpochRef.current) return;
    resizeHeightFlushEpochRef.current = null;
    flushResizeHeights();
  }, [measurementRetryEpoch]);

  function onMeasuredWidgetHeight(widgetId: string, paddedHeightPx: number) {
    if (operationRef.current?.kind === "resize" ||
      resizeHeightFlushEpochRef.current !== null) {
      pendingResizeHeightsRef.current.set(widgetId, paddedHeightPx);
      return;
    }
    onWidgetHeightChange?.(widgetId, paddedHeightPx);
  }

  function changeActiveCanvas(canvasId: string | null) {
    if (activeDragCanvasRef.current === canvasId) return;
    activeDragCanvasRef.current = canvasId;
    onDragCanvasChange(canvasId);
  }

  function resetReflowPreview() {
    const preview = reflowPreviewRef.current;
    preview.session.reset();
    preview.identity = null;
    preview.canvasId = null;
    preview.previousPositions = null;
    preview.positionsKey = null;
    preview.direction = ReflowDirection.BOTTOM;
    preview.result = null;
    preview.documentJson = null;
    preview.exitContainer = undefined;
  }

  function clearTemporaryCanvasRows() {
    temporaryCanvasRowsRef.current = {};
    setTemporaryCanvasRows({});
  }

  function extendNestedCanvasRows(canvasId: string, draggedBottomRow: number,
    excludedWidgetIds: string[]) {
    if (canvasId === rootWidgetId) return;
    const canvas = widgets[canvasId];
    const host = hostRef.current;
    const element = host ? elementForWidget(host, canvasId) : null;
    if (!canvas || !element) return;
    const current = Math.max(Math.floor(element.getBoundingClientRect().height / 10),
      temporaryCanvasRowsRef.current[canvasId] ?? 0);
    const occupied = (canvas.children ?? []).map((id) => widgets[id])
      .filter((widget): widget is CompatCanvasWidget => !!widget &&
        widget.detachFromLayout !== true)
      .map((widget) => ({ id: widget.widgetId, bottom: widget.bottomRow }));
    const next = Math.min(MAX_CANVAS_ROWS, nextTemporaryDropTargetRows(
      current, excludedWidgetIds, draggedBottomRow, occupied, false,
    ));
    if (next <= current) return;
    temporaryCanvasRowsRef.current = {
      ...temporaryCanvasRowsRef.current, [canvasId]: next,
    };
    setTemporaryCanvasRows(temporaryCanvasRowsRef.current);
  }

  function sampleReflow(
    identity: string, canvas: CompatCanvasWidget, target: CanvasTarget,
    originalPositions: BlockSpace[], positions: BlockSpace[],
    excludedIds: readonly string[], clientX: number, clientY: number,
    options: { resizeDirection?: ReflowDirection } = {},
  ): ReflowSessionResult {
    const preview = reflowPreviewRef.current;
    const frame = target.element.getBoundingClientRect();
    const changedCanvas = preview.canvasId !== canvas.widgetId;
    if (changedCanvas || preview.identity !== identity ||
      preview.documentJson !== documentJson) {
      const previousCanvas = preview.canvasId ? widgets[preview.canvasId] : undefined;
      const occupiedSpaces = (canvas.children ?? []).map((id) => widgets[id])
        .filter((widget): widget is CompatCanvasWidget => !!widget &&
          !excludedIds.includes(widget.widgetId) && widget.detachFromLayout !== true)
        .map((widget) => ({
          ...blockSpace(widget.widgetId, gridRect(widget)),
          isDropTarget: isDropTarget(widget),
          fixedHeight: widget.isFlexChild !== true &&
            (widget.dynamicHeight === "AUTO_HEIGHT" ||
              widget.dynamicHeight === "AUTO_HEIGHT_WITH_LIMITS")
            ? widget.bottomRow - widget.topRow : undefined,
        }));
      preview.session.begin({
        canvasId: canvas.widgetId, originalPositions, occupiedSpaces,
        gridProps: { parentColumnSpace: target.columnSpace,
          parentRowSpace: target.rowSpace, maxGridColumns: target.columns },
      });
      preview.identity = identity;
      preview.canvasId = canvas.widgetId;
      preview.previousPositions = null;
      preview.positionsKey = null;
      preview.direction = options.resizeDirection ?? ReflowDirection.BOTTOM;
      preview.result = null;
      preview.documentJson = documentJson;
      // Appsmith passes the just-exited container to the first sample on its
      // parent canvas so the collision tree can reverse that container.
      if (changedCanvas && previousCanvas?.parentId) {
        preview.exitContainer = previousCanvas.parentId;
      }
    }
    const key = positions.map((space) => `${space.id}:${space.left},${space.top},${
      space.right},${space.bottom}`).join("|");
    if (preview.positionsKey === key && preview.result) return preview.result;
    const first = positions[0];
    const firstMove = preview.previousPositions === null;
    const direction = options.resizeDirection ?? getMoveDirection(
      preview.previousPositions?.[0] ?? null, first, preview.direction,
    );
    preview.direction = options.resizeDirection ?? (firstMove
      ? getEdgeDirection(clientX - frame.left, clientY - frame.top,
        frame.width, direction)
      : direction);
    const mouseLeft = Math.floor((clientX - frame.left - 10) / target.columnSpace);
    const mouseTop = Math.floor((clientY - frame.top - 10) / target.rowSpace);
    const result = preview.session.sample({
      canvasId: canvas.widgetId, positions,
      direction: preview.direction,
      stopMoveAfterLimit: !!options.resizeDirection,
      shouldSkipContainerReflow: !options.resizeDirection,
      forceDirection: firstMove && !options.resizeDirection,
      immediateExitContainer: preview.exitContainer,
      mousePosition: { id: "mouse", left: mouseLeft, right: mouseLeft + 1,
        top: mouseTop, bottom: mouseTop + 1 },
    });
    preview.exitContainer = undefined;
    preview.previousPositions = positions.map((space) => ({ ...space }));
    preview.positionsKey = key;
    preview.result = result;
    return result;
  }

  function occupiedForPlan(canvas: CompatCanvasWidget, excludedIds: readonly string[]) {
    return (canvas.children ?? []).map((id) => widgets[id])
      .filter((widget): widget is CompatCanvasWidget => !!widget &&
        !excludedIds.includes(widget.widgetId) && widget.detachFromLayout !== true)
      .map((widget) => ({ widgetId: widget.widgetId, rect: gridRect(widget) }));
  }

  function blockedByMovementLimit(result: ReflowSessionResult,
    draggedIds: readonly string[]): boolean {
    return draggedIds.some((id) => {
      const limit = result.movementLimitMap?.[id];
      return !!limit && (!limit.canHorizontalMove || !limit.canVerticalMove);
    });
  }

  function singlePlanFromReflow(
    change: LayoutChange, canvas: CompatCanvasWidget,
    target: GridRect, targetId: string, targetGrid: CanvasTarget,
    result: ReflowSessionResult,
  ): LayoutPreview {
    let resolvedTarget = target;
    let resolvedChange = change;
    const movementLimit = result.movementLimitMap?.[targetId];
    if (change.kind === "resize" && movementLimit &&
      (!movementLimit.canHorizontalMove || !movementLimit.canVerticalMove)) {
      // FixedLayoutResizable keeps the previous rectangle independently on
      // each blocked axis, then lets the other axis continue resizing.
      const operation = operationRef.current;
      const prior = operation?.plan?.valid && operation.plan.target
        ? operation.plan.target : operation?.original ?? target;
      resolvedTarget = {
        leftColumn: movementLimit.canHorizontalMove ? target.leftColumn : prior.leftColumn,
        rightColumn: movementLimit.canHorizontalMove ? target.rightColumn : prior.rightColumn,
        topRow: movementLimit.canVerticalMove ? target.topRow : prior.topRow,
        bottomRow: movementLimit.canVerticalMove ? target.bottomRow : prior.bottomRow,
      };
      if (sameRect(resolvedTarget, prior) && operation?.plan?.valid) {
        return operation.plan;
      }
      resolvedChange = { kind: "resize", request: {
        widgetId: change.request.widgetId,
        leftColumn: resolvedTarget.leftColumn, topRow: resolvedTarget.topRow,
        width: resolvedTarget.rightColumn - resolvedTarget.leftColumn,
        height: resolvedTarget.bottomRow - resolvedTarget.topRow,
      } };
    } else if (change.kind !== "resize" && blockedByMovementLimit(result, [targetId])) {
      return { valid: false, error: "The widget overlaps a drop target until it reflows.",
        parentId: canvas.widgetId, target, reflowed: {} };
    }
    const occupied = occupiedForPlan(canvas, [targetId]);
    const ids = new Set(occupied.map((widget) => widget.widgetId));
    if (Object.keys(result.movementMap).some((id) => id !== targetId && !ids.has(id))) {
      return { valid: false, error: "The drag reflow references a missing widget.",
        parentId: canvas.widgetId, target, reflowed: {} };
    }
    return previewCommittedLayoutChange(documentJson, resolvedChange, {
      valid: true, parentId: canvas.widgetId, target: resolvedTarget,
      reflowed: reflowedGridRects(occupied, result.movementMap,
        targetGrid.columnSpace, targetGrid.rowSpace),
    });
  }

  function groupPlanFromReflow(
    request: GroupPlacementRequest, canvas: CompatCanvasWidget,
    targets: Record<string, GridRect>, targetGrid: CanvasTarget,
    result: ReflowSessionResult,
  ): GroupPlacementPreview {
    if (blockedByMovementLimit(result, request.widgetIds)) {
      return { valid: false, error: "The selected widgets overlap a drop target until it reflows.",
        parentId: canvas.widgetId, targets, reflowed: {} };
    }
    const occupied = occupiedForPlan(canvas, request.widgetIds);
    const ids = new Set(occupied.map((widget) => widget.widgetId));
    if (Object.keys(result.movementMap).some((id) =>
      !request.widgetIds.includes(id) && !ids.has(id))) {
      return { valid: false, error: "The group reflow references a missing widget.",
        parentId: canvas.widgetId, targets, reflowed: {} };
    }
    return previewCommittedGroupMove(documentJson, request, {
      valid: true, parentId: canvas.widgetId, targets,
      reflowed: reflowedGridRects(occupied, result.movementMap,
        targetGrid.columnSpace, targetGrid.rowSpace),
    });
  }

  function beginGroupDrag(
    parentId: string, widgetIds: string[],
    groupCenter: { left: number; top: number },
    startPoints: { left: number; top: number },
  ) {
    groupRef.current = {
      parentId, widgetIds, grabColumns: startPoints.left,
      grabRows: startPoints.top, startLeft: groupCenter.left,
      startTop: groupCenter.top, lastX: 0, lastY: 0, preview: null,
    };
    stopDragScroll();
    containerReflowGateRef.current.reset();
    resetReflowPreview();
    clearTemporaryCanvasRows();
    setGroupVisual(null);
    onBeginDrag({ kind: "group", widgetIds, parentId });
  }

  function planGroupAtPoint(operation: GroupInteraction, clientX: number, clientY: number,
    canvasId: string | null = null) {
    const host = hostRef.current;
    const candidate = canvasId ? widgets[canvasId] : undefined;
    const canvas = candidate?.type === "CANVAS_WIDGET" &&
      !operation.widgetIds.some((id) => isDescendant(widgets, canvasId!, id))
      ? candidate : null;
    const target = host && canvas ? canvasTarget(host, canvas, rootWidgetId) : null;
    if (!target || !canvas) {
      containerReflowGateRef.current.reset();
      resetReflowPreview();
      operation.lastX = clientX;
      operation.lastY = clientY;
      operation.preview = null;
      changeActiveCanvas(null);
      setGroupVisual(null);
      return null;
    }
    const frame = target.element.getBoundingClientRect();
    const leftColumn = Math.max(0, Math.round(
      (clientX - frame.left - target.widgetOffset) / target.columnSpace -
        operation.grabColumns,
    ));
    const topRow = Math.max(0, Math.round(
      (clientY - frame.top - target.widgetOffset) / target.rowSpace -
        operation.grabRows,
    ));
    const request = {
      widgetIds: operation.widgetIds, parentId: canvas.widgetId,
      leftColumn, topRow,
    };
    const selected = operation.widgetIds.map((id) => widgets[id]).filter(
      (widget): widget is CompatCanvasWidget => !!widget,
    );
    if (selected.length !== operation.widgetIds.length) return null;
    const sourceParent = selected[0]?.parentId ? widgets[selected[0].parentId] : undefined;
    const sourceOrder = sourceParent?.children ?? [];
    selected.sort((left, right) => sourceOrder.indexOf(left.widgetId) -
      sourceOrder.indexOf(right.widgetId));
    const originalLeft = Math.min(...selected.map((widget) => widget.leftColumn));
    const originalTop = Math.min(...selected.map((widget) => widget.topRow));
    const width = Math.max(...selected.map((widget) => widget.rightColumn)) -
      originalLeft;
    const height = Math.max(...selected.map((widget) => widget.bottomRow)) -
      originalTop;
    const targetRect = { leftColumn, topRow,
      rightColumn: leftColumn + width, bottomRow: topRow + height };
    if (canvas.canExtend === true) extendNestedCanvasRows(canvas.widgetId,
      targetRect.bottomRow, operation.widgetIds);
    const targets = Object.fromEntries(selected.map((widget) => [widget.widgetId, {
      leftColumn: widget.leftColumn + leftColumn - originalLeft,
      rightColumn: widget.rightColumn + leftColumn - originalLeft,
      topRow: widget.topRow + topRow - originalTop,
      bottomRow: widget.bottomRow + topRow - originalTop,
    }]));
    const occupied = (canvas.children ?? []).map((id) => widgets[id])
      .filter((widget): widget is CompatCanvasWidget => !!widget &&
        !operation.widgetIds.includes(widget.widgetId) && widget.detachFromLayout !== true)
      .map((widget) => ({ ...gridRect(widget), widgetId: widget.widgetId, type: widget.type }));
    const originalPositions = selected.map((widget) =>
      blockSpace(widget.widgetId, gridRect(widget)));
    const positions = selected.map((widget) =>
      blockSpace(widget.widgetId, targets[widget.widgetId]));
    const immediate = sampleReflow(`group:${operation.widgetIds.join("|")}`,
      canvas, target, originalPositions, positions, operation.widgetIds,
      clientX, clientY);
    const preview = (result: ReflowSessionResult) => groupPlanFromReflow(
      request, canvas, targets, target, result,
    );
    containerReflowGateRef.current.sample({
      canvasId: canvas.widgetId, target: targetRect, occupied,
    }, () => {
      const activated = reflowPreviewRef.current.session.activateContainerReflow(
        canvas.widgetId,
      );
      if (!activated) return false;
      const delayed = preview(activated);
      if (!delayed.valid) {
        resetReflowPreview();
        return false;
      }
      reflowPreviewRef.current.result = activated;
      operation.preview = delayed;
      setGroupVisual({ parentId: canvas.widgetId, plan: delayed });
      return true;
    });
    const plan = preview(reflowPreviewRef.current.result ?? immediate);
    operation.lastX = clientX;
    operation.lastY = clientY;
    operation.preview = plan;
    changeActiveCanvas(canvas.widgetId);
    setGroupVisual({ parentId: canvas.widgetId, plan });
    return plan;
  }

  function finishGroupDrag(operation: GroupInteraction, clientX: number, clientY: number,
    cancelled = false, endDrag = true) {
    stopDragScroll();
    // FixedCanvasDraggingArena commits the rectangles last drawn by its active
    // arena; mouseup itself does not perform another hit test.
    const plan = !cancelled ? operation.preview : null;
    if (plan?.valid) {
      const target = plan.targets[operation.widgetIds[0]];
      const first = widgets[operation.widgetIds[0]];
      if (target && first) {
        const leftColumn = operation.startLeft + target.leftColumn - first.leftColumn;
        const topRow = operation.startTop + target.topRow - first.topRow;
        if (leftColumn !== operation.startLeft || topRow !== operation.startTop) {
          onCommitGroupPlan({ widgetIds: operation.widgetIds, parentId: plan.parentId,
            leftColumn, topRow }, plan);
        }
      }
    }
    containerReflowGateRef.current.reset();
    resetReflowPreview();
    groupRef.current = null;
    setGroupVisual(null);
    clearTemporaryCanvasRows();
    changeActiveCanvas(null);
    suppressClickRef.current = true;
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    // Flush queued ResizeObserver measurements only after the drag command
    // commits against the same geometry that produced its preview.
    if (endDrag) onEndDrag();
  }

  function startSelection(
    widget: CompatCanvasWidget, startX: number, startY: number, multiple: boolean,
  ) {
    const host = hostRef.current;
    if (!host) return;
    const target = canvasTarget(host, widget, rootWidgetId);
    if (!target) return;
    const occupied = (widget.children ?? []).map((id) => widgets[id])
      .filter((child): child is CompatCanvasWidget => !!child)
      .map((child) => ({ id: child.widgetId, parentId: widget.widgetId,
        left: child.leftColumn, right: child.rightColumn,
        top: child.topRow, bottom: child.bottomRow,
        detachFromLayout: child.detachFromLayout }));
    selectionRef.current = {
      canvasId: widget.widgetId, startX, startY, lastX: startX, lastY: startY,
      lastClientX: target.element.getBoundingClientRect().left + startX,
      lastClientY: target.element.getBoundingClientRect().top + startY,
      moved: false, multiple,
      startSelection: selectionStartSnapshot(widget.widgetId, selectedWidgetIds, occupied),
      columnSpace: target.columnSpace, rowSpace: target.rowSpace, occupied,
    };
    selectionThrottleRef.current?.cancel();
    selectionThrottleRef.current = throttle((interaction: SelectionInteraction,
      rectangle: SelectionRectangle, invertedX: boolean, invertedY: boolean) => {
      onSelectMany(selectWidgetsInArea({
        canvasId: interaction.canvasId, occupiedWidgets: interaction.occupied,
        startingSelection: interaction.startSelection, rectangle,
        snapColumnSpace: interaction.columnSpace, snapRowSpace: interaction.rowSpace,
        snapToNextColumn: invertedY, snapToNextRow: invertedX,
        isMultiSelect: interaction.multiple,
      }));
    }, 150, { leading: true, trailing: true });
  }

  function beginSelection(event: React.MouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || dragSession || operationRef.current ||
      (event.target as HTMLElement).closest(".od-editable-canvas__selection, .t--multi-selection-box")) return;
    const host = hostRef.current;
    if (!host) return;
    if ((event.target as HTMLElement).closest('[data-native-widget="modal"]') &&
      !(event.target as HTMLElement).closest('[role="dialog"]')) return;
    const element = (event.target as HTMLElement).closest<HTMLElement>("[data-widget-id]");
    const widget = element?.dataset.widgetId ? widgets[element.dataset.widgetId] :
      event.target === host ? widgets[rootWidgetId] : undefined;
    if (!widget || widget.type !== "CANVAS_WIDGET" || widget.dropDisabled === true) return;
    // CanvasSelectionArena starts on a draggable nested canvas only with a
    // control modifier; the main canvas can always start area selection.
    if (widget.widgetId !== rootWidgetId && !event.ctrlKey && !event.metaKey) return;
    const target = canvasTarget(host, widget, rootWidgetId);
    if (!target) return;
    const bounds = target.element.getBoundingClientRect();
    startSelection(widget, event.clientX - bounds.left, event.clientY - bounds.top,
      event.ctrlKey || event.metaKey || event.shiftKey);
    event.preventDefault();
  }

  function activateOutsideSelection(clientX: number, clientY: number) {
    const pending = outsideSelectionRef.current;
    const host = hostRef.current;
    const rootWidget = widgets[rootWidgetId];
    const rootElement = host && elementForWidget(host, rootWidgetId);
    if (!pending || !rootWidget || !rootElement || rootWidget.dropDisabled === true) return;
    const bounds = rootElement.getBoundingClientRect();
    if (clientX < bounds.left || clientX > bounds.right ||
      clientY < bounds.top || clientY > bounds.bottom) return;
    outsideSelectionRef.current = null;
    const start = outsideCanvasSelectionStart(pending.clientX, pending.clientY, bounds);
    startSelection(rootWidget, start.x, start.y, pending.multiple);
    selectionMoveRef.current(clientX, clientY);
  }

  function updateSelection(clientX: number, clientY: number) {
    const interaction = selectionRef.current;
    const host = hostRef.current;
    if (!interaction || !host) return;
    const canvas = elementForWidget(host, interaction.canvasId);
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const x = clientX - bounds.left;
    const y = clientY - bounds.top;
    interaction.lastClientX = clientX;
    interaction.lastClientY = clientY;
    if (!interaction.moved && Math.hypot(x - interaction.startX, y - interaction.startY) < 2) return;
    interaction.moved = true;
    interaction.lastX = x;
    interaction.lastY = y;
    const rectangle = normalizedSelectionRectangle(
      interaction.startX, interaction.startY, x, y,
    );
    const frame = measuredRect(host, interaction.canvasId);
    if (frame) setSelectionVisual({ canvasId: interaction.canvasId, frame, rectangle });
    selectionThrottleRef.current?.(
      interaction, rectangle, x < interaction.startX, y < interaction.startY,
    );
    scheduleSelectionScroll();
  }

  function scheduleSelectionScroll() {
    if (selectionScrollTimerRef.current !== null) return;
    const interaction = selectionRef.current;
    const host = hostRef.current;
    const canvas = interaction && host ? elementForWidget(host, interaction.canvasId) : null;
    const viewport = host?.closest<HTMLElement>(".od-workbench__viewport") ?? null;
    const scrollParent = canvas ? scrollablesAt(canvas, viewport)[0] : null;
    if (!interaction || !canvas || !scrollParent) return;
    const frame = scrollParent.getBoundingClientRect();
    const threshold = 20;
    const topBuffer = interaction.lastClientY - threshold - frame.top;
    const bottomBuffer = frame.bottom - interaction.lastClientY - threshold;
    const direction = topBuffer < threshold ? -1 : bottomBuffer < threshold ? 1 : 0;
    if (!direction || direction < 0 && scrollParent.scrollTop <= 0 ||
      direction > 0 && scrollParent.scrollTop + scrollParent.clientHeight >=
        scrollParent.scrollHeight) return;
    const distance = direction < 0 ? topBuffer : bottomBuffer;
    const speed = Math.max((threshold - distance) / (2 * threshold), 0.1);
    selectionScrollTimerRef.current = window.setTimeout(() => {
      selectionScrollTimerRef.current = null;
      if (!selectionRef.current) return;
      // useCanvasDragToScroll advances 40px (2 * extensionOffset * row height)
      // and then repeats while the pointer remains near the canvas edge.
      scrollParent.scrollBy({ top: direction * 40, behavior: "smooth" });
      selectionMoveRef.current(interaction.lastClientX, interaction.lastClientY);
      scheduleSelectionScroll();
    }, 100 * Math.max(0.4, speed));
  }

  function finishSelection() {
    const interaction = selectionRef.current;
    if (!interaction) return;
    selectionThrottleRef.current?.flush();
    selectionThrottleRef.current?.cancel();
    selectionThrottleRef.current = null;
    if (selectionScrollTimerRef.current !== null) {
      window.clearTimeout(selectionScrollTimerRef.current);
      selectionScrollTimerRef.current = null;
    }
    selectionRef.current = null;
    setSelectionVisual(null);
    if (interaction.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
  }
  selectionMoveRef.current = updateSelection;
  outsideSelectionMoveRef.current = activateOutsideSelection;
  selectionFinishRef.current = finishSelection;

  useEffect(() => {
    const host = hostRef.current;
    const viewport = host?.closest<HTMLElement>(".od-workbench__viewport");
    // WidgetEditorContentWrapper starts selection in the surrounding editor,
    // then CanvasSelectionArena begins its root marquee when the pointer enters.
    const outsideDown = (event: globalThis.MouseEvent) => {
      const target = event.target;
      if (event.button !== 0 || !host || !target || host.contains(target as Node) ||
        !(target instanceof HTMLElement) || dragSessionRef.current || operationRef.current ||
        target.closest("button, a, input, select, textarea, [contenteditable='true']")) return;
      outsideSelectionRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        multiple: event.ctrlKey || event.metaKey || event.shiftKey,
      };
    };
    const move = (event: globalThis.MouseEvent) => {
      if (outsideSelectionRef.current) {
        if (!(event.buttons & 1)) outsideSelectionRef.current = null;
        else outsideSelectionMoveRef.current(event.clientX, event.clientY);
      }
      if (selectionRef.current) selectionMoveRef.current(event.clientX, event.clientY);
    };
    const up = () => {
      outsideSelectionRef.current = null;
      if (selectionRef.current) selectionFinishRef.current();
    };
    const scroll = () => {
      const interaction = selectionRef.current;
      if (interaction?.moved) selectionMoveRef.current(
        interaction.lastClientX, interaction.lastClientY,
      );
    };
    viewport?.addEventListener("mousedown", outsideDown, true);
    window.addEventListener("mousemove", move, true);
    window.addEventListener("mouseup", up, true);
    window.addEventListener("scroll", scroll, true);
    return () => {
      viewport?.removeEventListener("mousedown", outsideDown, true);
      outsideSelectionRef.current = null;
      window.removeEventListener("mousemove", move, true);
      window.removeEventListener("mouseup", up, true);
      window.removeEventListener("scroll", scroll, true);
      selectionThrottleRef.current?.cancel();
      if (selectionScrollTimerRef.current !== null) {
        window.clearTimeout(selectionScrollTimerRef.current);
      }
    };
  }, []);

  function begin(kind: Interaction["kind"], event: PointerEvent<HTMLElement>, widget: CompatCanvasWidget, handle?: Handle) {
    const host = hostRef.current;
    const parentWidget = widget.parentId ? widgets[widget.parentId] : undefined;
    const element = host && elementForWidget(host, widget.widgetId);
    const target = host && parentWidget?.type === "CANVAS_WIDGET"
      ? canvasTarget(host, parentWidget, rootWidgetId) : null;
    if (!host || !element || !target || !parentWidget ||
      (kind === "move" && widget.dragDisabled === true) ||
      (kind === "resize" && widget.resizeDisabled === true)) return;
    event.preventDefault();
    event.stopPropagation();
    if (kind === "resize" && selectedWidgetId !== widget.widgetId) {
      onSelect?.(widget.widgetId);
    }
    const bounds = element.getBoundingClientRect();
    const original = gridRect(widget);
    const startPoints = generateDragStartPoints(event.clientX, event.clientY,
      { left: bounds.left + WIDGET_PADDING, top: bounds.top + WIDGET_PADDING },
      target.columnSpace, target.rowSpace,
      original.rightColumn - original.leftColumn,
      original.bottomRow - original.topRow);
    operationRef.current = {
      pointerId: event.pointerId, widgetId: widget.widgetId, kind, handle,
      sourceParentId: parentWidget.widgetId, original,
      startX: event.clientX, startY: event.clientY,
      lastX: event.clientX, lastY: event.clientY,
      grabColumns: startPoints.left,
      grabRows: startPoints.top,
      columnSpace: target.columnSpace, rowSpace: target.rowSpace,
      scrollParent: scrollablesAt(element,
        host.closest<HTMLElement>(".od-workbench__viewport"))[0] ?? null,
      startScrollTop: 0,
      moved: false, plan: null, change: null,
    };
    operationRef.current.startScrollTop = operationRef.current.scrollParent?.scrollTop ?? 0;
    temporaryRowsRef.current = null;
    stopDragScroll();
    containerReflowGateRef.current.reset();
    resetReflowPreview();
    clearTemporaryCanvasRows();
    setTemporaryRows(null);
    setVisual(null);
    if (kind === "resize") setIsResizing(true);
    if (kind === "move") onBeginDrag({ kind: "widget", widgetId: widget.widgetId });
  }

  function beginWidgetDrag(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (operationRef.current) return;
    const target = event.target as HTMLElement;
    const nameControl = target.closest("[data-testid='t--widget-propertypane-toggle']");
    if (!nameControl && target.closest(
      "[data-resize-handle], button, a, input, select, textarea, [contenteditable='true']",
    )) return;
    const host = hostRef.current;
    const element = target.closest<HTMLElement>("[data-widget-id], [data-editing-widget-id]");
    if (!host || !element || !host.contains(element)) return;
    const widgetId = element.dataset.widgetId ?? element.dataset.editingWidgetId;
    const widget = widgetId ? widgets[widgetId] : undefined;
    if (!widget || widget.type === "CANVAS_WIDGET" || widget.dragDisabled === true) return;
    if (event.metaKey || event.ctrlKey) return;
    const parentWidget = widget.parentId ? widgets[widget.parentId] : undefined;
    const destination = parentWidget?.type === "CANVAS_WIDGET"
      ? canvasTarget(host, parentWidget, rootWidgetId) : null;
    if (!destination || !parentWidget) return;
    const bounds = (elementForWidget(host, widget.widgetId) ?? element).getBoundingClientRect();
    const original = gridRect(widget);
    const startPoints = generateDragStartPoints(event.clientX, event.clientY,
      { left: bounds.left + WIDGET_PADDING, top: bounds.top + WIDGET_PADDING },
      destination.columnSpace, destination.rowSpace,
      original.rightColumn - original.leftColumn,
      original.bottomRow - original.topRow);
    operationRef.current = {
      pointerId: -1, widgetId: widget.widgetId, kind: "move",
      sourceParentId: parentWidget.widgetId, original,
      startX: event.clientX, startY: event.clientY,
      lastX: event.clientX, lastY: event.clientY,
      grabColumns: startPoints.left, grabRows: startPoints.top,
      columnSpace: destination.columnSpace, rowSpace: destination.rowSpace,
      scrollParent: null, startScrollTop: 0,
      moved: true, plan: null, change: null,
    };
    stopDragScroll();
    containerReflowGateRef.current.reset();
    resetReflowPreview();
    clearTemporaryCanvasRows();
    onSelect?.(widget.widgetId);
    onBeginDrag({ kind: "widget", widgetId: widget.widgetId });
  }

  function previewDraggedChange(change: LayoutChange, source: EditorDragSession,
    canvas: CompatCanvasWidget, target: GridRect, clientX: number, clientY: number,
    handle?: Handle): LayoutPreview {
    if ((source.kind === "palette" && source.type === "MODAL_WIDGET") ||
      (source.kind === "widget" && widgets[source.widgetId]?.detachFromLayout === true)) {
      // ModalWidget.detachFromLayout bypasses Appsmith's collision tree.
      containerReflowGateRef.current.reset();
      resetReflowPreview();
      return previewLayoutChange(documentJson, change);
    }
    const host = hostRef.current;
    const targetGrid = host ? canvasTarget(host, canvas, rootWidgetId) : null;
    if (!targetGrid) return { valid: false, error: "The destination canvas is unavailable.",
      parentId: canvas.widgetId, target, reflowed: {} };
    const targetId = source.kind === "widget" ? source.widgetId : "__new_widget__";
    const originalWidget = source.kind === "widget" ? widgets[source.widgetId] : undefined;
    const originalPositions = [blockSpace(targetId, originalWidget
      ? gridRect(originalWidget)
      : { leftColumn: 0, topRow: 0,
          rightColumn: target.rightColumn - target.leftColumn,
          bottomRow: target.bottomRow - target.topRow })];
    const immediate = sampleReflow(`${change.kind}:${targetId}`, canvas,
      targetGrid, originalPositions, [blockSpace(targetId, target)],
      [targetId], clientX, clientY,
      change.kind === "resize" ? { resizeDirection: resizeDirection(handle) } : {});
    const preview = (result: ReflowSessionResult) => singlePlanFromReflow(
      change, canvas, target, targetId, targetGrid, result,
    );
    if (change.kind === "resize") return preview(immediate);
    const occupied = (canvas.children ?? [])
      .map((id) => widgets[id])
      .filter((widget): widget is CompatCanvasWidget => !!widget &&
        widget.widgetId !== targetId && widget.detachFromLayout !== true)
      .map((widget) => ({ ...gridRect(widget), widgetId: widget.widgetId, type: widget.type }));
    containerReflowGateRef.current.sample({
      canvasId: canvas.widgetId, target, occupied,
    }, () => {
      const activated = reflowPreviewRef.current.session.activateContainerReflow(
        canvas.widgetId,
      );
      if (!activated) return false;
      const delayed = preview(activated);
      if (!delayed.valid) {
        resetReflowPreview();
        return false;
      }
      reflowPreviewRef.current.result = activated;
      if (source.kind === "palette") palettePlanRef.current = delayed;
      else if (source.kind === "widget" &&
        operationRef.current?.widgetId === source.widgetId) {
        operationRef.current.plan = delayed;
      }
      setVisual({ source, parentId: delayed.parentId ?? canvas.widgetId,
        target: delayed.target ?? target, plan: delayed });
      return true;
    });
    return preview(reflowPreviewRef.current.result ?? immediate);
  }

  function planAtPoint(operation: Interaction, clientX: number, clientY: number,
    canvasId: string | null = null): LayoutPreview | null {
    const host = hostRef.current;
    if (!host) return null;
    let change: LayoutChange | null = null;
    let parentId: string | null = operation.sourceParentId;
    let rawTarget: GridRect | null = null;
    if (operation.kind === "move") {
      const candidate = canvasId ? widgets[canvasId] : undefined;
      const canvas = candidate?.type === "CANVAS_WIDGET" &&
        !isDescendant(widgets, canvasId!, operation.widgetId) ? candidate : null;
      const destination = canvas ? canvasTarget(host, canvas, rootWidgetId) : null;
      if (!destination || !canvas) {
        // useCanvasDragging.resetCanvasState clears the active arena when its
        // pointer leaves; a later mouseup cannot reuse that arena's rectangle.
        containerReflowGateRef.current.reset();
        resetReflowPreview();
        operation.lastX = clientX;
        operation.lastY = clientY;
        operation.plan = null;
        operation.change = null;
        changeActiveCanvas(null);
        setVisual(null);
        return null;
      }
      if (destination && (canvas?.dropDisabled !== true ||
        destination.widget.widgetId === operation.sourceParentId)) {
        const bounds = destination.element.getBoundingClientRect();
        const width = operation.original.rightColumn - operation.original.leftColumn;
        const height = operation.original.bottomRow - operation.original.topRow;
        const rows = destination.widget.widgetId === rootWidgetId
          ? MAX_CANVAS_ROWS
          : Math.floor(destination.element.getBoundingClientRect().height /
            destination.rowSpace);
        const dragCenterSpace = { left: operation.original.leftColumn,
          top: operation.original.topRow };
        const isChildOfCanvas = canvas.widgetId === operation.sourceParentId;
        const parentDiff = getParentDiff(dragCenterSpace, true,
          isChildOfCanvas, destination.rowSpace, destination.columnSpace,
          destination.widgetOffset);
        const relativeStartPoints = getRelativeStartPoints(dragCenterSpace,
          { left: operation.grabColumns, top: operation.grabRows },
          { left: 20, top: 20 }, true, isChildOfCanvas,
          destination.rowSpace, destination.columnSpace,
          destination.widgetOffset);
        // useCanvasDragging applies the slider offset to the original block in
        // destination grid units; its source position cancels on a canvas jump.
        const left = operation.original.leftColumn * destination.columnSpace +
          destination.widgetOffset + clientX - bounds.left -
          relativeStartPoints.left - parentDiff.left;
        const top = operation.original.topRow * destination.rowSpace +
          destination.widgetOffset + clientY - bounds.top -
          relativeStartPoints.top - parentDiff.top;
        const block = modifyBlockDimension({
          left,
          top,
          width: width * destination.columnSpace,
          height: height * destination.rowSpace,
          columnWidth: width, rowHeight: height,
          widgetId: operation.widgetId,
          fixedHeight: widgets[operation.widgetId]?.isFlexChild !== true &&
            (widgets[operation.widgetId]?.dynamicHeight === "AUTO_HEIGHT" ||
              widgets[operation.widgetId]?.dynamicHeight === "AUTO_HEIGHT_WITH_LIMITS")
            ? height : undefined,
        }, destination.columnSpace, destination.rowSpace, rows - 1,
        canvas.canExtend === true || canvas.widgetId === rootWidgetId, false);
        const space = getDraggingSpacesFromBlocks([block],
          destination.columnSpace, destination.rowSpace)[0];
        const leftColumn = space.left;
        const topRow = space.top;
        parentId = destination.widget.widgetId;
        rawTarget = { leftColumn, topRow,
          rightColumn: space.right, bottomRow: space.bottom };
        if (canvas.canExtend === true) extendNestedCanvasRows(canvas.widgetId,
          rawTarget.bottomRow, [operation.widgetId]);
        change = { kind: "move", request: {
          widgetId: operation.widgetId, leftColumn, topRow,
          rightColumn: space.right, bottomRow: space.bottom,
          parentId: destination.widget.widgetId,
        } };
      }
    } else if (operation.handle) {
      const dx = Math.round((clientX - operation.startX) / operation.columnSpace);
      // ResizableComponent.getResizedPositions freezes height for auto-height
      // widgets. Its corner handles remain available for horizontal resizing.
      const resizingWidget = widgets[operation.widgetId];
      const autoHeight = resizingWidget?.dynamicHeight === "AUTO_HEIGHT" ||
        resizingWidget?.dynamicHeight === "AUTO_HEIGHT_WITH_LIMITS";
      // ResizableHandle adds the nearest canvas scroll delta to drag movement
      // before snapping, so the handle follows the same row while scrolling.
      const scrollDelta = (operation.scrollParent?.scrollTop ?? 0) - operation.startScrollTop;
      const dy = autoHeight ? 0 : Math.round((clientY - operation.startY + scrollDelta) /
        operation.rowSpace);
      const parent = widgets[operation.sourceParentId];
      const parentTarget = parent ? canvasTarget(host, parent, rootWidgetId) : null;
      const columns = parentTarget?.columns ?? 0;
      const previous = operation.plan?.valid && operation.plan.target
        ? operation.plan.target : operation.original;
      rawTarget = boundedResize(operation.original, previous, operation.handle,
        dx, dy, columns);
      change = { kind: "resize", request: {
        widgetId: operation.widgetId,
        leftColumn: rawTarget.leftColumn, topRow: rawTarget.topRow,
        width: rawTarget.rightColumn - rawTarget.leftColumn,
        height: rawTarget.bottomRow - rawTarget.topRow,
      } };
    }
    let plan: LayoutPreview = {
      valid: false, error: "Move over an eligible canvas to place this widget.",
      parentId, target: rawTarget, reflowed: {},
    };
    if (!change && operation.kind === "move") {
      containerReflowGateRef.current.reset();
      resetReflowPreview();
    }
    if (change) {
      try {
        const canvas = parentId ? widgets[parentId] : undefined;
        plan = canvas && rawTarget
          ? previewDraggedChange(change,
            { kind: "widget", widgetId: operation.widgetId }, canvas, rawTarget,
            clientX, clientY, operation.kind === "resize" ? operation.handle : undefined)
          : { valid: false, error: "The destination canvas is unavailable.",
              parentId, target: rawTarget, reflowed: {} };
      } catch (error) {
        plan = { valid: false,
          error: error instanceof Error ? error.message : "The placement is unavailable.",
          parentId, target: rawTarget, reflowed: {} };
      }
    }
    // FixedLayoutResizable retains newDimensions when the next resize sample
    // is rejected. Its wrapper and onResizeStop keep the last accepted rect.
    if (operation.kind === "resize" && !plan.valid &&
      operation.plan?.valid && operation.plan.target) {
      plan = operation.plan;
    }
    operation.lastX = clientX;
    operation.lastY = clientY;
    operation.plan = plan;
    if (operation.kind === "resize" && plan.valid && plan.target &&
      plan.target.bottomRow > operation.original.bottomRow) {
      extendNestedCanvasRows(operation.sourceParentId,
        plan.target.bottomRow, [operation.widgetId]);
    }
    operation.change = operation.kind === "resize" && plan.valid && plan.target
      ? { kind: "resize", request: {
          widgetId: operation.widgetId,
          leftColumn: plan.target.leftColumn, topRow: plan.target.topRow,
          width: plan.target.rightColumn - plan.target.leftColumn,
          height: plan.target.bottomRow - plan.target.topRow,
        } }
      : change;
    changeActiveCanvas(plan.parentId ?? parentId);
    setVisual({ source: { kind: "widget", widgetId: operation.widgetId },
      parentId: plan.parentId ?? parentId, target: plan.target ?? rawTarget, plan });
    return plan;
  }

  function planPaletteAtPoint(type: AddWidgetRequest["type"], clientX: number,
    clientY: number, canvasId: string | null = null): LayoutPreview | null {
    const host = hostRef.current;
    if (!host) {
      palettePlanRef.current = null;
      return null;
    }
    const candidate = canvasId ? widgets[canvasId] : undefined;
    const canvas = candidate?.type === "CANVAS_WIDGET" ? candidate : null;
    const destination = canvas ? canvasTarget(host, canvas, rootWidgetId) : null;
    if (!destination || !canvas || canvas.dropDisabled === true) {
      palettePlanRef.current = null;
      containerReflowGateRef.current.reset();
      resetReflowPreview();
      changeActiveCanvas(null);
      setVisual(null);
      return null;
    }
    const bounds = destination.element.getBoundingClientRect();
    const size = defaultWidgetGridSize(type);
    const rows = canvas.widgetId === rootWidgetId
      ? MAX_CANVAS_ROWS : Math.floor(destination.element.getBoundingClientRect().height /
        destination.rowSpace);
    // Appsmith places the new widget roughly 20px below and to the left of
    // the pointer's top-right drag anchor.
    const block = modifyBlockDimension({
      left: clientX - bounds.left - destination.widgetOffset -
        size.width * destination.columnSpace + 20,
      top: clientY - bounds.top - destination.widgetOffset - 20,
      width: size.width * destination.columnSpace,
      height: size.height * destination.rowSpace,
      columnWidth: size.width, rowHeight: size.height,
      widgetId: "__new_widget__",
      fixedHeight: AUTO_HEIGHT_PALETTE_TYPES.has(type)
        ? size.height * destination.rowSpace : undefined,
    }, destination.columnSpace, destination.rowSpace, rows - 1,
    canvas.canExtend === true || canvas.widgetId === rootWidgetId, false);
    const space = getDraggingSpacesFromBlocks([block],
      destination.columnSpace, destination.rowSpace)[0];
    const leftColumn = space.left;
    const topRow = space.top;
    if (canvas.canExtend === true) extendNestedCanvasRows(canvas.widgetId,
      space.bottom, []);
    let plan: LayoutPreview;
    try {
      const change: LayoutChange = { kind: "add", request: {
        type, parentId: canvas.widgetId, leftColumn, topRow,
        columns: block.columnWidth, rows: block.rowHeight,
      } };
      plan = previewDraggedChange(change, { kind: "palette", type }, canvas, {
        leftColumn, topRow, rightColumn: space.right,
        bottomRow: space.bottom,
      }, clientX, clientY);
    } catch (error) {
      plan = { valid: false,
        error: error instanceof Error ? error.message : "The placement is unavailable.",
        parentId: canvas.widgetId, target: { leftColumn, topRow,
          rightColumn: space.right, bottomRow: space.bottom },
        reflowed: {} };
    }
    changeActiveCanvas(canvas.widgetId);
    palettePlanRef.current = plan;
    setVisual({ source: { kind: "palette", type }, parentId: canvas.widgetId,
      target: plan.target, plan });
    return plan;
  }

  function maybeExtendRoot(clientY: number) {
    const host = hostRef.current;
    if (!host || !root || !rootMetrics) return;
    const target = canvasTarget(host, root, rootWidgetId);
    if (!target) return;
    const row = Math.floor((clientY - target.element.getBoundingClientRect().top) / target.rowSpace);
    if (row < 0) return;
    const current = Math.max(rootMetrics.dropTargetRows, temporaryRowsRef.current ?? 0);
    if (current >= MAX_CANVAS_ROWS) return;
    const occupied = (root.children ?? []).map((id) => widgets[id])
      .filter((widget): widget is CompatCanvasWidget => !!widget &&
        widget.detachFromLayout !== true)
      .map((widget) => ({ id: widget.widgetId, bottom: widget.bottomRow }));
    const groupBottom = groupVisual?.parentId === rootWidgetId
      ? Math.max(0, ...Object.values(groupVisual.plan.targets).map((item) => item.bottomRow))
      : 0;
    const draggedBottom = Math.max(row + 1,
      visual?.parentId === rootWidgetId ? visual.target?.bottomRow ?? 0 : 0,
      groupBottom);
    const excludedIds = dragSession?.kind === "group" ? dragSession.widgetIds
      : dragSession?.kind === "widget" ? [dragSession.widgetId] : [];
    const next = Math.min(MAX_CANVAS_ROWS, nextTemporaryDropTargetRows(
      current, excludedIds, draggedBottom, occupied, true,
    ));
    if (next <= current) return;
    temporaryRowsRef.current = next;
    setTemporaryRows(next);
  }

  function stopDragScroll() {
    if (dragScrollTimerRef.current !== null) {
      window.clearTimeout(dragScrollTimerRef.current);
      dragScrollTimerRef.current = null;
    }
    dragScrollDirectionRef.current = 0;
  }

  function planActiveDragAt(clientX: number, clientY: number,
    canvasId: string | null): LayoutPreview | GroupPlacementPreview | null {
    const session = dragSessionRef.current;
    if (session?.kind === "palette") {
      palettePointerRef.current = { x: clientX, y: clientY };
      if (canvasId === rootWidgetId) maybeExtendRoot(clientY);
      return planPaletteAtPoint(session.type, clientX, clientY, canvasId);
    } else if (session?.kind === "group" && groupRef.current) {
      if (canvasId === rootWidgetId) maybeExtendRoot(clientY);
      return planGroupAtPoint(groupRef.current, clientX, clientY, canvasId);
    } else if (operationRef.current?.kind === "move" && operationRef.current.moved) {
      if (canvasId === rootWidgetId) maybeExtendRoot(clientY);
      return planAtPoint(operationRef.current, clientX, clientY, canvasId);
    }
    return null;
  }

  function maybeAutoScroll(clientX: number, clientY: number) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      stopDragScroll();
      return;
    }
    const host = hostRef.current;
    const viewport = host?.closest<HTMLElement>(".od-workbench__viewport") ?? null;
    // useCanvasDragToScroll chooses the scroll parent from the active canvas
    // arena, rather than from whichever child happens to be under the pointer.
    const activeCanvas = host && activeDragCanvasRef.current
      ? elementForWidget(host, activeDragCanvasRef.current) : null;
    const scroller = activeCanvas ? scrollablesAt(activeCanvas, viewport)[0] : null;
    if (!scroller) { stopDragScroll(); return; }
    const bounds = scroller.getBoundingClientRect();
    if (clientX < bounds.left || clientX > bounds.right) { stopDragScroll(); return; }
    // Port of helpers.getScrollByPixels and useCanvasDragToScroll: 20px edge
    // threshold, 40px scroll steps, and a speed-based 100ms repeat timer.
    const threshold = 20;
    const topBuffer = clientY > 0 ? clientY - threshold - bounds.top : 0;
    const bottomBuffer = bounds.bottom - (clientY + threshold);
    const direction = topBuffer < threshold ? -1 : bottomBuffer < threshold ? 1 : 0;
    const distance = direction < 0 ? topBuffer : bottomBuffer;
    const speed = Math.max((threshold - distance) / (2 * threshold), 0.1);
    if (!direction || direction < 0 && scroller.scrollTop <= 0) {
      stopDragScroll();
      return;
    }
    if (dragScrollDirectionRef.current === direction && dragScrollTimerRef.current !== null) return;
    stopDragScroll();
    dragScrollDirectionRef.current = direction;
    const tick = () => {
      dragScrollTimerRef.current = null;
      const session = dragSessionRef.current;
      if (!session || session.kind === "widget" && !operationRef.current ||
        session.kind === "group" && !groupRef.current) {
        stopDragScroll();
        return;
      }
      scroller.scrollBy({ top: direction * 40, behavior: "smooth" });
      planActiveDragAt(clientX, clientY, activeDragCanvasRef.current);
      dragScrollTimerRef.current = window.setTimeout(tick,
        100 * Math.max(0.4, speed));
    };
    tick();
  }

  function update(event: PointerSignal) {
    const operation = operationRef.current;
    if (!operation || operation.pointerId !== event.pointerId) return;
    if (!operation.moved && Math.hypot(event.clientX - operation.startX, event.clientY - operation.startY) < 3) return;
    event.preventDefault();
    operation.moved = true;
    if (operation.kind === "resize") {
      planAtPoint(operation, event.clientX, event.clientY,
        operation.sourceParentId);
    } else if (activeDragCanvasRef.current) {
      maybeAutoScroll(event.clientX, event.clientY);
    }
  }

  function finishOperation(operation: Interaction, cancelled = false,
    endDrag = true) {
    stopDragScroll();
    // Appsmith's Fixed canvas commits the rectangles already drawn by the
    // drag arena. A fresh hit test at release can replace a valid preview if
    // scrolling or editor chrome briefly changes the element under the mouse.
    // Pointer/scroll movement updates operation.plan while the drag is active.
    const commitsResize = !cancelled && operation.kind === "resize" &&
      operation.moved && operation.plan?.valid && operation.plan.target &&
      operation.change && !sameRect(operation.plan.target, operation.original);
    if (!cancelled && operation.moved && operation.plan?.valid &&
      operation.plan.target && operation.change) {
      const target = operation.plan.target;
      if (operation.kind === "move") {
        if (operation.plan.parentId !== operation.sourceParentId ||
          !sameRect(target, operation.original)) {
          onCommitLayoutPlan(operation.change, operation.plan);
        }
      } else if (!sameRect(target, operation.original)) {
        onCommitLayoutPlan(operation.change, operation.plan);
      }
    }
    operationRef.current = null;
    containerReflowGateRef.current.reset();
    resetReflowPreview();
    temporaryRowsRef.current = null;
    setVisual(null);
    setTemporaryRows(null);
    clearTemporaryCanvasRows();
    if (operation.kind === "resize") {
      setIsResizing(false);
      if (commitsResize && measurementRetryEpoch !== undefined) {
        resizeHeightFlushEpochRef.current = measurementRetryEpoch;
      } else {
        flushResizeHeights();
      }
    }
    changeActiveCanvas(null);
    if (operation.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    // End the drag after commit so queued height measurements cannot change
    // the authored geometry between preview and command execution.
    if (operation.kind === "move" && endDrag) onEndDrag();
  }

  function finish(event: PointerSignal, cancelled = false) {
    const operation = operationRef.current;
    if (!operation || operation.pointerId !== event.pointerId) return;
    if (!cancelled && operation.kind === "move") return;
    event.preventDefault();
    event.stopPropagation();
    finishOperation(operation, cancelled);
  }

  useEffect(() => {
    // Appsmith registers a release listener beyond the active drag arena. The
    // selected widget chrome unmounts during a move, so its pointer capture
    // cannot own the rest of this gesture.
    const move = (event: globalThis.PointerEvent) => update(event);
    const up = (event: globalThis.PointerEvent) => finish(event);
    const cancel = (event: globalThis.PointerEvent) => finish(event, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancel, true);
    return () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true);
    };
  });

  useEffect(() => {
    if (!dragSession) return;
    function move(event: MouseEvent) {
      const session = dragSessionRef.current;
      if (!session || operationRef.current?.kind === "resize") return;
      if (session.kind === "palette") {
        palettePointerRef.current = { x: event.clientX, y: event.clientY };
        if (activeDragCanvasRef.current) maybeAutoScroll(event.clientX, event.clientY);
      } else if (session.kind === "group") {
        const operation = groupRef.current;
        if (!operation) return;
        if (activeDragCanvasRef.current) maybeAutoScroll(event.clientX, event.clientY);
      } else {
        const operation = operationRef.current;
        if (!operation || operation.pointerId !== -1) return;
        if (activeDragCanvasRef.current) maybeAutoScroll(event.clientX, event.clientY);
      }
    }
    function up(event: MouseEvent) {
      stopDragScroll();
      const session = dragSessionRef.current;
      if (!session || operationRef.current?.kind === "resize") return;
      // The Fixed arena's body/window mouseup listener commits its cached
      // preview after this capture listener. If no arena was entered, clear
      // the drag on the next turn as Appsmith's resetDragging does.
      window.setTimeout(() => {
        if (arenaDropHandledRef.current) {
          arenaDropHandledRef.current = false;
          return;
        }
        if (!dragSessionRef.current) return;
        if (session.kind === "group" && groupRef.current) {
          finishGroupDrag(groupRef.current, event.clientX, event.clientY, true);
        } else if (session.kind === "widget" && operationRef.current) {
          finishOperation(operationRef.current, true);
        } else {
          setVisual(null);
          palettePlanRef.current = null;
          containerReflowGateRef.current.reset();
          resetReflowPreview();
          setTemporaryRows(null);
          clearTemporaryCanvasRows();
          temporaryRowsRef.current = null;
          changeActiveCanvas(null);
          onEndDrag();
        }
      }, 0);
    }
    function cancel(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      stopDragScroll();
      const group = groupRef.current;
      if (group) {
        finishGroupDrag(group, group.lastX, group.lastY, true);
        return;
      }
      const operation = operationRef.current;
      if (operation?.pointerId === -1) finishOperation(operation, true);
      else {
        setVisual(null);
        palettePlanRef.current = null;
        containerReflowGateRef.current.reset();
        resetReflowPreview();
        setTemporaryRows(null);
        clearTemporaryCanvasRows();
        temporaryRowsRef.current = null;
        changeActiveCanvas(null);
        onEndDrag();
      }
    }
    window.addEventListener("mousemove", move, true);
    window.addEventListener("mouseup", up, true);
    window.addEventListener("keydown", cancel, true);
    return () => {
      window.removeEventListener("mousemove", move, true);
      window.removeEventListener("mouseup", up, true);
      window.removeEventListener("keydown", cancel, true);
      stopDragScroll();
    };
  }, [dragSession, documentJson, store]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !dragSession || dragSession.kind === "palette") return;
    const ids = dragSession.kind === "widget"
      ? [dragSession.widgetId] : dragSession.widgetIds;
    const sources = ids.map((id) => elementForWidget(host, id)).filter(
      (element): element is HTMLElement => !!element,
    );
    const previous = sources.map((source) => ({ source,
      visibility: source.style.visibility, pointerEvents: source.style.pointerEvents }));
    for (const source of sources) {
      source.dataset.dragSource = "true";
      source.style.visibility = "hidden";
      source.style.pointerEvents = "none";
    }
    return () => {
      for (const { source, visibility, pointerEvents } of previous) {
        delete source.dataset.dragSource;
        source.style.visibility = visibility;
        source.style.pointerEvents = pointerEvents;
      }
    };
  }, [dragSession, store]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const plan = groupVisual?.plan ?? visual?.plan;
    const parentId = groupVisual?.parentId ?? visual?.parentId;
    if (!host || !plan?.valid || !parentId) return;
    const changes: Array<{ element: HTMLElement; transform: string; transition: string }> = [];
    for (const [widgetId, target] of Object.entries(plan.reflowed)) {
      const widget = widgets[widgetId];
      const element = elementForWidget(host, widgetId);
      if (!widget || !element) continue;
      const original = gridToPixels(host, widgets, rootWidgetId,
        parentId, gridRect(widget));
      const destination = gridToPixels(host, widgets, rootWidgetId,
        parentId, target);
      if (!original || !destination) continue;
      changes.push({ element, transform: element.style.transform,
        transition: element.style.transition });
      element.style.transition = "transform 100ms ease";
      element.style.transform = `translate(${destination.left - original.left}px, ${
        destination.top - original.top}px)`;
    }
    return () => {
      for (const { element, transform, transition } of changes) {
        element.style.transform = transform;
        element.style.transition = transition;
      }
    };
  }, [visual, groupVisual, state, rootWidgetId]);

  function useArrowKey(kind: Interaction["kind"], handle: Handle | undefined, event: KeyboardEvent<HTMLElement>) {
    if (!selected || !parent || !canManipulate) return;
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 5 : 1;
    const [dx, dy] = direction;
    const original = gridRect(selected);
    const target = kind === "move"
      ? { leftColumn: original.leftColumn + dx * step,
          rightColumn: original.rightColumn + dx * step,
          topRow: original.topRow + dy * step,
          bottomRow: original.bottomRow + dy * step }
      : resizedRect(original, handle ?? "bottomRight", dx * step,
        selectedAutoHeight ? 0 : dy * step);
    if (sameRect(original, target)) return;
    const change: LayoutChange = kind === "move"
      ? { kind: "move", request: { widgetId: selected.widgetId,
          leftColumn: target.leftColumn, topRow: target.topRow, parentId: parent.widgetId } }
      : { kind: "resize", request: { widgetId: selected.widgetId,
          leftColumn: target.leftColumn, topRow: target.topRow,
          width: target.rightColumn - target.leftColumn,
          height: target.bottomRow - target.topRow } };
    const plan = previewLayoutChange(documentJson, change);
    if (!plan.valid || !plan.target) return;
    if (kind === "move") onMove(selected.widgetId,
      plan.target.leftColumn, plan.target.topRow, parent.widgetId);
    else onResize(selected.widgetId, plan.target.leftColumn, plan.target.topRow,
      plan.target.rightColumn - plan.target.leftColumn,
      plan.target.bottomRow - plan.target.topRow);
  }

  function onArenaEnter(canvasId: string) {
    changeActiveCanvas(canvasId);
  }

  function onArenaMove(canvasId: string, position: FixedCanvasArenaPosition):
    LayoutPreview | GroupPlacementPreview | null {
    const operation = operationRef.current;
    if (operation?.kind === "move") operation.moved = true;
    // useCanvasDragging plans from the slider's offsetX/Y. Its scroll replay
    // adjusts offsetY so the block follows the scrolled canvas under a still pointer.
    const canvas = widgets[canvasId];
    const host = hostRef.current;
    const destination = host && canvas ? canvasTarget(host, canvas, rootWidgetId) : null;
    const bounds = destination?.element.getBoundingClientRect();
    return planActiveDragAt(
      bounds ? bounds.left + position.offsetX : position.clientX,
      bounds ? bounds.top + position.offsetY : position.clientY,
      canvasId,
    );
  }

  function onArenaLeave(canvasId: string) {
    if (activeDragCanvasRef.current !== canvasId) return;
    stopDragScroll();
    containerReflowGateRef.current.reset();
    resetReflowPreview();
    palettePlanRef.current = null;
    if (operationRef.current?.kind === "move") {
      operationRef.current.plan = null;
      operationRef.current.change = null;
    }
    if (groupRef.current) groupRef.current.preview = null;
    setVisual(null);
    setGroupVisual(null);
    changeActiveCanvas(null);
  }

  function onArenaUp(canvasId: string,
    lastPreview: LayoutPreview | GroupPlacementPreview | null) {
    arenaDropHandledRef.current = true;
    const session = dragSessionRef.current;
    if (!session) return;
    if (session.kind === "palette") {
      const plan = palettePlanRef.current ??
        (lastPreview && "target" in lastPreview ? lastPreview : null);
      if (plan?.valid && plan.target && plan.parentId === canvasId) {
        onCommitLayoutPlan({ kind: "add", request: {
          type: session.type, parentId: canvasId,
          leftColumn: plan.target.leftColumn, topRow: plan.target.topRow,
          columns: plan.target.rightColumn - plan.target.leftColumn,
          rows: plan.target.bottomRow - plan.target.topRow,
        } }, plan);
      }
      palettePointerRef.current = null;
      palettePlanRef.current = null;
      containerReflowGateRef.current.reset();
      resetReflowPreview();
      temporaryRowsRef.current = null;
      setTemporaryRows(null);
      clearTemporaryCanvasRows();
      setVisual(null);
      changeActiveCanvas(null);
    } else if (session.kind === "group") {
      const operation = groupRef.current;
      if (!operation) return;
      operation.preview ??= lastPreview && "targets" in lastPreview
        ? lastPreview : null;
      finishGroupDrag(operation, operation.lastX, operation.lastY, false, false);
    } else {
      const operation = operationRef.current;
      if (!operation || operation.kind !== "move") return;
      operation.plan ??= lastPreview && "target" in lastPreview
        ? lastPreview : null;
      finishOperation(operation, false, false);
    }
  }

  function onArenaPaint(canvasId: string,
    preview: LayoutPreview | GroupPlacementPreview | null,
    canvas: HTMLCanvasElement) {
    const widget = widgets[canvasId];
    if (!widget) return;
    const host = hostRef.current;
    const target = host ? canvasTarget(host, widget, rootWidgetId) : null;
    if (!target) return;
    const rectangles = preview && "targets" in preview
      ? Object.values(preview.targets)
      : preview?.target ? [preview.target] : [];
    paintFixedCanvasBlocks({
      canvas,
      blocks: rectangles.map((rect) => ({
        left: rect.leftColumn * target.columnSpace,
        top: rect.topRow * target.rowSpace,
        width: (rect.rightColumn - rect.leftColumn) * target.columnSpace,
        height: (rect.bottomRow - rect.topRow) * target.rowSpace,
        valid: preview?.valid === true,
      })),
      snapColumnSpace: target.columnSpace,
      snapRowSpace: target.rowSpace,
      noPad: widget.noPad === true,
    });
  }

  const host = hostRef.current;
  const activeElement = visual?.parentId && host ? elementForWidget(host, visual.parentId) : null;
  const activeCanvas = visual?.parentId ? widgets[visual.parentId] : null;
  const activeTarget = host && activeCanvas ? canvasTarget(host, activeCanvas, rootWidgetId) : null;
  const activeFrame = activeElement && host ? (() => {
    const a = activeElement.getBoundingClientRect();
    const b = host.getBoundingClientRect();
    return { left: a.left - b.left, top: a.top - b.top, width: a.width,
      height: visual?.parentId === rootWidgetId ? Math.max(a.height, b.height) : a.height };
  })() : null;
  const ghostFrame = visual?.target && visual.parentId && host
    ? gridToPixels(host, widgets, rootWidgetId, visual.parentId, visual.target) : null;
  const liveResize = operationRef.current?.kind === "resize" &&
    visual?.plan.valid && selected && ghostFrame && selectedFrame
    ? { widgetId: selected.widgetId,
        x: ghostFrame.left - selectedFrame.left,
        y: ghostFrame.top - selectedFrame.top,
        width: ghostFrame.width, height: ghostFrame.height } : undefined;
  const hovered = focusedWidgetId ? widgets[focusedWidgetId] : undefined;
  const disabledHandles = new Set(Array.isArray(selected?.disabledResizeHandles)
    ? selected.disabledResizeHandles.filter((value): value is string => typeof value === "string") : []);
  const fixedWidgetChrome: Record<string, AppsmithWidgetChromeProps> = {};
  if (hovered && hovered.widgetId !== selected?.widgetId &&
    selectedWidgetIds.length <= 1 && !dragSession && !isResizing &&
    hovered.type !== "CANVAS_WIDGET" && hovered.type !== "MODAL_WIDGET" &&
    !isListTemplateDescendant(widgets, hovered.widgetId)) {
    fixedWidgetChrome[hovered.widgetId] = {
      widgetId: hovered.widgetId, widgetName: hovered.widgetName,
      topRow: hovered.topRow, selected: false, hovered: true,
      showName: true, canMove: hovered.dragDisabled !== true,
      canResize: hovered.resizeDisabled !== true,
      disabledHandles: new Set(Array.isArray(hovered.disabledResizeHandles)
        ? hovered.disabledResizeHandles.filter((value): value is string => typeof value === "string") : []),
      autoHeight: hovered.dynamicHeight === "AUTO_HEIGHT" ||
        hovered.dynamicHeight === "AUTO_HEIGHT_WITH_LIMITS",
      errorCount: evaluationErrorCounts?.[hovered.widgetId],
      onMoveKeyDown: () => undefined,
      onResizeKeyDown: () => undefined,
      onResizePointerDown: (handle, event) => begin("resize", event, hovered, handle),
      onSelect: () => onSelect?.(hovered.widgetId),
    };
  }
  if (canManipulate && selectedFrame && selected && selectedWidgetIds.length <= 1 &&
    !dragSession) {
    fixedWidgetChrome[selected.widgetId] = {
      widgetId: selected.widgetId, widgetName: selected.widgetName,
      topRow: selected.topRow, selected: true, hovered: false,
      showName: !isResizing, canMove, canResize, disabledHandles,
      autoHeight: selectedAutoHeight,
      errorCount: evaluationErrorCounts?.[selected.widgetId],
      onMoveKeyDown: (event) => useArrowKey("move", undefined, event),
      onResizeKeyDown: (handle, event) => useArrowKey("resize", handle, event),
      onResizePointerDown: (handle, event) => begin("resize", event, selected, handle),
      onSelect: () => onSelect?.(selected.widgetId),
    };
  }
  const selectedParentTarget = host && parent
    ? canvasTarget(host, parent, rootWidgetId) : null;
  const rootRows = rootMetrics?.dropTargetRows ?? 120;
  const rootHeight = rootMetrics?.dropTargetHeightPx ?? 1200;
  const rootRowSpace = 10;
  const selectedWidgets = selectedWidgetIds.map((id) => widgets[id]).filter(
    (widget): widget is CompatCanvasWidget => !!widget && widget.type !== "CANVAS_WIDGET",
  );
  const selectedCanvasId = selectedWidgets.length > 1 &&
    selectedWidgets.every((widget) => widget.parentId === selectedWidgets[0].parentId)
    ? selectedWidgets[0].parentId : null;
  const selectedCanvas = selectedCanvasId ? widgets[selectedCanvasId] : null;
  const selectedTarget = host && selectedCanvas
    ? canvasTarget(host, selectedCanvas, rootWidgetId) : null;
  const selectedCanvasFrame = host && selectedCanvasId
    ? measuredRect(host, selectedCanvasId) : null;
  const groupCanvas = groupVisual ? widgets[groupVisual.parentId] : null;
  const groupTarget = host && groupCanvas ? canvasTarget(host, groupCanvas, rootWidgetId) : null;
  const groupFrame = host && groupVisual ? measuredRect(host, groupVisual.parentId) : null;
  const groupNoPad = groupCanvas?.noPad === true;
  const groupVisualPad = groupNoPad ? 0 : 6;
  const groupBlocks = groupVisual && groupFrame && host && groupTarget
    ? Object.values(groupVisual.plan.targets).map((target) => ({
      left: groupTarget.widgetOffset + target.leftColumn * groupTarget.columnSpace - groupVisualPad,
      top: groupTarget.widgetOffset + target.topRow * groupTarget.rowSpace - groupVisualPad,
      width: (target.rightColumn - target.leftColumn) * groupTarget.columnSpace,
      height: (target.bottomRow - target.topRow) * groupTarget.rowSpace,
      valid: groupVisual.plan.valid,
    })) : [];

  return (
    <div
      className={`od-editable-canvas${visual || selectionVisual || groupVisual ? " od-editable-canvas--interacting" : ""}${dragSession ? " od-editable-canvas--dragging" : ""}`}
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClickRef.current = false;
      }}
      onDragStartCapture={beginWidgetDrag}
      onMouseDownCapture={beginSelection}
      onMouseMoveCapture={(event) => {
        if (dragSession || operationRef.current || selectionRef.current) return;
        const host = hostRef.current;
        // WidgetNameLayer lives inside Appsmith's widget wrapper. Our chrome
        // sits above that wrapper, so retain hover while crossing its name.
        const element = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-widget-id], [data-editing-widget-id]",
        );
        const widgetId = host && element && host.contains(element)
          ? element.dataset.widgetId ?? element.dataset.editingWidgetId ?? null : null;
        const widget = widgetId ? widgets[widgetId] : undefined;
        const next = widget && widget.type !== "CANVAS_WIDGET" &&
          widget.type !== "MODAL_WIDGET" &&
          widget.resizeDisabled !== true ? widgetId : null;
        // Appsmith's Canvas clears focusedWidget on canvas mouseleave, not
        // while crossing blank canvas between a widget and its name badge.
        if (next) setHoveredId((current) => current === next ? current : next);
      }}
      onMouseLeave={() => setHoveredId(null)}
      onFocusCapture={(event) => {
        const target = event.target as HTMLElement;
        const element = target.closest<HTMLElement>("[data-widget-id], [data-editing-widget-id]");
        const widgetId = element?.dataset.widgetId ?? element?.dataset.editingWidgetId;
        setFocusedId(widgetId && widgets[widgetId]?.type !== "CANVAS_WIDGET" ? widgetId : null);
      }}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (!next || !(next instanceof HTMLElement) ||
          !event.currentTarget.contains(next)) setFocusedId(null);
      }}
      ref={hostRef}
      style={{ width: renderedCanvasWidth,
        minHeight: Math.max(rootHeight, (temporaryRows ?? 0) * rootRowSpace) }}
    >
      <NativeReadOnlyCanvas draggableWidgets onSelect={onSelect}
        liveResize={liveResize}
        fixedWidgetChrome={fixedWidgetChrome}
        temporaryCanvasRows={temporaryCanvasRows}
        renderFixedCanvasArena={(canvasId, frame, widget) => {
          const snapGrid = getFixedCanvasSnapGrid(frame.width, {
            isMainCanvas: canvasId === rootWidgetId, noPad: widget.noPad === true,
          });
          const sourceParentId = dragSession?.kind === "widget"
            ? widgets[dragSession.widgetId]?.parentId
            : dragSession?.kind === "group" ? dragSession.parentId : null;
          return <FixedCanvasDraggingArena<LayoutPreview | GroupPlacementPreview>
            canvasId={canvasId} isDragging={!!dragSession}
            isResizing={isResizing}
            isCurrentDraggedCanvas={activeDragCanvasRef.current === canvasId}
            isInitialDragCanvas={dragSession?.kind === "palette"
              ? canvasId === rootWidgetId : sourceParentId === canvasId}
            canExtend={canvasId === rootWidgetId || widget.canExtend === true}
            snapRows={Math.max(1, Math.ceil(frame.height / snapGrid.rowSpace))}
            snapColumnSpace={snapGrid.columnSpace}
            snapRowSpace={snapGrid.rowSpace}
            canvasPadding={canvasId === rootWidgetId ? 200 : 0}
            onEnter={onArenaEnter}
            onMove={onArenaMove}
            onLeave={onArenaLeave}
            onUp={onArenaUp}
            onDragEnd={() => onEndDrag()}
            currentPreview={visual?.parentId === canvasId ? visual.plan
              : groupVisual?.parentId === canvasId ? groupVisual.plan : undefined}
            onPaint={onArenaPaint}
          />;
        }}
        activeTabCanvasIds={activeTabCanvasIds} onTabChange={onTabChange}
        openModalIds={openModalIds} onModalClose={onModalClose}
        onModalResize={onModalResize}
        onModalResizeStart={onModalResizeStart}
        onModalResizeEnd={onModalResizeEnd}
        onWidgetHeightChange={onMeasuredWidgetHeight}
        measurementRetryEpoch={measurementRetryEpoch}
        showTabOrder={showTabOrder}
        overlay={overlay} rootWidgetId={rootWidgetId}
        selectedWidgetId={selectedWidgetId} store={store} theme={theme} />
      {selectionVisual && <AppsmithCanvasSelectionMarquee
        canvasId={selectionVisual.canvasId} frame={selectionVisual.frame}
        rectangle={selectionVisual.rectangle} />}
      {selectedCanvasId && selectedTarget && selectedCanvasFrame &&
        <AppsmithWidgetsMultiSelectBox canvasId={selectedCanvasId}
          canvasOffset={{ left: selectedCanvasFrame.left, top: selectedCanvasFrame.top }}
          selectedWidgets={selectedWidgets.map((widget) => ({
            widgetId: widget.widgetId, parentId: widget.parentId,
            topRow: widget.topRow, bottomRow: widget.bottomRow,
            leftColumn: widget.leftColumn, rightColumn: widget.rightColumn,
          }))} snapColumnSpace={selectedTarget.columnSpace}
          snapRowSpace={selectedTarget.rowSpace}
          noContainerOffset={selectedCanvas?.noContainerOffset === true}
          isDragging={!!dragSession} onFocus={() => setHoveredId(null)}
          onGroupDragStart={({ parentId, draggingGroupCenter, startPoints }) =>
            beginGroupDrag(parentId, selectedWidgets.map((widget) => widget.widgetId),
              draggingGroupCenter, startPoints)}
          onCopy={() => onCopyMany(selectedWidgets.map((widget) => widget.widgetId))}
          onCut={() => onCutMany(selectedWidgets.map((widget) => widget.widgetId))}
          onDelete={() => onDeleteMany(selectedWidgets.map((widget) => widget.widgetId))}
          onGroup={() => onGroupMany(selectedWidgets.map((widget) => widget.widgetId))} />}
      {groupVisual && groupFrame && groupTarget &&
        <AppsmithDragVisuals activeFrame={groupFrame} blocks={groupBlocks}
          showPreviewCanvas={false}
          canvasId={groupVisual.parentId} columnSpace={groupTarget.columnSpace}
          rowSpace={groupTarget.rowSpace} hostHeight={Math.max(host?.clientHeight ?? 0, rootHeight)}
          hostWidth={host?.clientWidth ?? renderedCanvasWidth}
          noPad={groupNoPad} />}
      {visual && activeFrame && activeTarget && visual.parentId &&
        <AppsmithDragVisuals activeFrame={activeFrame}
          showPreviewCanvas={false}
          blocks={ghostFrame ? [{
            left: ghostFrame.left - activeFrame.left -
              (activeCanvas?.noPad === true ? 0 : 6),
            top: ghostFrame.top - activeFrame.top -
              (activeCanvas?.noPad === true ? 0 : 6),
            width: ghostFrame.width, height: ghostFrame.height,
            valid: visual.plan.valid,
          }] : []}
          canvasId={visual.parentId} columnSpace={activeTarget.columnSpace}
          hostHeight={Math.max(host?.clientHeight ?? 0, rootHeight,
            (temporaryRows ?? 0) * rootRowSpace)}
          hostWidth={host?.clientWidth ?? renderedCanvasWidth}
          noPad={activeCanvas?.noPad === true}
          rowSpace={activeTarget.rowSpace} />}
      {visual && !visual.plan.valid && visual.plan.error &&
        <div className="od-editable-canvas__feedback" role="status">{visual.plan.error}</div>}
      {canManipulate && selectedFrame && selected && selectedParentTarget &&
        selectedWidgetIds.length <= 1 &&
        selected.dynamicHeight === "AUTO_HEIGHT_WITH_LIMITS" &&
        <AppsmithAutoHeightOverlay
          bottomRow={selected.bottomRow}
          isHidden={!!dragSession || isResizing || !!visual || !!groupVisual}
          leftColumn={selected.leftColumn}
          maxDynamicHeight={positive(selected.maxDynamicHeight, 9000)}
          minDynamicHeight={positive(selected.minDynamicHeight, 4)}
          noContainerOffset={parent?.noPad === true}
          onBatchUpdate={(limits) => onHeightLimitsChange(selected.widgetId, {
            minRows: limits.minDynamicHeight, maxRows: limits.maxDynamicHeight,
          })}
          parentColumnSpace={selectedParentTarget.columnSpace}
          parentRowSpace={selectedParentTarget.rowSpace}
          rightColumn={selected.rightColumn}
          style={selectedFrame}
          topRow={selected.topRow}
          widgetId={selected.widgetId}
        />}
    </div>
  );
}
