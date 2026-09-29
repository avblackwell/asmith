import React from "react";
import type { ReactNode } from "react";
import styled from "styled-components";

/** Appsmith's WidgetStyleContainer presentation layer (Apache-2.0). */
export interface WidgetStyleContainerProps {
  widgetId: string;
  children?: ReactNode;
  borderColor?: string;
  backgroundColor?: string;
  borderWidth?: number | string;
  borderRadius?: number | string;
  boxShadow?: string;
  className?: string;
  selected?: boolean;
}

const WidgetStyle = styled.div<WidgetStyleContainerProps>`
  height: 100%;
  width: 100%;
  border-radius: ${({ borderRadius }) => borderRadius};
  box-shadow: ${(props) => props.boxShadow} !important;
  border-width: ${(props) => props.borderWidth || 0}px;
  border-color: ${(props) => props.borderColor || "transparent"};
  outline: ${(props) =>
    props.selected
      ? `${props.borderWidth || 1}px solid #3b82f6 !important`
      : ""};
  border-style: solid;
  background-color: ${(props) => props.backgroundColor || "transparent"};
  display: block;
  overflow: hidden;

  & > div {
    height: 100%;
    width: 100%;
  }
`;

export function WidgetStyleContainer(props: WidgetStyleContainerProps): React.ReactElement {
  return (
    <WidgetStyle {...props} data-testid={`container-wrapper-${props.widgetId}`}>
      {props.children}
    </WidgetStyle>
  );
}
