import type { KeyboardEvent, PointerEvent } from "react";
import React from "react";
import styled, { css } from "styled-components";
import { Icon } from "@appsmith/ads";

/**
 * Appsmith fixed-layout editor chrome, adapted to receive interaction state as
 * props instead of reading Appsmith's global editor store.
 *
 * Styles and measurements follow:
 * app/client/src/layoutSystems/common/resizer/ResizeStyledComponents.tsx
 * app/client/src/layoutSystems/common/resizer/common.tsx
 * app/client/src/layoutSystems/common/widgetName/index.tsx
 * app/client/src/layoutSystems/common/widgetName/SettingsControl.tsx
 * app/client/src/constants/{Colors,DefaultTheme,WidgetConstants}.tsx
 *
 * The source renders resize handles as divs through react-use-gesture. These
 * are buttons so the local workbench can retain its keyboard controls while
 * using the same visible handles and pointer hit areas.
 */

export type Handle =
  | "left"
  | "top"
  | "right"
  | "bottom"
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight";

export const HANDLES: readonly Handle[] = [
  "left", "top", "right", "bottom", "topLeft", "topRight", "bottomLeft", "bottomRight",
];

const WIDGET_PADDING = 4;
const EDGE_RESIZE_HANDLE_WIDTH = 12;
const CORNER_RESIZE_HANDLE_WIDTH = 10;
const WIDGET_NAME_HEIGHT = 22;
const GREY_1 = "#FAFAFA";
const WATUSI = "#FF9B4E";
const JAFFA_DARK = "#EF7541";
const RESIZE_ORANGE = "#F86A2B";

interface ChromeStyleProps {
  $hovered: boolean;
  $disableDot: boolean;
}

// Appsmith WidgetNameComponentHeight is theme.spaces[10] (22px). Its name
// lives at the right edge and flips below a widget within the first two rows.
const NamePosition = styled.div<{ $topRow: number }>`
  position: absolute;
  display: flex;
  top: ${({ $topRow }) => $topRow > 2
    ? `${-WIDGET_NAME_HEIGHT + 1}px`
    : "calc(100% - 1px)"};
  right: 0;
  height: ${WIDGET_NAME_HEIGHT}px;
  z-index: 3;
  pointer-events: auto;
  cursor: pointer;
`;

const WidgetName = styled.span`
  width: inherit;
  overflow-x: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

// SettingsControl's name badge, with a semantic button in place of its div.
const NameButton = styled.div<{ $inverted: boolean; $selected: boolean; $hasErrors: boolean }>`
  appearance: none;
  box-sizing: border-box;
  height: 100%;
  max-width: 100%;
  padding: 0 5px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 4px;
  border: 1px solid ${GREY_1};
  ${({ $inverted }) => $inverted
    ? css`
        border-bottom-left-radius: 4px;
        border-bottom-right-radius: 4px;
        border-top: none;
      `
    : css`
        border-top-left-radius: 4px;
        border-top-right-radius: 4px;
        border-bottom: none;
      `}
  background: ${({ $selected, $hasErrors }) => $hasErrors
    ? "var(--ads-v2-color-fg-error, #b42318)"
    : $selected ? JAFFA_DARK : WATUSI};
  color: ${({ $hasErrors }) => $hasErrors
    ? "var(--ads-v2-color-bg-error, #fff)" : "#fff"};
  font: 400 12px/1.2 Inter, sans-serif;
  cursor: pointer;
  pointer-events: auto;
  touch-action: none;
  user-select: none;

  &:focus-visible { outline: 2px solid ${RESIZE_ORANGE}; outline-offset: 2px; }
`;

const HandleReset = css`
  appearance: none;
  box-sizing: border-box;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  pointer-events: auto;
  touch-action: none;
  user-select: none;

  &:focus-visible { outline: 2px solid ${RESIZE_ORANGE}; outline-offset: 2px; }
`;

// Edge indicator dimensions and offsets mirror ResizeStyledComponents.tsx.
const EdgeHandleStyles = css`
  ${HandleReset}
  position: absolute;
  width: ${EDGE_RESIZE_HANDLE_WIDTH}px;
  height: ${EDGE_RESIZE_HANDLE_WIDTH}px;

  &::before {
    position: absolute;
    background: transparent;
    content: "";
  }
