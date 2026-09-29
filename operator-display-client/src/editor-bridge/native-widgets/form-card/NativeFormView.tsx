import React from "react";
import type { ReactElement, ReactNode } from "react";
import type { AppsmithWidgetDsl } from "../../../document";
import { NativeContainerView } from "../text-container/NativeContainerView";

export interface NativeFormViewProps {
  widget: AppsmithWidgetDsl;
  children?: ReactNode;
  themeBorderRadius?: string;
  themeBoxShadow?: string;
}

/** FormWidget inherits ContainerWidget's Fixed presentation. */
export function NativeFormView(props: NativeFormViewProps): ReactElement {
  const { widget } = props;
  const themeValue = (value: unknown, fallback: string) =>
    typeof value === "string" && !value.includes("{{") ? value : fallback;
  return <NativeContainerView
    backgroundColor={themeValue(widget.backgroundColor, "#FFFFFF")}
    borderColor={themeValue(widget.borderColor, "#E0DEDE")}
    borderRadius={themeValue(widget.borderRadius, props.themeBorderRadius ?? "0px")}
    borderWidth={typeof widget.borderWidth === "string" || typeof widget.borderWidth === "number"
      ? widget.borderWidth : "1"}
    boxShadow={themeValue(widget.boxShadow, props.themeBoxShadow ?? "none")}
    layoutSystemType="FIXED"
    noScroll={widget.dynamicHeight === "AUTO_HEIGHT"}
    shouldScrollContents={widget.shouldScrollContents === true}
    widgetId={widget.widgetId}
  >{props.children}</NativeContainerView>;
}
