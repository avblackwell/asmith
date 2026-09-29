import React, { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import styled from "styled-components";
import { modalIsVisible, modalRenderMetrics, type ModalRenderMetrics } from "./modalModel";
import { NativeModalResizable } from "./NativeModalResizable";

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Backdrop = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
`;

const Panel = styled.div<{ $width: number; $height: number; $editMode: boolean }>`
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  width: ${({ $width }) => `${$width}px`};
  height: ${({ $height }) => `${$height}px`};
  max-height: ${({ $editMode }) => $editMode ? "85%" : "95%"};
  outline: none;
`;

const Wrapper = styled.div<{ $background: string; $borderRadius: string }>`
  overflow: hidden;
  width: 100%;
  height: 100%;
  background: ${({ $background }) => $background};
  border-radius: ${({ $borderRadius }) => $borderRadius};
`;

const Content = styled.div<{ $scroll: boolean }>`
  position: relative;
  overflow-x: hidden;
  overflow-y: ${({ $scroll }) => $scroll ? "auto" : "hidden"};
  width: 100%;
  height: 100%;
  scrollbar-color: #cccccc transparent;
  scrollbar-width: thin;
  &::-webkit-scrollbar-thumb { background: #cccccc; }
  &::-webkit-scrollbar-track { background: transparent; }
`;

function safeColor(value: unknown): string {
  if (typeof value !== "string") return "#FFFFFF";
  const color = value.trim();
  return /^#[\da-f]{3,8}$/i.test(color) ||
    /^rgba?\([\d\s.,%]+\)$/i.test(color) ||
    /^[a-z]+$/i.test(color) ? color : "#FFFFFF";
}

function safeRadius(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "0px";
  const radius = String(value).trim();
  return /^\d+(?:\.\d+)?(?:px|rem|em|%)?$/.test(radius) ? radius : "0px";
}

export type ModalCloseReason = "escape" | "outside";

export interface NativeModalViewProps {
  widgetId: string;
  widgetName: string;
  canvasWidgetId: string;
  renderCanvas: (canvasWidgetId: string, metrics: ModalRenderMetrics) => ReactNode;
  mainCanvasWidthPx: number;
  widthPx: number;
  heightPx: number;
  isVisible?: boolean;
  selectedWidgetAncestry?: readonly string[];
  isEditMode?: boolean;
  canEscapeKeyClose?: boolean;
  canOutsideClickClose?: boolean;
  shouldScrollContents?: boolean;
  backgroundColor?: string;
  borderRadius?: string | number;
  themeBorderRadius?: string | number;
  onRequestClose?: (reason: ModalCloseReason) => void;
  onSelect?: () => void;
  autoHeight?: boolean;
  disabledResizeHandles?: readonly string[];
  onResize?: (widgetId: string, canvasWidgetId: string,
    dimensions: { width: number; height: number }) => void;
  onResizeStart?: (widgetId: string) => void;
  onResizeEnd?: (widgetId: string) => void;
}

/** ModalOverlayLayer + ModalComponent without Appsmith's action/backend graph. */
export function NativeModalView(props: NativeModalViewProps): React.ReactElement | null {
  const contentRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const backdropPointerDownRef = useRef(false);
  const [viewportBounds, setViewportBounds] = useState<{
    top: number; left: number; width: number; height: number;
  } | null>(null);
  const isOpen = modalIsVisible(props.widgetId, props.isVisible,
    props.selectedWidgetAncestry);
  const metrics = modalRenderMetrics({
    requestedWidthPx: props.widthPx,
    requestedHeightPx: props.heightPx,
    mainCanvasWidthPx: props.mainCanvasWidthPx,
    shouldScrollContents: props.shouldScrollContents === true,
  });

  useEffect(() => {
    if (!isOpen) return;
    // ModalOverlayLayer in Appsmith excludes the IDE sidebar from the overlay.
    // This extracted shell has a distinct canvas viewport and property pane;
    // bound the backdrop to that viewport so its palette and controls remain
    // interactive while the Modal is being edited.
    const viewport = overlayRef.current?.closest<HTMLElement>(".od-workbench__viewport");
    const refresh = () => {
      const rect = viewport?.getBoundingClientRect();
      const next = rect ? { top: rect.top, left: rect.left,
        width: rect.width, height: rect.height } : {
        top: 0, left: 0, width: window.innerWidth, height: window.innerHeight,
      };
      setViewportBounds((previous) => previous &&
        previous.top === next.top && previous.left === next.left &&
        previous.width === next.width && previous.height === next.height
        ? previous : next);
    };
    refresh();
    const observer = viewport && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(refresh) : null;
    if (viewport) observer?.observe(viewport);
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !props.canEscapeKeyClose || !props.onRequestClose) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      props.onRequestClose?.("escape");
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, props.canEscapeKeyClose, props.onRequestClose]);

  useEffect(() => {
    if (!isOpen) return;
    let releaseTimer: number | undefined;
    const clearOrigin = () => {
      // The backdrop click follows pointerup in the same event turn. Preserve
      // its origin until then, and clear a press released on another element.
      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => {
        backdropPointerDownRef.current = false;
      }, 0);
    };
    const cancelOrigin = () => {
      window.clearTimeout(releaseTimer);
      backdropPointerDownRef.current = false;
    };
    window.addEventListener("pointerup", clearOrigin, true);
    window.addEventListener("pointercancel", cancelOrigin, true);
    window.addEventListener("blur", cancelOrigin);
    return () => {
      window.removeEventListener("pointerup", clearOrigin, true);
      window.removeEventListener("pointercancel", cancelOrigin, true);
      window.removeEventListener("blur", cancelOrigin);
      window.clearTimeout(releaseTimer);
      backdropPointerDownRef.current = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!props.shouldScrollContents) contentRef.current?.scrollTo({ top: 0,
      behavior: "smooth" });
  }, [props.shouldScrollContents]);

  if (!isOpen) return null;

  const panelContent = (
    <Wrapper
      $background={safeColor(props.backgroundColor)}
      $borderRadius={safeRadius(props.borderRadius ?? props.themeBorderRadius)}
      data-testid="modal-wrapper"
    >
      <Content
        $scroll={props.shouldScrollContents === true}
        className={`t--modal-widget scroll-parent${props.shouldScrollContents ? " canvas" : ""}`}
        id={props.widgetId}
        onClick={(event) => {
          event.stopPropagation();
          props.onSelect?.();
        }}
        ref={contentRef}
        tabIndex={0}
      >
        {metrics.widthPx > 0 && metrics.heightPx > 0
          ? props.renderCanvas(props.canvasWidgetId, metrics) : null}
      </Content>
    </Wrapper>
  );

  return (
    <Overlay data-native-widget="modal" data-testid={`native-modal-${props.widgetId}`}
      onClick={(event) => event.stopPropagation()}
      ref={overlayRef} style={viewportBounds ?? { visibility: "hidden" }}>
      <Backdrop
        aria-hidden="true"
        data-modal-backdrop="true"
        onPointerDown={() => { backdropPointerDownRef.current = true; }}
        onPointerCancel={() => { backdropPointerDownRef.current = false; }}
        onClick={() => {
          // Blueprint Overlay closes only when the outside click begins on its
          // backdrop. ModalResizable temporarily disables panel pointer events
          // while dragging, so a handle release can otherwise look like an
          // outside click to this extracted overlay.
          const beganOutside = backdropPointerDownRef.current;
          backdropPointerDownRef.current = false;
          if (beganOutside && props.canOutsideClickClose && props.onRequestClose) {
            props.onRequestClose("outside");
          }
        }}
      />
      {props.isEditMode && props.onResize ? <NativeModalResizable
        autoHeight={props.autoHeight === true}
        canvasWidgetId={props.canvasWidgetId}
        disabledResizeHandles={props.disabledResizeHandles}
        height={metrics.heightPx}
        mainCanvasWidth={props.mainCanvasWidthPx}
        onResize={props.onResize}
        onResizeStart={props.onResizeStart}
        onResizeEnd={props.onResizeEnd}
        onSelect={props.onSelect}
        widgetId={props.widgetId}
        widgetName={props.widgetName}
        width={metrics.widthPx}
      >
        {panelContent}
      </NativeModalResizable> : <Panel
        $editMode={props.isEditMode === true}
        $height={metrics.heightPx}
        $width={metrics.widthPx}
        aria-label={props.widgetName}
        aria-modal={props.isEditMode ? undefined : "true"}
        data-widget-id={props.widgetId}
        data-widget-name={props.widgetName}
        onClick={props.onSelect ? (event) => {
          event.stopPropagation();
          props.onSelect?.();
        } : undefined}
        role="dialog"
      >
        {panelContent}
      </Panel>}
    </Overlay>
  );
}
