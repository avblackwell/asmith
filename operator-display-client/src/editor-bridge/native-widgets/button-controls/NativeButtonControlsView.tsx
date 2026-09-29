import React from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import styled from "styled-components";
import { BlueprintIcon } from "./BlueprintIcon";
import {
  buttonSurface,
  buttonVariant,
  getVisibleGroupButtons,
  safeButtonColor,
  safeButtonRadius,
  safeButtonShadow,
} from "./buttonControlsModel";
import type { ButtonControlWidget, ButtonVariant, GroupButton } from "./buttonControlsModel";

// ButtonWidget/component/index.tsx BaseButton and
// IconButtonWidget/component/index.tsx IconButtonContainer.
const Host = styled.div`
  width: 100%; height: 100%; display: flex; box-sizing: border-box;
  align-items: center; justify-content: center;
`;
const Button = styled.button`
  box-sizing: border-box; display: flex; align-items: center; width: 100%; height: 100%;
  background-image: none; outline: none; padding: 0 10px; gap: 8px;
  font-family: var(--ads-font-family, Inter, Arial, sans-serif); font-size: 14px;
  font-weight: 500; overflow: hidden;
  & > span { display: inline-block; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; }
  & > svg { flex: 0 0 16px; }
  &[data-source-disabled="true"] { background: var(--wds-color-bg-disabled, #e0dede) !important;
    border-color: var(--wds-color-border-disabled, #d0cece) !important;
    color: var(--wds-color-text-disabled, #858282) !important; box-shadow: none !important; }
  &[data-action-unavailable="true"] { cursor: not-allowed; }
`;
const IconButtonHost = styled(Host)`
  position: relative;
`;
const IconButtonSurface = styled(Button)`
  min-width: 30px; min-height: 30px; padding: 0;
  justify-content: center; flex: 0 0 auto;
  & > svg { width: 16px; height: 16px; flex: none; }
`;
// ButtonGroupWidget/component/index.tsx ButtonGroupWrapper and StyledButton.
const Group = styled.div<{ $horizontal: boolean; $primary: boolean; $radius: string }>`
  height: 100%; width: 100%; position: relative; display: flex;
  justify-content: stretch; align-items: stretch; overflow: hidden;
  flex-direction: ${({ $horizontal }) => $horizontal ? "row" : "column"};
  gap: ${({ $primary }) => $primary ? "1px" : "0px"};
  border-radius: ${({ $radius }) => $radius};
  & > button { flex: 1 1 auto; min-width: 0; min-height: 0; }
  & > button:first-child { border-radius: ${({ $horizontal, $radius }) => $horizontal
    ? `${$radius} 0 0 ${$radius}` : `${$radius} ${$radius} 0 0`}; }
  & > button:last-child { border-radius: ${({ $horizontal, $radius }) => $horizontal
    ? `0 ${$radius} ${$radius} 0` : `0 0 ${$radius} ${$radius}`}; }
`;

export interface NativeButtonControlsViewProps {
  widget: ButtonControlWidget;
  width: number;
  height: number;
  mode?: "editor" | "viewer";
  themePrimaryColor?: string;
  themeBorderRadius?: string;
  themeBoxShadow?: string;
}

function safeFontSize(value: unknown): string | undefined {
  return typeof value === "string" && /^(?:\d+(?:\.\d+)?(?:px|rem|em|%)|inherit)$/i.test(value.trim())
    ? value.trim() : undefined;
}

