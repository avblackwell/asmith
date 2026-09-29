import { areIntersecting } from "../../editable-store/appsmith-reflow/geometry";
import type { GridRect } from "../../editable-store/fixedLayoutPlanner";

/**
 * Appsmith Fixed editor's `useReflow` defers reflow of occupied drop targets
 * for 500 ms. The timer is registered only when the dragged block overlaps a
 * drop target; `useCanvasDragging` only calls reflow when its snapped rectangle
 * changes. This controller retains that timing across pointer events inside
 * one snapped grid cell. It does not delay entering a nested canvas.
 */
export const CONTAINER_REFLOW_DELAY_MS = 500;

export interface DropTargetSpace extends GridRect {
  widgetId: string;
  type: string;
}

export interface ContainerCollisionSample {
  canvasId: string;
  target: GridRect;
  occupied: readonly DropTargetSpace[];
}

export type TimerHandle = ReturnType<typeof setTimeout>;

export interface ContainerReflowClock {
  set(callback: () => void, delayMs: number): TimerHandle;
  clear(handle: TimerHandle): void;
}

const browserClock: ContainerReflowClock = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle),
};

function isDropTarget(space: DropTargetSpace): boolean {
  // Appsmith's occupied-space selector uses checkIsDropTarget(widget.type),
  // which reads the widget config's isCanvas flag. These five supported Fixed
  // widgets set that flag; detached Modals are filtered from occupied
  // spaces by the caller before this gate sees them.
  return space.type === "CONTAINER_WIDGET" || space.type === "STATBOX_WIDGET" ||
    space.type === "FORM_WIDGET" || space.type === "CARD_WIDGET" ||
    space.type === "TABS_WIDGET" || space.type === "MODAL_WIDGET" ||
    space.type === "LIST_WIDGET_V2";
}

function collisionKey(sample: ContainerCollisionSample): string | null {
  const colliding = sample.occupied
    .filter((space) => isDropTarget(space) && areIntersecting({
      left: sample.target.leftColumn,
      top: sample.target.topRow,
      right: sample.target.rightColumn,
      bottom: sample.target.bottomRow,
    }, {
      left: space.leftColumn,
      top: space.topRow,
      right: space.rightColumn,
      bottom: space.bottomRow,
    }))
    .map((space) => space.widgetId)
    .sort();
  if (!colliding.length) return null;
  const { leftColumn, topRow, rightColumn, bottomRow } = sample.target;
  return JSON.stringify([sample.canvasId, leftColumn, topRow,
    rightColumn, bottomRow, colliding]);
}

/**
 * `sample` returns whether the preview planner may reflow an occupied drop target.
 * Its callback runs at the 500 ms boundary and should compute the Appsmith
 * reflow with `shouldReflowDropTarget=true`, returning false when Appsmith's
 * movement-limit check or the product's canvas bounds rejects that plan.
 * A true result latches until the dragged block leaves all drop targets.
 */
export class ContainerReflowGate {
  private timeOutFunction: TimerHandle | null = null;
  private pendingKey: string | null = null;
  private attemptedKey: string | null = null;
  private shouldReflowDropTargets = false;

  constructor(private readonly clock: ContainerReflowClock = browserClock) {}

  sample(sample: ContainerCollisionSample, onTimeout: () => boolean): boolean {
    const key = collisionKey(sample);
    if (key === null) {
      this.reset();
      return false;
    }
    if (this.shouldReflowDropTargets) return true;
    if (key === this.pendingKey || key === this.attemptedKey) return false;

    this.clearPending();
    this.pendingKey = key;
    this.timeOutFunction = this.clock.set(() => {
      if (this.pendingKey !== key) return;
      this.timeOutFunction = null;
      this.pendingKey = null;
      this.attemptedKey = key;
      // Appsmith latches the option only if its delayed reflow can move a
      // drop target without producing an undroppable state.
      if (onTimeout()) this.shouldReflowDropTargets = true;
    }, CONTAINER_REFLOW_DELAY_MS);
    return false;
  }

  reset(): void {
    this.clearPending();
    this.attemptedKey = null;
    this.shouldReflowDropTargets = false;
  }

  private clearPending(): void {
    if (this.timeOutFunction !== null) this.clock.clear(this.timeOutFunction);
    this.timeOutFunction = null;
    this.pendingKey = null;
  }
}
