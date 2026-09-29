import React from "react";
import styled, { css } from "styled-components";
import { Alignment } from "@blueprintjs/core";
import type { LabelPosition } from "./rteTypes";

// The layout branch matches Appsmith widgets/components/LabelWithTooltip.tsx.
export const LABEL_CONTAINER_CLASS = "label-container";
export const labelLayoutStyles = css<{ compactMode: boolean; labelPosition?: LabelPosition }>`
  display: flex;
  flex-direction: ${({ compactMode, labelPosition }) =>
    labelPosition === "Left" ? "row" : labelPosition === "Top" ? "column" : compactMode ? "row" : "column"};
  align-items: ${({ compactMode, labelPosition }) =>
    labelPosition === "Top" ? "flex-start" : compactMode ? "center" : "flex-start"};
  justify-content: flex-start;
`;

interface LabelProps {
  alignment?: Alignment;
  className?: string;
  color?: string;
  compact: boolean;
  disabled?: boolean;
  fontSize?: string;
  fontStyle?: string;
  helpText?: string;
  isDynamicHeightEnabled?: boolean;
  position?: LabelPosition;
  text: string;
  width?: number;
}

const LabelContainer = styled.div<{ $side: boolean; $width?: number }>`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  width: ${({ $side, $width }) => $side ? ($width ? `${$width}px` : "33%") : "100%"};
  max-width: ${({ $side }) => $side ? "70%" : "100%"};
  margin-right: ${({ $side }) => $side ? "5px" : "0"};
`;

export default function RteLabelWithTooltip(props: LabelProps): React.ReactElement {
  const side = props.position === "Left" || (props.position === "Auto" && props.compact);
  return <LabelContainer $side={side} $width={props.width}
    className={`${LABEL_CONTAINER_CLASS} ${props.className || ""}`}
    data-testid={LABEL_CONTAINER_CLASS} title={props.helpText || props.text}>
    <label style={{ color: props.disabled ? "#6b7280" : props.color || "inherit",
      fontSize: props.fontSize || "inherit",
      fontWeight: props.fontStyle?.includes("BOLD") ? 700 : undefined,
      fontStyle: props.fontStyle?.includes("ITALIC") ? "italic" : undefined,
      textAlign: props.alignment === Alignment.RIGHT ? "right" : "left",
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: props.isDynamicHeightEnabled ? "normal" : "nowrap" }}>
      {props.text}
    </label>
    {props.helpText && <span aria-label={props.helpText} title={props.helpText} style={{ marginLeft: 5, cursor: "help" }}>ⓘ</span>}
  </LabelContainer>;
}
