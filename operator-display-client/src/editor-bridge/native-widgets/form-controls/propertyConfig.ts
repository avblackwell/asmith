import type { PropertyControl, PropertySection, PropertyTab } from "../../property-controls/config";
import type { FormWidgetType } from "./NativeFormWidgetView";

/** Static fields selected from the source getPropertyPaneContent/StyleConfig methods. */
const visible: PropertyControl = { propertyName: "isVisible", label: "Visible",
  controlType: "SWITCH", valueType: "boolean", defaultValue: true,
  isBindProperty: true, isJSConvertible: true };
const disabled: PropertyControl = { propertyName: "isDisabled", label: "Disabled",
  controlType: "SWITCH", valueType: "boolean", defaultValue: false,
  isBindProperty: true, isJSConvertible: true };
const required: PropertyControl = { propertyName: "isRequired", label: "Required",
  controlType: "SWITCH", valueType: "boolean", defaultValue: false,
  isBindProperty: true, isJSConvertible: true };
const loading: PropertyControl = { propertyName: "animateLoading", label: "Animate loading",
  controlType: "SWITCH", valueType: "boolean", defaultValue: true,
  isBindProperty: true, isJSConvertible: true };
const labelText: PropertyControl = { propertyName: "label", label: "Text",
  controlType: "INPUT_TEXT", valueType: "string", isBindProperty: true };
const selectLabelText: PropertyControl = { ...labelText, propertyName: "labelText" };
const labelPosition: PropertyControl = { propertyName: "labelPosition", label: "Position",
  controlType: "ICON_TABS", valueType: "string", defaultValue: "Top",
  options: [{ label: "Auto", value: "Auto" }, { label: "Left", value: "Left" },
    { label: "Top", value: "Top" }] };
const toggleLabelPosition: PropertyControl = { ...labelPosition, defaultValue: "Left",
  options: [{ label: "Left", value: "Left" }, { label: "Right", value: "Right" }] };
const labelAlignment: PropertyControl = { propertyName: "labelAlignment", label: "Alignment",
  controlType: "ICON_TABS", valueType: "string", fullWidth: true,
  options: [{ label: "Left", value: "LEFT" }, { label: "Right", value: "RIGHT" }],
  visibleWhen: [{ propertyName: "labelPosition", equals: "Left" }] };
const labelWidth: PropertyControl = { propertyName: "labelWidth", label: "Width (in columns)",
  controlType: "INPUT_TEXT", valueType: "number", validation: { min: 0, integer: true },
  visibleWhen: [{ propertyName: "labelPosition", equals: "Left" }] };
const tooltip: PropertyControl = { propertyName: "labelTooltip", label: "Tooltip",
  controlType: "INPUT_TEXT", valueType: "string", isBindProperty: true };
const placeholder: PropertyControl = { propertyName: "placeholderText", label: "Placeholder",
  controlType: "INPUT_TEXT", valueType: "string", isBindProperty: true };
const labelColor: PropertyControl = { propertyName: "labelTextColor", label: "Font color",
  controlType: "COLOR_PICKER", valueType: "string", isBindProperty: true,
  isJSConvertible: true };
const labelSize: PropertyControl = { propertyName: "labelTextSize", label: "Font size",
  controlType: "DROP_DOWN", valueType: "string", defaultValue: "0.875rem",
  options: [
    { label: "S", value: "0.875rem", subText: "0.875rem" },
    { label: "M", value: "1rem", subText: "1rem" },
    { label: "L", value: "1.25rem", subText: "1.25rem" },
    { label: "XL", value: "1.875rem", subText: "1.875rem" },
    { label: "XXL", value: "3rem", subText: "3rem" },
    { label: "3XL", value: "3.75rem", subText: "3.75rem" },
  ] };
const accent: PropertyControl = { propertyName: "accentColor", label: "Accent color",
  controlType: "COLOR_PICKER", valueType: "string", isBindProperty: true,
  isJSConvertible: true };
const borderRadius: PropertyControl = { propertyName: "borderRadius", label: "Border radius",
  controlType: "BORDER_RADIUS_OPTIONS", valueType: "string",
  options: [{ label: "None", value: "0px" }, { label: "M", value: "0.375rem" },
    { label: "L", value: "1.5rem" }] };
