import { cloneDeep } from "lodash";
import type { OccupiedSpace } from "../../editable-store/appsmith-reflow/geometry";
import { reflow } from "../../editable-store/appsmith-reflow";
import type {
  BlockSpace,
  CollidingSpaceMap,
  GridProps,
  MovementLimitMap,
  PrevReflowState,
  ReflowedSpaceMap,
  SecondOrderCollisionMap,
  SpaceMap,
} from "../../editable-store/appsmith-reflow/reflowTypes";
import { ReflowDirection } from "../../editable-store/appsmith-reflow/reflowTypes";
import {
  getBottomMostRow,
  getLimitedMovementMap,
  getSpacesMapFromArray,
  willItCauseUndroppableState,
} from "../../editable-store/appsmith-reflow/reflowUtils";

/** The immutable inputs to one Appsmith fixed-canvas drag or resize. */
export interface ReflowSessionCanvas {
  canvasId: string;
  originalPositions: OccupiedSpace[];
  occupiedSpaces: BlockSpace[];
  gridProps: GridProps;
  shouldResize?: boolean;
}

/** One snapped pointer sample, corresponding to useReflow.reflowSpaces. */
export interface ReflowSessionSample {
  canvasId: string;
  positions: BlockSpace[];
  direction: ReflowDirection;
  stopMoveAfterLimit?: boolean;
  shouldSkipContainerReflow?: boolean;
  forceDirection?: boolean;
  immediateExitContainer?: string;
  mousePosition?: OccupiedSpace;
}

export interface ReflowSessionResult {
  movementLimitMap?: MovementLimitMap;
  movementMap: ReflowedSpaceMap;
  bottomMostRow: number;
  spacePositionMap?: SpaceMap;
  /** The source hook uses this to schedule a 500 ms stationary-pointer retry. */
  shouldRegisterContainerTimeout: boolean;
}

interface DeferredContainerAttempt {
  sample: ReflowSessionSample;
  previous: PrevReflowState;
  exitContainer?: string;
  mousePosition?: OccupiedSpace;
}

/** Exact pure calculation from app/client/src/utils/reflowHookUtils.ts. */
function getBottomRowAfterReflow(
  movementMap: ReflowedSpaceMap | undefined,
  widgetBottom: number,
  occupiedSpaces: OccupiedSpace[],
  gridProps: GridProps,
): number {
  const bottomReflowedWidgets = Object.entries(movementMap || {}).filter(
    (each) => !!each[1].Y,
  );
  const reflowedWidgetsBottomMostRow = bottomReflowedWidgets.reduce(
    (bottomMostRow, [id, reflowedParams]) => {
      const widget = occupiedSpaces.find((eachSpace) => eachSpace.id === id);

      if (widget) {
        const bottomMovement = (reflowedParams.Y || 0) / gridProps.parentRowSpace;
        const bottomRow = widget.bottom + bottomMovement;

        if (bottomRow > bottomMostRow) return bottomRow;
      }

      return bottomMostRow;
    },
    0,
  );

  return Math.max(reflowedWidgetsBottomMostRow, widgetBottom);
}

/**
 * Imperative form of Appsmith's useReflow hook. Its four previous-result maps
 * live for the full drag, instead of being rebuilt from saved DSL each frame.
 * Redux dispatch/animation and the 500 ms clock belong to the caller.
 */
export class AppsmithReflowSession {
  private canvas?: ReflowSessionCanvas;
  private prevPositions?: OccupiedSpace[];
  private prevCollidingSpaces?: CollidingSpaceMap;
  private prevMovementMap: ReflowedSpaceMap = {};
  private prevSecondOrderCollisionMap: SecondOrderCollisionMap = {};
  private shouldReflowDropTargets = false;
  private isReflowing = false;
  private exitContainer?: string;
  private mousePointerAtContainerExit?: OccupiedSpace;
  private deferredContainerAttempt?: DeferredContainerAttempt;

  get canvasId(): string | undefined {
    return this.canvas?.canvasId;
  }

  /** Starting on another canvas discards all collision and direction history. */
  begin(canvas: ReflowSessionCanvas): void {
    this.reset();
    this.canvas = cloneDeep(canvas);
    this.prevPositions = cloneDeep(canvas.originalPositions);
    this.prevCollidingSpaces = { horizontal: {}, vertical: {} };
  }

  /** End of drag, canvas exit, or a document change during dragging. */
  reset(): void {
    this.canvas = undefined;
    this.prevPositions = undefined;
    this.prevCollidingSpaces = undefined;
    this.prevMovementMap = {};
    this.prevSecondOrderCollisionMap = {};
    this.shouldReflowDropTargets = false;
    this.isReflowing = false;
    this.exitContainer = undefined;
    this.mousePointerAtContainerExit = undefined;
    this.deferredContainerAttempt = undefined;
  }

