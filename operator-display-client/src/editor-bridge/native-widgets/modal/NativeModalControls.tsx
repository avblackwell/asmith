import React from "react";
import styled from "styled-components";

const ButtonSurface = styled.div<{ $primary: boolean; $color: string }>`
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 0 10px;
  border: 1px solid ${({ $primary, $color }) => $primary ? "transparent" : $color};
  border-radius: 4px;
  background: ${({ $primary, $color }) => $primary ? $color : "transparent"};
  color: ${({ $primary, $color }) => $primary ? "#FFFFFF" : $color};
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const IconSurface = styled.div<{ $color: string }>`
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: ${({ $color }) => $color};
  font-size: 24px;
  line-height: 1;
`;

function safeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && (
    /^#[\da-f]{3,8}$/i.test(value) || /^rgba?\([\d\s.,%]+\)$/i.test(value)
  ) ? value : fallback;
}

/** Static ButtonWidget surface for the Modal default blueprint. No event executes. */
export function NativeModalButtonView(props: {
  text: string;
  variant?: unknown;
  color?: unknown;
  themePrimaryColor: string;
}): React.ReactElement {
  const primary = props.variant !== "SECONDARY" && props.variant !== "TERTIARY";
  return <ButtonSurface $color={safeColor(props.color, props.themePrimaryColor)}
    $primary={primary} data-native-widget="modal-button">{props.text}</ButtonSurface>;
}

/** Static IconButtonWidget surface for the Modal default blueprint. */
export function NativeModalIconButtonView(props: {
  iconName: string;
  color?: unknown;
}): React.ReactElement {
  return <IconSurface $color={safeColor(props.color, "#858282")}
    aria-label={props.iconName === "cross" ? "Close" : props.iconName}
    data-native-widget="modal-icon-button">
    {props.iconName === "cross" ? "×" : props.iconName}
  </IconSurface>;
}