`;

const VerticalResizeIndicators = css<ChromeStyleProps>`
  &::after {
    position: absolute;
    content: "";
    width: 7px;
    height: 16px;
    border-radius: 50%/16%;
    background: ${GREY_1};
    top: calc(50% - 8px);
    left: calc(50% - 2.5px);
    border: 1px solid ${({ $hovered }) => $hovered ? WATUSI : RESIZE_ORANGE};
    outline: 1px solid ${GREY_1};
  }

  &:hover::after { background: ${RESIZE_ORANGE}; }
`;

const HorizontalResizeIndicators = css<ChromeStyleProps>`
  &::after {
    position: absolute;
    content: "";
    width: 16px;
    height: 7px;
    border-radius: 16%/50%;
    border: 1px solid ${({ $hovered }) => $hovered ? WATUSI : RESIZE_ORANGE};
    background: ${GREY_1};
    top: calc(50% - 2.5px);
    left: calc(50% - 8px);
    outline: 1px solid ${GREY_1};
  }

  &:hover::after { background: ${RESIZE_ORANGE}; }
`;

const VerticalHandleStyles = css<ChromeStyleProps>`
  ${EdgeHandleStyles}
  ${({ $disableDot }) => $disableDot ? "" : VerticalResizeIndicators}
  top: -3px;
  height: calc(100% + ${2 * WIDGET_PADDING - 1}px);
  ${({ $disableDot }) => $disableDot ? "" : "cursor: col-resize;"}

  &::before { left: 50%; bottom: 0; top: 0; width: 1px; }
`;

const HorizontalHandleStyles = css<ChromeStyleProps>`
  ${EdgeHandleStyles}
  ${({ $disableDot }) => $disableDot ? "" : HorizontalResizeIndicators}
  left: -${WIDGET_PADDING}px;
  width: calc(100% + ${2 * WIDGET_PADDING}px);
  ${({ $disableDot }) => $disableDot ? "" : "cursor: row-resize;"}

  &::before { top: 50%; right: 0; left: 0; height: 1px; }
`;

const LeftHandle = styled.div<ChromeStyleProps>`
  ${VerticalHandleStyles}
  left: ${-EDGE_RESIZE_HANDLE_WIDTH / 2 - WIDGET_PADDING + 1.5}px;
`;

const RightHandle = styled.div<ChromeStyleProps>`
  ${VerticalHandleStyles}
  right: ${-EDGE_RESIZE_HANDLE_WIDTH / 2 - WIDGET_PADDING + 3.5}px;
  height: calc(100% + ${2 * WIDGET_PADDING}px);
`;

const TopHandle = styled.div<ChromeStyleProps>`
  ${HorizontalHandleStyles}
  top: ${-EDGE_RESIZE_HANDLE_WIDTH / 2 - WIDGET_PADDING + 1.5}px;
`;

const BottomHandle = styled.div<ChromeStyleProps>`
  ${HorizontalHandleStyles}
  bottom: ${-EDGE_RESIZE_HANDLE_WIDTH / 2 - WIDGET_PADDING + 3.5}px;
`;

const CornerHandleStyles = css`
  ${HandleReset}
  position: absolute;
  z-index: 3;
  width: ${CORNER_RESIZE_HANDLE_WIDTH}px;
  height: ${CORNER_RESIZE_HANDLE_WIDTH}px;
`;

const BottomRightHandle = styled.div`
  ${CornerHandleStyles}
  bottom: -${CORNER_RESIZE_HANDLE_WIDTH / 2}px;
  right: -${CORNER_RESIZE_HANDLE_WIDTH / 2}px;
  cursor: se-resize;
`;

const BottomLeftHandle = styled.div`
  ${CornerHandleStyles}
  left: -${CORNER_RESIZE_HANDLE_WIDTH / 2}px;
  bottom: -${CORNER_RESIZE_HANDLE_WIDTH / 2}px;
  cursor: sw-resize;
`;

const TopLeftHandle = styled.div`
  ${CornerHandleStyles}
  left: -${CORNER_RESIZE_HANDLE_WIDTH / 2}px;
  top: -${CORNER_RESIZE_HANDLE_WIDTH / 2}px;
  cursor: nw-resize;
