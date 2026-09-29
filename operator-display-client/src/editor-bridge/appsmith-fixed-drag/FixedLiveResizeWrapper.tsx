import type { ReactNode } from "react";
import React from "react";
import { Spring, animated } from "react-spring";
import styled from "styled-components";

// FixedLayoutEditorWidgetOnion > FixedResizableLayer > ResizableComponent >
// FixedLayoutResizable. Keep the positioned widget outside this wrapper, as
// Appsmith does. The wrapper, which contains the actual widget, reflects the
// accepted resize rectangle before the Redux resize command is committed.
const WIDGET_PADDING = 4;
const RESIZE_BORDER_BUFFER = 4;
const MAX_HEIGHT_IN_PX = 9000 * 10;

const ResizeWrapper = styled(animated.div)`
  box-sizing: border-box;
  display: block;
  border: 1px solid;
  padding: 1px;
  outline-offset: 1px;
  outline: 1px solid transparent;
  will-change: outline-color;
  &.show-boundary { outline-color: #fafafa; }
  &.pointer-event-none { pointer-events: none; }
`;

export interface FixedLiveResizePreview {
  widgetId: string;
  /** Pixel displacement from the outer positioned widget. */
  x: number;
  y: number;
  /** Full widget dimensions, including the positioned layer's padding. */
  width: number;
  height: number;
}

interface FixedLiveResizeWrapperProps {
  widgetId: string;
  width: number;
  height: number;
  autoHeight: boolean;
  maxHeightInPx?: number;
  preview?: FixedLiveResizePreview;
  showBoundary?: boolean;
  isHovered?: boolean;
  handles?: ReactNode;
  children: ReactNode;
}

/** Appsmith's animated inner resize wrapper, with content and handles together. */
export function FixedLiveResizeWrapper({
  widgetId, width, height, autoHeight, maxHeightInPx = MAX_HEIGHT_IN_PX,
  preview, showBoundary = false, isHovered = false, handles, children,
}: FixedLiveResizeWrapperProps): React.ReactElement {
  const active = preview?.widgetId === widgetId;
  const nextWidth = active ? preview.width : width;
  const nextHeight = active ? preview.height : height;
  const componentWidth = Math.max(1, nextWidth - 2 * WIDGET_PADDING);
  const componentHeight = Math.max(1, nextHeight - 2 * WIDGET_PADDING);
  const wrapperWidth = componentWidth + RESIZE_BORDER_BUFFER;
  const wrapperHeight = componentHeight + RESIZE_BORDER_BUFFER;
  const x = active ? preview.x : 0;
  const y = active ? preview.y : 0;

  return (
    <Spring
      config={{ clamp: true, friction: 0, tension: 999 }}
      immediate={!active}
      to={{
        width: wrapperWidth,
        height: autoHeight ? "auto" : Math.min(maxHeightInPx, wrapperHeight),
        maxHeight: maxHeightInPx,
        transform: `translate3d(${x - RESIZE_BORDER_BUFFER / 2}px,${
          y - RESIZE_BORDER_BUFFER / 2}px,0)`,
      }}
    >
      {(style) => (
        <ResizeWrapper
          className={`resize-wrapper${showBoundary ? " show-boundary" : ""}${active ? " pointer-event-none" : ""}`}
          data-live-resize-wrapper={widgetId}
          id={`resize-${widgetId}`}
          style={{ ...style,
            borderColor: showBoundary ? "#fafafa" : "transparent",
            boxShadow: showBoundary
              ? `0px 0px 0px 1px ${isHovered ? "#FF9B4E" : "#f86a2b"}`
              : "none" }}
        >
          {children}
          {handles}
        </ResizeWrapper>
      )}
    </Spring>
  );
}
