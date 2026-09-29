import React, { useCallback, useRef } from "react";
import "./ExplorerResizeHandle.css";

export const EXPLORER_MIN_WIDTH = 240;
export const EXPLORER_MAX_WIDTH = 500;
export const EXPLORER_RESIZE_STEP = 10;

export interface ExplorerResizeHandleProps {
  width: number;
  onWidthChange: (width: number) => void;
}

interface ActiveDrag {
  pointerId: number;
  startX: number;
  startWidth: number;
  lastWidth: number;
}

export function clampExplorerWidth(width: number): number {
  return Math.min(EXPLORER_MAX_WIDTH, Math.max(EXPLORER_MIN_WIDTH, width));
}

/** A local divider between the explorer and canvas, with no Appsmith routing. */
export function ExplorerResizeHandle({
  onWidthChange,
  width,
}: ExplorerResizeHandleProps) {
  const activeDrag = useRef<ActiveDrag | null>(null);

  const movePointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = activeDrag.current;

      if (!drag || drag.pointerId !== event.pointerId) return;

      const nextWidth = clampExplorerWidth(
        drag.startWidth + event.clientX - drag.startX,
      );

      if (nextWidth !== drag.lastWidth) {
        drag.lastWidth = nextWidth;
        onWidthChange(nextWidth);
      }
    },
    [onWidthChange],
  );
  const stopPointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = activeDrag.current;

      if (!drag || drag.pointerId !== event.pointerId) return;

      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      activeDrag.current = null;
    },
    [],
  );
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;

      event.preventDefault();
      activeDrag.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: clampExplorerWidth(width),
        lastWidth: clampExplorerWidth(width),
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [width],
  );
  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      movePointer(event);
      stopPointer(event);
    },
    [movePointer, stopPointer],
  );
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const delta =
        event.key === "ArrowLeft"
          ? -EXPLORER_RESIZE_STEP
          : event.key === "ArrowRight"
            ? EXPLORER_RESIZE_STEP
            : 0;

      if (!delta) return;

      event.preventDefault();

      const nextWidth = clampExplorerWidth(width + delta);

      if (nextWidth !== width) onWidthChange(nextWidth);
    },
    [onWidthChange, width],
  );
  const handleLostPointerCapture = useCallback(() => {
    activeDrag.current = null;
  }, []);

  return (
    <div
      aria-label="Resize widget explorer"
      aria-orientation="vertical"
      aria-valuemax={EXPLORER_MAX_WIDTH}
      aria-valuemin={EXPLORER_MIN_WIDTH}
      aria-valuenow={clampExplorerWidth(width)}
      className="explorer-resize-handle"
      data-testid="t--workbench-explorer-resizer"
      onKeyDown={handleKeyDown}
      onLostPointerCapture={handleLostPointerCapture}
      onPointerCancel={stopPointer}
      onPointerDown={handlePointerDown}
      onPointerMove={movePointer}
      onPointerUp={handlePointerUp}
      role="separator"
      tabIndex={0}
    />
  );
}
