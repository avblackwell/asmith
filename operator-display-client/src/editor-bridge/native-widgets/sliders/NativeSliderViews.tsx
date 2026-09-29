import React from "react";
import { CATEGORY_SLIDER_DEFAULTS, NUMBER_SLIDER_DEFAULTS, RANGE_SLIDER_DEFAULTS } from "./defaults";
import { SliderChrome } from "./SliderChrome";
import { getCategorySliderOptions, getChangeValue, setRangedValue } from "./sliderModel";
import type { CategoryOption, SliderMark, SliderSize } from "./sliderModel";
import { useSliderMove } from "./useSliderMove";

interface SliderBaseProps {
  widgetName?: string;
  isDisabled?: boolean;
  accentColor?: string;
  labelText?: string;
  labelPosition?: string;
  labelTextColor?: string;
  labelTextSize?: string;
  labelStyle?: string;
  labelTooltip?: string;
  sliderSize?: SliderSize;
  showMarksLabel?: boolean;
  isDirty?: boolean;
}

export interface NativeNumberSliderViewProps extends SliderBaseProps {
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  value?: number;
  marks?: readonly SliderMark[];
  tooltipAlwaysOn?: boolean;
  onChangeEnd?: (value: number) => void;
  onMetaChange?: (meta: { value: number; isDirty: boolean }) => void;
}

function tooltip(value: number, step: number): string {
  return step % 1 !== 0 ? value.toFixed(1) : value.toString();
}

