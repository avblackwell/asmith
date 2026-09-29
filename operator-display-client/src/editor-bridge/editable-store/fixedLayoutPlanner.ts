import type { AppsmithWidgetDsl } from "../../document";
import {
  DEFAULT_GRID_COLUMNS,
  DEFAULT_GRID_ROW_HEIGHT,
} from "../appsmith-fixed-autoheight/autoHeightRules";
import { reflow } from "./appsmith-reflow";
import type { BlockSpace, PrevReflowState } from "./appsmith-reflow/reflowTypes";
import { ReflowDirection } from "./appsmith-reflow/reflowTypes";
import { areIntersecting } from "./appsmith-reflow/geometry";

export interface GridRect {
  leftColumn: number;
  topRow: number;
  rightColumn: number;
  bottomRow: number;
}

export interface FixedLayoutPlan {
  target: GridRect;
  reflowed: Record<string, GridRect>;
}

interface PlanOptions {
  target: GridRect;
  previousTarget?: GridRect;
  targetId?: string;
  siblings: AppsmithWidgetDsl[];
  columns: number;
  rows: number;
  columnSpace: number;
  rowSpace: number;
  directions: ReflowDirection[];
  /** Appsmith defers reflowing a colliding drop target during dragging. */
  shouldReflowDropTarget?: boolean;
  /** Preserve children of a container if Appsmith's reflow reduces its size. */
  canReflowWidget?: (widget: AppsmithWidgetDsl, proposed: GridRect) => boolean;
  /** The displacement map produced by the active Appsmith drag session. */
  committedReflowed?: Record<string, GridRect>;
}

export function rectOf(widget: AppsmithWidgetDsl): GridRect {
  return {
    leftColumn: widget.leftColumn,
    topRow: widget.topRow,
    rightColumn: widget.rightColumn,
    bottomRow: widget.bottomRow,
  };
}

function spaceOf(id: string, rect: GridRect): BlockSpace {
  return {
    id,
    left: rect.leftColumn,
    top: rect.topRow,
    right: rect.rightColumn,
    bottom: rect.bottomRow,
  };
}

function withinCanvas(rect: GridRect, columns: number, rows: number): boolean {
  return Number.isFinite(rect.leftColumn) && Number.isFinite(rect.topRow) &&
    Number.isFinite(rect.rightColumn) && Number.isFinite(rect.bottomRow) &&
    rect.leftColumn >= 0 && rect.topRow >= 0 &&
    rect.rightColumn > rect.leftColumn && rect.bottomRow > rect.topRow &&
    rect.rightColumn <= columns && rect.bottomRow <= rows;
}

function sameRect(left: GridRect, right: GridRect): boolean {
  return left.leftColumn === right.leftColumn && left.topRow === right.topRow &&
    left.rightColumn === right.rightColumn && left.bottomRow === right.bottomRow;
}

/**
 * Run Appsmith's pure collision-tree reflow against one fixed canvas. The
 * editor hook supplies pointer history and animations; here each command is
 * planned from the saved DSL, and the same plan drives preview and commit.
 */
