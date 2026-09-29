import type { PropertyControl, PropertySection, PropertyTab } from "../../property-controls/config";
import type { ChoiceWidgetType } from "./choiceModel";

/** Static Fixed property metadata transcribed from the four Appsmith widget classes. */
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
const labelText: PropertyControl = { propertyName: "labelText", label: "Text",
  controlType: "INPUT_TEXT", valueType: "string", isBindProperty: true };
const labelPosition: PropertyControl = { propertyName: "labelPosition", label: "Position",
  controlType: "ICON_TABS", valueType: "string", defaultValue: "Top", fullWidth: true,
  options: [{ label: "Auto", value: "Auto" }, { label: "Left", value: "Left" },
    { label: "Top", value: "Top" }] };
const labelAlignment: PropertyControl = { propertyName: "labelAlignment", label: "Alignment",
  controlType: "ICON_TABS", valueType: "string", fullWidth: true,
  options: [{ label: "Left", value: "LEFT" }, { label: "Right", value: "RIGHT" }],
  visibleWhen: [{ propertyName: "labelPosition", equals: "Left" }] };
const labelWidth: PropertyControl = { propertyName: "labelWidth", label: "Width (in columns)",
  controlType: "INPUT_TEXT", valueType: "number", validation: { min: 0, integer: true },
  visibleWhen: [{ propertyName: "labelPosition", equals: "Left" }] };
const tooltip: PropertyControl = { propertyName: "labelTooltip", label: "Tooltip",
  controlType: "INPUT_TEXT", valueType: "string", isBindProperty: true };
const inline: PropertyControl = { propertyName: "isInline", label: "Inline",
  controlType: "SWITCH", valueType: "boolean", defaultValue: true,
  isBindProperty: true, isJSConvertible: true };
const options: PropertyControl = { propertyName: "options", label: "Options",
  controlType: "JSON_ARRAY", valueType: "object", isBindProperty: true,
  placeholderText: '[{ "label": "Blue", "value": "BLUE" }]' };
const groupDefaults: PropertyControl = { propertyName: "defaultSelectedValues",
  label: "Default selected values", controlType: "JSON_ARRAY", valueType: "object",
  isBindProperty: true, placeholderText: '["BLUE"]' };
const accent: PropertyControl = { propertyName: "accentColor", label: "Accent color",
  controlType: "COLOR_PICKER", valueType: "string", isBindProperty: true,
  isJSConvertible: true };
const radius: PropertyControl = { propertyName: "borderRadius", label: "Border radius",
  controlType: "BORDER_RADIUS_OPTIONS", valueType: "string",
  options: [{ label: "None", value: "0px" }, { label: "M", value: "0.375rem" },
    { label: "L", value: "1.5rem" }] };
const shadow: PropertyControl = { propertyName: "boxShadow", label: "Box shadow",
  controlType: "BOX_SHADOW_OPTIONS", valueType: "string",
  options: [{ label: "None", value: "none" },
    { label: "Small", value: "0 1px 3px rgba(0, 0, 0, .1)" },
    { label: "Medium", value: "0 4px 6px rgba(0, 0, 0, .1)" }] };
