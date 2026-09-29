import React from "react";
import AppsmithProgressComponent from "./AppsmithProgressComponent";
import { ProgressType, ProgressVariant } from "./constants";

const APP_SMITH_GREEN = "#03B365";
const DEFAULT_PROGRESS = 50;

export interface NativeProgressViewProps {
  widgetId: string;
  widgetName?: string;
  progress?: number;
  progressType?: string;
  steps?: number;
  isIndeterminate?: boolean;
  showResult?: boolean;
  counterClockwise?: boolean;
  fillColor?: string;
  borderRadius?: string | number;
  themePrimaryColor?: string;
  dimensions?: { width: number; height: number };
}

export interface NormalizedProgressProps {
  value: number;
  type: ProgressType;
  variant: ProgressVariant;
  steps: number;
  showResult: boolean;
  counterClockwise: boolean;
  fillColor: string;
  borderRadius: string;
  isScaleY: boolean;
}

function safeColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const color = value.trim();

  if (/^#[a-f\d]{3,4}(?:[a-f\d]{3,4})?$/i.test(color)) return color;
  if (/^rgba?\([\d\s.,%]+\)$/i.test(color)) return color;
  if (/^hsla?\([\d\s.,%]+\)$/i.test(color)) return color;
  if (/^[a-z]+$/i.test(color)) return color;

  return null;
}

function safeBorderRadius(value: unknown): string {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 && value <= 1000
      ? `${value}px`
      : "0px";
  }
  if (typeof value !== "string") return "0px";

  const match = /^(\d+(?:\.\d+)?)(px|rem|em|%)$/.exec(value.trim());
  if (!match || Number(match[1]) > 1000) return "0px";
  return value.trim();
}

/** Resolve Appsmith's saved ProgressWidget values before rendering its component. */
export function normalizeProgressProps(
  props: Omit<NativeProgressViewProps, "widgetId" | "widgetName">,
): NormalizedProgressProps {
  const rawValue = props.progress;
  const value = Number.isFinite(rawValue)
    ? Math.min(100, Math.max(0, rawValue as number))
    : DEFAULT_PROGRESS;
  const rawSteps = props.steps;
  const steps = Number.isFinite(rawSteps)
    ? Math.min(100, Math.max(1, Math.trunc(rawSteps as number)))
    : 1;
  const themeColor = safeColor(props.themePrimaryColor);
  const requestedColor = props.fillColor === "{{appsmith.theme.colors.primaryColor}}"
    ? themeColor
    : safeColor(props.fillColor);

  return {
    value,
    type: props.progressType === ProgressType.CIRCULAR
      ? ProgressType.CIRCULAR
      : ProgressType.LINEAR,
    variant: props.isIndeterminate === true
      ? ProgressVariant.INDETERMINATE
      : ProgressVariant.DETERMINATE,
    steps,
    showResult: props.showResult === true,
    counterClockwise: props.counterClockwise === true,
    fillColor: requestedColor ?? themeColor ?? APP_SMITH_GREEN,
    borderRadius: safeBorderRadius(props.borderRadius),
    isScaleY: (props.dimensions?.height ?? 0) > (props.dimensions?.width ?? 0),
  };
}

/** Static, read-only Appsmith ProgressWidget presentation. No action executor is mounted. */
export function NativeProgressView(props: NativeProgressViewProps): React.ReactElement {
  const normalized = normalizeProgressProps(props);

  return (
    <div
      aria-label={props.widgetName || "Progress"}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={normalized.variant === ProgressVariant.DETERMINATE
        ? normalized.value
        : undefined}
      data-native-widget="progress"
      data-progress-type={normalized.type}
      data-testid={`native-progress-${props.widgetId}`}
      role="progressbar"
      style={{ width: "100%", height: "100%" }}
    >
      <AppsmithProgressComponent {...normalized} />
    </div>
  );
}