  /**
   * Run one snapped sample. Pass only changed rectangles, as useCanvasDragging
   * does, so a stationary pointer leaves the deferred container attempt live.
   */
  sample(input: ReflowSessionSample): ReflowSessionResult {
    const canvas = this.requireCanvas(input.canvasId);
    this.deferredContainerAttempt = undefined;

    const previous: PrevReflowState = {
      prevSpacesMap: getSpacesMapFromArray(cloneDeep(this.prevPositions)),
      // useReflow intentionally passes an undefined collision map after a
      // collision-free frame; the pure reflow code checks for that value.
      prevCollidingSpaceMap: cloneDeep(this.prevCollidingSpaces) as CollidingSpaceMap,
      prevMovementMap: cloneDeep(this.prevMovementMap),
      prevSecondOrderCollisionMap: cloneDeep(this.prevSecondOrderCollisionMap),
    };
    const positions = cloneDeep(input.positions);
    const {
      collidingSpaceMap,
      movementLimitMap,
      movementMap,
      secondOrderCollisionMap,
      shouldRegisterContainerTimeout,
      spacePositionMap,
    } = reflow(
      positions,
      cloneDeep(canvas.originalPositions),
      cloneDeep(canvas.occupiedSpaces),
      input.direction,
      canvas.gridProps,
      input.forceDirection ?? false,
      canvas.shouldResize ?? true,
      previous,
      input.immediateExitContainer,
      input.mousePosition,
      !input.shouldSkipContainerReflow || this.shouldReflowDropTargets,
    );

    this.prevPositions = cloneDeep(positions);
    this.prevCollidingSpaces = cloneDeep(collidingSpaceMap);
    this.prevSecondOrderCollisionMap = cloneDeep(secondOrderCollisionMap || {});

    if (!this.shouldReflowDropTargets && !this.exitContainer) {
      this.exitContainer = input.immediateExitContainer;
      this.mousePointerAtContainerExit = cloneDeep(input.mousePosition);
    }

    const correctedMovementMap = input.stopMoveAfterLimit
      ? getLimitedMovementMap(movementMap, this.prevMovementMap, {
          canHorizontalMove: true,
          canVerticalMove: true,
        })
      : movementMap || {};
    this.prevMovementMap = cloneDeep(correctedMovementMap);

    if (input.shouldSkipContainerReflow) {
      if (shouldRegisterContainerTimeout) {
        // The source's timeout closes over previous, not the state after this
        // sample. ContainerReflowGate controls the 500 ms stationary delay.
        this.deferredContainerAttempt = {
          sample: cloneDeep(input),
          previous: cloneDeep(previous),
          exitContainer: this.exitContainer,
          mousePosition: cloneDeep(this.mousePointerAtContainerExit || input.mousePosition),
        };
      } else if (!Object.values(collidingSpaceMap?.horizontal || {}).some(
        (space) => space.isDropTarget,
      ) && !Object.values(collidingSpaceMap?.vertical || {}).some(
        (space) => space.isDropTarget,
      )) {
        this.shouldReflowDropTargets = false;
        this.mousePointerAtContainerExit = undefined;
        this.exitContainer = undefined;
      }
    }

    if (Object.keys(correctedMovementMap).length > 0) {
      this.isReflowing = true;
    } else if (this.isReflowing) {
      this.isReflowing = false;
      this.shouldReflowDropTargets = false;
    }

    return {
      movementLimitMap: cloneDeep(movementLimitMap),
      movementMap: cloneDeep(correctedMovementMap),
      bottomMostRow: getBottomRowAfterReflow(
        movementMap,
        getBottomMostRow(positions),
        canvas.occupiedSpaces,
        canvas.gridProps,
      ),
      spacePositionMap: cloneDeep(spacePositionMap),
      shouldRegisterContainerTimeout: !!shouldRegisterContainerTimeout,
    };
  }

  /**
   * Called once after ContainerReflowGate's 500 ms timer. This is Appsmith's
   * second reflow(..., true, true) call from useReflow's timeout callback.
   * Undefined means that no safe delayed container movement was produced.
   */
  activateContainerReflow(canvasId: string): ReflowSessionResult | undefined {
    const canvas = this.requireCanvas(canvasId);
    const pending = this.deferredContainerAttempt;
    this.deferredContainerAttempt = undefined;
    if (!pending) return undefined;

    const {
      collidingSpaceMap,
      movementLimitMap,
      movementMap,
      secondOrderCollisionMap,
    } = reflow(
      cloneDeep(pending.sample.positions),
      cloneDeep(canvas.originalPositions),
      cloneDeep(canvas.occupiedSpaces),
      pending.sample.direction,
      canvas.gridProps,
      pending.sample.forceDirection ?? false,
      canvas.shouldResize ?? true,
      cloneDeep(pending.previous),
      pending.exitContainer,
      pending.mousePosition,
      true,
      true,
    );

    this.exitContainer = undefined;
    this.mousePointerAtContainerExit = undefined;
    if (willItCauseUndroppableState(movementLimitMap)) return undefined;

    if (movementMap && Object.keys(movementMap).length > 0) {
      this.shouldReflowDropTargets = true;
      this.isReflowing = true;
      this.prevCollidingSpaces = cloneDeep(collidingSpaceMap);
      this.prevSecondOrderCollisionMap = cloneDeep(secondOrderCollisionMap || {});
      this.prevMovementMap = cloneDeep(movementMap);
      return {
        movementLimitMap: cloneDeep(movementLimitMap),
        movementMap: cloneDeep(movementMap),
        bottomMostRow: getBottomRowAfterReflow(
          movementMap,
          getBottomMostRow(pending.sample.positions),
          canvas.occupiedSpaces,
          canvas.gridProps,
        ),
        spacePositionMap: undefined,
        shouldRegisterContainerTimeout: false,
      };
    }

    if (this.isReflowing) {
      this.isReflowing = false;
      this.shouldReflowDropTargets = false;
    }
    return undefined;
  }

  private requireCanvas(canvasId: string): ReflowSessionCanvas {
    if (!this.canvas || this.canvas.canvasId !== canvasId) {
      // A late callback from a previous canvas must never reuse old history.
      this.reset();
      throw new Error("Begin an Appsmith reflow session for this canvas first.");
    }
    return this.canvas;
  }
}
