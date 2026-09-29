import type { PropertyControl, PropertySection, PropertyTab } from "../../property-controls/config";

const visible: PropertyControl = { propertyName: "isVisible", label: "Visible",
  controlType: "SWITCH", valueType: "boolean", defaultValue: true,
  isBindProperty: true, isJSConvertible: true };
const loading: PropertyControl = { propertyName: "animateLoading", label: "Animate loading",
  controlType: "SWITCH", valueType: "boolean", defaultValue: true,
  isBindProperty: true, isJSConvertible: true };
const radius: PropertyControl = { propertyName: "borderRadius", label: "Border radius",
  controlType: "BORDER_RADIUS_OPTIONS", valueType: "string", options: [
    { label: "None", value: "0px" }, { label: "M", value: "0.375rem" },
    { label: "L", value: "1.5rem" } ] };
const shadow: PropertyControl = { propertyName: "boxShadow", label: "Box shadow",
  controlType: "BOX_SHADOW_OPTIONS", valueType: "string", options: [
    { label: "None", value: "none" },
    { label: "Small", value: "0 1px 3px rgba(0,0,0,.1)" },
    { label: "Medium", value: "0 4px 6px rgba(0,0,0,.1)" } ] };
const labelStyles: PropertyControl[] = [
  { propertyName: "labelTextColor", label: "Font color", controlType: "COLOR_PICKER",
    valueType: "string", isBindProperty: true, isJSConvertible: true },
  { propertyName: "labelTextSize", label: "Font size", controlType: "DROP_DOWN",
    valueType: "string", defaultValue: "0.875rem", options: [
      { label: "S", value: "0.875rem" }, { label: "M", value: "1rem" },
      { label: "L", value: "1.25rem" }, { label: "XL", value: "1.875rem" },
      { label: "XXL", value: "3rem" }, { label: "3XL", value: "3.75rem" } ] },
  { propertyName: "labelStyle", label: "Emphasis", controlType: "BUTTON_GROUP",
    valueType: "string", options: [ { label: "Bold", value: "BOLD" },
      { label: "Italic", value: "ITALIC" } ], isBindProperty: true, isJSConvertible: true },
];

const richTextContent: readonly PropertySection[] = [
  { sectionName: "Data", children: [
    { propertyName: "inputType", label: "Input Type", controlType: "ICON_TABS",
      valueType: "string", defaultValue: "html", fullWidth: true,
      options: [{ label: "Markdown", value: "markdown" }, { label: "HTML", value: "html" }] },
    { propertyName: "defaultText", label: "Default value", controlType: "INPUT_TEXT_AREA",
      valueType: "string", placeholderText: "<b>Hello World</b>", isBindProperty: true },
  ] },
  { sectionName: "Label", children: [
    { propertyName: "labelText", label: "Text", controlType: "INPUT_TEXT",
      valueType: "string", isBindProperty: true },
    { propertyName: "labelPosition", label: "Position", controlType: "ICON_TABS",
      valueType: "string", defaultValue: "Top", fullWidth: true,
      options: [{ label: "Auto", value: "Auto" }, { label: "Left", value: "Left" },
        { label: "Top", value: "Top" }] },
    { propertyName: "labelAlignment", label: "Alignment", controlType: "ICON_TABS",
      valueType: "string", fullWidth: true,
      options: [{ label: "Left", value: "LEFT" }, { label: "Right", value: "RIGHT" }],
      visibleWhen: [{ propertyName: "labelPosition", equals: "Left" }] },
    { propertyName: "labelWidth", label: "Width (in columns)", controlType: "INPUT_TEXT",
      valueType: "number", validation: { min: 0, integer: true },
      visibleWhen: [{ propertyName: "labelPosition", equals: "Left" }] },
  ] },
  { sectionName: "Validations", children: [
    { propertyName: "isRequired", label: "Required", controlType: "SWITCH",
      valueType: "boolean", isBindProperty: true, isJSConvertible: true },
  ] },
  { sectionName: "General", children: [
    { propertyName: "labelTooltip", label: "Tooltip", controlType: "INPUT_TEXT",
      valueType: "string", isBindProperty: true },
    visible,
    { propertyName: "isDisabled", label: "Disabled", controlType: "SWITCH",
      valueType: "boolean", isBindProperty: true, isJSConvertible: true },
    loading,
    { propertyName: "isToolbarHidden", label: "Hide toolbar", controlType: "SWITCH",
      valueType: "boolean", isBindProperty: true, isJSConvertible: true },
  ] },
];
const richTextStyle: readonly PropertySection[] = [
  { sectionName: "Label styles", children: labelStyles },
  { sectionName: "Border and shadow", children: [radius, shadow] },
];

