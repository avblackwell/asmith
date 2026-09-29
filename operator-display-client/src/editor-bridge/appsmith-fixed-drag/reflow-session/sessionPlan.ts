import type { GridRect } from "../../editable-store/fixedLayoutPlanner";
import type {
  BlockSpace,
  ReflowedSpaceMap,
} from "../../editable-store/appsmith-reflow/reflowTypes";
import { ReflowDirection } from "../../editable-store/appsmith-reflow/reflowTypes";

/** Port of canvasDraggingUtils.getMoveDirection. */
export function getMoveDirection(
  previous: BlockSpace | null,
  current: BlockSpace,
  currentDirection: ReflowDirection,
): ReflowDirection {
  if (!previous) return currentDirection;
  if (current.right - previous.right > 0 || current.left - previous.left > 0)
    return ReflowDirection.RIGHT;
  if (current.right - previous.right < 0 || current.left - previous.left < 0)
    return ReflowDirection.LEFT;
  if (current.bottom - previous.bottom > 0 || current.top - previous.top > 0)
    return ReflowDirection.BOTTOM;
  if (current.bottom - previous.bottom < 0 || current.top - previous.top < 0)
    return ReflowDirection.TOP;
  return currentDirection;
}

/** Port of canvasDraggingUtils.getEdgeDirection for the first canvas sample. */
export function getEdgeDirection(
  x: number, y: number, width: number | undefined,
  currentDirection: ReflowDirection,
): ReflowDirection {
  if (width === undefined) return currentDirection;
  const topEdgeDist = Math.abs(y);
  const leftEdgeDist = Math.abs(x);
  const rightEdgeDist = Math.abs(width - x);
  const min = Math.min(topEdgeDist, leftEdgeDist, rightEdgeDist);
  switch (min) {
    case leftEdgeDist: return ReflowDirection.RIGHT;
    case rightEdgeDist: return ReflowDirection.LEFT;
    case topEdgeDist: return ReflowDirection.BOTTOM;
    default: return currentDirection;
  }
}

export interface FixedOccupiedWidget {
  widgetId: string;
  rect: GridRect;
}

/** Same movement-map to grid conversion used by fixedLayoutPlanner. */
export function reflowedGridRects(
  occupied: readonly FixedOccupiedWidget[],
  movementMap: ReflowedSpaceMap,
  columnSpace: number,
  rowSpace: number,
): Record<string, GridRect> {
  const reflowed: Record<string, GridRect> = {};
  for (const widget of occupied) {
    const movement = movementMap[widget.widgetId];
    if (!movement) continue;
    const original = widget.rect;
    const leftColumn = Math.round(original.leftColumn + (movement.X ?? 0) / columnSpace);
    const topRow = Math.round(original.topRow + (movement.Y ?? 0) / rowSpace);
    const width = movement.width === undefined
      ? original.rightColumn - original.leftColumn
      : Math.round(movement.width / columnSpace);
    const height = movement.height === undefined
      ? original.bottomRow - original.topRow
      : Math.round(movement.height / rowSpace);
    const proposed = {
      leftColumn, topRow,
      rightColumn: leftColumn + width,
      bottomRow: topRow + height,
    };
    if (proposed.leftColumn !== original.leftColumn ||
      proposed.topRow !== original.topRow ||
      proposed.rightColumn !== original.rightColumn ||
      proposed.bottomRow !== original.bottomRow) {
      reflowed[widget.widgetId] = proposed;
    }
  }
  return reflowed;
}
