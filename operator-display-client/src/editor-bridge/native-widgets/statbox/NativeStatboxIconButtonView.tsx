import React from "react";
import styled from "styled-components";

const IconButtonContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
`;

const StyledButton = styled.div<{
  $dimension: number;
  $buttonColor: string;
  $iconColor: string;
  $border: string;
  $borderRadius: string;
  $boxShadow: string;
}>`
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${({ $dimension }) => `${$dimension}px`};
  height: ${({ $dimension }) => `${$dimension}px`};
  min-width: 30px;
  min-height: 30px;
  background-image: none;
  background: ${({ $buttonColor }) => $buttonColor};
  border: ${({ $border }) => $border};
  border-radius: ${({ $borderRadius }) => $borderRadius};
  box-shadow: ${({ $boxShadow }) => $boxShadow};
  color: ${({ $iconColor }) => $iconColor};
  & > svg {
    width: 100%;
    height: 100%;
    min-width: 16px;
    min-height: 16px;
    fill: currentColor;
  }
`;

function safeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && (
    /^#[\da-f]{3,8}$/i.test(value) || /^rgba?\([\d\s.,%]+\)$/i.test(value)
  ) ? value : fallback;
}

function safeRadius(value: unknown, fallback: string): string {
  const radius = String(value ?? "").trim();
  return /^\d+(?:\.\d+)?(?:px|rem|em|%)?$/.test(radius) ? radius : fallback;
}

function safeShadow(value: unknown): string {
  return typeof value === "string" && /^(?:none|[\d\s.,%()a-z-]+)$/i.test(value)
    ? value : "none";
}

export interface NativeStatboxIconButtonViewProps {
  width: number;
  height: number;
  iconName: string;
  buttonColor?: unknown;
  buttonVariant?: unknown;
  borderRadius?: unknown;
  boxShadow?: unknown;
  themePrimaryColor: string;
  themeBorderRadius: string;
  themeBoxShadow: string;
  isDisabled?: boolean;
}

/**
 * Static Fixed IconButton surface for Statbox's source blueprint. It follows
 * IconButtonComponent's centered min(width,height) - 2*WIDGET_PADDING size,
 * StyledButton shape, and Blueprint's 20px arrow-top-right SVG path. There is
 * no Appsmith action executor, so this intentionally has no click handler.
 */
export function NativeStatboxIconButtonView(
  props: NativeStatboxIconButtonViewProps,
): React.ReactElement {
  const dimension = Math.max(0, Math.min(props.width, props.height) - 8);
  const color = safeColor(props.buttonColor, props.themePrimaryColor);
  const variant = props.buttonVariant === "SECONDARY" || props.buttonVariant === "TERTIARY"
    ? props.buttonVariant : "PRIMARY";
  const disabled = props.isDisabled === true;
  const background = disabled ? "#E0DEDE" : variant === "PRIMARY" ? color : "transparent";
  const foreground = disabled ? "#858282" : variant === "PRIMARY" ? "#FFFFFF" : color;
  const border = disabled || variant !== "SECONDARY" ? "none" : `1px solid ${color}`;
  const borderRadius = safeRadius(props.borderRadius, props.themeBorderRadius);
  const boxShadow = safeShadow(props.boxShadow ?? props.themeBoxShadow);
  return <IconButtonContainer data-native-widget="statbox-icon-button">
    <StyledButton
      $border={border}
      $borderRadius={borderRadius}
      $boxShadow={boxShadow}
      $buttonColor={background}
      $dimension={dimension}
      $iconColor={foreground}
      aria-label={props.iconName}
      data-icon-name={props.iconName}
    >
      {props.iconName === "arrow-top-right" ? <svg aria-hidden="true" viewBox="0 0 20 20">
        <path fillRule="evenodd" clipRule="evenodd"
          d="M17 2H7c-.55 0-1 .45-1 1s.45 1 1 1h7.59L2.29 16.29a1.003 1.003 0 0 0 1.42 1.42L16 5.41V13c0 .55.45 1 1 1s1-.45 1-1V3c0-.55-.45-1-1-1z" />
      </svg> : props.iconName}
    </StyledButton>
  </IconButtonContainer>;
}
