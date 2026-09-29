import React, { useCallback, useEffect, useRef, useState } from "react";
import { getCanvasClassName } from "utils/generators";
import "./CanvasViewport.css";

export interface CanvasViewportProps {
  canvasWidth: number;
  children: React.ReactNode;
}

const SCROLL_STEP = 300;

/** Keeps Appsmith's unscaled canvas inside its expected scroll parent. */
export function CanvasViewport({ canvasWidth, children }: CanvasViewportProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = useCallback(() => {
    const area = scrollAreaRef.current;

    if (!area) return;

    setCanScrollLeft(area.scrollLeft > 1);
    setCanScrollRight(
      area.scrollLeft + area.clientWidth < area.scrollWidth - 1,
    );
  }, []);

  useEffect(
    function watchCanvasScrollSize() {
      const area = scrollAreaRef.current;

      if (!area) return;

      updateScrollButtons();

      if (typeof ResizeObserver === "undefined") return;

      const observer = new ResizeObserver(updateScrollButtons);

      observer.observe(area);

      if (area.firstElementChild instanceof HTMLElement) {
        observer.observe(area.firstElementChild);
      }

      return () => observer.disconnect();
    },
    [canvasWidth, updateScrollButtons],
  );

  const scrollCanvas = useCallback((direction: -1 | 1) => {
    scrollAreaRef.current?.scrollBy({
      left: direction * SCROLL_STEP,
      behavior: "smooth",
    });
  }, []);
  const scrollLeft = useCallback(() => scrollCanvas(-1), [scrollCanvas]);
  const scrollRight = useCallback(() => scrollCanvas(1), [scrollCanvas]);

  return (
    <section
      aria-label="Canvas viewport"
      className="integration-canvas-viewport"
    >
      <div
        aria-label="Canvas navigation"
        className="integration-canvas-viewport__toolbar"
        role="group"
      >
        <span className="integration-canvas-viewport__size">
          Artboard {canvasWidth}px
        </span>
        <div className="integration-canvas-viewport__buttons">
          <button
            aria-controls="standalone-canvas-scroll-area"
            aria-label="Scroll canvas left"
            data-testid="t--canvas-scroll-left"
            disabled={!canScrollLeft}
            onClick={scrollLeft}
            type="button"
          >
            ←
          </button>
          <button
            aria-controls="standalone-canvas-scroll-area"
            aria-label="Scroll canvas right"
            data-testid="t--canvas-scroll-right"
            disabled={!canScrollRight}
            onClick={scrollRight}
            type="button"
          >
            →
          </button>
        </div>
      </div>
      <div
        className={`standalone-editor__canvas ${getCanvasClassName()} integration-canvas-viewport__scroll`}
        data-testid="t--canvas-scroll-area"
        id="standalone-canvas-scroll-area"
        onScroll={updateScrollButtons}
        ref={scrollAreaRef}
      >
        {children}
      </div>
    </section>
  );
}
