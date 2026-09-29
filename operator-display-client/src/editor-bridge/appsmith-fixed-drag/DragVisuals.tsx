import React, { useLayoutEffect, useRef, useState } from "react";
import styled from "styled-components";

// Source: app/client/src/constants/WidgetConstants.tsx and
// app/client/src/layoutSystems/common/dropTarget/DragLayerComponent.tsx.
const GRID_COLUMNS = 64;
const GRID_POINT_SIZE = 1;
const CONTAINER_GRID_PADDING = 6;
const GRID_COLOR = "#E0DEDE";
const VALID_FILL = "rgba(104, 113, 239, 0.6)";
const INVALID_FILL = "rgba(255, 55, 35, 0.6)";
const VALID_STROKE = "rgb(104, 113, 239)";
const INVALID_STROKE = "red";

export interface DragVisualFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DragVisualBlock {
  /** Pixel coordinates relative to the active canvas, before container padding. */
  left: number;
  top: number;
  width: number;
  height: number;
  valid: boolean;
}

export interface AppsmithDragVisualsProps {
  activeFrame: DragVisualFrame;
  blocks: DragVisualBlock[];
  canvasId: string;
  columnSpace: number;
  rowSpace: number;
  hostWidth: number;
  hostHeight: number;
  noPad?: boolean;
  /** FixedCanvasDraggingArena owns Canvas2D block painting in edit mode. */
  showPreviewCanvas?: boolean;
}

interface VisibleRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const Host = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  user-select: none;
`;

const ActiveCanvas = styled.div`
  position: absolute;
  overflow: hidden;
  pointer-events: none;
`;

// This is DragLayerComponent's dotted-grid CSS with theme.colors.grid resolved
// from the Appsmith theme (Colors.ALTO2). The fixed canvas row is 10px; the
// rowSpace prop retains that spacing if a host canvas has been scaled.
const DragLayer = styled.div<{ columnSpace: number; rowSpace: number; noPad: boolean }>`
  position: absolute;
  pointer-events: none;
  left: ${(props) => props.noPad ? "0" : `${CONTAINER_GRID_PADDING - GRID_POINT_SIZE}px`};
  top: ${(props) => props.noPad ? "0" : `${CONTAINER_GRID_PADDING - GRID_POINT_SIZE}px`};
  height: ${(props) => props.noPad ? "100%" : `calc(100% - ${(CONTAINER_GRID_PADDING - GRID_POINT_SIZE) * 2}px)`};
  width: ${(props) => props.noPad ? "100%" : `calc(100% - ${(CONTAINER_GRID_PADDING - GRID_POINT_SIZE) * 2}px)`};
  background-image: radial-gradient(
    circle at ${GRID_POINT_SIZE}px ${GRID_POINT_SIZE}px,
    ${GRID_COLOR} ${GRID_POINT_SIZE}px,
    transparent 0
  );
  background-size: ${(props) => props.columnSpace - GRID_POINT_SIZE / GRID_COLUMNS}px
    ${(props) => props.rowSpace}px;
`;

const PreviewCanvas = styled.canvas`
  position: absolute;
  pointer-events: none;
`;

function sameRect(a: VisibleRect | null, b: VisibleRect): boolean {
  return !!a && a.left === b.left && a.top === b.top &&
    a.width === b.width && a.height === b.height;
}

/**
 * Appsmith clips its sticky canvas to the visible arena. This local equivalent
 * keeps the backing canvas small even when the dashboard has thousands of rows.
 */
function visibleInsideClippingParents(element: HTMLElement): VisibleRect {
  const bounds = element.getBoundingClientRect();
  let left = Math.max(bounds.left, 0);
  let top = Math.max(bounds.top, 0);
  let right = Math.min(bounds.right, window.innerWidth);
  let bottom = Math.min(bounds.bottom, window.innerHeight);
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = window.getComputedStyle(parent);
    const clipX = /^(auto|scroll|hidden|clip)$/.test(style.overflowX);
    const clipY = /^(auto|scroll|hidden|clip)$/.test(style.overflowY);
    if (!clipX && !clipY) continue;
    const frame = parent.getBoundingClientRect();
    if (clipX) {
      left = Math.max(left, frame.left);
      right = Math.min(right, frame.right);
    }
    if (clipY) {
      top = Math.max(top, frame.top);
      bottom = Math.min(bottom, frame.bottom);
    }
  }
  return {
    left: Math.max(0, left - bounds.left),
    top: Math.max(0, top - bounds.top),
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/** Appsmith fixed-layout grid and Canvas2D placement blocks for one active drop target. */
export function AppsmithDragVisuals({
  activeFrame, blocks, canvasId, columnSpace, rowSpace, hostWidth, hostHeight,
  noPad = false, showPreviewCanvas = true,
}: AppsmithDragVisualsProps): React.ReactElement {
  const activeRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState<VisibleRect | null>(null);

  useLayoutEffect(() => {
    const element = activeRef.current;
    if (!element) return;
    const measure = () => {
      const next = visibleInsideClippingParents(element);
      setVisible((current) => sameRect(current, next) ? current : next);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [activeFrame.left, activeFrame.top, activeFrame.width, activeFrame.height]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible || !visible.width || !visible.height) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    const backingWidth = Math.max(1, Math.ceil(visible.width * ratio));
    const backingHeight = Math.max(1, Math.ceil(visible.height * ratio));
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, visible.width, visible.height);
    const pad = noPad ? 0 : CONTAINER_GRID_PADDING;
    // Same fill and 3px dashed snapped outline as useRenderBlocksOnCanvas.
    for (const block of blocks) {
      if (block.width <= 0 || block.height <= 0) continue;
      context.fillStyle = block.valid ? VALID_FILL : INVALID_FILL;
      context.fillRect(
        block.left + pad - visible.left,
        block.top + pad - visible.top,
        block.width,
        block.height,
      );
      context.setLineDash([3]);
      context.strokeStyle = block.valid ? VALID_STROKE : INVALID_STROKE;
      context.strokeRect(
        Math.round(block.left / columnSpace) * columnSpace + pad + 1 - visible.left,
        Math.round(block.top / rowSpace) * rowSpace + pad + 1 - visible.top,
        block.width - 1,
        block.height - 1,
      );
    }
  }, [blocks, columnSpace, noPad, rowSpace, visible]);

  return (
    <Host aria-hidden="true" style={{ width: hostWidth, height: hostHeight }}>
      <ActiveCanvas ref={activeRef} style={activeFrame}>
        <DragLayer className="drag-layer" columnSpace={columnSpace}
          data-drop-canvas-id={canvasId} noPad={noPad} rowSpace={rowSpace} />
        {showPreviewCanvas && <PreviewCanvas
          data-drag-preview-valid={blocks.every((block) => block.valid) ? "true" : "false"}
          data-testid={`canvas-dragging-${canvasId}`} ref={canvasRef}
          style={{ left: visible?.left ?? 0, top: visible?.top ?? 0,
            width: visible?.width ?? 0, height: visible?.height ?? 0 }} />}
      </ActiveCanvas>
    </Host>
  );
}