const boxShadow: PropertyControl = { propertyName: "boxShadow", label: "Box shadow",
  controlType: "BOX_SHADOW_OPTIONS", valueType: "string",
  options: [{ label: "None", value: "none" },
    { label: "Small", value: "0 1px 3px rgba(0,0,0,.1)" },
    { label: "Medium", value: "0 4px 6px rgba(0,0,0,.1)" }] };
const sourceData: PropertyControl = { propertyName: "sourceData", label: "Source Data",
  controlType: "JSON_ARRAY", valueType: "object", isBindProperty: true,
  placeholderText: '[{ "name": "Blue", "code": "BLUE" }]' };
const optionLabel: PropertyControl = { propertyName: "optionLabel", label: "Label key",
  controlType: "INPUT_TEXT", valueType: "string", defaultValue: "name",
  isBindProperty: true };
const optionValue: PropertyControl = { propertyName: "optionValue", label: "Value key",
  controlType: "INPUT_TEXT", valueType: "string", defaultValue: "code",
  isBindProperty: true };
const selectDefault: PropertyControl = { propertyName: "defaultOptionValue",
  label: "Default selected value", controlType: "INPUT_TEXT", valueType: "string",
  isBindProperty: true };
const searching: PropertyControl = { propertyName: "isFilterable", label: "Allow searching",
  controlType: "SWITCH", valueType: "boolean", defaultValue: true,
  isBindProperty: true, isJSConvertible: true };
const serverFiltering: PropertyControl = { propertyName: "serverSideFiltering",
  label: "Server side filtering", controlType: "SWITCH", valueType: "boolean",
  defaultValue: false, isBindProperty: true, isJSConvertible: true };

const labelStyle = [labelColor, labelSize,
  { propertyName: "labelStyle", label: "Emphasis", controlType: "BUTTON_GROUP",
    valueType: "string", options: [
      { label: "Bold", value: "BOLD", icon: "text-bold" },
      { label: "Italic", value: "ITALIC", icon: "text-italic" },
    ], isBindProperty: true, isJSConvertible: true } as PropertyControl];
const selectStyle = [labelColor, labelSize, accent, borderRadius, boxShadow];
const selectContent: readonly PropertySection[] = [
  { sectionName: "Data", children: [sourceData, optionLabel, optionValue, selectDefault] },
  { sectionName: "Label", children: [selectLabelText, labelPosition, labelAlignment, labelWidth] },
  { sectionName: "Search & filters", children: [searching, serverFiltering] },
  { sectionName: "Validations", children: [required] },
  { sectionName: "General", children: [tooltip, placeholder, visible, disabled, loading] },
];

