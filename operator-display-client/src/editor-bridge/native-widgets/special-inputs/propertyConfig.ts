import type { PropertyControl, PropertySection, PropertyTab } from "../../property-controls/config";
import { CurrencyTypeOptions } from "./Currency";
import { ISDCodeOptions } from "./ISDCodes_v2";
import { DATE_FORMAT_OPTIONS, type SpecialInputType } from "./specialInputsModel";

const switchControl = (propertyName: string, label: string, defaultValue?: boolean): PropertyControl => ({
  propertyName, label, controlType: "SWITCH", valueType: "boolean",
  defaultValue, isBindProperty: true, isJSConvertible: true,
});
const textControl = (propertyName: string, label: string, placeholderText?: string): PropertyControl => ({
  propertyName, label, controlType: "INPUT_TEXT", valueType: "string",
  placeholderText, isBindProperty: true,
});
const labelPosition: PropertyControl = {
  propertyName: "labelPosition", label: "Position", controlType: "ICON_TABS",
  valueType: "string", defaultValue: "Top", fullWidth: true,
  options: [{ label: "Auto", value: "Auto" }, { label: "Left", value: "Left" },
    { label: "Top", value: "Top" }],
};
const labelAlignment: PropertyControl = {
  propertyName: "labelAlignment", label: "Alignment", controlType: "ICON_TABS",
  valueType: "string", options: [{ label: "Left", value: "LEFT" },
    { label: "Right", value: "RIGHT" }],
  visibleWhen: [{ propertyName: "labelPosition", equals: "Left" }],
};
const labelWidth: PropertyControl = {
  propertyName: "labelWidth", label: "Width (in columns)", controlType: "INPUT_TEXT",
  valueType: "number", validation: { min: 0, integer: true },
  visibleWhen: [{ propertyName: "labelPosition", equals: "Left" }],
};
const labelSection: PropertySection = {
  sectionName: "Label", children: [textControl("label", "Text"), labelPosition,
    labelAlignment, labelWidth],
};
const labelStyles: PropertySection = {
  sectionName: "Label styles", children: [
    { propertyName: "labelTextColor", label: "Font color", controlType: "COLOR_PICKER",
      valueType: "string", isBindProperty: true, isJSConvertible: true },
    { propertyName: "labelTextSize", label: "Font size", controlType: "DROP_DOWN",
      valueType: "string", defaultValue: "0.875rem", options: [
        { label: "S", value: "0.875rem" }, { label: "M", value: "1rem" },
        { label: "L", value: "1.25rem" }, { label: "XL", value: "1.875rem" },
        { label: "XXL", value: "3rem" }, { label: "3XL", value: "3.75rem" },
      ] },
    { propertyName: "labelStyle", label: "Emphasis", controlType: "BUTTON_GROUP",
      valueType: "string", options: [{ label: "Bold", value: "BOLD", icon: "text-bold" },
        { label: "Italic", value: "ITALIC", icon: "text-italic" }] },
  ],
};
const borders: PropertySection = {
  sectionName: "Border and shadow", children: [
    { propertyName: "accentColor", label: "Accent color", controlType: "COLOR_PICKER",
      valueType: "string", isBindProperty: true, isJSConvertible: true },
    { propertyName: "borderRadius", label: "Border radius", controlType: "BORDER_RADIUS_OPTIONS",
      valueType: "string", options: [{ label: "None", value: "0px" },
        { label: "M", value: "0.375rem" }, { label: "L", value: "1.5rem" }] },
    { propertyName: "boxShadow", label: "Box shadow", controlType: "BOX_SHADOW_OPTIONS",
      valueType: "string", options: [{ label: "None", value: "none" },
        { label: "Small", value: "0 1px 3px rgba(0,0,0,.1)" },
        { label: "Medium", value: "0 4px 6px rgba(0,0,0,.1)" }] },
  ],
};

