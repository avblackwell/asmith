import React, { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import styled from "styled-components";
import {
  DEFAULT_GRID_ROW_HEIGHT,
  heightLimitRowsAfterDrag,
  initialHeightLimitDragState,
  moveMaxHeightLimit,
  moveMinHeightLimit,
  type HeightLimitDragState,
} from "./autoHeightRules";

// Values and presentation come from Appsmith's autoHeightOverlay/constants.ts
// and ui/* styled components. Only pointer event ownership and the commit
// callback are adapters for the extracted workbench.
const OVERLAY_COLOR = "#F32B8B";
const CONTAINER_GRID_PADDING = 6;

const StyledAutoHeightOverlay = styled.div<{ isHidden: boolean }>`
  width: 100%;
  height: 100%;
  position: absolute;
  z-index: 3;
  pointer-events: none;
  display: ${(props) => (props.isHidden ? "none" : "block")};
`;

const AutoHeightLimitOverlayDisplay = styled.div<{ isActive: boolean; height: number }>`
  display: ${(props) => (props.isActive ? "block" : "none")};
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: ${(props) => props.height}px;
  background-color: rgba(243, 43, 139, 0.1);
`;

const HandleGroup = styled.div`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: all;
  width: 100%;
  z-index: 1;
`;

const Handle = styled.div<{ height: number }>`
  position: absolute;
  display: flex;
  align-items: center;
  width: 100%;
  height: 13px;
  transform: translateY(${(props) => props.height - 6}px);
  cursor: ns-resize;
  touch-action: none;
`;

const HandleBorder = styled.div<{ isActive: boolean }>`
  background-image: linear-gradient(
    to right,
    ${OVERLAY_COLOR} 50%,
    rgba(255, 255, 255, 0) 0%
  );
  background-size: 8% 1px;
  background-repeat: repeat-x;
  height: 1px;
  width: 100%;
  ${(props) => (props.isActive ? `background-color: ${OVERLAY_COLOR}` : "")}
`;

const HandleDot = styled.div<{ isDragging: boolean }>`
  position: absolute;
  left: 50%;
  border-radius: 50%;
  width: 7px;
  height: 7px;
  transform: translateX(-50%)
    scale(${(props) => (props.isDragging ? "1.67" : "1")});
  border: 1px solid ${OVERLAY_COLOR};
  background-color: ${OVERLAY_COLOR};
  box-shadow: 0px 0px 0px 2px white;
`;

const HandleLabel = styled.div<{ isActive: boolean }>`
  position: absolute;
  pointer-events: none;
  padding: 1px 4px;
  background: #191919;
  font-weight: 400;
  font-size: 10px;
  line-height: 16px;
  color: #ffffff;
  text-align: center;
  white-space: nowrap;
  left: 0px;
  transform: translate(calc(-100% - 4px), -2px);
  display: ${(props) => (props.isActive ? "initial" : "none")};
`;

export interface AppsmithAutoHeightOverlayProps {
  widgetId: string;
  /** Grid coordinates of the selected widget in its parent canvas. */
  topRow: number;
  bottomRow: number;
  leftColumn: number;
  rightColumn: number;
  parentColumnSpace: number;
  parentRowSpace: number;
  noContainerOffset?: boolean;
  minDynamicHeight: number;
  maxDynamicHeight: number;
  isHidden?: boolean;
  /** Optional host-relative position override when rendered as a canvas portal. */
  style?: CSSProperties;
  /** Appsmith's batchUpdateWidgetProperty adapter; heights use grid rows. */
  onBatchUpdate: (limits: { minDynamicHeight?: number; maxDynamicHeight?: number }) => void;
  onDragStart?: () => void;
  onDragStop?: () => void;
}

type DragKind = "min" | "max";

/** Appsmith's selected-widget auto-height limit overlay for FIXED layout. */
export function AppsmithAutoHeightOverlay({
  widgetId,
  topRow,
  bottomRow,
  leftColumn,
  rightColumn,
  parentColumnSpace,
  parentRowSpace,
  noContainerOffset = false,
  minDynamicHeight,
  maxDynamicHeight,
  isHidden = false,
  style,
  onBatchUpdate,
  onDragStart,
  onDragStop,
}: AppsmithAutoHeightOverlayProps) {
  const [state, setState] = useState<HeightLimitDragState>(() =>
    initialHeightLimitDragState(minDynamicHeight, maxDynamicHeight),
  );
  const [activeHandle, setActiveHandle] = useState<DragKind | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<DragKind | null>(null);
  const stateRef = useRef(state);
  const dragRef = useRef<{ kind: DragKind; pointerId: number; startY: number } | null>(null);
  const callbackRef = useRef({ onBatchUpdate, onDragStop });
  callbackRef.current = { onBatchUpdate, onDragStop };

  function publish(next: HeightLimitDragState) {
    stateRef.current = next;
    setState(next);
  }

  useEffect(() => {
    publish(initialHeightLimitDragState(minDynamicHeight, maxDynamicHeight));
  }, [minDynamicHeight, maxDynamicHeight, widgetId]);

  useEffect(() => {
    const update = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const delta = event.clientY - drag.startY;
      publish(drag.kind === "max"
        ? moveMaxHeightLimit(stateRef.current, delta, parentRowSpace)
        : moveMinHeightLimit(stateRef.current, delta, parentRowSpace));
    };
    const finish = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      setActiveHandle(null);
      const current = stateRef.current;
      if (current.maxdY !== 0 || current.mindY !== 0) {
        const rows = heightLimitRowsAfterDrag(current);
        callbackRef.current.onBatchUpdate({
          ...(current.maxdY !== 0 ? { maxDynamicHeight: rows.maxRows } : {}),
          ...(current.mindY !== 0 ? { minDynamicHeight: rows.minRows } : {}),
        });
      }
      callbackRef.current.onDragStop?.();
    };
    window.addEventListener("pointermove", update);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", update);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [parentRowSpace]);

  function begin(kind: DragKind, event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { kind, pointerId: event.pointerId, startY: event.clientY };
    setActiveHandle(kind);
    onDragStart?.();
  }

  const finalMaxY = state.maxY + state.maxdY;
  const finalMinY = state.minY + state.mindY;
  const minActive = activeHandle === "min" || hoveredHandle === "min";
  const maxActive = activeHandle === "max" || hoveredHandle === "max";
  const isColliding = finalMaxY === finalMinY;
  const positionedStyle: CSSProperties = style ?? {
    height: (bottomRow - topRow) * parentRowSpace,
    width: (rightColumn - leftColumn) * parentColumnSpace,
    left: leftColumn * parentColumnSpace + (noContainerOffset ? 0 : CONTAINER_GRID_PADDING),
    top: topRow * parentRowSpace + (noContainerOffset ? 0 : CONTAINER_GRID_PADDING),
  };

  return (
    <StyledAutoHeightOverlay
      data-widget-auto-height-overlay={widgetId}
      isHidden={isHidden}
      onClick={(event) => event.stopPropagation()}
      style={positionedStyle}
    >
      <AutoHeightLimitOverlayDisplay
        data-testid="t--auto-height-overlay"
        height={maxActive ? finalMaxY : finalMinY}
        isActive={maxActive || minActive}
      />
      <HandleGroup data-testid="t-auto-height-overlay-handles">
        <Handle
          data-testid="t--auto-height-overlay-handles-min"
          height={finalMinY}
          onPointerDown={(event) => begin("min", event)}
          onMouseEnter={() => setHoveredHandle("min")}
          onMouseLeave={() => setHoveredHandle(null)}
          onClick={(event) => event.stopPropagation()}
          onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }}
        >
          <HandleBorder isActive={minActive} />
          <HandleDot isDragging={activeHandle === "min"} />
          {!isColliding && <HandleLabel isActive={minActive}>Min-Height: {Math.floor(finalMinY / DEFAULT_GRID_ROW_HEIGHT)} rows</HandleLabel>}
        </Handle>
        <Handle
          data-testid="t--auto-height-overlay-handles-max"
          height={finalMaxY}
          onPointerDown={(event) => begin("max", event)}
          onMouseEnter={() => setHoveredHandle("max")}
          onMouseLeave={() => setHoveredHandle(null)}
          onClick={(event) => event.stopPropagation()}
          onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }}
        >
          <HandleBorder isActive={maxActive} />
          <HandleDot isDragging={activeHandle === "max"} />
          <HandleLabel isActive={maxActive}>{isColliding ? "Height" : "Max-Height"}: {Math.floor(finalMaxY / DEFAULT_GRID_ROW_HEIGHT)} rows</HandleLabel>
        </Handle>
      </HandleGroup>
    </StyledAutoHeightOverlay>
  );
}
