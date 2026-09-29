import React, { useEffect, useRef } from "react";
import type { RefObject } from "react";
import styled from "styled-components";

/**
 * Port of Appsmith's layoutSystems/common/canvasArenas/StickyCanvasArena.tsx.
 * The canvas paints the preview. The slider, which has pointer events, owns
 * the current canvas's drag gesture.
 */
export interface StickyCanvasArenaProps {
  canvasId: string;
  sliderId: string;
  canvasPadding: number;
  dependencies?: Record<string, unknown>;
  getRelativeScrollingParent: (child: HTMLDivElement) => Element | null;
  shouldObserveIntersection: boolean;
  scaleFactor?: number;
  slidingArenaRef: RefObject<HTMLDivElement>;
  stickyCanvasRef: RefObject<HTMLCanvasElement>;
  onCanvasRescaled?: () => void;
}

const StickyCanvas = styled.canvas`
  position: absolute;
  pointer-events: none;
`;

const StyledCanvasSlider = styled.div<{ paddingBottom: number }>`
  position: absolute;
  pointer-events: all;
  top: 0px;
  left: 0px;
  height: calc(100% + ${(props) => props.paddingBottom}px);
  width: 100%;
  image-rendering: -moz-crisp-edges;
  image-rendering: -webkit-crisp-edges;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  overflow-y: auto;
`;

function shouldUpdateCanvas(
  currentEntry: IntersectionObserverEntry,
  previousEntry?: IntersectionObserverEntry,
): boolean {
  if (!previousEntry) return true;
  const previous = previousEntry.intersectionRect;
  const current = currentEntry.intersectionRect;
  return previous.height !== current.height || previous.width !== current.width ||
    previous.left !== current.left || previous.top !== current.top ||
    previousEntry.boundingClientRect.top !== currentEntry.boundingClientRect.top ||
    previousEntry.boundingClientRect.left !== currentEntry.boundingClientRect.left;
}

export function StickyCanvasArena({
  canvasId,
  sliderId,
  canvasPadding,
  dependencies,
  getRelativeScrollingParent,
  shouldObserveIntersection,
  scaleFactor = 1,
  slidingArenaRef,
  stickyCanvasRef,
  onCanvasRescaled,
}: StickyCanvasArenaProps): React.ReactElement {
  const previousIntersectionEntry = useRef<IntersectionObserverEntry>();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const onCanvasRescaledRef = useRef(onCanvasRescaled);
  onCanvasRescaledRef.current = onCanvasRescaled;

  // Appsmith observes the slider and clips the paint canvas to its visible
  // intersection with the scrolling canvas. Resetting the canvas dimensions
  // also resets its 2D context, so only update when the intersection changes.
  useEffect(() => {
    const slider = slidingArenaRef.current;
    const canvas = stickyCanvasRef.current;
    if (!slider || !canvas || typeof IntersectionObserver === "undefined") return;
    const scale = window.devicePixelRatio || 1;
    let frame = 0;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!shouldUpdateCanvas(entry, previousIntersectionEntry.current)) continue;
        window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(() => {
          const parentCanvas = getRelativeScrollingParent(slider);
          if (!parentCanvas || !slidingArenaRef.current || !stickyCanvasRef.current) return;
          const left = entry.intersectionRect.left - entry.boundingClientRect.left;
          const top = entry.intersectionRect.top - entry.boundingClientRect.top;
          canvas.style.position = "absolute";
          canvas.style.left = `${left}px`;
          canvas.style.top = `${top}px`;
          canvas.style.width = `${entry.intersectionRect.width}px`;
          canvas.style.height = `${entry.intersectionRect.height}px`;
          canvas.width = entry.intersectionRect.width * scale * scaleFactor;
          canvas.height = entry.intersectionRect.height * scale * scaleFactor;
          canvas.getContext("2d")?.scale(scale * scaleFactor, scale * scaleFactor);
          previousIntersectionEntry.current = entry;
          // Resizing the backing canvas clears its bitmap. Appsmith's scroll
          // path follows this with onMouseMove; replay the same paint when the
          // first intersection arrives after a single mouseover sample.
          onCanvasRescaledRef.current?.();
        });
      }
    });
    observerRef.current = observer;
    const observeSlider = () => {
      if (!shouldObserveIntersection) return;
      observer.disconnect();
      if (slidingArenaRef.current) observer.observe(slidingArenaRef.current);
    };
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null : new ResizeObserver(observeSlider);
    const parentCanvas = getRelativeScrollingParent(slider);
    parentCanvas?.addEventListener("scroll", observeSlider, false);
    parentCanvas?.addEventListener("mouseover", observeSlider, false);
    resizeObserver?.observe(slider);
    observeSlider();
    return () => {
      parentCanvas?.removeEventListener("scroll", observeSlider);
      parentCanvas?.removeEventListener("mouseover", observeSlider);
      resizeObserver?.disconnect();
      observer.disconnect();
      observerRef.current = null;
      window.cancelAnimationFrame(frame);
    };
  }, [slidingArenaRef, stickyCanvasRef, getRelativeScrollingParent,
    shouldObserveIntersection, scaleFactor, dependencies]);

  return <>
    <StickyCanvas data-sl="canvas-mq" data-testid={canvasId}
      id={canvasId} ref={stickyCanvasRef} />
    <StyledCanvasSlider data-testid={sliderId} data-type="canvas-slider"
      id={sliderId} paddingBottom={canvasPadding} ref={slidingArenaRef} />
  </>;
}
