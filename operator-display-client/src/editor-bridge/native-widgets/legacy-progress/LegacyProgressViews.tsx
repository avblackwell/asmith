import React from "react";
import styled from "styled-components";
import { normalizeProgressProps } from "../progress";

// Read-only ports of the deprecated Appsmith ProgressBarWidget and
// CircularProgressWidget components. Both source cards are hidden from the
// palette and replaced by PROGRESS_WIDGET; saved legacy DSL still renders.
const BarWrapper = styled.div`
  display: flex;
  align-items: center;
  height: 100%;
`;
const Bar = styled.div<{ $progress: number; $fillColor: string; $borderRadius: string }>`
  flex: 1;
  height: 6px;
  background: #e8e8e8;
  position: relative;
  border-radius: ${({ $borderRadius }) => $borderRadius};
  overflow: hidden;
  &:after {
    background: ${({ $fillColor }) => $fillColor};
    width: ${({ $progress }) => $progress ? `${$progress}%` : ""};
    transition: width 0.4s ease;
    position: absolute;
    content: "";
    left: 0;
    top: 0;
    bottom: 0;
  }
`;
const BarLabel = styled.div`
  font-size: 14px;
  color: #090707;
  padding-left: 4px;
  line-height: 16px;
`;
const StepWrapper = styled.div`
  display: flex;
  flex: 1;
  height: 6px;
  position: relative;
  margin: 0 -2px;
`;
const StepContainer = styled.div`
  flex: 1;
  background: #e8e8e8;
  margin: 0 1px;
`;

export interface LegacyProgressBarProps {
  widgetId: string;
  progress?: number;
  showResult?: boolean;
  fillColor?: string;
  barType?: string;
  steps?: number;
  borderRadius?: string | number;
  themePrimaryColor?: string;
}

function stepProgress(percentage: number, stepSize: number, currentStep: number) {
  const current = percentage - stepSize * currentStep;
  if (current > stepSize) return 100;
  if (current < 0) return 0;
  return current / stepSize * 100;
}

export function LegacyProgressBarView(props: LegacyProgressBarProps): React.ReactElement {
  const normalized = normalizeProgressProps(props);
  const determinate = props.barType === "determinate" && Number.isFinite(props.steps);
  return <BarWrapper className="t--progressbar-widget" data-native-widget="legacy-progress-bar"
    data-testid={`native-progressbar-${props.widgetId}`}>
    {determinate ? <StepWrapper>{Array.from({ length: normalized.steps }, (_, index) =>
      <StepContainer key={index}><Bar
        $borderRadius={normalized.borderRadius} $fillColor={normalized.fillColor}
        $progress={stepProgress(normalized.value, 100 / normalized.steps, index)}
        data-testid={stepProgress(normalized.value, 100 / normalized.steps, index)}
      /></StepContainer>)}</StepWrapper> : <Bar
        $borderRadius={normalized.borderRadius} $fillColor={normalized.fillColor}
        $progress={normalized.value} data-testid={normalized.value}
      />}
    {props.showResult === true && <BarLabel>{normalized.value}%</BarLabel>}
  </BarWrapper>;
}

const SvgContainer = styled.svg`
  width: 100%;
  height: 100%;
  vertical-align: middle;
`;
const Trail = styled.path`
  stroke: #e8e8e8;
`;
const Path = styled.path<{ $fillColor: string }>`
  stroke: ${({ $fillColor }) => $fillColor};
  transition: stroke-dashoffset 0.5s ease 0s;
`;
const CircleLabel = styled.text`
  fill: #231f20;
  font-size: 20px;
  dominant-baseline: middle;
  text-anchor: middle;
`;

export interface LegacyCircularProgressProps {
  widgetId: string;
  progress?: number;
  counterClockwise?: boolean;
  fillColor?: string;
  showResult?: boolean;
  themePrimaryColor?: string;
}

export function LegacyCircularProgressView(props: LegacyCircularProgressProps): React.ReactElement {
  const normalized = normalizeProgressProps(props);
  const radius = 50 - 8 / 2;
  const diameter = Math.PI * 2 * radius;
  const rotation = props.counterClockwise ? 1 : 0;
  const path = `M 50,50 m 0,-${radius} a ${radius},${radius} ${rotation} 1 1 0,${2 * radius} a ${radius},${radius} ${rotation} 1 1 0,-${2 * radius}`;
  const gap = (1 - normalized.value / 100) * diameter;
  return <SvgContainer data-native-widget="legacy-circular-progress"
    data-testid="CircularProgressbar" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="50" fill="transparent" />
    <Trail d={path} fillOpacity={0} strokeWidth={8}
      style={{ strokeDasharray: `${diameter}px ${diameter}px`, strokeDashoffset: "0px" }} />
    <Path d={path} $fillColor={normalized.fillColor} fillOpacity={0} strokeWidth={8}
      style={{ strokeDasharray: `${diameter}px ${diameter}px`,
        strokeDashoffset: `${props.counterClockwise ? -gap : gap}px` }} />
    {props.showResult !== false && <CircleLabel x="50" y="50">
      {Math.round(normalized.value)}%
    </CircleLabel>}
  </SvgContainer>;
}
