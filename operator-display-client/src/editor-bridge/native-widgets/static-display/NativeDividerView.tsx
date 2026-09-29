import React from "react";
import type { CSSProperties } from "react";

export interface NativeDividerViewProps {
  orientation?: string;
  capType?: string;
  capSide?: number;
  strokeStyle?: string;
  dividerColor?: string;
  thickness?: number;
}

function DividerCap({
  type,
  isStart,
  isHorizontal,
  size,
  color,
}: {
  type: "dot" | "arrow";
  isStart: boolean;
  isHorizontal: boolean;
  size: number;
  color: string;
}): React.ReactElement {
  const placement: CSSProperties = isHorizontal
    ? { top: "50%", [isStart ? "left" : "right"]: 0, transform: "translateY(-50%)" }
    : { left: "50%", [isStart ? "top" : "bottom"]: 0, transform: "translateX(-50%)" };
  const rotation = isHorizontal ? (isStart ? 0 : 180) : (isStart ? 90 : 270);

  return (
    <span
      aria-hidden="true"
      className="od-native-divider__cap"
      data-cap-position={isStart ? "start" : "end"}
      style={{ ...placement, width: size, height: size }}
    >
      {type === "dot" ? (
        <svg viewBox="0 0 10 10"><circle cx="5" cy="5" fill={color} r="5" /></svg>
      ) : (
        <svg style={{ transform: `rotate(${rotation}deg)` }} viewBox="0 0 8 14">
          <path d="M7 13L1 7L7 1" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </svg>
      )}
    </span>
  );
}

/** Read-only adaptation of Appsmith's DividerComponent presentation. */
export function NativeDividerView({
  orientation = "horizontal",
  capType = "nc",
  capSide = 0,
  strokeStyle = "solid",
  dividerColor = "#858282",
  thickness = 2,
}: NativeDividerViewProps): React.ReactElement {
  const isHorizontal = orientation !== "vertical";
  const width = Number.isFinite(thickness) && thickness >= 0 ? thickness : 1;
  const lineStyle = strokeStyle === "dashed" || strokeStyle === "dotted"
    ? strokeStyle
    : "solid";
  const cap = capType === "dot" || capType === "arrow" ? capType : null;
  const showStart = Boolean(cap && capSide <= 0);
  const showEnd = Boolean(cap && capSide >= 0);
  const capSize = width * (cap === "dot" ? 3.5 : 5);
  const padding = isHorizontal
    ? { paddingLeft: showStart ? width / 2 : 0, paddingRight: showEnd ? width / 2 : 0 }
    : { paddingTop: showStart ? width / 2 : 0, paddingBottom: showEnd ? width / 2 : 0 };
  const border = `${width}px ${lineStyle} ${dividerColor}`;

  return (
    <div
      aria-orientation={isHorizontal ? "horizontal" : "vertical"}
      className="od-native-divider"
      data-native-widget="divider"
      data-orientation={isHorizontal ? "horizontal" : "vertical"}
      data-testid="native-divider"
      role="separator"
      style={padding}
    >
      <div
        className="od-native-divider__line"
        data-testid={isHorizontal ? "divider-horizontal-line" : "divider-vertical-line"}
        style={isHorizontal
          ? { width: "100%", height: 0, borderTop: border }
          : { width: 0, height: "100%", borderRight: border }}
      />
      {showStart && cap && <DividerCap color={dividerColor} isHorizontal={isHorizontal} isStart size={capSize} type={cap} />}
      {showEnd && cap && <DividerCap color={dividerColor} isHorizontal={isHorizontal} isStart={false} size={capSize} type={cap} />}
    </div>
  );
}
