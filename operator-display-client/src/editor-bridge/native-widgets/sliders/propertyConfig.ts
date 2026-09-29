import type { PropertyControl, PropertySection, PropertyTab } from "../../property-controls/config";

type SliderType = "RATE_WIDGET" | "NUMBER_SLIDER_WIDGET" |
  "RANGE_SLIDER_WIDGET" | "CATEGORY_SLIDER_WIDGET";

const numberControl = (propertyName: string, label: string): PropertyControl => ({
  propertyName, label, controlType: "INPUT_TEXT", valueType: "number",
  isBindProperty: true,
});
const switchControl = (propertyName: string, label: string): PropertyControl => ({
  propertyName, label, controlType: "SWITCH", valueType: "boolean",
  isBindProperty: true, isJSConvertible: true,
});
const colorControl = (propertyName: string, label: string): PropertyControl => ({
  propertyName, label, controlType: "COLOR_PICKER", valueType: "string",
  isBindProperty: true, isJSConvertible: true,
});

const sliderLabel: readonly PropertySection[] = [{ sectionName: "Label", children: [
  { propertyName: "labelText", label: "Text", controlType: "INPUT_TEXT",
    valueType: "string", isBindProperty: true },
  { propertyName: "labelPosition", label: "Position", controlType: "ICON_TABS",
    valueType: "string", options: [
      { label: "Left", value: "Left" }, { label: "Top", value: "Top" },
    ] },
  { propertyName: "labelAlignment", label: "Alignment", controlType: "ICON_TABS",
    valueType: "string", options: [
      { label: "Left", value: "LEFT" }, { label: "Right", value: "RIGHT" },
    ], visibleWhen: [{ propertyName: "labelPosition", equals: "Left" }] },
  numberControl("labelWidth", "Width (in columns)"),
] }];

const sliderGeneral: readonly PropertyControl[] = [
  { propertyName: "labelTooltip", label: "Tooltip", controlType: "INPUT_TEXT",
    valueType: "string", isBindProperty: true },
  switchControl("showMarksLabel", "Show marks"),
  switchControl("isVisible", "Visible"),
  switchControl("isDisabled", "Disabled"),
  switchControl("animateLoading", "Animate loading"),
];
const marks: PropertyControl = { propertyName: "marks", label: "Marks",
  controlType: "JSON_ARRAY", valueType: "object", isBindProperty: true,
  visibleWhen: [{ propertyName: "showMarksLabel", notEquals: false }] };
const sliderStyle: readonly PropertySection[] = [
  { sectionName: "General", children: [{ propertyName: "sliderSize", label: "Size",
    controlType: "ICON_TABS", valueType: "string", options: [
      { label: "S", value: "s" }, { label: "M", value: "m" },
      { label: "L", value: "l" },
    ] }] },
  { sectionName: "Label styles", children: [
    colorControl("labelTextColor", "Font color"),
    { propertyName: "labelTextSize", label: "Font size", controlType: "DROP_DOWN",
      valueType: "string", options: [
        { label: "S", value: "0.875rem" }, { label: "M", value: "1rem" },
        { label: "L", value: "1.25rem" }, { label: "XL", value: "1.875rem" },
        { label: "XXL", value: "3rem" }, { label: "3XL", value: "3.75rem" },
      ] },
    { propertyName: "labelStyle", label: "Emphasis", controlType: "BUTTON_GROUP",
      valueType: "string", options: [
        { label: "Bold", value: "BOLD" }, { label: "Italic", value: "ITALIC" },
      ] },
  ] },
  { sectionName: "Color", children: [colorControl("accentColor", "Fill color")] },
];

export const SLIDER_PROPERTY_CONTROLS: Record<SliderType,
  Record<PropertyTab, readonly PropertySection[]>> = {
  RATE_WIDGET: {
    content: [
      { sectionName: "Data", children: [numberControl("maxCount", "Max rating"),
        numberControl("defaultRate", "Default rating"),
        { propertyName: "tooltips", label: "Tooltips", controlType: "JSON_ARRAY",
          valueType: "object" }] },
      { sectionName: "General", children: [
        switchControl("isAllowHalf", "Allow half stars"),
        switchControl("isVisible", "Visible"),
        switchControl("isDisabled", "Disabled"),
        switchControl("isReadOnly", "Read only"),
        switchControl("animateLoading", "Animate loading"),
      ] },
    ],
    style: [
      { sectionName: "General", children: [{ propertyName: "size", label: "Star size",
        controlType: "ICON_TABS", valueType: "string", options: [
          { label: "Small", value: "SMALL" },
          { label: "Medium", value: "MEDIUM" },
          { label: "Large", value: "LARGE" },
        ] }] },
      { sectionName: "Color", children: [
        colorControl("activeColor", "Active color"),
        colorControl("inactiveColor", "Inactive color"),
      ] },
    ],
  },
  NUMBER_SLIDER_WIDGET: {
    content: [
      { sectionName: "Data", children: [
        numberControl("min", "Min. value"), numberControl("max", "Max. value"),
        numberControl("step", "Step size"), numberControl("defaultValue", "Default value"),
      ] }, ...sliderLabel,
      { sectionName: "General", children: [sliderGeneral[0], sliderGeneral[1], marks,
        ...sliderGeneral.slice(2), switchControl("tooltipAlwaysOn", "Show value always")] },
    ],
    style: sliderStyle,
  },
  RANGE_SLIDER_WIDGET: {
    content: [
      { sectionName: "Data", children: [
        numberControl("min", "Min. value"), numberControl("max", "Max. value"),
        numberControl("step", "Step size"), numberControl("minRange", "Min. range"),
        numberControl("defaultStartValue", "Default start value"),
        numberControl("defaultEndValue", "Default end value"),
      ] }, ...sliderLabel,
      { sectionName: "General", children: [sliderGeneral[0], sliderGeneral[1], marks,
        ...sliderGeneral.slice(2), switchControl("tooltipAlwaysOn", "Show value always")] },
    ],
    style: sliderStyle,
  },
  CATEGORY_SLIDER_WIDGET: {
    content: [
      { sectionName: "Data", children: [
        { propertyName: "options", label: "Options", controlType: "JSON_ARRAY",
          valueType: "object", isBindProperty: true },
        { propertyName: "defaultOptionValue", label: "Default value",
          controlType: "INPUT_TEXT", valueType: "string", isBindProperty: true },
      ] }, ...sliderLabel,
      { sectionName: "General", children: sliderGeneral },
    ],
    style: sliderStyle,
  },
};