const commonInputGeneral: readonly PropertyControl[] = [
  textControl("tooltip", "Tooltip"), textControl("placeholderText", "Placeholder"),
  switchControl("isVisible", "Visible", true), switchControl("isDisabled", "Disabled", false),
  switchControl("animateLoading", "Animate loading", true),
  switchControl("autoFocus", "Auto focus", false),
];
const commonInputValidation: readonly PropertyControl[] = [
  switchControl("isRequired", "Required", false),
  textControl("regex", "Regex"), textControl("errorMessage", "Error message"),
];

export const SPECIAL_INPUT_PROPERTY_CONTROLS: Record<SpecialInputType,
  Record<PropertyTab, readonly PropertySection[]>> = {
  DATE_PICKER_WIDGET2: {
    content: [
      { sectionName: "Data", children: [
        { propertyName: "dateFormat", label: "Date format", controlType: "DROP_DOWN",
          valueType: "string", isBindProperty: true, isJSConvertible: true,
          options: DATE_FORMAT_OPTIONS.map((value) => ({ label: value, value })) },
        textControl("defaultDate", "Default Date", "Enter Default Date"),
        { propertyName: "firstDayOfWeek", label: "First Day Of Week",
          controlType: "INPUT_TEXT", valueType: "number", defaultValue: 0,
          validation: { min: 0, max: 6, integer: true } },
        { propertyName: "timePrecision", label: "Time Precision",
          controlType: "DROP_DOWN", valueType: "string", defaultValue: "minute",
          options: [{ label: "None", value: "None" },
            { label: "Minute", value: "minute" }, { label: "Second", value: "second" }] },
      ] },
      labelSection,
      { sectionName: "Validation", children: [
        switchControl("isRequired", "Required", false),
        textControl("minDate", "Min Date"), textControl("maxDate", "Max Date"),
      ] },
      { sectionName: "General", children: [
        textControl("labelTooltip", "Tooltip"),
        switchControl("isVisible", "Visible", true),
        switchControl("isDisabled", "Disabled", false),
        switchControl("animateLoading", "Animate loading", true),
        switchControl("shortcuts", "Show Shortcuts", false),
        switchControl("closeOnSelection", "Close On Selection", true),
      ] },
    ],
    style: [labelStyles, borders],
  },
  PHONE_INPUT_WIDGET: {
    content: [
      { sectionName: "Data", children: [
        textControl("defaultText", "Default value", "(000) 000-0000"),
        { propertyName: "defaultDialCode", label: "Default country code",
          controlType: "DROP_DOWN", valueType: "string", defaultValue: "+1",
          options: ISDCodeOptions.map((item) => ({
            label: `${item.name} (${item.dial_code})`, value: item.dial_code,
          })) },
        switchControl("allowDialCodeChange", "Change country code", false),
      ] },
      labelSection,
      { sectionName: "Validation", children: commonInputValidation },
      { sectionName: "General", children: [...commonInputGeneral,
        switchControl("allowFormatting", "Enable formatting", true)] },
    ],
    style: [labelStyles, borders],
  },
  CURRENCY_INPUT_WIDGET: {
    content: [
      { sectionName: "Data", children: [
        textControl("defaultText", "Default value", "100"),
        { propertyName: "defaultCurrencyCode", label: "Currency",
          controlType: "DROP_DOWN", valueType: "string", defaultValue: "INR",
          options: CurrencyTypeOptions.map((item) => ({
            label: `${item.currency} - ${item.currency_name}`, value: item.currency,
          })) },
        switchControl("allowCurrencyChange", "Allow currency change", false),
        { propertyName: "decimals", label: "Decimals allowed", controlType: "DROP_DOWN",
          valueType: "number", defaultValue: 0,
          options: Array.from({ length: 7 }, (_, value) => ({ label: String(value), value })) },
      ] },
      labelSection,
      { sectionName: "Validation", children: commonInputValidation },
      { sectionName: "General", children: [...commonInputGeneral,
        switchControl("showStepArrows", "Show step arrows", false)] },
    ],
    style: [labelStyles, borders],
  },
};
