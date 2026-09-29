import React, { useLayoutEffect, useRef, useState } from "react";
import type { SelectionRectangle } from "./selectionGeometry";

interface VisibleRect { left: number; top: number; width: number; height: number }

function sameRect(a: VisibleRect | null, b: VisibleRect): boolean {
  return !!a && a.left === b.left && a.top === b.top &&
    a.width === b.width && a.height === b.height;
}

/** StickyCanvasArena's intersection-rect positioning for a local host. */
function sourceCanvas(frameElement: HTMLElement, canvasId: string): HTMLElement | null {
  const host = frameElement.parentElement;
  if (!host) return null;
  // Canvas IDs come from saved DSL; compare values without interpolating an ID
  // into a selector. The marquee itself is mounted beside the widget tree.
  for (const candidate of host.querySelectorAll<HTMLElement>("[data-widget-id]")) {
    if (candidate.dataset.widgetId === canvasId) return candidate;
  }
  return null;
}

function clippingAncestors(element: HTMLElement, canvasId: string): HTMLElement[] {
  const ancestors = new Set<HTMLElement>();
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    ancestors.add(parent);
  }
  const source = sourceCanvas(element, canvasId);
  for (let parent = source; parent; parent = parent.parentElement) {
    ancestors.add(parent);
  }
  return [...ancestors].filter((parent) => {
    const style = window.getComputedStyle(parent);
    return /^(auto|scroll|hidden|clip)$/.test(style.overflowX) ||
      /^(auto|scroll|hidden|clip)$/.test(style.overflowY);
  });
}

function visibleInsideClippingParents(element: HTMLElement, canvasId: string): VisibleRect {
  const bounds = element.getBoundingClientRect();
  let left = Math.max(bounds.left, 0);
  let top = Math.max(bounds.top, 0);
  let right = Math.min(bounds.right, window.innerWidth);
  let bottom = Math.min(bounds.bottom, window.innerHeight);
  for (const parent of clippingAncestors(element, canvasId)) {
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

export interface CanvasSelectionMarqueeProps {
  canvasId: string;
  /** Canvas frame relative to the workbench's positioned editor host. */
  frame: { left: number; top: number; width: number; height: number };
  /** Selection dimensions in canvas-local pixels. */
  rectangle: SelectionRectangle | null;
}

/** The Canvas2D marquee painted by Appsmith's Fixed CanvasSelectionArena. */
export function AppsmithCanvasSelectionMarquee({
  canvasId, frame, rectangle,
}: CanvasSelectionMarqueeProps): React.ReactElement {
  const frameRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState<VisibleRect | null>(null);

  useLayoutEffect(() => {
    const frameElement = frameRef.current;
    if (!frameElement) return;
    const measure = () => {
      const next = visibleInsideClippingParents(frameElement, canvasId);
      setVisible((current) => sameRect(current, next) ? current : next);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(frameElement);
    for (const parent of clippingAncestors(frameElement, canvasId)) {
      observer?.observe(parent);
    }
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [canvasId, frame.left, frame.top, frame.width, frame.height]);

  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas || !visible) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const scale = window.devicePixelRatio || 1;
    const backingWidth = Math.max(1, Math.ceil(visible.width * scale));
    const backingHeight = Math.max(1, Math.ceil(visible.height * scale));
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, visible.width, visible.height);
    if (!rectangle || !visible.width || !visible.height) return;

    // CanvasSelectionArena.tsx drawRectangle: 1px padding, dashed blue
    // outline, and transparent blue fill.
    const strokeWidth = 1;
    context.setLineDash([5]);
    context.strokeStyle = "rgba(125,188,255,1)";
    context.strokeRect(
      rectangle.left - strokeWidth - visible.left,
      rectangle.top - strokeWidth - visible.top,
      rectangle.width + 2 * strokeWidth,
      rectangle.height + 2 * strokeWidth,
    );
    context.fillStyle = "rgb(84, 132, 236, 0.06)";
    context.fillRect(rectangle.left - visible.left, rectangle.top - visible.top,
      rectangle.width, rectangle.height);
  }, [rectangle, visible]);

  return (
    <div
      ref={frameRef}
      style={{
        position: "absolute",
        left: frame.left,
        top: frame.top,
        width: frame.width,
        height: frame.height,
        pointerEvents: "none",
        zIndex: rectangle ? 2 : undefined,
      }}
    >
      <canvas
        aria-hidden="true"
        data-testid={`canvas-selection-${canvasId}`}
        ref={ref}
        style={{
          position: "absolute",
          left: visible?.left ?? 0,
          top: visible?.top ?? 0,
          width: visible?.width ?? 0,
          height: visible?.height ?? 0,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
