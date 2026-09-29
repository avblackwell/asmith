import React, { useEffect, useRef } from "react";
import type { MouseEventHandler, ReactElement, ReactNode } from "react";
import styled from "styled-components";
import { WidgetStyleContainer } from "./WidgetStyleContainer";

/**
 * Read-only adaptation of Appsmith ContainerWidget/component (Apache-2.0).
 * Layout mode is explicit, removing its Redux selector and editor effects.
 */
export interface NativeContainerViewProps {
  widgetId: string;
  children?: ReactNode;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number | string;
  borderRadius?: number | string;
  boxShadow?: string;
  selected?: boolean;
  detachFromLayout?: boolean;
  shouldScrollContents?: boolean;
  noScroll?: boolean;
  layoutSystemType?: "FIXED" | "AUTO" | "ANVIL";
  isListItemContainer?: boolean;
  onClick?: MouseEventHandler<HTMLDivElement>;
  onClickCapture?: MouseEventHandler<HTMLDivElement>;
}

interface ContainerSurfaceStyle {
  $shouldScrollContents: boolean;
  $noScroll: boolean;
  $backgroundColor?: string;
}

const ContainerSurface = styled.div<ContainerSurfaceStyle>`
  position: relative;
  height: 100%;
  width: 100%;
  overflow: hidden;
  outline: none;
  background: ${(props) => props.$backgroundColor};
  ${(props) => props.$shouldScrollContents && !props.$noScroll && `
    position: relative;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-color: #cccccc transparent;
    scrollbar-width: thin;
    &::-webkit-scrollbar-thumb { background: #cccccc !important; }
    &::-webkit-scrollbar-track { background: transparent !important; }
  `}
`;

export function NativeContainerView(props: NativeContainerViewProps): ReactElement {
  const {
    backgroundColor,
    borderColor,
    borderRadius,
    borderWidth,
    boxShadow,
    children,
    detachFromLayout = false,
    isListItemContainer = false,
    layoutSystemType = "FIXED",
    noScroll = false,
    onClick,
    onClickCapture,
    selected = false,
    shouldScrollContents = false,
    widgetId,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollEnabled = shouldScrollContents &&
    (layoutSystemType === "FIXED" || (!detachFromLayout && isListItemContainer));

  useEffect(() => {
    if (!scrollEnabled && containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [scrollEnabled]);

  const surface = (
    <ContainerSurface
      $backgroundColor={backgroundColor}
      $noScroll={noScroll}
      $shouldScrollContents={scrollEnabled}
      className={[
        scrollEnabled ? "canvas" : "",
        `appsmith_widget_${widgetId}`,
        "container-with-scrollbar",
        layoutSystemType === "AUTO" && widgetId === "0" ? "auto-layout" : "",
      ].filter(Boolean).join(" ")}
      data-widgetid={widgetId}
      data-native-widget="container"
      data-testid={`native-container-${widgetId}`}
      onClick={onClick}
      onClickCapture={onClickCapture}
      ref={containerRef}
    >
      {children}
    </ContainerSurface>
  );

  if (detachFromLayout) return surface;

  return (
    <WidgetStyleContainer
      backgroundColor={backgroundColor}
      borderColor={borderColor}
      borderRadius={borderRadius}
      borderWidth={borderWidth}
      boxShadow={boxShadow}
      className="style-container"
      selected={selected}
      widgetId={widgetId}
    >
      {surface}
    </WidgetStyleContainer>
  );
}
