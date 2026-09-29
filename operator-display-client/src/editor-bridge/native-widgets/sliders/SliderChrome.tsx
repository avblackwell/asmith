import React from "react";
import styled from "styled-components";
import { getPosition, isMarkedFilled, SLIDER_THUMB_SIZES, SLIDER_TRACK_SIZES } from "./sliderModel";
import type { SliderMark, SliderSize } from "./sliderModel";

export interface SliderChromeProps {
  min: number;
  max: number;
  values: readonly number[];
  size: SliderSize;
  color: string;
  disabled: boolean;
  active: boolean;
  marks?: readonly SliderMark[];
  showMarksLabel: boolean;
  tooltipAlwaysOn?: boolean;
  labelText?: string;
  labelPosition?: string;
  labelTextColor?: string;
  labelTextSize?: string;
  labelStyle?: string;
  labelTooltip?: string;
  onThumbFocus?: (index: number) => void;
  onThumbMouseDown?: (index: number, event: React.MouseEvent<HTMLDivElement>) => void;
  onThumbKeyDown?: (index: number, event: React.KeyboardEvent<HTMLDivElement>) => void;
  tooltipFor: (value: number) => string;
  inputName: string;
  rootRef: React.Ref<HTMLDivElement>;
}

const Container = styled.div<{ leftLabel: boolean }>(({ leftLabel }) => ({
  display: "flex", flexDirection: leftLabel ? "row" : "column", alignItems: leftLabel ? "center" : "stretch",
  paddingLeft: leftLabel ? 0 : "0.4rem", paddingRight: "0.4rem", height: "100%", width: "100%",
}));
const TrackRoot = styled.div<{ disabled: boolean; size: SliderSize; topLabel: boolean }>(
  ({ disabled, size, topLabel }) => ({
    WebkitTapHighlightColor: "transparent", outline: 0, height: `${SLIDER_TRACK_SIZES[size] * 2}px`,
    display: "flex", alignItems: topLabel ? "flex-end" : "center", marginBottom: topLabel ? "1.5rem" : 0,
    flex: 1, width: "100%", cursor: disabled ? "not-allowed" : "pointer", minWidth: 0,
  }),
);
const Track = styled.div<{ size: SliderSize; trackColor: string }>(({ size, trackColor }) => ({
  position: "relative", height: `${SLIDER_TRACK_SIZES[size]}px`, width: "100%",
  marginRight: `${SLIDER_TRACK_SIZES[size]}px`, marginLeft: `${SLIDER_TRACK_SIZES[size]}px`,
  "&::before": {
    content: '""', position: "absolute", top: 0, bottom: 0, borderRadius: "16px",
    right: `${-SLIDER_TRACK_SIZES[size]}px`, left: `${-SLIDER_TRACK_SIZES[size]}px`,
    backgroundColor: trackColor, zIndex: 0,
  },
}));
const Thumb = styled.div<{ position: number; size: SliderSize; thumbColor: string; disabled: boolean }>(
  ({ position, size, thumbColor, disabled }) => ({
    boxSizing: "border-box", position: "absolute", display: "flex", height: SLIDER_THUMB_SIZES[size],
    width: SLIDER_THUMB_SIZES[size], backgroundColor: thumbColor, border: `4px solid ${thumbColor}`,
    top: "50%", left: `${position}%`, transform: "translate(-50%, -50%)", zIndex: 3,
    cursor: disabled ? "not-allowed" : "pointer", borderRadius: 1000, alignItems: "center",
    justifyContent: "center", transition: "box-shadow 100ms ease, transform 100ms ease", userSelect: "none",
  }),
);

