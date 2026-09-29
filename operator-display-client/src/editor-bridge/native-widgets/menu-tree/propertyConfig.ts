import type { PropertyControl, PropertySection, PropertyTab } from "../../property-controls/config";
import type { MenuTreeWidgetType } from "./menuTreeModel";

const control = (propertyName: string, label: string,
  controlType: PropertyControl["controlType"],
  valueType: PropertyControl["valueType"] = "string",
  extras: Partial<PropertyControl> = {}): PropertyControl =>
  ({ propertyName, label, controlType, valueType, ...extras });

const visible = control("isVisible", "Visible", "SWITCH", "boolean", { isBindProperty: true });
const disabled = control("isDisabled", "Disabled", "SWITCH", "boolean", { isBindProperty: true });
const loading = control("animateLoading", "Animate loading", "SWITCH", "boolean", { defaultValue: true, isBindProperty: true });
const labelStyles: readonly PropertySection[] = [
  { sectionName: "Label styles", children: [
    control("labelTextColor", "Font color", "COLOR_PICKER", "string", { isBindProperty: true }),
    control("labelTextSize", "Font size", "DROP_DOWN", "string", {
      defaultValue: "0.875rem", options: [
        { label: "S", value: "0.875rem" }, { label: "M", value: "1rem" },
        { label: "L", value: "1.25rem" }, { label: "XL", value: "1.875rem" },
        { label: "XXL", value: "3rem" }, { label: "3XL", value: "3.75rem" },
      ], isBindProperty: true,
    }),
    control("labelStyle", "Emphasis", "BUTTON_GROUP", "string", {
      options: [{ label: "Bold", value: "BOLD" }, { label: "Italic", value: "ITALIC" }],
      isBindProperty: true,
    }),
  ] },
];
const radius = control("borderRadius", "Border radius", "BORDER_RADIUS_OPTIONS", "string", {
  options: [{ label: "None", value: "0px" }, { label: "M", value: "0.375rem" },
    { label: "L", value: "1.5rem" }], isBindProperty: true,
});
const shadow = control("boxShadow", "Box shadow", "BOX_SHADOW_OPTIONS", "string", {
  options: [{ label: "None", value: "none" },
    { label: "Small", value: "0 1px 3px rgba(0, 0, 0, .1)" },
    { label: "Medium", value: "0 4px 6px rgba(0, 0, 0, .1)" }],
  isBindProperty: true,
});

const treeContent = (multi: boolean): readonly PropertySection[] => [
  { sectionName: "Data", children: [
    control("options", "Options", "JSON_ARRAY", "object", {
      isBindProperty: true, placeholderText: '[{"label":"Blue","value":"BLUE","children":[]}]',
    }),
    control("defaultOptionValue", multi ? "Default selected values" : "Default selected value",
      multi ? "JSON_ARRAY" : "INPUT_TEXT", multi ? "object" : "string", { isBindProperty: true }),
  ] },
  { sectionName: "Label", children: [
    control("labelText", "Text", "INPUT_TEXT", "string", { isBindProperty: true }),
    control("labelPosition", "Position", "ICON_TABS", "string", {
      defaultValue: "Top", fullWidth: true, options: [
        { label: "Auto", value: "Auto" }, { label: "Left", value: "Left" },
        { label: "Top", value: "Top" },
      ],
    }),
    control("labelAlignment", "Alignment", "ICON_TABS", "string", {
      visibleWhen: [{ propertyName: "labelPosition", equals: "Left" }],
      options: [{ label: "Left", value: "LEFT" }, { label: "Right", value: "RIGHT" }],
    }),
    control("labelWidth", "Width (in columns)", "INPUT_TEXT", "number", {
      validation: { min: 0, integer: true },
      visibleWhen: [{ propertyName: "labelPosition", equals: "Left" }],
    }),
  ] },
  { sectionName: "Validations", children: [
    control("isRequired", "Required", "SWITCH", "boolean", { isBindProperty: true }),
  ] },
  { sectionName: "General", children: [
    control("labelTooltip", "Tooltip", "INPUT_TEXT", "string", { isBindProperty: true }),
    ...(multi ? [control("mode", "Mode", "DROP_DOWN", "string", {
      options: [{ label: "Display only parent items", value: "SHOW_PARENT" },
        { label: "Display only child items", value: "SHOW_CHILD" },
        { label: "Display all items", value: "SHOW_ALL" }],
    })] : []),
    control("placeholderText", "Placeholder", "INPUT_TEXT", "string", { isBindProperty: true }),
    visible, disabled, loading,
    control("allowClear", "Allow clearing value", "SWITCH", "boolean", { isBindProperty: true }),
    control("expandAll", "Expand all by default", "SWITCH", "boolean", { isBindProperty: true }),
  ] },
];