const jsonFormContent: readonly PropertySection[] = [
  { sectionName: "Data", children: [
    { propertyName: "sourceData", label: "Source data", controlType: "INPUT_TEXT_AREA",
      valueType: "string", isBindProperty: true,
      placeholderText: '{ "name": "John", "age": 24 }' },
    { propertyName: "autoGenerateForm", label: "Auto generate form", controlType: "SWITCH",
      valueType: "boolean", defaultValue: true, isBindProperty: true, isJSConvertible: true },
  ] },
  { sectionName: "General", children: [
    { propertyName: "title", label: "Title", controlType: "INPUT_TEXT",
      valueType: "string", isBindProperty: true }, visible,
    { propertyName: "useSourceData", label: "Hidden fields in data",
      controlType: "SWITCH", valueType: "boolean", isBindProperty: true, isJSConvertible: true },
    loading,
    { propertyName: "disabledWhenInvalid", label: "Disable when form is invalid",
      controlType: "SWITCH", valueType: "boolean", defaultValue: true,
      isBindProperty: true, isJSConvertible: true },
    { propertyName: "fixedFooter", label: "Fixed Footer", controlType: "SWITCH",
      valueType: "boolean", defaultValue: true, isBindProperty: true, isJSConvertible: true },
    { propertyName: "scrollContents", label: "Scroll contents", controlType: "SWITCH",
      valueType: "boolean", defaultValue: true, isBindProperty: true },
    { propertyName: "showReset", label: "Show reset", controlType: "SWITCH",
      valueType: "boolean", defaultValue: true, isBindProperty: true, isJSConvertible: true },
    { propertyName: "submitButtonLabel", label: "Submit button label", controlType: "INPUT_TEXT",
      valueType: "string", isBindProperty: true },
    { propertyName: "resetButtonLabel", label: "Reset button label", controlType: "INPUT_TEXT",
      valueType: "string", isBindProperty: true },
    { propertyName: "maxAllowedFields", label: "Max allowed fields", controlType: "INPUT_TEXT",
      valueType: "number", placeholderText: "1-200", validation: { min: 1, max: 200, integer: true },
      isBindProperty: true },
  ] },
];
const jsonFormStyle: readonly PropertySection[] = [
  { sectionName: "Color", children: [
    { propertyName: "backgroundColor", label: "Background color", controlType: "COLOR_PICKER",
      valueType: "string", isBindProperty: true, isJSConvertible: true },
    { propertyName: "borderColor", label: "Border color", controlType: "COLOR_PICKER",
      valueType: "string", isBindProperty: true, isJSConvertible: true },
  ] },
  { sectionName: "Border and shadow", children: [
    { propertyName: "borderWidth", label: "Border width", controlType: "INPUT_TEXT",
      valueType: "number", validation: { min: 0 }, isBindProperty: true },
    radius, shadow,
  ] },
];

export const RICH_JSON_PROPERTY_CONTROLS: Record<
  "RICH_TEXT_EDITOR_WIDGET" | "JSON_FORM_WIDGET", Record<PropertyTab, readonly PropertySection[]>
> = {
  RICH_TEXT_EDITOR_WIDGET: { content: richTextContent, style: richTextStyle },
  JSON_FORM_WIDGET: { content: jsonFormContent, style: jsonFormStyle },
};