export const FORM_PROPERTY_CONTROLS: Record<FormWidgetType,
  Record<PropertyTab, readonly PropertySection[]>> = {
  INPUT_WIDGET_V2: {
    content: [
      { sectionName: "Data", children: [
        { propertyName: "inputType", label: "Data type", controlType: "DROP_DOWN",
          valueType: "string", defaultValue: "TEXT", options: [
            { label: "Single-line text", value: "TEXT" },
            { label: "Multi-line text", value: "MULTI_LINE_TEXT" },
            { label: "Number", value: "NUMBER" },
            { label: "Password", value: "PASSWORD" },
            { label: "Email", value: "EMAIL" },
          ] },
        { propertyName: "defaultText", label: "Default value", controlType: "INPUT_TEXT",
          valueType: "string", isBindProperty: true },
      ] },
      { sectionName: "Label", children: [labelText, labelPosition, labelAlignment, labelWidth] },
      { sectionName: "Validation", children: [required,
        { propertyName: "maxChars", label: "Max characters", controlType: "INPUT_TEXT",
          valueType: "number", validation: { min: 1, integer: true },
          visibleWhen: [{ propertyName: "inputType", oneOf: ["TEXT", "MULTI_LINE_TEXT"] }] },
        { propertyName: "minNum", label: "Min", controlType: "INPUT_TEXT",
          valueType: "number", visibleWhen: [{ propertyName: "inputType", equals: "NUMBER" }] },
        { propertyName: "maxNum", label: "Max", controlType: "INPUT_TEXT",
          valueType: "number", visibleWhen: [{ propertyName: "inputType", equals: "NUMBER" }] },
        { propertyName: "regex", label: "Regex", controlType: "INPUT_TEXT",
          valueType: "string", isBindProperty: true },
        { propertyName: "errorMessage", label: "Error message", controlType: "INPUT_TEXT",
          valueType: "string", isBindProperty: true },
        { propertyName: "isSpellCheck", label: "Spellcheck", controlType: "SWITCH",
          valueType: "boolean" },
      ] },
      { sectionName: "General", children: [placeholder, visible, disabled, loading,
        { propertyName: "showStepArrows", label: "Show step arrows", controlType: "SWITCH",
          valueType: "boolean", visibleWhen: [{ propertyName: "inputType", equals: "NUMBER" }] },
      ] },
    ],
    style: [
      { sectionName: "Label styles", children: labelStyle },
      { sectionName: "Border and shadow", children: [accent, borderRadius, boxShadow] },
    ],
  },
  SELECT_WIDGET: {
    content: selectContent,
    style: [{ sectionName: "Label styles", children: selectStyle }],
  },
  MULTI_SELECT_WIDGET_V2: {
    content: selectContent.map((section) => section.sectionName === "Data"
      ? { ...section, children: [sourceData, optionLabel, optionValue,
        { propertyName: "defaultOptionValue", label: "Default selected values",
          controlType: "JSON_ARRAY", valueType: "object", isBindProperty: true }] }
      : section),
    style: [{ sectionName: "Label styles", children: selectStyle }],
  },
  CHECKBOX_WIDGET: {
    content: [
      { sectionName: "Label", children: [labelText, toggleLabelPosition,
        { propertyName: "alignWidget", label: "Alignment", controlType: "ICON_TABS",
          valueType: "string", options: [{ label: "Left", value: "LEFT" },
            { label: "Right", value: "RIGHT" }] }] },
      { sectionName: "Validations", children: [required] },
      { sectionName: "General", children: [tooltip,
        { propertyName: "defaultCheckedState", label: "Default state",
          controlType: "SWITCH", valueType: "boolean", defaultValue: true,
          isBindProperty: true, isJSConvertible: true }, visible, disabled, loading] },
    ],
    style: [{ sectionName: "Label styles", children: labelStyle },
      { sectionName: "Color", children: [accent] },
      { sectionName: "Border and shadow", children: [borderRadius] }],
  },
  RADIO_GROUP_WIDGET: {
    content: [
      { sectionName: "Data", children: [
        { propertyName: "options", label: "Options", controlType: "JSON_ARRAY",
          valueType: "object", isBindProperty: true,
          placeholderText: '[{ "label": "Yes", "value": "Y" }]' },
        selectDefault,
      ] },
      { sectionName: "Label", children: [labelText, labelPosition, labelAlignment, labelWidth] },
      { sectionName: "Validations", children: [required] },
      { sectionName: "General", children: [tooltip, visible, disabled,
        { propertyName: "isInline", label: "Inline", controlType: "SWITCH",
          valueType: "boolean", defaultValue: true }, loading] },
    ],
    style: [{ sectionName: "Label styles", children: labelStyle },
      { sectionName: "Color", children: [accent] }],
  },
  SWITCH_WIDGET: {
    content: [
      { sectionName: "Label", children: [labelText, toggleLabelPosition,
        { propertyName: "alignWidget", label: "Alignment", controlType: "ICON_TABS",
          valueType: "string", options: [{ label: "Left", value: "LEFT" },
            { label: "Right", value: "RIGHT" }] }] },
      { sectionName: "General", children: [
        { propertyName: "defaultSwitchState", label: "Default state",
          controlType: "SWITCH", valueType: "boolean", defaultValue: true,
          isBindProperty: true, isJSConvertible: true }, visible, disabled, loading,
      ] },
    ],
    style: [{ sectionName: "Label styles", children: labelStyle },
      { sectionName: "Color", children: [accent] }],
  },
};
