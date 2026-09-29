/**
 * Fixed-layout auto-height document updates. The dependency tree and vertical
 * reflow follow Appsmith's utils/autoHeight/{generateTree,helpers,reflow}.ts;
 * the bottom-up canvas/container pass follows sagas/autoHeightSagas/widgets.ts
 * and containers.ts. DOM measurement stays in AppsmithAutoHeightContainer.
 */
import { parseDashboardDocument, type AppsmithWidgetDsl, type DashboardDocument } from "../../document";
import {
  CANVAS_EXTENSION_OFFSET,
  DEFAULT_GRID_ROW_HEIGHT,
  getWidgetMaxAutoHeight,
  getWidgetMinAutoHeight,
  isAutoHeightEnabledForWidget,
  normalizedMainCanvasBottomRow,
} from "../appsmith-fixed-autoheight/autoHeightRules";
import type { TreeNode, NodeSpace } from "./appsmith-auto-height/constants";
import { generateTree } from "./appsmith-auto-height/generateTree";
import { computeChangeInPositionBasedOnDelta } from "./appsmith-auto-height/reflow";
import { tabsCanvasHeightOffsetRows } from "../native-widgets/tabs/tabsModel";
import { recomputeModalAutoHeight } from "../native-widgets/modal/modalAutoHeight";
import { cardChromeHeightInPx } from "../native-widgets/form-card/viewModel";

export type AutoHeightLayoutTree = Record<string, TreeNode>;

function visit(widget: AppsmithWidgetDsl, callback: (widget: AppsmithWidgetDsl) => void): void {
  callback(widget);
  for (const child of widget.children ?? []) visit(child, callback);
}

function findWidget(root: AppsmithWidgetDsl, widgetId: string): AppsmithWidgetDsl | undefined {
  let found: AppsmithWidgetDsl | undefined;
  visit(root, (widget) => { if (widget.widgetId === widgetId) found = widget; });
  return found;
}

/** Build the Appsmith above/below graph independently for each CANVAS_WIDGET. */
export function buildAutoHeightTree(root: AppsmithWidgetDsl,
  previous: AutoHeightLayoutTree = {}, layoutUpdated = false): AutoHeightLayoutTree {
  const tree: AutoHeightLayoutTree = {};
  visit(root, (canvas) => {
    if (canvas.type !== "CANVAS_WIDGET") return;
    const spaces: Record<string, NodeSpace> = {};
    for (const widget of canvas.children ?? []) {
      if (widget.detachFromLayout === true) continue;
      spaces[widget.widgetId] = {
        id: widget.widgetId,
        left: widget.leftColumn,
        right: widget.rightColumn,
        top: widget.topRow,
        bottom: widget.bottomRow,
      };
    }
    Object.assign(tree, generateTree(spaces, layoutUpdated, previous));
  });
  return tree;
}

function rowLimit(widget: AppsmithWidgetDsl, desiredRows: number): number {
  const min = getWidgetMinAutoHeight(widget) ?? 4;
  const max = getWidgetMaxAutoHeight(widget) ?? 9000;
  return Math.min(max, Math.max(min, desiredRows));
}

function canvasHeightOffsetRows(widget: AppsmithWidgetDsl): number {
  const border = Number(widget.borderWidth ?? 0);
  return widget.type === "CARD_WIDGET"
    ? Math.ceil(cardChromeHeightInPx(widget) / DEFAULT_GRID_ROW_HEIGHT)
    : widget.type === "TABS_WIDGET"
    ? tabsCanvasHeightOffsetRows(widget.borderWidth as string | number | undefined,
      widget.shouldShowTabs !== false)
    : Number.isFinite(border) && border > 1
      ? Math.ceil((border * 2) / DEFAULT_GRID_ROW_HEIGHT) : 0;
}

function applyHeight(root: AppsmithWidgetDsl, widget: AppsmithWidgetDsl, targetRows: number,
  tree: AutoHeightLayoutTree): boolean {
  const node = tree[widget.widgetId];
  if (!node || !widget.parentId) return false;
  const parent = findWidget(root, widget.parentId);
  if (parent?.type !== "CANVAS_WIDGET") return false;
  const delta = targetRows - (widget.bottomRow - widget.topRow);
  if (delta === 0) return false;
  const changes = computeChangeInPositionBasedOnDelta(tree, { [widget.widgetId]: delta });
  for (const sibling of parent.children ?? []) {
    const bounds = changes[sibling.widgetId];
    if (!bounds) continue;
    sibling.topRow = bounds.topRow;
    sibling.bottomRow = bounds.bottomRow;
  }
  // Appsmith's UPDATE_MULTIPLE_WIDGET_PROPERTIES reducer calls
  // getCanvasWidgetHeightsToUpdate after a container height change. For each
  // child canvas, getCanvasBottomRow stores pixels and uses the larger of its
  // parent's available rows and its own bottommost child. A row-count write
  // here would erase the Fixed resize saga's persisted canvas extension.
  if (widget.type === "CONTAINER_WIDGET" || widget.type === "STATBOX_WIDGET" ||
    widget.type === "FORM_WIDGET" || widget.type === "CARD_WIDGET" ||
    widget.type === "TABS_WIDGET") {
    const parentRows = targetRows - canvasHeightOffsetRows(widget);
    for (const canvas of widget.children?.filter((child) =>
      child.type === "CANVAS_WIDGET") ?? []) {
      const occupiedRows = Math.max(0, ...(canvas.children ?? [])
        .filter((child) => child.detachFromLayout !== true &&
          child.bottomRow !== child.topRow)
        .map((child) => child.bottomRow));
      canvas.bottomRow = Math.max(parentRows, occupiedRows) * DEFAULT_GRID_ROW_HEIGHT;
    }
  }
  return true;
}

