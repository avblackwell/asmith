export interface SliderMark { value: number; label: string }
export interface CategoryOption { label: string; value: string | number }

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Appsmith NumberSliderWidget/utils.ts uses these functions for all three sliders.
export function getPosition({ value, min, max }: { value: number; min: number; max: number }): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 0;
  return clamp(((value - min) / (max - min)) * 100, 0, 100);
}

export function getChangeValue({ value, min, max, step, containerWidth }: {
  value: number; min: number; max: number; step: number; containerWidth?: number;
}): number {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || max <= min || step <= 0) return min;
  const left = !containerWidth ? value : clamp(value, 0, containerWidth) / containerWidth;
  const dx = left * (max - min);
  const nextValue = (dx !== 0 ? Math.round(dx / step) * step : 0) + min;
  return clamp(nextValue, min, max);
}

export function isMarkedFilled({ mark, offset, value }: { mark: SliderMark; offset?: number; value: number }): boolean {
  return typeof offset === "number"
    ? mark.value >= offset && mark.value <= value
    : mark.value <= value;
}

/** Appsmith RangeSliderComponent.setRangedValue, including linked thumbs. */
export function setRangedValue(current: readonly [number, number], val: number, index: 0 | 1, min: number, max: number, minRange: number): [number, number] {
  const clone: [number, number] = [current[0], current[1]];
  clone[index] = val;
  if (index === 0) {
    if (val > clone[1] - minRange) clone[1] = Math.min(val + minRange, max);
    if (val > (max - minRange || min)) clone[index] = current[index];
  } else {
    if (val < clone[0] + minRange) clone[0] = Math.max(val - minRange, min);
    if (val < clone[0] + minRange) clone[index] = current[index];
  }
  return clone;
}

/** Appsmith CategorySliderWidget.getSliderOptions, with its rounded 100/n step. */
export function getCategorySliderOptions(options: readonly CategoryOption[]): {
  sliderOptions: { value: number; label: string; optionValue: string | number }[];
  stepSize: number;
} {
  if (!options.length) return { sliderOptions: [], stepSize: 0 };
  const stepSize = Math.round(100 / options.length);
  return {
    sliderOptions: options.map((option, index) => ({
      value: (index + 1) * stepSize, label: option.label, optionValue: option.value,
    })),
    stepSize,
  };
}

export const RATE_SIZES = { SMALL: 12, MEDIUM: 16, LARGE: 21 } as const;
export const SLIDER_TRACK_SIZES = { s: 4, m: 6, l: 8 } as const;
export const SLIDER_THUMB_SIZES = { s: 12, m: 16, l: 20 } as const;
export type SliderSize = keyof typeof SLIDER_TRACK_SIZES;