export function SliderChrome(props: SliderChromeProps): React.ReactElement {
  const {
    min, max, values, size, color, disabled, active, marks, showMarksLabel,
    tooltipAlwaysOn, labelText, labelPosition, labelTextColor, labelTextSize,
    labelStyle, labelTooltip, onThumbFocus, onThumbMouseDown, onThumbKeyDown,
    tooltipFor, inputName, rootRef,
  } = props;
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(-1);
  const positions = values.map((value) => getPosition({ value, min, max }));
  const from = values.length > 1 ? positions[0] : 0;
  const to = positions[positions.length - 1] ?? 0;
  const barColor = disabled ? "#A9A7A7" : color;
  const trackColor = !disabled && (active || hovered) ? "#B3B3B3" : "#E0DEDE";
  const markLabelColor = disabled ? "#A9A7A7" : "#4B4848";

  return <Container data-native-slider-root leftLabel={labelPosition === "Left"}>
    {labelText && <label title={labelTooltip} style={{
      color: labelTextColor, fontSize: labelTextSize || "0.875rem",
      fontWeight: labelStyle === "BOLD" ? "bold" : undefined,
      fontStyle: labelStyle === "ITALIC" ? "italic" : undefined,
      marginBottom: labelPosition === "Left" ? 0 : 8,
    }}>{labelText}</label>}
    <TrackRoot data-slider-root disabled={disabled} ref={rootRef} size={size} tabIndex={-1} topLabel={labelPosition === "Top"}>
      <Track data-slider-track onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} size={size} trackColor={trackColor}>
        <div data-slider-bar style={{
          backgroundColor: barColor, borderRadius: 16, position: "absolute", zIndex: 1,
          left: `calc(${from}% - ${SLIDER_TRACK_SIZES[size]}px)`,
          width: `calc(${to - from}% + ${SLIDER_TRACK_SIZES[size]}px)`, top: 0, bottom: 0,
        }} />
        {marks?.map((mark, index) => {
          if (mark.value < min || mark.value > max) return null;
          const position = getPosition({ value: mark.value, min, max });
          return <div data-slider-mark={mark.value} key={`${mark.value}-${index}`} style={{
            position: "absolute", left: `${position}%`, top: 0, zIndex: 2, pointerEvents: "none",
          }}>
            <div style={{
              backgroundColor: "white", border: `${SLIDER_TRACK_SIZES[size] >= 8 ? 2 : 1}px solid ${
                isMarkedFilled({ mark, offset: values.length > 1 ? values[0] : undefined, value: values[values.length - 1] })
                  ? barColor : trackColor}`, borderRadius: 1000, height: SLIDER_TRACK_SIZES[size],
              width: SLIDER_TRACK_SIZES[size], transform: "translateX(-4px)",
            }} />
            {showMarksLabel && <p style={{ color: markLabelColor, fontSize: 12, marginTop: 5, whiteSpace: "nowrap",
              transform: position <= 5 && mark.label.length > 5 ? "translateX(-20%)"
                : position >= 95 && mark.label.length > 5 ? "translateX(-80%)" : "translateX(-50%)",
            }}>{mark.label}</p>}
          </div>;
        })}
        {values.map((value, index) => {
          const tooltipValue = tooltipFor(value);
          return <Thumb
            aria-disabled={disabled} aria-label={values.length > 1 ? `${inputName} ${index === 0 ? "start" : "end"}` : inputName}
            aria-valuemax={max} aria-valuemin={min} aria-valuenow={value}
            data-testid="slider-thumb" disabled={disabled} key={index}
            onBlur={() => setFocused(-1)} onClick={(event) => event.stopPropagation()}
            onFocus={() => { setFocused(index); onThumbFocus?.(index); }}
            onKeyDown={(event) => onThumbKeyDown?.(index, event)}
            onMouseDown={(event) => onThumbMouseDown?.(index, event)}
            position={positions[index]} role="slider" size={size} tabIndex={disabled ? -1 : 0}
            thumbColor={barColor}
          >
            {(tooltipAlwaysOn || active || hovered || focused === index) && tooltipValue !== "" &&
              <div data-slider-tooltip style={{
                position: "absolute", top: -36, backgroundColor: "#212529", color: "white",
                fontSize: 12, padding: 5, borderRadius: 4, whiteSpace: "nowrap", pointerEvents: "none",
              }}>{tooltipValue}</div>}
          </Thumb>;
        })}
      </Track>
      {values.map((value, index) => <input key={index} name={values.length > 1
        ? `${inputName}_${index === 0 ? "from" : "to"}` : inputName} type="hidden" value={value} />)}
    </TrackRoot>
  </Container>;
}