function containerTargetRows(container: AppsmithWidgetDsl): number | null {
  if ((container.type !== "CONTAINER_WIDGET" && container.type !== "STATBOX_WIDGET" &&
    container.type !== "FORM_WIDGET" && container.type !== "CARD_WIDGET" &&
    container.type !== "TABS_WIDGET") ||
    !isAutoHeightEnabledForWidget(container)) {
    return null;
  }
  const canvases = container.children?.filter((child) => child.type === "CANVAS_WIDGET") ?? [];
  if (!canvases.length) return null;
  // Appsmith adds CANVAS_EXTENSION_OFFSET after the bottommost inner widget.
  // Container and Statbox have no tabs/header height offset.
  // Tabs chooses an active canvas at runtime. Use the tallest authored tab so
  // switching tabs stays transient and cannot clip a taller hidden canvas.
  const occupiedBottom = Math.max(0, ...canvases.flatMap((canvas) =>
    (canvas.children ?? []).filter((child) => child.detachFromLayout !== true)
      .map((child) => child.bottomRow)));
  // ContainerWidget.getCanvasHeightOffset accounts for borders wider than 1px.
  const offset = canvasHeightOffsetRows(container);
  const minimum = getWidgetMinAutoHeight(container) ?? 4;
  return rowLimit(container, container.type === "TABS_WIDGET"
    ? Math.max(minimum, occupiedBottom + CANVAS_EXTENSION_OFFSET + offset)
    : occupiedBottom > 0
      ? occupiedBottom + CANVAS_EXTENSION_OFFSET + offset
      : minimum + offset);
}

function refreshRoot(root: AppsmithWidgetDsl): void {
  root.bottomRow = normalizedMainCanvasBottomRow(root.children ?? []);
}

/**
 * Appsmith's Container check for edits that add, move, delete, or resize
 * widgets. Deepest containers are processed before their ancestors.
 */
export function recomputeAutoHeightContainers(sourceJson: string): string {
  const document = JSON.parse(sourceJson) as DashboardDocument;
  const root = document.layout.dsl;
  const containers: Array<{ widget: AppsmithWidgetDsl; depth: number }> = [];
  function collect(widget: AppsmithWidgetDsl, depth: number): void {
    if (widget.type === "CONTAINER_WIDGET" || widget.type === "STATBOX_WIDGET" ||
      widget.type === "FORM_WIDGET" || widget.type === "CARD_WIDGET" ||
      widget.type === "TABS_WIDGET") {
      containers.push({ widget, depth });
    }
    for (const child of widget.children ?? []) collect(child, depth + 1);
  }
  collect(root, 0);
  containers.sort((a, b) => b.depth - a.depth);
  let changed = false;
  for (const { widget } of containers) {
    const target = containerTargetRows(widget);
    if (target === null) continue;
    const tree = buildAutoHeightTree(root);
    changed = applyHeight(root, widget, target, tree) || changed;
  }
  if (!changed) return recomputeModalAutoHeight(sourceJson);
  refreshRoot(root);
  parseDashboardDocument(document);
  return recomputeModalAutoHeight(JSON.stringify(document));
}

/**
 * Process one content measurement through Appsmith's bottom-up sibling and
 * Container reflow. Pixel input has already been padded by the measurement UI.
 */
export function measureAutoHeightInDocument(sourceJson: string,
  widgetId: string, paddedHeightPx: number,
  previousTree: AutoHeightLayoutTree): { documentJson: string; tree: AutoHeightLayoutTree } {
  if (!Number.isFinite(paddedHeightPx) || paddedHeightPx < 0) {
    throw new Error("Measured widget height must be a finite nonnegative pixel value.");
  }
  const document = JSON.parse(sourceJson) as DashboardDocument;
  const root = document.layout.dsl;
  const widget = findWidget(root, widgetId);
  if (!widget || widget.type === "CANVAS_WIDGET" ||
    widget.detachFromLayout === true || !isAutoHeightEnabledForWidget(widget)) {
    return { documentJson: sourceJson, tree: previousTree };
  }
  const tree = buildAutoHeightTree(root, previousTree);
  const targetRows = rowLimit(widget, Math.ceil(paddedHeightPx / DEFAULT_GRID_ROW_HEIGHT));
  let changed = applyHeight(root, widget, targetRows, tree);
  let canvas = widget.parentId ? findWidget(root, widget.parentId) : undefined;
  while (canvas?.parentId) {
    const container = findWidget(root, canvas.parentId);
    if (!container || (container.type !== "CONTAINER_WIDGET" &&
      container.type !== "STATBOX_WIDGET" && container.type !== "FORM_WIDGET" &&
      container.type !== "CARD_WIDGET" && container.type !== "TABS_WIDGET")) break;
    const nextRows = containerTargetRows(container);
    if (nextRows !== null) {
      // The parent's dependency graph is still based on its pre-measurement
      // bounds. This is the same deepest-first ordering used by Appsmith.
      changed = applyHeight(root, container, nextRows, tree) || changed;
    }
    canvas = container.parentId ? findWidget(root, container.parentId) : undefined;
  }
  if (!changed) return { documentJson: sourceJson, tree: previousTree };
  refreshRoot(root);
  parseDashboardDocument(document);
  return {
    documentJson: recomputeModalAutoHeight(JSON.stringify(document)),
    tree: buildAutoHeightTree(root, previousTree),
  };
}
