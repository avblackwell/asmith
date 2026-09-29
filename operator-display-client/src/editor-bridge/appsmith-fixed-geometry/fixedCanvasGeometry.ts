import {
  DEFAULT_GRID_ROW_HEIGHT,
  getCanvasSnapRows,
  getFixedCanvasSnapGrid,
  mainCanvasRenderBottomRow,
  normalizedMainCanvasBottomRow,
} from "../appsmith-fixed-autoheight/autoHeightRules";

/** Geometry-only slice of Appsmith's flattened CANVAS_WIDGET state. */
export interface FixedGeometryWidget {
  widgetId: string;
  type: string;
  topRow: number;
  bottomRow: number;
  leftColumn: number;
  rightColumn: number;
  parentId?: string;
  children?: readonly string[];
  noPad?: boolean;
  noContainerOffset?: boolean;
  detachFromLayout?: boolean;
  shouldScrollContents?: boolean;
  borderWidth?: string | number;
}

export interface FixedPixelFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FixedRootCanvasMetrics {
  normalizedBottomRowPx: number;
  renderBottomRowPx: number;
  dropTargetRows: number;
  dropTargetHeightPx: number;
  widthPx: number;
  columnSpace: number;
  rowSpace: number;
  widgetOffsetPx: number;
}

export function fixedRootCanvasMetrics(
  widgets: Record<string, FixedGeometryWidget>,
  rootId: string,
  mainCanvasWidthPx: number,
  mainCanvasHeightPx: number,
  mode: "editor" | "viewer",
): FixedRootCanvasMetrics {
  const root = widgets[rootId];
  if (!root || root.type !== "CANVAS_WIDGET") {
    throw new Error("The fixed layout root must be a CANVAS_WIDGET.");
  }
  const children = (root.children ?? []).map((id) => widgets[id]).filter(
    (widget): widget is FixedGeometryWidget => !!widget,
  );
  const normalizedBottomRowPx = normalizedMainCanvasBottomRow(children);
  const renderBottomRowPx = mainCanvasRenderBottomRow(
    normalizedBottomRowPx, mainCanvasHeightPx, mode,
  );
  const dropTargetRows = getCanvasSnapRows(renderBottomRowPx);
  // Appsmith UPDATE_CANVAS_LAYOUT owns the rendered root width in ui.mainCanvas.
  // The DSL rightColumn is only the initial value read by INIT_CANVAS_LAYOUT.
  const grid = getFixedCanvasSnapGrid(mainCanvasWidthPx, { isMainCanvas: true, noPad: root.noPad });
  return {
    normalizedBottomRowPx,
    renderBottomRowPx,
    dropTargetRows,
    dropTargetHeightPx: dropTargetRows * DEFAULT_GRID_ROW_HEIGHT,
    widthPx: mainCanvasWidthPx,
    columnSpace: grid.columnSpace,
    rowSpace: grid.rowSpace,
    widgetOffsetPx: root.noPad ? 0 : 6,
  };
}

/**
 * PositionedContainer uses +6px for both axes, including nested canvases.
 * getSnappedGrid separately subtracts 12px for root, 20px for nested canvas.
 */
export function fixedCanvasChildFrame(
  widget: Pick<FixedGeometryWidget,
    "leftColumn" | "rightColumn" | "topRow" | "bottomRow" | "noContainerOffset">,
  parentCanvasWidthPx: number,
  options: { isMainCanvas: boolean; noPad?: boolean },
): FixedPixelFrame {
  const { columnSpace } = getFixedCanvasSnapGrid(parentCanvasWidthPx, options);
  const offset = options.noPad || widget.noContainerOffset ? 0 : 6;
  return {
    left: widget.leftColumn * columnSpace + offset,
    top: widget.topRow * DEFAULT_GRID_ROW_HEIGHT + offset,
    width: (widget.rightColumn - widget.leftColumn) * columnSpace,
    height: (widget.bottomRow - widget.topRow) * DEFAULT_GRID_ROW_HEIGHT,
  };
}

/**
 * ContainerWidget.renderChildWidget overwrites the inner canvas dimensions
 * with its own component width/height before FixedLayoutCanvas renders it.
 */
export function fixedInnerCanvasFrame(
  containerFrame: FixedPixelFrame,
  normalizedInnerCanvasBottomRowPx?: number,
  containerScrolls = false,
): FixedPixelFrame {
  const bottomRowPx = containerScrolls && normalizedInnerCanvasBottomRowPx
    ? normalizedInnerCanvasBottomRowPx
    : containerFrame.height;
  return {
    left: 0,
    top: 0,
    width: containerFrame.width,
    height: Math.max(0, getCanvasSnapRows(bottomRowPx)) * DEFAULT_GRID_ROW_HEIGHT,
  };
}

/** Supported Container branch of WidgetSizeUtils.getCanvasBottomRow. */
export function normalizedInnerCanvasBottomRow(
  widgets: Record<string, FixedGeometryWidget>,
  canvasId: string,
): number {
  const canvas = widgets[canvasId];
  const parent = canvas?.parentId ? widgets[canvas.parentId] : undefined;
  if (!canvas || !parent) return 0;
  let parentRows = parent.bottomRow - parent.topRow;
  if (parent.type === "CONTAINER_WIDGET") {
    const borderWidth = Number.parseInt(String(parent.borderWidth ?? 0), 10);
    if (borderWidth > 1) {
      parentRows -= Math.ceil((2 * borderWidth) / DEFAULT_GRID_ROW_HEIGHT);
    }
  }
  let bottomRows = parentRows;
  for (const id of canvas.children ?? []) {
    const child = widgets[id];
    if (!child || child.detachFromLayout || child.bottomRow === child.topRow) continue;
    bottomRows = Math.max(bottomRows, child.bottomRow);
  }
  return bottomRows * DEFAULT_GRID_ROW_HEIGHT;
}