export function planFixedLayout(options: PlanOptions): FixedLayoutPlan {
  const { target, siblings, columns, rows, columnSpace, rowSpace } = options;
  // The extracted Appsmith fixed reflow works in 64 columns and 10px rows.
  // Reject stale DSL-derived spacing before it reaches pixel movement math.
  if (columns !== DEFAULT_GRID_COLUMNS || rowSpace !== DEFAULT_GRID_ROW_HEIGHT ||
    !Number.isFinite(columnSpace) || columnSpace <= 0) {
    throw new Error("The fixed canvas requires a 64-column, 10px-row snap grid.");
  }
  if (!withinCanvas(target, columns, rows)) {
    throw new Error("The widget extends beyond the selected canvas.");
  }
  const occupied = siblings
    .filter((widget) => widget.widgetId !== options.targetId && widget.detachFromLayout !== true)
    .map((widget) => ({
      ...spaceOf(widget.widgetId, rectOf(widget)),
      type: widget.type,
      // Appsmith's occupied-space selector uses checkIsDropTarget(type),
      // which reads the widget config's isCanvas flag. These four currently
      // expose editable Fixed drop canvases here; List V2's generated row
      // canvases are not editable yet. Detached Modals are removed above.
      isDropTarget: widget.type === "CONTAINER_WIDGET" ||
        widget.type === "STATBOX_WIDGET" || widget.type === "FORM_WIDGET" ||
        widget.type === "CARD_WIDGET" || widget.type === "TABS_WIDGET" ||
        widget.type === "MODAL_WIDGET" || widget.type === "LIST_WIDGET_V2",
    }));
  const targetSpace = spaceOf(options.targetId ?? "__new_widget__", target);
  const previousSpace = spaceOf(targetSpace.id, options.previousTarget ?? target);

  if (options.committedReflowed) {
    const reflowed = options.committedReflowed;
    const occupiedById = new Map(occupied.map((space) => [space.id, space]));
    for (const [id, proposed] of Object.entries(reflowed)) {
      const original = occupiedById.get(id);
      const widget = siblings.find((candidate) => candidate.widgetId === id);
      if (!original || !widget || !withinCanvas(proposed, columns, rows) ||
        (options.canReflowWidget && !options.canReflowWidget(widget, proposed))) {
        throw new Error("The drag reflow no longer fits this canvas.");
      }
    }
    const finalRects = occupied.map((space) => ({
      id: space.id,
      rect: reflowed[space.id] ?? {
        leftColumn: space.left, topRow: space.top,
        rightColumn: space.right, bottomRow: space.bottom,
      },
    }));
    if (finalRects.some(({ rect }) => areIntersecting(targetSpace, {
      left: rect.leftColumn, top: rect.topRow,
      right: rect.rightColumn, bottom: rect.bottomRow,
    })) || finalRects.some(({ id, rect }, index) =>
      reflowed[id] && finalRects.some((other, otherIndex) =>
        index !== otherIndex && areIntersecting(
          { left: rect.leftColumn, top: rect.topRow,
            right: rect.rightColumn, bottom: rect.bottomRow },
          { left: other.rect.leftColumn, top: other.rect.topRow,
            right: other.rect.rightColumn, bottom: other.rect.bottomRow },
        )))) {
      throw new Error("The drag reflow overlaps another widget.");
    }
    return { target, reflowed };
  }

  for (const [index, direction] of options.directions.entries()) {
    let movementMap;
    try {
      const previous: PrevReflowState = {
        prevSpacesMap: { [targetSpace.id]: { ...previousSpace } },
        prevCollidingSpaceMap: { horizontal: {}, vertical: {} },
        prevMovementMap: {},
        prevSecondOrderCollisionMap: {},
      };
      ({ movementMap } = reflow(
        [{ ...targetSpace }], [{ ...previousSpace }], occupied.map((space) => ({ ...space })), direction,
        { parentColumnSpace: columnSpace, parentRowSpace: rowSpace, maxGridColumns: columns },
        // The first attempt follows Appsmith's movement-derived direction.
        // Bounded-canvas fallbacks must be forced or getCalculatedDirection
        // would override each candidate with the same original movement.
        index > 0, true, previous, undefined, undefined,
        options.shouldReflowDropTarget ?? true,
      ));
    } catch {
      continue;
    }
    const reflowed: Record<string, GridRect> = {};
    let valid = true;
    for (const widget of siblings) {
      const movement = movementMap?.[widget.widgetId];
      if (!movement) continue;
      const original = rectOf(widget);
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
      if (!withinCanvas(proposed, columns, rows) ||
        (options.canReflowWidget && !options.canReflowWidget(widget, proposed))) {
        valid = false;
        break;
      }
      if (!sameRect(original, proposed)) reflowed[widget.widgetId] = proposed;
    }
    if (!valid) continue;

    // Appsmith checks the final DSL after reflow. Keep pre-existing overlaps
    // between untouched imported widgets intact, but never add a new overlap.
    const finalRects = occupied.map((space) => ({
      id: space.id,
      rect: reflowed[space.id] ?? {
        leftColumn: space.left, topRow: space.top,
        rightColumn: space.right, bottomRow: space.bottom,
      },
    }));
    if (finalRects.some(({ rect }) => areIntersecting(targetSpace, {
      left: rect.leftColumn, top: rect.topRow,
      right: rect.rightColumn, bottom: rect.bottomRow,
    }))) continue;
    if (finalRects.some(({ id, rect }, index) =>
      reflowed[id] && finalRects.some((other, otherIndex) =>
        index !== otherIndex && areIntersecting(
          { left: rect.leftColumn, top: rect.topRow, right: rect.rightColumn, bottom: rect.bottomRow },
          { left: other.rect.leftColumn, top: other.rect.topRow,
            right: other.rect.rightColumn, bottom: other.rect.bottomRow },
        )))) continue;

    return { target, reflowed };
  }
  throw new Error("There is not enough space to place this widget without overlap.");
}

/** Appsmith evaluates vertical and horizontal reflow directions from movement. */
export function preferredDirections(
  previous: GridRect | undefined,
  target: GridRect,
  mode: "add" | "move" | "resize",
): ReflowDirection[] {
  const choices: ReflowDirection[] = [];
  const add = (direction: ReflowDirection) => {
    if (!choices.includes(direction)) choices.push(direction);
  };
  if (previous && mode === "move") {
    if (target.topRow > previous.topRow) add(ReflowDirection.BOTTOM);
    else if (target.topRow < previous.topRow) add(ReflowDirection.TOP);
    if (target.leftColumn > previous.leftColumn) add(ReflowDirection.RIGHT);
    else if (target.leftColumn < previous.leftColumn) add(ReflowDirection.LEFT);
  } else if (previous && mode === "resize") {
    const vertical = target.topRow < previous.topRow ? ReflowDirection.TOP
      : target.bottomRow > previous.bottomRow ? ReflowDirection.BOTTOM : null;
    const horizontal = target.leftColumn < previous.leftColumn ? ReflowDirection.LEFT
      : target.rightColumn > previous.rightColumn ? ReflowDirection.RIGHT : null;
    if (vertical && horizontal) add(`${vertical}|${horizontal}` as ReflowDirection);
    if (vertical) add(vertical);
    if (horizontal) add(horizontal);
  }
  // A palette drop uses Appsmith's downward reflow. Alternative directions
  // let a bounded nested canvas accept a drop when that path has no room.
  for (const direction of [
    ReflowDirection.BOTTOM, ReflowDirection.RIGHT,
    ReflowDirection.LEFT, ReflowDirection.TOP,
  ]) add(direction);
  return choices;
}