const treeStyle: readonly PropertySection[] = [
  ...labelStyles,
  { sectionName: "Border and shadow", children: [radius, shadow] },
];

/** Controls supported by the local pane, transcribed from the Appsmith configs. */
export const MENU_TREE_PROPERTY_CONTROLS: Record<MenuTreeWidgetType,
  Record<PropertyTab, readonly PropertySection[]>> = {
  MENU_BUTTON_WIDGET: {
    content: [
      { sectionName: "Basic", children: [
        control("label", "Label", "INPUT_TEXT", "string", { isBindProperty: true }),
        control("menuItemsSource", "Menu items source", "ICON_TABS", "string", {
          defaultValue: "STATIC", fullWidth: true,
          options: [{ label: "Static", value: "STATIC" }, { label: "Dynamic", value: "DYNAMIC" }],
        }),
        control("sourceData", "Source data", "JSON_ARRAY", "object", {
          isBindProperty: true, visibleWhen: [{ propertyName: "menuItemsSource", equals: "DYNAMIC" }],
        }),
      ] },
      { sectionName: "General", children: [visible, disabled, loading,
        control("isCompact", "Compact", "SWITCH", "boolean", { isBindProperty: true })] },
    ],
    style: [
      { sectionName: "General", children: [
        control("menuVariant", "Button variant", "DROP_DOWN", "string", {
          options: [{ label: "Primary", value: "PRIMARY" },
            { label: "Secondary", value: "SECONDARY" }, { label: "Tertiary", value: "TERTIARY" }],
          isBindProperty: true,
        }),
      ] },
      { sectionName: "Icon", children: [
        control("iconName", "Icon", "INPUT_TEXT", "string", { isBindProperty: true }),
        control("iconAlign", "Position", "ICON_TABS", "string", {
          options: [{ label: "Left", value: "left" }, { label: "Right", value: "right" }],
        }),
        control("placement", "Placement", "DROP_DOWN", "string", {
          options: [{ label: "Start", value: "START" },
            { label: "Between", value: "BETWEEN" }, { label: "Center", value: "CENTER" }],
        }),
      ] },
      { sectionName: "Color", children: [control("menuColor", "Button color", "COLOR_PICKER", "string", { isBindProperty: true })] },
      { sectionName: "Border and shadow", children: [radius, shadow] },
    ],
  },
  SINGLE_SELECT_TREE_WIDGET: { content: treeContent(false), style: treeStyle },
  MULTI_SELECT_TREE_WIDGET: { content: treeContent(true), style: treeStyle },
};

/** Source controls needing specialized item editors/action execution beyond the local pane. */
export const MENU_TREE_DEFERRED_PROPERTY_PATHS = {
  MENU_BUTTON_WIDGET: ["menuItems", "menuItems.*", "configureMenuItems", "configureMenuItems.config.*"],
  SINGLE_SELECT_TREE_WIDGET: ["onOptionChange", "onDropdownOpen", "onDropdownClose"],
  MULTI_SELECT_TREE_WIDGET: ["onOptionChange", "onDropdownOpen", "onDropdownClose"],
} as const;
