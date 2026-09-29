import { Icon } from "@appsmith/ads";
import React, { useEffect, useMemo, useRef } from "react";
import styled from "styled-components";

const CONTAINER_GRID_PADDING = 6;
const POPUP_HEIGHT = 122;
const POPUP_WIDTH = 38;

const SelectionBox = styled.div`
  position: absolute;
  cursor: grab;
`;
const Actions = styled.div`
  margin-top: 5px;
  margin-left: 5px;
  visibility: hidden;
  display: flex;
  flex-direction: column;
  transition: all 50ms ease-in-out;
  padding: 5px 0;
  width: max-content;
  position: absolute;
  z-index: 4;
  background-color: #ededed;
`;
const Action = styled.button`
  cursor: pointer;
  height: 28px;
  width: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 5px;
  outline: none;
  border: none;
  background: transparent;
  z-index: 4;
  position: relative;
  &:hover, &:active, &.active { background: #e1e1e1; }
  &:focus { outline: none; }
`;
const BorderTop = styled.div`
  width: 100%; height: 1px; position: absolute; z-index: 4;
  border-top: 1px dashed #69b5ff; top: 0; left: 0;
`;
const BorderLeft = styled.div`
  width: 0; height: 100%; position: absolute; z-index: 4;
  border-left: 1px dashed #69b5ff; top: 0; left: 0;
`;
const BorderRight = styled.div`
  width: 0; height: 100%; position: absolute; z-index: 4;
  border-left: 1px dashed #69b5ff; top: 0; left: calc(100% - 1px);
`;
const BorderBottom = styled.div`
  width: 100%; height: 1px; position: absolute; z-index: 4;
  border-bottom: 1px dashed #69b5ff; top: 100%; left: 0;
`;

export interface SelectedWidgetBox {
  widgetId: string;
  parentId?: string;
  topRow: number;
  bottomRow: number;
  leftColumn: number;
  rightColumn: number;
}

export interface GroupDragStart {
  parentId: string;
  draggingGroupCenter: { top: number; left: number };
  startPoints: { top: number; left: number };
}

export interface WidgetsMultiSelectBoxProps {
  canvasId: string;
  /** Host-relative origin when rendered outside its Appsmith canvas parent. */
  canvasOffset?: { left: number; top: number };
  selectedWidgets: readonly SelectedWidgetBox[];
  snapColumnSpace: number;
  snapRowSpace: number;
  noContainerOffset: boolean;
  isDragging: boolean;
  onGroupDragStart: (start: GroupDragStart) => void;
  onFocus: () => void;
  onCopy: () => void;
  onCut: () => void;
  onDelete: () => void;
  onGroup: () => void;
}

/** Appsmith's sibling selection box and action rail, with editor actions passed in. */
export function AppsmithWidgetsMultiSelectBox({
  canvasId, canvasOffset, selectedWidgets, snapColumnSpace, snapRowSpace,
  noContainerOffset, isDragging, onGroupDragStart, onFocus,
  onCopy, onCut, onDelete, onGroup,
}: WidgetsMultiSelectBoxProps): React.ReactElement | null {
  const draggableRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const siblings = selectedWidgets.length > 1 && selectedWidgets.every(
    (widget) => widget.parentId === canvasId,
  );
  const shouldRender = !isDragging && siblings;

  const bounds = useMemo(() => {
    if (!shouldRender) return null;
    const left = Math.min(...selectedWidgets.map((widget) => widget.leftColumn));
    const right = Math.max(...selectedWidgets.map((widget) => widget.rightColumn));
    const top = Math.min(...selectedWidgets.map((widget) => widget.topRow));
    const bottom = Math.max(...selectedWidgets.map((widget) => widget.bottomRow));
    const padding = noContainerOffset ? 0 : CONTAINER_GRID_PADDING;
    return {
      top: top * snapRowSpace + padding + (canvasOffset?.top ?? 0),
      left: left * snapColumnSpace + padding + (canvasOffset?.left ?? 0),
      height: (bottom - top) * snapRowSpace,
      width: (right - left) * snapColumnSpace,
      groupCenter: { top, left },
    };
  }, [shouldRender, selectedWidgets, snapColumnSpace, snapRowSpace,
    noContainerOffset, canvasOffset?.top, canvasOffset?.left]);

  useEffect(() => {
    const box = draggableRef.current;
    if (!shouldRender || !box || typeof IntersectionObserver === "undefined") return;
    // WidgetsMultiSelectBox.tsx adjusts the action rail to the visible part
    // of the selected bounds, and switches to a row for a short intersection.
    const observer = new IntersectionObserver(([node]) => {
      if (!node) return;
      const isVisible = node.isIntersecting &&
        ((node.intersectionRect.height < POPUP_HEIGHT &&
          node.intersectionRect.height >= POPUP_WIDTH &&
          node.intersectionRect.width >= POPUP_HEIGHT) ||
         (node.intersectionRect.height >= POPUP_HEIGHT &&
          node.intersectionRect.width >= POPUP_WIDTH));
      requestAnimationFrame(() => {
        const menu = menuRef.current;
        if (!menu) return;
        if (isVisible) {
          menu.style.top = `${node.intersectionRect.top - node.boundingClientRect.top}px`;
          menu.style.left = `${node.intersectionRect.left - node.boundingClientRect.left}px`;
          menu.style.flexDirection = node.intersectionRect.height < POPUP_HEIGHT
            ? "row" : "column";
        }
        menu.style.visibility = isVisible ? "visible" : "hidden";
      });
    }, { root: null, threshold: Array(1000).fill(0).map((_, i) => i / 1000) });
    observer.observe(box);
    return () => observer.disconnect();
  }, [shouldRender, bounds]);

  if (!bounds) return null;
  const run = (event: React.MouseEvent<HTMLButtonElement>, callback: () => void) => {
    event.preventDefault();
    event.stopPropagation();
    callback();
  };
  return (
    <SelectionBox
      className="t--multi-selection-box"
      data-testid="t--selection-box"
      draggable
      key={`selection-box-${canvasId}`}
      onDragStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const box = draggableRef.current;
        if (!box) return;
        const rect = box.getBoundingClientRect();
        onGroupDragStart({
          parentId: canvasId,
          draggingGroupCenter: bounds.groupCenter,
          startPoints: {
            top: (event.clientY - rect.top) / snapRowSpace,
            left: (event.clientX - rect.left) / snapColumnSpace,
          },
        });
      }}
      onMouseMove={onFocus}
      onMouseOver={onFocus}
      ref={draggableRef}
      style={{ left: bounds.left, top: bounds.top,
        height: bounds.height, width: bounds.width }}
    >
      <BorderTop /><BorderLeft /><BorderRight /><BorderBottom />
      <Actions ref={menuRef} style={{ top: 0, left: 0 }}>
        <Action aria-label="Copy selected widgets" onClick={(event) => run(event, onCopy)} title="Copy selected widgets">
          <Icon name="duplicate" size="md" />
        </Action>
        <Action aria-label="Cut selected widgets" onClick={(event) => run(event, onCut)} title="Cut selected widgets">
          <Icon name="cut-control" size="md" />
        </Action>
        <Action aria-label="Delete selected widgets" onClick={(event) => run(event, onDelete)} title="Delete selected widgets">
          <Icon name="delete-bin-line" size="md" />
        </Action>
        <Action aria-label="Group selected widgets" onClick={(event) => run(event, onGroup)} title="Group selected widgets">
          <Icon name="group-control" size="sm" />
        </Action>
      </Actions>
    </SelectionBox>
  );
}