export function NativeNumberSliderView(props: NativeNumberSliderViewProps): React.ReactElement {
  const min = Number.isFinite(props.min) ? props.min! : NUMBER_SLIDER_DEFAULTS.min;
  const max = Number.isFinite(props.max) && props.max! > min ? props.max! : NUMBER_SLIDER_DEFAULTS.max;
  const step = Number.isFinite(props.step) && props.step! > 0 ? props.step! : NUMBER_SLIDER_DEFAULTS.step;
  const defaultValue = Number.isFinite(props.defaultValue) ? props.defaultValue! : NUMBER_SLIDER_DEFAULTS.defaultValue;
  const [value, setValue] = React.useState(props.value ?? defaultValue);
  const [dirty, setDirty] = React.useState(props.isDirty ?? false);
  const valueRef = React.useRef(value);
  const committedRef = React.useRef(value);
  const defaultRef = React.useRef(defaultValue);
  valueRef.current = value;

  React.useEffect(() => {
    if (defaultRef.current !== defaultValue) {
      defaultRef.current = defaultValue;
      setValue(defaultValue); valueRef.current = defaultValue; committedRef.current = defaultValue; setDirty(false);
      props.onMetaChange?.({ value: defaultValue, isDirty: false });
    }
  }, [defaultValue]);
  React.useEffect(() => {
    if (props.value !== undefined) {
      setValue(props.value); valueRef.current = props.value; committedRef.current = props.value;
    }
  }, [props.value]);

  const commit = (next: number) => {
    if (next !== committedRef.current) {
      setValue(next); valueRef.current = next;
      props.onChangeEnd?.(next);
    }
    committedRef.current = next;
    if (!dirty) setDirty(true);
    props.onMetaChange?.({ value: next, isDirty: true });
  };
  const { ref, active } = useSliderMove(
    (x) => { if (!props.isDisabled) {
      const next = getChangeValue({ value: x, min, max, step });
      setValue(next); valueRef.current = next;
    } },
    () => { if (!props.isDisabled) commit(valueRef.current); },
  );

  return <div data-native-widget="number-slider" data-meta-value={value} data-meta-dirty={dirty} style={{ height: "100%", width: "100%" }}>
    <SliderChrome
      active={active} color={props.accentColor || "#16a34a"} disabled={props.isDisabled === true}
      inputName={props.widgetName || NUMBER_SLIDER_DEFAULTS.widgetName}
      labelPosition={props.labelPosition || NUMBER_SLIDER_DEFAULTS.labelPosition}
      labelStyle={props.labelStyle} labelText={props.labelText ?? NUMBER_SLIDER_DEFAULTS.labelText}
      labelTextColor={props.labelTextColor} labelTextSize={props.labelTextSize || NUMBER_SLIDER_DEFAULTS.labelTextSize}
      labelTooltip={props.labelTooltip} marks={props.showMarksLabel === false ? [] : props.marks ?? NUMBER_SLIDER_DEFAULTS.marks}
      max={max} min={min} rootRef={ref} showMarksLabel={props.showMarksLabel !== false}
      size={props.sliderSize || "m"} tooltipAlwaysOn={props.tooltipAlwaysOn === true}
      tooltipFor={(current) => tooltip(current, step)} values={[value]}
      onThumbMouseDown={(_, event) => { if (event.cancelable) event.preventDefault(); event.stopPropagation(); }}
      onThumbKeyDown={(_, event) => {
        if (props.isDisabled || !["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const delta = event.key === "ArrowUp" || event.key === "ArrowRight" ? step : -step;
        commit(Math.min(Math.max(valueRef.current + delta, min), max));
      }}
    />
  </div>;
}

export interface NativeRangeSliderViewProps extends SliderBaseProps {
  min?: number;
  max?: number;
  minRange?: number;
  step?: number;
  defaultStartValue?: number;
  defaultEndValue?: number;
  start?: number;
  end?: number;
  marks?: readonly SliderMark[];
  tooltipAlwaysOn?: boolean;
  onStartChange?: (value: number) => void;
  onEndChange?: (value: number) => void;
  onMetaChange?: (meta: { start: number; end: number; isDirty: boolean }) => void;
}

export function NativeRangeSliderView(props: NativeRangeSliderViewProps): React.ReactElement {
  const min = Number.isFinite(props.min) ? props.min! : RANGE_SLIDER_DEFAULTS.min;
  const max = Number.isFinite(props.max) && props.max! > min ? props.max! : RANGE_SLIDER_DEFAULTS.max;
  const step = Number.isFinite(props.step) && props.step! > 0 ? props.step! : RANGE_SLIDER_DEFAULTS.step;
  const minRange = Number.isFinite(props.minRange) && props.minRange! > 0 ? props.minRange! : RANGE_SLIDER_DEFAULTS.minRange;
  const defaultStartValue = Number.isFinite(props.defaultStartValue) ? props.defaultStartValue! : RANGE_SLIDER_DEFAULTS.defaultStartValue;
  const defaultEndValue = Number.isFinite(props.defaultEndValue) ? props.defaultEndValue! : RANGE_SLIDER_DEFAULTS.defaultEndValue;
  const [values, setValues] = React.useState<[number, number]>([
    props.start ?? defaultStartValue, props.end ?? defaultEndValue,
  ]);
  const [dirty, setDirty] = React.useState(props.isDirty ?? false);
  const valuesRef = React.useRef(values);
  const committedRef = React.useRef(values);
  const defaultRef = React.useRef<[number, number]>([defaultStartValue, defaultEndValue]);
  const thumbIndex = React.useRef<0 | 1>(0);
  valuesRef.current = values;

  React.useEffect(() => {
    if (defaultRef.current[0] !== defaultStartValue || defaultRef.current[1] !== defaultEndValue) {
      defaultRef.current = [defaultStartValue, defaultEndValue];
      const reset: [number, number] = [defaultStartValue, defaultEndValue];
      valuesRef.current = reset; committedRef.current = reset; setValues(reset); setDirty(false);
      props.onMetaChange?.({ start: reset[0], end: reset[1], isDirty: false });
    }
  }, [defaultStartValue, defaultEndValue]);
  React.useEffect(() => {
    if (props.start !== undefined || props.end !== undefined) {
      const next: [number, number] = [props.start ?? valuesRef.current[0], props.end ?? valuesRef.current[1]];
      valuesRef.current = next; committedRef.current = next; setValues(next);
    }
  }, [props.start, props.end]);

  const commit = (next: [number, number]) => {
    if (committedRef.current[0] !== next[0]) props.onStartChange?.(next[0]);
    if (committedRef.current[1] !== next[1]) props.onEndChange?.(next[1]);
    committedRef.current = next;
    valuesRef.current = next;
    setValues(next);
    if (!dirty) setDirty(true);
    props.onMetaChange?.({ start: next[0], end: next[1], isDirty: true });
  };
  const { ref, active } = useSliderMove(
    (x) => { if (!props.isDisabled) {
      const value = getChangeValue({ value: x, min, max, step });
      const next = setRangedValue(valuesRef.current, value, thumbIndex.current, min, max, minRange);
      valuesRef.current = next; setValues(next);
    } },
    () => { if (!props.isDisabled) commit(valuesRef.current); },
  );
  const chooseThumb = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect?.width) return;
    const changeValue = getChangeValue({ value: event.clientX - rect.left, min, max, step, containerWidth: rect.width });
    thumbIndex.current = Math.abs(valuesRef.current[0] - changeValue) > Math.abs(valuesRef.current[1] - changeValue) ? 1 : 0;
  };

  return <div data-native-widget="range-slider" data-meta-start={values[0]} data-meta-end={values[1]} data-meta-dirty={dirty}
    onMouseDownCapture={chooseThumb} style={{ height: "100%", width: "100%" }}>
    <SliderChrome
      active={active} color={props.accentColor || "#16a34a"} disabled={props.isDisabled === true}
      inputName={props.widgetName || RANGE_SLIDER_DEFAULTS.widgetName}
      labelPosition={props.labelPosition || RANGE_SLIDER_DEFAULTS.labelPosition}
      labelStyle={props.labelStyle} labelText={props.labelText ?? RANGE_SLIDER_DEFAULTS.labelText}
      labelTextColor={props.labelTextColor} labelTextSize={props.labelTextSize || RANGE_SLIDER_DEFAULTS.labelTextSize}
      labelTooltip={props.labelTooltip} marks={props.showMarksLabel === false ? [] : props.marks ?? RANGE_SLIDER_DEFAULTS.marks}
      max={max} min={min} rootRef={ref} showMarksLabel={props.showMarksLabel !== false}
      size={props.sliderSize || "m"} tooltipAlwaysOn={props.tooltipAlwaysOn === true}
      tooltipFor={(current) => tooltip(current, step)} values={values}
      onThumbFocus={(index) => { thumbIndex.current = index as 0 | 1; }}
      onThumbMouseDown={(index, event) => {
        thumbIndex.current = index as 0 | 1;
        if (event.cancelable) event.preventDefault(); event.stopPropagation();
      }}
      onThumbKeyDown={(index, event) => {
        if (props.isDisabled || !["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const delta = event.key === "ArrowUp" || event.key === "ArrowRight" ? step : -step;
        const val = Math.min(Math.max(valuesRef.current[index] + delta, min), max);
        commit(setRangedValue(valuesRef.current, val, index as 0 | 1, min, max, minRange));
      }}
    />
  </div>;
}

export interface NativeCategorySliderViewProps extends SliderBaseProps {
  options?: readonly CategoryOption[];
  defaultOptionValue?: string | number;
  value?: string | number;
  onChangeEnd?: (value: string | number | undefined) => void;
  onMetaChange?: (meta: { value: string | number | undefined; isDirty: boolean }) => void;
}

export function NativeCategorySliderView(props: NativeCategorySliderViewProps): React.ReactElement {
  const rawOptions = props.options ?? CATEGORY_SLIDER_DEFAULTS.options;
  const validOptions = rawOptions.length >= 2 && rawOptions.every((option) =>
    option && typeof option.label === "string" && option.label !== "" &&
    (typeof option.value === "string" || typeof option.value === "number") &&
    typeof option.value === typeof rawOptions[0].value) &&
    new Set(rawOptions.map((option) => option.value)).size === rawOptions.length;
  const options = validOptions ? rawOptions : [];
  const { sliderOptions, stepSize } = getCategorySliderOptions(options);
  const defaultOptionValue = props.defaultOptionValue ?? CATEGORY_SLIDER_DEFAULTS.defaultOptionValue;
  const [value, setValue] = React.useState<string | number | undefined>(props.value ?? defaultOptionValue);
  const [dirty, setDirty] = React.useState(props.isDirty ?? false);
  const [live, setLive] = React.useState<number>(stepSize);
  const valueRef = React.useRef(value);
  const liveRef = React.useRef(live);
  const defaultRef = React.useRef(defaultOptionValue);
  valueRef.current = value;
  liveRef.current = live;
  const selectedValue = sliderOptions.find((option) => option.optionValue === value)?.value ?? stepSize;

  React.useEffect(() => {
    if (defaultRef.current !== defaultOptionValue) {
      defaultRef.current = defaultOptionValue;
      setValue(defaultOptionValue); valueRef.current = defaultOptionValue; setDirty(false);
      props.onMetaChange?.({ value: defaultOptionValue, isDirty: false });
    }
  }, [defaultOptionValue]);
  React.useEffect(() => {
    if (props.value !== undefined) { setValue(props.value); valueRef.current = props.value; }
  }, [props.value]);
  React.useEffect(() => { setLive(selectedValue); liveRef.current = selectedValue; }, [selectedValue]);

  const commit = (next: number) => {
    const selected = sliderOptions.find((option) => option.value === next)?.optionValue;
    if (valueRef.current !== selected) {
      setValue(selected); valueRef.current = selected;
      props.onChangeEnd?.(selected);
    }
    if (!dirty) setDirty(true);
    props.onMetaChange?.({ value: selected, isDirty: true });
  };
  const disabled = props.isDisabled === true || sliderOptions.length === 0;
  const { ref, active } = useSliderMove(
    (x) => { if (!disabled) {
      const next = getChangeValue({ value: x, min: stepSize, max: stepSize * sliderOptions.length, step: stepSize });
      setLive(next); liveRef.current = next;
    } },
    () => { if (!disabled) commit(liveRef.current); },
  );

  return <div data-native-widget="category-slider" data-meta-value={value} data-meta-dirty={dirty} style={{ height: "100%", width: "100%" }}>
    <SliderChrome
      active={active} color={props.accentColor || "#16a34a"} disabled={disabled}
      inputName={props.widgetName || CATEGORY_SLIDER_DEFAULTS.widgetName}
      labelPosition={props.labelPosition || CATEGORY_SLIDER_DEFAULTS.labelPosition}
      labelStyle={props.labelStyle} labelText={props.labelText ?? CATEGORY_SLIDER_DEFAULTS.labelText}
      labelTextColor={props.labelTextColor} labelTextSize={props.labelTextSize || CATEGORY_SLIDER_DEFAULTS.labelTextSize}
      labelTooltip={props.labelTooltip} marks={sliderOptions}
      max={stepSize * sliderOptions.length || 100} min={stepSize || 0} rootRef={ref}
      showMarksLabel={props.showMarksLabel !== false} size={props.sliderSize || "m"}
      tooltipFor={(current) => sliderOptions.find((option) => option.value === current)?.label || ""}
      values={[active ? live : selectedValue]}
      onThumbMouseDown={(_, event) => { if (event.cancelable) event.preventDefault(); event.stopPropagation(); }}
      onThumbKeyDown={(_, event) => {
        if (disabled || !["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const delta = event.key === "ArrowUp" || event.key === "ArrowRight" ? stepSize : -stepSize;
        commit(Math.min(Math.max(selectedValue + delta, stepSize), stepSize * sliderOptions.length));
      }}
    />
  </div>;
}
