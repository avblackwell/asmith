/**
 * Fixed Modal's dedicated resize layer, adapted from Appsmith's
 * layoutSystems/common/resizer/{ModalResizable,ModalResizableLayer,
 * ResizeStyledComponents}. The only product adaptation is onStop's local
 * Redux command callback; the four handles and centered pixel geometry are
 * the Appsmith interaction.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Spring, animated } from "react-spring";
import { useDrag } from "react-use-gesture";
import styled, { css } from "styled-components";
import type { StyledComponent } from "styled-components";
import { modalResizeDimensions } from "./modalResizeModel";

const WIDGET_PADDING = 4;
const EDGE_RESIZE_HANDLE_WIDTH = 12;
const GREY_1 = "#FAFAFA";
const WATUSI = "#FF9B4E";

const VerticalResizeIndicators = css<{ $isHovered: boolean }>`
  &::after {
    position: absolute;
    content: "";
    width: 7px;
    height: 16px;
    border-radius: 50%/16%;
    background: ${GREY_1};
    top: calc(50% - 8px);
    left: calc(50% - 2.5px);
    border: 1px solid ${({ $isHovered }) => $isHovered ? WATUSI : "#F86A2B"};
    outline: 1px solid ${GREY_1};
  }
  &:hover::after { background: #f86a2b; }
`;

const HorizontalResizeIndicators = css<{ $isHovered: boolean }>`
  &::after {
    position: absolute;
    content: "";
    width: 16px;
    height: 7px;
    border-radius: 16%/50%;
    border: 1px solid ${({ $isHovered }) => $isHovered ? WATUSI : "#F86A2B"};
    background: ${GREY_1};
    top: calc(50% - 2.5px);
    left: calc(50% - 8px);
    outline: 1px solid ${GREY_1};
  }
  &:hover::after { background: #f86a2b; }
`;

const VerticalHandle = styled.div<{ $showAsBorder: boolean; $disableDot: boolean;
  $isHovered: boolean }>`
  position: absolute;
  width: ${EDGE_RESIZE_HANDLE_WIDTH}px;
  top: -3px;
  height: calc(100% + ${2 * WIDGET_PADDING - 1}px);
  ${({ $showAsBorder, $disableDot }) => !$showAsBorder && !$disableDot ? css`
    cursor: col-resize;
    ${VerticalResizeIndicators}
  ` : ""}
  &::before { position: absolute; content: ""; left: 50%; bottom: 0; top: 0; width: 1px; }
`;

const HorizontalHandle = styled.div<{ $showAsBorder: boolean; $disableDot: boolean;
  $isHovered: boolean }>`
  position: absolute;
  height: ${EDGE_RESIZE_HANDLE_WIDTH}px;
  left: -3px;
  width: calc(100% + ${2 * WIDGET_PADDING}px);
  ${({ $showAsBorder, $disableDot }) => !$showAsBorder && !$disableDot ? css`
    cursor: row-resize;
    ${HorizontalResizeIndicators}
  ` : ""}
  &::before { position: absolute; content: ""; top: 50%; right: 0; left: 0; height: 1px; }
`;

const LeftHandleStyles = styled(VerticalHandle)`left: -8.5px;`;
const RightHandleStyles = styled(VerticalHandle)`right: -6.5px; height: calc(100% + ${2 * WIDGET_PADDING}px);`;
const TopHandleStyles = styled(HorizontalHandle)`top: -8.5px;`;
const BottomHandleStyles = styled(HorizontalHandle)`bottom: -6.5px;`;

const ResizeWrapper = styled(animated.div)`
  position: relative;
  z-index: 1;
  display: block;
  flex: 0 0 auto;
  max-height: 85%;
  outline: 1px solid transparent;
  outline-offset: 1px;
  border: 1px solid ${GREY_1};
  padding: 1px;
  box-shadow: 0 0 0 1px ${WATUSI};
  will-change: outline-color;
  &.show-boundary { outline-color: ${GREY_1}; }
  &.pointer-event-none { pointer-events: none; }
`;

const getSnappedValues = (x: number, y: number) => ({
  x: Math.round(x), y: Math.round(y),
});

type Edge = "left" | "top" | "bottom" | "right";
type HandleComponent = StyledComponent<"div", Record<string, unknown>, {
  $showAsBorder: boolean; $disableDot: boolean; $isHovered: boolean;
}>;

function ResizableHandle(props: {
  direction: Edge;
  component: HandleComponent;
  enabled: boolean;
  dragCallback: (x: number, y: number) => void;
  onStart: () => void;
  onStop: () => void;
}) {
  const bind = useDrag(({ dragging, first, last, memo, movement: [mx, my] }) => {
    if (!props.enabled) return memo;
    const snapped = getSnappedValues(mx, my);
    if (dragging && memo && (snapped.x !== memo.x || snapped.y !== memo.y)) {
      props.dragCallback(snapped.x, snapped.y);
    }
    if (first) props.onStart();
    if (last) props.onStop();
    return snapped;
  });
  const Component = props.component;
  return <Component {...bind()} $disableDot={!props.enabled}
    $isHovered $showAsBorder={!props.enabled}
    aria-label={`Resize modal ${props.direction}`}
    data-modal-resize-handle={props.direction} />;
}

export interface NativeModalResizableProps {
  widgetId: string;
  widgetName: string;
  canvasWidgetId: string;
  width: number;
  height: number;
  mainCanvasWidth: number;
  autoHeight: boolean;
  disabledResizeHandles?: readonly string[];
  onResize: (widgetId: string, canvasWidgetId: string,
    dimensions: { width: number; height: number }) => void;
  onResizeStart?: (widgetId: string) => void;
  onResizeEnd?: (widgetId: string) => void;
  onSelect?: () => void;
  children: ReactNode;
}

export function NativeModalResizable(props: NativeModalResizableProps): React.ReactElement {
  const [pointerEvents, togglePointerEvents] = useState(true);
  const initial = { width: props.width, height: props.height, x: 0, y: 0, reset: false };
  const [newDimensions, setNewDimensions] = useState(initial);
  const newDimensionsRef = useRef(initial);

  useEffect(() => {
    const dimensions = { width: props.width, height: props.height, x: 0, y: 0, reset: true };
    newDimensionsRef.current = dimensions;
    setNewDimensions(dimensions);
  }, [props.width, props.height]);

  const setDimensionPreview = (rect: typeof initial) => {
    // ModalResizableLayer deliberately has no sibling collision check: Modal
    // is detached from the Fixed canvas reflow tree.
    newDimensionsRef.current = rect;
    setNewDimensions(rect);
  };
  const disabled = useMemo(() => new Set(props.disabledResizeHandles ?? []),
    [props.disabledResizeHandles]);
  const enableHorizontalResize = true;
  const enableVerticalResize = !props.autoHeight;
  const handles: Array<{ direction: Edge; component: HandleComponent;
    dragCallback: (x: number, y: number) => void }> = [
    { direction: "left", component: LeftHandleStyles,
      dragCallback: (x) => setDimensionPreview({
        width: props.width - 2 * x, height: newDimensionsRef.current.height,
        x: 0, y: newDimensionsRef.current.y, reset: false,
      }) },
    { direction: "top", component: TopHandleStyles,
      dragCallback: (_x, y) => setDimensionPreview({
        width: newDimensionsRef.current.width, height: props.height - 2 * y,
        x: newDimensionsRef.current.x, y: 0, reset: false,
      }) },
    { direction: "bottom", component: BottomHandleStyles,
      dragCallback: (_x, y) => setDimensionPreview({
        width: newDimensionsRef.current.width, height: props.height + 2 * y,
        x: newDimensionsRef.current.x, y: 0, reset: false,
      }) },
    { direction: "right", component: RightHandleStyles,
      dragCallback: (x) => setDimensionPreview({
        width: props.width + 2 * x, height: newDimensionsRef.current.height,
        x: newDimensionsRef.current.x, y: newDimensionsRef.current.y, reset: false,
      }) },
  ];

  const onResizeStop = useCallback(() => {
    togglePointerEvents(true);
    const dimensions = modalResizeDimensions({
      width: newDimensionsRef.current.width,
      height: newDimensionsRef.current.height,
      currentHeight: props.height,
      mainCanvasWidth: props.mainCanvasWidth,
      autoHeight: props.autoHeight,
    });
    if (dimensions.width !== props.width || dimensions.height !== props.height) {
      props.onResize(props.widgetId, props.canvasWidgetId, dimensions);
    }
    // Appsmith clears isResizing on the next turn, after MODAL_RESIZE has been
    // dispatched and click handling for the gesture has completed.
    window.setTimeout(() => props.onResizeEnd?.(props.widgetId), 0);
  }, [props]);
  const onResizeStart = useCallback(() => {
    togglePointerEvents(false);
    props.onResizeStart?.(props.widgetId);
  }, [props]);

  return <Spring
    config={{ clamp: true, friction: 0, tension: 999 }}
    from={{ width: props.width, height: props.height }}
    immediate={newDimensions.reset}
    to={{ width: newDimensions.width, height: newDimensions.height,
      transform: `translate3d(${newDimensions.x}px,${newDimensions.y}px,0)` }}
  >
    {(style) => <ResizeWrapper
      aria-label={props.widgetName}
      className={`resize-wrapper show-boundary${pointerEvents ? "" : " pointer-event-none"}`}
      data-modal-resizable={props.widgetId}
      data-widget-id={props.widgetId}
      data-widget-name={props.widgetName}
      onClick={props.onSelect ? (event) => {
        event.stopPropagation();
        props.onSelect?.();
      } : undefined}
      role="dialog"
      style={style}
    >
      {props.children}
      {handles.filter((handle) => !disabled.has(handle.direction)).map((handle) => {
        const enabled = handle.direction === "left" || handle.direction === "right"
          ? enableHorizontalResize : enableVerticalResize;
        return <ResizableHandle key={handle.direction} {...handle}
          enabled={enabled} onStart={onResizeStart} onStop={onResizeStop} />;
      })}
    </ResizeWrapper>}
  </Spring>;
}
