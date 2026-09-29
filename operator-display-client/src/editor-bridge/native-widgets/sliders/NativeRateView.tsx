import React from "react";
import { RATE_DEFAULTS } from "./defaults";
import { clamp, RATE_SIZES } from "./sliderModel";

export interface NativeRateViewProps {
  widgetId?: string;
  widgetName?: string;
  maxCount?: number;
  defaultRate?: number;
  rate?: number;
  size?: keyof typeof RATE_SIZES;
  activeColor?: string;
  inactiveColor?: string;
  isAllowHalf?: boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  tooltips?: readonly string[];
  minHeight?: number;
  onValueChanged?: (rate: number) => void;
  onMetaChange?: (meta: { rate: number; value: number }) => void;
}

const STAR_PATH = "M10 0l3.1 6.6 6.9 1-5 5.1 1.2 7.3-6.2-3.4L3.8 20 5 12.7 0 7.6l6.9-1z";

export function NativeRateView(props: NativeRateViewProps): React.ReactElement {
  const maxCount = Number.isInteger(props.maxCount) && props.maxCount! > 0
    ? props.maxCount! : RATE_DEFAULTS.maxCount;
  const defaultRate = Number.isFinite(props.defaultRate) ? props.defaultRate! : RATE_DEFAULTS.defaultRate;
  const [rate, setRate] = React.useState(clamp(props.rate ?? defaultRate, 0, maxCount));
  const defaultRef = React.useRef(defaultRate);
  const size = RATE_SIZES[props.size || RATE_DEFAULTS.size];
  const disabled = props.isDisabled === true || props.isReadOnly === true;
  const tooltips = props.tooltips || RATE_DEFAULTS.tooltips;

  React.useEffect(() => {
    if (defaultRef.current !== defaultRate) {
      defaultRef.current = defaultRate;
      const next = clamp(defaultRate, 0, maxCount);
      setRate(next);
      props.onMetaChange?.({ rate: next, value: next });
    }
  }, [defaultRate, maxCount]);
  React.useEffect(() => {
    if (props.rate !== undefined) setRate(clamp(props.rate, 0, maxCount));
  }, [props.rate, maxCount]);

  const commit = (next: number) => {
    if (disabled) return;
    const clamped = clamp(next, 0, maxCount);
    if (clamped === rate) return;
    setRate(clamped);
    props.onValueChanged?.(clamped);
    props.onMetaChange?.({ rate: clamped, value: clamped });
  };

  return <div
    aria-label={props.widgetName || RATE_DEFAULTS.widgetName}
    data-native-widget="rate" data-meta-rate={rate}
    data-disabled={props.isDisabled === true} data-read-only={props.isReadOnly === true}
    style={{ alignContent: "flex-start", alignItems: "center", display: "flex", flexDirection: "row",
      justifyContent: "center", minHeight: props.minHeight, overflow: "auto", width: "100%" }}
  >
    <span style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 5 }}>
      {Array.from({ length: maxCount }, (_, index) => {
        const fill = clamp(rate - index, 0, 1);
        return <button
          aria-label={`${index + 1} of ${maxCount} stars${tooltips[index] ? `: ${tooltips[index]}` : ""}`}
          aria-pressed={rate === index + 1 || props.isAllowHalf === true && rate === index + 0.5}
          data-star-index={index + 1}
          disabled={disabled}
          key={index}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const half = props.isAllowHalf === true && event.clientX - rect.left < rect.width / 2;
            commit(index + (half ? 0.5 : 1));
          }}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"].includes(event.key)) return;
            event.preventDefault();
            const delta = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : -1;
            commit(rate + delta * (props.isAllowHalf ? 0.5 : 1));
          }}
          style={{ background: "none", border: 0, cursor: disabled ? "not-allowed" : "pointer", padding: 0,
            height: size, position: "relative", width: size }}
          title={tooltips[index]}
          type="button"
        >
          <svg aria-hidden="true" height={size} viewBox="0 0 20 20" width={size}>
            <path d={STAR_PATH} fill={props.inactiveColor || RATE_DEFAULTS.inactiveColor} />
          </svg>
          {fill > 0 && <span style={{ height: size, left: 0, overflow: "hidden", position: "absolute", top: 0,
            width: `${fill * 100}%` }}>
            <svg aria-hidden="true" height={size} viewBox="0 0 20 20" width={size}>
              <path d={STAR_PATH} fill={props.activeColor || RATE_DEFAULTS.activeColor} />
            </svg>
          </span>}
        </button>;
      })}
    </span>
  </div>;
}