const labelStyles: PropertyControl[] = [
  { propertyName: "labelTextColor", label: "Font color", controlType: "COLOR_PICKER",
    valueType: "string", isBindProperty: true, isJSConvertible: true },
  { propertyName: "labelTextSize", label: "Font size", controlType: "DROP_DOWN",
    valueType: "string", defaultValue: "0.875rem", options: [
      { label: "S", value: "0.875rem" }, { label: "M", value: "1rem" },
      { label: "L", value: "1.25rem" }, { label: "XL", value: "1.875rem" },
      { label: "XXL", value: "3rem" }, { label: "3XL", value: "3.75rem" },
    ], isBindProperty: true, isJSConvertible: true },
  { propertyName: "labelStyle", label: "Emphasis", controlType: "BUTTON_GROUP",
    valueType: "string", options: [
      { label: "Bold", value: "BOLD", icon: "text-bold" },
      { label: "Italic", value: "ITALIC", icon: "text-italic" },
    ], isBindProperty: true, isJSConvertible: true },
];
const groupContent: readonly PropertySection[] = [
  { sectionName: "Data", children: [options, groupDefaults] },
  { sectionName: "Label", children: [labelText, labelPosition, labelAlignment, labelWidth] },
  { sectionName: "Validations", children: [required] },
  { sectionName: "General", children: [tooltip, visible, disabled, inline, loading] },
];
const selectContent: readonly PropertySection[] = [
  { sectionName: "Data", children: [
    { propertyName: "sourceData", label: "Source Data", controlType: "JSON_ARRAY",
      valueType: "object", isBindProperty: true,
      placeholderText: '[{ "name": "Blue", "code": "BLUE" }]' },
    { propertyName: "optionLabel", label: "Label key", controlType: "INPUT_TEXT",
      valueType: "string", defaultValue: "name", isBindProperty: true },
    { propertyName: "optionValue", label: "Value key", controlType: "INPUT_TEXT",
      valueType: "string", defaultValue: "code", isBindProperty: true },
    { propertyName: "defaultOptionValue", label: "Default selected value",
      controlType: "INPUT_TEXT", valueType: "string", isBindProperty: true },
  ] },
  { sectionName: "Label", children: [labelText, labelPosition, labelAlignment, labelWidth] },
  { sectionName: "Search & filters", children: [
    { propertyName: "isFilterable", label: "Allow searching", controlType: "SWITCH",
      valueType: "boolean", defaultValue: true, isBindProperty: true, isJSConvertible: true },
    { propertyName: "serverSideFiltering", label: "Server side filtering",
      controlType: "SWITCH", valueType: "boolean", defaultValue: false,
      isBindProperty: true, isJSConvertible: true },
  ] },
  { sectionName: "Validations", children: [required] },
  { sectionName: "General", children: [tooltip,
    { propertyName: "placeholderText", label: "Placeholder", controlType: "INPUT_TEXT",
      valueType: "string", isBindProperty: true }, visible, disabled, loading] },
];

export const CHOICE_PROPERTY_CONTROLS: Record<ChoiceWidgetType,
  Record<PropertyTab, readonly PropertySection[]>> = {
  SELECT_WIDGET: { content: selectContent,
    style: [{ sectionName: "Label styles", children: labelStyles },
      { sectionName: "Border and shadow", children: [radius, shadow] }] },
  MULTI_SELECT_WIDGET_V2: { content: selectContent.map((section) =>
    section.sectionName === "Data" ? { ...section, children: [
      ...section.children.slice(0, 3),
      { propertyName: "defaultOptionValue", label: "Default selected values",
        controlType: "JSON_ARRAY", valueType: "object", isBindProperty: true } as PropertyControl,
    ] } : section.sectionName === "General" ? { ...section, children: [
      ...section.children,
      { propertyName: "allowSelectAll", label: "Allow select all",
        controlType: "SWITCH", valueType: "boolean", isBindProperty: true,
        isJSConvertible: true } as PropertyControl,
    ] } : section),
    style: [{ sectionName: "Label styles", children: labelStyles },
      { sectionName: "Border and shadow", children: [radius, shadow] }] },
  CHECKBOX_GROUP_WIDGET: { content: [
    ...groupContent.slice(0, 3),
    { sectionName: "General", children: [
      ...groupContent[3].children.slice(0, 4),
      { propertyName: "isSelectAll", label: "Select all options",
        controlType: "SWITCH", valueType: "boolean", isBindProperty: true,
        isJSConvertible: true } as PropertyControl, loading,
    ] },
  ], style: [
    { sectionName: "Label styles", children: labelStyles },
    { sectionName: "General", children: [{ propertyName: "optionAlignment", label: "Alignment",
      controlType: "DROP_DOWN", valueType: "string", options: [
        { label: "None", value: "unset" }, { label: "Start", value: "flex-start" },
        { label: "End", value: "flex-end" }, { label: "Center", value: "center" },
        { label: "Between", value: "space-between" }, { label: "Around", value: "space-around" },
      ], isBindProperty: true, isJSConvertible: true }] },
    { sectionName: "Color", children: [accent] },
    { sectionName: "Border and shadow", children: [radius] },
  ] },
  SWITCH_GROUP_WIDGET: { content: groupContent, style: [
    { sectionName: "Label styles", children: labelStyles },
    { sectionName: "General", children: [{ propertyName: "alignment", label: "Alignment",
      controlType: "ICON_TABS", valueType: "string", defaultValue: "LEFT", fullWidth: true,
      options: [{ label: "Left", value: "LEFT" }, { label: "Right", value: "RIGHT" }],
      isBindProperty: true }] },
    { sectionName: "Color", children: [accent] },
  ] },
};
