import React, { useCallback, useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { StickyCanvasArena } from "./StickyCanvasArena";

/**
 * Editor-only port of Appsmith's FixedCanvasDraggingArena/useCanvasDragging
 * event lifecycle. Widget blocks, reflow, and the document command stay with
 * the caller; each mounted canvas owns its own pointer target and last sample.
 */
export interface FixedCanvasArenaPosition {
  clientX: number;
  clientY: number;
  offsetX: number;
  offsetY: number;
  cause: "enter" | "pointer" | "scroll";
}

export interface FixedCanvasDraggingArenaProps<Preview = unknown> {
  canvasId: string;
  isDragging: boolean;
  isResizing: boolean;
  isCurrentDraggedCanvas: boolean;
  isInitialDragCanvas?: boolean;
  hasDraggingBlocks?: boolean;
  canExtend: boolean;
  snapRows: number;
  snapColumnSpace: number;
  snapRowSpace: number;
  canvasPadding?: number;
  getRelativeScrollingParent?: (slider: HTMLDivElement) => Element | null;
  onEnter: (canvasId: string, position: FixedCanvasArenaPosition) => void;
  onMove: (canvasId: string, position: FixedCanvasArenaPosition) => Preview | null;
  onLeave: (canvasId: string) => void;
  onScroll?: (canvasId: string, position: FixedCanvasArenaPosition, deltaY: number) => void;
  onUp: (canvasId: string, lastPreview: Preview | null) => void;
  onDragEnd?: (canvasId: string) => void;
  /** Latest reflow plan, including Appsmith's delayed container activation. */
  currentPreview?: Preview | null;
  onPaint?: (canvasId: string, preview: Preview | null,
    canvas: HTMLCanvasElement, slider: HTMLDivElement,
    scrollParent: Element) => void;
}

// Appsmith utils/generators.tsx:getNearestParentCanvas.
export function getNearestParentCanvas(element: Element | null): Element | null {
  return element?.closest(".canvas") ?? null;
}

function getScrollByPixels(
  offsetY: number, scrollParent: Element, slider: Element,
): { scrollAmount: number; speed: number } {
  // Appsmith utils/helpers.tsx:getScrollByPixels: 20px edge threshold and
  // two canvas extension rows (40px) per step.
  const scrollParentBounds = scrollParent.getBoundingClientRect();
  const sliderBounds = slider.getBoundingClientRect();
  const scrollAmount = 40;
  const topBuffer = offsetY + sliderBounds.top > 0
    ? offsetY + sliderBounds.top - 20 - scrollParentBounds.top : 0;
  const bottomBuffer = scrollParentBounds.bottom -
    (offsetY + sliderBounds.top + 20);
  if (topBuffer < 20) return {
    scrollAmount: -scrollAmount,
    speed: Math.max((20 - topBuffer) / 40, 0.1),
  };
  if (bottomBuffer < 20) return {
    scrollAmount,
    speed: Math.max((20 - bottomBuffer) / 40, 0.1),
  };
  return { scrollAmount: 0, speed: 0 };
}

export function FixedCanvasDraggingArena<Preview = unknown>({
  canvasId,
  isDragging,
  isResizing,
  isCurrentDraggedCanvas,
  isInitialDragCanvas = false,
  hasDraggingBlocks = true,
  canExtend,
  snapRows,
  snapColumnSpace,
  snapRowSpace,
  canvasPadding = 0,
  getRelativeScrollingParent = getNearestParentCanvas,
  onEnter,
  onMove,
  onLeave,
  onScroll,
  onUp,
  onDragEnd,
  currentPreview,
  onPaint,
}: FixedCanvasDraggingArenaProps<Preview>): React.ReactElement | null {
  const slidingArenaRef = useRef<HTMLDivElement>(null);
  const stickyCanvasRef = useRef<HTMLCanvasElement>(null);
  const repaintAfterRescaleRef = useRef<(() => void) | null>(null);
  const refreshPreviewRef = useRef<((preview: Preview | null) => void) | null>(null);
  const repaintAfterRescale = useCallback(() => repaintAfterRescaleRef.current?.(), []);
  const currentCanvasRef = useRef(isCurrentDraggedCanvas);
  currentCanvasRef.current = isCurrentDraggedCanvas;
  const callbacksRef = useRef({ onEnter, onMove, onLeave, onScroll, onUp, onDragEnd, onPaint });
  callbacksRef.current = { onEnter, onMove, onLeave, onScroll, onUp, onDragEnd, onPaint };
  const showCanvas = isDragging && !isResizing && hasDraggingBlocks;
  const canvasReRenderDependencies = useMemo(() => ({
    canExtend, snapColumnSpace, snapRowSpace, snapRows,
  }), [canExtend, snapColumnSpace, snapRowSpace, snapRows]);

  useEffect(() => {
    const slider = slidingArenaRef.current;
    const canvas = stickyCanvasRef.current;
    if (!showCanvas || !slider || !canvas) return;
    const scrollParent = getRelativeScrollingParent(slider);
    if (!scrollParent) return;
    slider.dataset.dragPreviewCanvasId = canvasId;
    canvas.dataset.dragPreviewCanvasId = canvasId;
    slider.dataset.dragPreviewValid = "none";
    canvas.dataset.dragPreviewValid = "none";
    let canvasIsDragging = false;
    let lastPreview: Preview | null = null;
    let lastMouseMoveEvent: FixedCanvasArenaPosition | null = null;
    let lastScrollTop: number | null = null;
    let lastScrollHeight: number | null = null;
    let scrollDirection = 0;
    let scrollByPixels = 0;
    let scrollSpeed = 0;
    let didMouseUp = false;
    const scrollTimers: number[] = [];
    const scrollFrameTimers: number[] = [];

    const clearScrollStacks = () => {
      for (const timer of scrollTimers) window.clearTimeout(timer);
      scrollTimers.length = 0;
    };
    const stopScroll = () => {
      clearScrollStacks();
      scrollDirection = 0;
    };
    const clearCanvas = () => {
      const context = canvas.getContext("2d");
      context?.clearRect(0, 0, canvas.width, canvas.height);
    };
    const resetCanvasState = () => {
      stopScroll();
      clearCanvas();
      slider.style.zIndex = "";
      if (canvasIsDragging) callbacksRef.current.onLeave(canvasId);
      canvasIsDragging = false;
      lastPreview = null;
      slider.dataset.dragPreviewValid = "none";
      canvas.dataset.dragPreviewValid = "none";
    };
    const positionFromMouse = (
      event: MouseEvent, cause: FixedCanvasArenaPosition["cause"],
    ): FixedCanvasArenaPosition => ({
      clientX: event.clientX, clientY: event.clientY,
      offsetX: event.offsetX, offsetY: event.offsetY, cause,
    });
    const paintPreview = (preview: Preview | null) => {
      const valid = preview && typeof preview === "object" &&
        "valid" in preview && typeof preview.valid === "boolean"
        ? String(preview.valid) : "none";
      slider.dataset.dragPreviewValid = valid;
      canvas.dataset.dragPreviewValid = valid;
      callbacksRef.current.onPaint?.(canvasId, preview,
        canvas, slider, scrollParent);
    };
    const onMouseMove = (position: FixedCanvasArenaPosition) => {
      if (!canvasIsDragging) {
        onFirstMoveOnCanvas(position);
        return;
      }
      lastPreview = callbacksRef.current.onMove(canvasId, position);
      paintPreview(lastPreview);
      lastMouseMoveEvent = position;
      lastScrollTop = scrollParent.scrollTop;
      lastScrollHeight = scrollParent.scrollHeight;
    };
    refreshPreviewRef.current = (preview) => {
      if (!canvasIsDragging || lastPreview === preview) return;
      lastPreview = preview;
      paintPreview(preview);
    };
    repaintAfterRescaleRef.current = () => {
      if (canvasIsDragging) callbacksRef.current.onPaint?.(canvasId,
        lastPreview, canvas, slider, scrollParent);
    };
    const onFirstMoveOnCanvas = (position: FixedCanvasArenaPosition) => {
      if (canvasIsDragging) return;
      canvasIsDragging = true;
      slider.style.zIndex = "2";
      callbacksRef.current.onEnter(canvasId, position);
      // Appsmith useCanvasDragging:onFirstMoveOnCanvas immediately samples the
      // first mouseover, including a one-step palette drag into the arena.
      onMouseMove(position);
    };
    const onMouseUp = () => {
      if (didMouseUp) return;
      didMouseUp = true;
      if (canvasIsDragging) callbacksRef.current.onUp(canvasId, lastPreview);
      const wasCurrent = currentCanvasRef.current || canvasIsDragging;
      resetCanvasState();
      if (wasCurrent) {
        // Appsmith defers clearing global drag state until after onDrop.
        window.setTimeout(() => callbacksRef.current.onDragEnd?.(canvasId), 0);
      }
    };
    const scrollFn = () => {
      clearScrollStacks();
      if (!currentCanvasRef.current) return;
      if ((scrollByPixels < 0 && scrollParent.scrollTop > 0) ||
        scrollByPixels > 0) {
        scrollParent.scrollBy({ top: scrollByPixels, behavior: "smooth" });
      }
      scrollTimers.push(window.setTimeout(scrollFn,
        100 * Math.max(0.4, scrollSpeed)));
    };
    const onMouseMoveEvent = (event: MouseEvent) => {
      // useCanvasDragToScroll registers its mousemove listener before
      // useCanvasDragging's move listener in the Appsmith hook.
      if (currentCanvasRef.current) {
        const scroll = getScrollByPixels(event.offsetY, scrollParent, slider);
        scrollByPixels = scroll.scrollAmount;
        scrollSpeed = scroll.speed;
        const nextDirection = scrollByPixels > 0 ? 1 : scrollByPixels < 0 ? -1 : 0;
        if (nextDirection !== scrollDirection) {
          clearScrollStacks();
          scrollDirection = nextDirection;
          if (scrollDirection) scrollFn();
        }
      }
      onMouseMove(positionFromMouse(event, "pointer"));
    };
    const onMouseOver = (event: MouseEvent) =>
      onFirstMoveOnCanvas(positionFromMouse(event, "enter"));
    const onScrollEvent = () => {
      // Appsmith waits for StickyCanvasArena's own scroll observer first.
      scrollFrameTimers.push(window.setTimeout(() => {
        if (!canvasIsDragging || !lastMouseMoveEvent ||
          lastScrollTop === null || lastScrollHeight === null) return;
        const deltaY = scrollParent.scrollHeight + scrollParent.scrollTop -
          (lastScrollHeight + lastScrollTop);
        const position = { ...lastMouseMoveEvent,
          offsetY: lastMouseMoveEvent.offsetY + deltaY,
          cause: "scroll" as const };
        callbacksRef.current.onScroll?.(canvasId, position, deltaY);
        onMouseMove(position);
      }, 0));
    };

    slider.addEventListener("mousemove", onMouseMoveEvent, false);
    slider.addEventListener("mouseup", onMouseUp, false);
    slider.addEventListener("mouseover", onMouseOver, false);
    slider.addEventListener("mouseout", resetCanvasState, false);
    slider.addEventListener("mouseleave", resetCanvasState, false);
    scrollParent.addEventListener("scroll", onScrollEvent, false);
    document.body.addEventListener("mouseup", onMouseUp, false);
    window.addEventListener("mouseup", onMouseUp, false);
    if (isInitialDragCanvas) slider.style.zIndex = "2";

    return () => {
      slider.removeEventListener("mousemove", onMouseMoveEvent);
      slider.removeEventListener("mouseup", onMouseUp);
      slider.removeEventListener("mouseover", onMouseOver);
      slider.removeEventListener("mouseout", resetCanvasState);
      slider.removeEventListener("mouseleave", resetCanvasState);
      scrollParent.removeEventListener("scroll", onScrollEvent);
      document.body.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mouseup", onMouseUp);
      for (const timer of scrollFrameTimers) window.clearTimeout(timer);
      repaintAfterRescaleRef.current = null;
      refreshPreviewRef.current = null;
      resetCanvasState();
    };
  }, [canvasId, showCanvas, getRelativeScrollingParent]);

  useEffect(() => {
    if (currentPreview !== undefined) refreshPreviewRef.current?.(currentPreview);
  }, [currentPreview]);

  return showCanvas ? <StickyCanvasArena
    canvasId={`canvas-dragging-${canvasId}`}
    canvasPadding={canvasPadding}
    dependencies={canvasReRenderDependencies}
    getRelativeScrollingParent={getRelativeScrollingParent}
    shouldObserveIntersection={isDragging}
    sliderId={`div-dragarena-${canvasId}`}
    slidingArenaRef={slidingArenaRef as RefObject<HTMLDivElement>}
    stickyCanvasRef={stickyCanvasRef as RefObject<HTMLCanvasElement>}
    onCanvasRescaled={repaintAfterRescale}
  /> : null;
}
