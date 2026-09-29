import { DEFAULT_GRID_COLUMNS } from "../appsmith-fixed-autoheight/autoHeightRules";
import {
  HORIZONTAL_RESIZE_MIN_LIMIT,
  VERTICAL_RESIZE_MIN_LIMIT,
} from "../editable-store/appsmith-reflow/reflowTypes";

/**
 * Fixed drag geometry from Appsmith's
 * layoutSystems/common/utils/canvasDraggingUtils.ts:470-546. The caller
 * supplies pixel coordinates relative to the current canvas arena, as
 * useCanvasDragging.ts:376-405 does before collision and reflow.
 */
export interface WidgetDraggingBlock {
  left: number;
  top: number;
  width: number;
  height: number;
  columnWidth: number;
  rowHeight: number;
  widgetId: string;
  fixedHeight?: number;
}

export interface DraggingSpace {
  left: number;
  top: number;
  right: number;
  bottom: number;
  id: string;
  fixedHeight?: number;
}

// fixedlayout/common/utils.ts:generateDragStateForFixedLayout stores a
// bounded fractional grid offset from the DraggableComponent's inner bounds.
export function generateDragStartPoints(
  clientX: number,
  clientY: number,
  bounds: { left: number; top: number },
  parentColumnSpace: number,
  parentRowSpace: number,
  widgetWidth: number,
  widgetHeight: number,
): { left: number; top: number } {
  return {
    top: Math.min(Math.max((clientY - bounds.top) / parentRowSpace, 0), widgetHeight - 1),
    left: Math.min(Math.max((clientX - bounds.left) / parentColumnSpace, 0), widgetWidth - 1),
  };
}

// layoutSystems/common/utils/canvasDraggingUtils.ts:279-349. The destination
// snap spacing and padding are applied afresh on every canvas transition.
export function getParentDiff(
  dragCenterSpace: { top: number; left: number },
  isDragging: boolean,
  isChildOfCanvas: boolean,
  snapRowSpace: number,
  snapColumnSpace: number,
  containerPadding: number,
): { top: number; left: number } {
  if (!isDragging) return { top: 0, left: 0 };
  if (!isChildOfCanvas) return {
    top: dragCenterSpace.top * snapRowSpace + containerPadding,
    left: dragCenterSpace.left * snapColumnSpace + containerPadding,
  };
  return { top: containerPadding, left: containerPadding };
}

export function getRelativeStartPoints(
  dragCenterSpace: { top: number; left: number },
  dragOffset: { top: number; left: number },
  defaultHandlePositions: { top: number; left: number },
  isDragging: boolean,
  isChildOfCanvas: boolean,
  snapRowSpace: number,
  snapColumnSpace: number,
  containerPadding: number,
): { top: number; left: number } {
  if (!isDragging) return defaultHandlePositions;
  const dragLeft = isChildOfCanvas ? dragCenterSpace.left : 0;
  const dragTop = isChildOfCanvas ? dragCenterSpace.top : 0;
  return {
    left: ((dragLeft + dragOffset?.left) || 0) * snapColumnSpace +
      2 * containerPadding,
    top: ((dragTop + dragOffset?.top) || 0) * snapRowSpace +
      2 * containerPadding,
  };
}

// utils/helpers.tsx:snapToGrid and WidgetPropsUtils.tsx:getDropZoneOffsets.
export const getDropZoneOffsets = (
  colWidth: number,
  rowHeight: number,
  dragOffset: { x: number; y: number },
  parentOffset: { x: number; y: number },
): [number, number] => [
  Math.round((dragOffset.x - parentOffset.x) / colWidth),
  Math.round((dragOffset.y - parentOffset.y) / rowHeight),
];

// WidgetPropsUtils.tsx:90-126. Reflow consumes the adjusted block bounds.
export function getDraggingSpacesFromBlocks(
  draggingBlocks: WidgetDraggingBlock[],
  snapColumnSpace: number,
  snapRowSpace: number,
): DraggingSpace[] {
  const draggingSpaces: DraggingSpace[] = [];

  for (const draggingBlock of draggingBlocks) {
    const [leftColumn, topRow] = getDropZoneOffsets(
      snapColumnSpace,
      snapRowSpace,
      { x: draggingBlock.left, y: draggingBlock.top },
      { x: 0, y: 0 },
    );

    draggingSpaces.push({
      left: leftColumn,
      top: topRow,
      right: leftColumn + draggingBlock.width / snapColumnSpace,
      bottom: topRow + draggingBlock.height / snapRowSpace,
      id: draggingBlock.widgetId,
      fixedHeight: draggingBlock.fixedHeight !== undefined
        ? draggingBlock.rowHeight
        : undefined,
    });
  }

  return draggingSpaces;
}

export const modifyBlockDimension = <T extends WidgetDraggingBlock>(
  draggingBlock: T,
  snapColumnSpace: number,
  snapRowSpace: number,
  parentBottomRow: number,
  canExtend: boolean,
  modifyBlock: boolean,
  // Appsmith uses the widget's own limits for building blocks.
  horizontalMinResizeLimit: number = HORIZONTAL_RESIZE_MIN_LIMIT,
  verticalMinResizeLimit: number = VERTICAL_RESIZE_MIN_LIMIT,
): T => {
  const { columnWidth, fixedHeight, height, left, rowHeight, top, width } =
    draggingBlock;
  const [leftColumn, topRow] = getDropZoneOffsets(
    snapColumnSpace,
    snapRowSpace,
    { x: left, y: top },
    { x: 0, y: 0 },
  );
  let leftOffset = 0,
    rightOffset = 0,
    topOffset = 0,
    bottomOffset = 0;

  if (!modifyBlock) {
    if (leftColumn < 0) {
      leftOffset =
        leftColumn + columnWidth > horizontalMinResizeLimit
          ? leftColumn
          : horizontalMinResizeLimit - columnWidth;
    } else if (leftColumn + columnWidth > DEFAULT_GRID_COLUMNS) {
      rightOffset = DEFAULT_GRID_COLUMNS - leftColumn - columnWidth;
      rightOffset =
        columnWidth + rightOffset >= horizontalMinResizeLimit
          ? rightOffset
          : horizontalMinResizeLimit - columnWidth;
    }
    if (topRow < 0 && fixedHeight === undefined) {
      topOffset =
        topRow + rowHeight > verticalMinResizeLimit
          ? topRow
          : verticalMinResizeLimit - rowHeight;
    }
    if (
      topRow + rowHeight > parentBottomRow &&
      !canExtend &&
      fixedHeight === undefined
    ) {
      bottomOffset = parentBottomRow - topRow - rowHeight;
      bottomOffset =
        rowHeight + bottomOffset >= verticalMinResizeLimit
          ? bottomOffset
          : verticalMinResizeLimit - rowHeight;
    }
  }

  return {
    ...draggingBlock,
    left: left - leftOffset * snapColumnSpace,
    top: top - topOffset * snapRowSpace,
    width: width + (leftOffset + rightOffset) * snapColumnSpace,
    height: height + (topOffset + bottomOffset) * snapRowSpace,
    columnWidth: columnWidth + leftOffset + rightOffset,
    rowHeight: rowHeight + topOffset + bottomOffset,
  };
};