`;

const TopRightHandle = styled.div`
  ${CornerHandleStyles}
  right: -${CORNER_RESIZE_HANDLE_WIDTH / 2}px;
  top: -${CORNER_RESIZE_HANDLE_WIDTH / 2}px;
  cursor: ne-resize;
`;

const HANDLE_COMPONENTS = {
  left: LeftHandle,
  top: TopHandle,
  right: RightHandle,
  bottom: BottomHandle,
  topLeft: TopLeftHandle,
  topRight: TopRightHandle,
  bottomLeft: BottomLeftHandle,
  bottomRight: BottomRightHandle,
} as const;

const HANDLE_DIRECTIONS: Partial<Record<Handle, string>> = {
  left: "LEFT",
  top: "TOP",
  right: "RIGHT",
  bottom: "BOTTOM",
};

export interface AppsmithWidgetChromeProps {
  widgetId: string;
  widgetName: string;
  topRow: number;
  selected: boolean;
  hovered: boolean;
  showName: boolean;
  canMove: boolean;
  canResize: boolean;
  disabledHandles: Set<string>;
  autoHeight: boolean;
  /** WidgetNameLayer's getErrorCount result for this widget. */
  errorCount?: number;
  onSelect: () => void;
  onMoveKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onResizePointerDown: (handle: Handle, event: PointerEvent<HTMLElement>) => void;
  onResizeKeyDown: (handle: Handle, event: KeyboardEvent<HTMLElement>) => void;
}

export function AppsmithWidgetName({
  widgetId, widgetName, topRow, selected, hovered, showName, canMove, onSelect,
  onMoveKeyDown, errorCount = 0,
}: AppsmithWidgetChromeProps): React.ReactElement | null {
  if ((!selected && !hovered) || !showName) return null;

  return (
      <NamePosition $topRow={topRow} id={`widget_name_${widgetId}`}
        data-testid="t--settings-controls-positioned-wrapper">
        <NameButton
          $inverted={topRow <= 2}
          $selected={selected}
          $hasErrors={errorCount > 0}
          aria-label={canMove ? `Move ${widgetName}` : `Select ${widgetName}`}
          className="t--widget-propertypane-toggle"
          data-error-count={errorCount > 0 ? errorCount : undefined}
          data-testid="t--widget-propertypane-toggle"
          onClick={(event) => {
            onSelect();
            event.preventDefault();
            event.stopPropagation();
          }}
          onKeyDown={canMove ? onMoveKeyDown : undefined}
          role="button"
          tabIndex={0}
          title={canMove ? "Drag to move" : "Select widget"}
        >
          {errorCount > 0 && <Icon name="warning" size="sm" />}
          <WidgetName className="t--widget-name">{widgetName}</WidgetName>
        </NameButton>
      </NamePosition>
  );
}

export function AppsmithResizeHandles({
  widgetName, selected, hovered, canResize, disabledHandles, autoHeight,
  onResizePointerDown, onResizeKeyDown,
}: AppsmithWidgetChromeProps): React.ReactElement | null {
  if ((!selected && !hovered) || !canResize) return null;

  return (
    <>
      {HANDLES.filter((handle) => !disabledHandles.has(handle)).map((handle) => {
        const ResizeHandle = HANDLE_COMPONENTS[handle];
        const disableDot = autoHeight && (handle === "top" || handle === "bottom");
        return (
          <ResizeHandle
            $hovered={hovered && !selected}
            $disableDot={disableDot}
            aria-disabled={disableDot || undefined}
            aria-label={`Resize ${widgetName} from ${handle}`}
            data-resize-handle={handle}
            data-testid={`t--resizable-handle-${HANDLE_DIRECTIONS[handle]}`}
            key={handle}
            onKeyDown={disableDot ? undefined : (event) => onResizeKeyDown(handle, event)}
            onPointerDown={disableDot ? undefined : (event) => onResizePointerDown(handle, event)}
            role="button"
            tabIndex={disableDot ? -1 : 0}
            title={`Drag ${handle} edge to resize`}
          />
        );
      })}
    </>
  );
}