function unavailableAction(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function justify(placement: unknown): CSSProperties["justifyContent"] {
  return placement === "START" ? "flex-start" : placement === "BETWEEN" ? "space-between" : "center";
}

function buttonIconAndText(iconName: string | undefined, text: string, iconAlign: unknown): ReactNode {
  const icon = iconName ? <BlueprintIcon name={iconName} /> : null;
  return iconAlign === "right" ? <>{text && <span>{text}</span>}{icon}</> : <>{icon}{text && <span>{text}</span>}</>;
}

function surfaceStyle(
  variant: ButtonVariant,
  color: string,
  radius: string,
  shadow: string,
  placement: unknown,
): CSSProperties {
  const surface = buttonSurface(variant, color);
  return {
    background: surface.background,
    color: surface.foreground,
    border: surface.border,
    borderRadius: radius,
    boxShadow: shadow,
    justifyContent: justify(placement),
  };
}

function TextButton({ widget, primary, radius, shadow }: {
  widget: ButtonControlWidget; primary: string; radius: string; shadow: string;
}): ReactElement {
  const variant = buttonVariant(widget.buttonVariant);
  const color = safeButtonColor(widget.buttonColor, primary);
  const disabledByForm = widget.disabledWhenInvalid === true && widget.isFormValid === false;
  const sourceDisabled = widget.isDisabled === true || disabledByForm || widget.isLoading === true;
  const actionUnavailable = unavailableAction(widget.onClick) || widget.googleRecaptchaKey != null;
  const label = typeof widget.text === "string" ? widget.text : "Submit";
  const iconName = typeof widget.iconName === "string" ? widget.iconName : undefined;
  const tooltip = typeof widget.tooltip === "string" ? widget.tooltip : undefined;
  const style = surfaceStyle(variant, color, radius, shadow, widget.placement);
  const labelColor = safeButtonColor(widget.labelTextColor, style.color || "#fff");
  const labelStyle = typeof widget.labelStyle === "string" ? widget.labelStyle : "";
  return <Host data-native-button-control="button" data-testid={`native-button-${widget.widgetId}`}>
    <Button aria-label={label} data-action-unavailable={actionUnavailable} data-source-disabled={sourceDisabled}
      disabled={sourceDisabled || actionUnavailable} style={{
        ...style,
        fontSize: safeFontSize(widget.labelTextSize) || "inherit",
        fontStyle: labelStyle.includes("ITALIC") ? "italic" : "normal",
        fontWeight: labelStyle.includes("BOLD") ? 700 : 500,
      }} title={actionUnavailable ? "Button action is not connected" : tooltip} type="button">
      {widget.isLoading === true ? <span>Loading…</span> : <span style={{ display: "flex", alignItems: "center", gap: 8,
        color: labelColor, flexDirection: widget.iconAlign === "right" ? "row-reverse" : "row" }}>
        {iconName && <BlueprintIcon name={iconName} />}{label}
      </span>}
    </Button>
  </Host>;
}

function IconOnlyButton({ widget, width, height, primary, radius, shadow }: {
  widget: ButtonControlWidget; width: number; height: number; primary: string; radius: string; shadow: string;
}): ReactElement {
  const variant = buttonVariant(widget.buttonVariant);
  const color = safeButtonColor(widget.buttonColor, primary);
  const sourceDisabled = widget.isDisabled === true;
  const actionUnavailable = unavailableAction(widget.onClick);
  const iconName = typeof widget.iconName === "string" ? widget.iconName : "plus";
  // Appsmith subtracts WIDGET_PADDING on both sides (4px each) and centers
  // the resulting square inside the Fixed widget frame.
  const dimension = Math.max(0, Math.min(width, height) - 8);
  return <IconButtonHost data-native-button-control="icon-button" data-testid={`native-icon-button-${widget.widgetId}`}>
    <IconButtonSurface aria-label={iconName} data-action-unavailable={actionUnavailable}
      data-source-disabled={sourceDisabled} disabled={sourceDisabled || actionUnavailable}
      style={{ ...surfaceStyle(variant, color, radius, shadow, "CENTER"),
        width: dimension, height: dimension }}
      title={actionUnavailable ? "Icon button action is not connected" : typeof widget.tooltip === "string" ? widget.tooltip : undefined}
      type="button"><BlueprintIcon name={iconName} /></IconButtonSurface>
  </IconButtonHost>;
}

function GroupButton({ button, group, primary, radius, shadow }: {
  button: GroupButton; group: ButtonControlWidget; primary: string; radius: string; shadow: string;
}): ReactElement {
  const variant = buttonVariant(group.buttonVariant);
  const color = safeButtonColor(button.buttonColor, primary);
  const sourceDisabled = button.isDisabled || group.isDisabled === true ||
    (button.disabledWhenInvalid && group.isFormValid === false);
  const actionUnavailable = button.buttonType === "MENU" || unavailableAction(button.onClick);
  return <Button aria-label={button.label || button.iconName || button.id}
    data-action-unavailable={actionUnavailable} data-group-button-id={button.id}
    data-group-button-type={button.buttonType} data-source-disabled={sourceDisabled}
    disabled={sourceDisabled || actionUnavailable}
    style={surfaceStyle(variant, color, radius, shadow, button.placement)}
    title={actionUnavailable ? button.buttonType === "MENU" ? "Button menu is not connected" : "Button action is not connected" : undefined}
    type="button">
    {buttonIconAndText(button.iconName, button.label, button.iconAlign)}
  </Button>;
}

function ButtonGroup({ widget, primary, radius, shadow }: {
  widget: ButtonControlWidget; primary: string; radius: string; shadow: string;
}): ReactElement {
  const buttons = getVisibleGroupButtons(widget);
  return <Group $horizontal={widget.orientation !== "vertical"} $primary={buttonVariant(widget.buttonVariant) === "PRIMARY"}
    $radius={radius} className="t--buttongroup-widget" data-native-button-control="button-group"
    data-testid={`native-button-group-${widget.widgetId}`} style={{ boxShadow: shadow }}>
    {buttons.map((button) => <GroupButton button={button} group={widget} key={button.id}
      primary={primary} radius={radius} shadow="none" />)}
  </Group>;
}

export function NativeButtonControlsView({ widget, width, height, themePrimaryColor,
  themeBorderRadius, themeBoxShadow }: NativeButtonControlsViewProps): ReactElement | null {
  const primary = safeButtonColor(themePrimaryColor, "#03B365");
  const radius = safeButtonRadius(widget.borderRadius, safeButtonRadius(themeBorderRadius, "0px"));
  const shadow = safeButtonShadow(widget.boxShadow ?? themeBoxShadow);
  switch (widget.type) {
    case "BUTTON_WIDGET": return <TextButton widget={widget} primary={primary} radius={radius} shadow={shadow} />;
    case "ICON_BUTTON_WIDGET": return <IconOnlyButton widget={widget} width={width} height={height}
      primary={primary} radius={radius} shadow={shadow} />;
    case "BUTTON_GROUP_WIDGET": return <ButtonGroup widget={widget} primary={primary} radius={radius} shadow={shadow} />;
    default: return null;
  }
}
