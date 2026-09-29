// Literal getDefaults() values from the four Appsmith Fixed widget classes.
export const RATE_DEFAULTS = {
  rows: 4, columns: 20, animateLoading: true, maxCount: 5, defaultRate: 3,
  activeColor: "#FFCB45", inactiveColor: "#E0DEDE", size: "LARGE",
  isRequired: false, isAllowHalf: false, isDisabled: false, isReadOnly: false,
  tooltips: ["Terrible", "Bad", "Neutral", "Good", "Great"], widgetName: "Rating",
} as const;

const PERCENT_MARKS = [
  { value: 25, label: "25%" }, { value: 50, label: "50%" }, { value: 75, label: "75%" },
];

export const NUMBER_SLIDER_DEFAULTS = {
  min: 0, max: 100, step: 1, defaultValue: 10, showMarksLabel: true,
  marks: PERCENT_MARKS, isVisible: true, isDisabled: false, tooltipAlwaysOn: false,
  rows: 8, columns: 40, widgetName: "NumberSlider", shouldScroll: false,
  shouldTruncate: false, version: 1, animateLoading: true, labelText: "Percentage",
  labelPosition: "Top", labelAlignment: "left", labelWidth: 8,
  labelTextSize: "0.875rem", sliderSize: "m", responsiveBehavior: "fill",
} as const;

export const RANGE_SLIDER_DEFAULTS = {
  ...NUMBER_SLIDER_DEFAULTS, minRange: 5, defaultStartValue: 10, defaultEndValue: 100,
  widgetName: "RangeSlider",
} as const;

export const CATEGORY_SLIDER_DEFAULTS = {
  options: [
    { label: "xs", value: "xs" }, { label: "sm", value: "sm" },
    { label: "md", value: "md" }, { label: "lg", value: "lg" },
    { label: "xl", value: "xl" },
  ],
  defaultOptionValue: "md", isVisible: true, isDisabled: false,
  showMarksLabel: true, rows: 8, columns: 40, widgetName: "CategorySlider",
  shouldScroll: false, shouldTruncate: false, version: 1, animateLoading: true,
  labelText: "Size", labelPosition: "Top", labelAlignment: "left", labelWidth: 5,
  labelTextSize: "0.875rem", sliderSize: "m", responsiveBehavior: "fill",
} as const;
