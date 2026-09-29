/**
 * Static, product-owned subset of Appsmith's widget property pane metadata.
 * This module has no Appsmith runtime, backend, worker, or store imports.
 */
import { FORM_PROPERTY_CONTROLS } from "../../native-widgets/form-controls/propertyConfig";
import { SLIDER_PROPERTY_CONTROLS } from "../../native-widgets/sliders/propertyConfig";
import { CHOICE_PROPERTY_CONTROLS } from "../../native-widgets/choice-controls/propertyConfig";
import { SPECIAL_INPUT_PROPERTY_CONTROLS } from "../../native-widgets/special-inputs/propertyConfig";
import { MAP_EMBED_PROPERTY_CONTROLS } from "../../native-widgets/map-embed/propertyConfig";
import { RICH_JSON_PROPERTY_CONTROLS } from "../../native-widgets/rich-json-form/propertyConfig";
import { MENU_TREE_PROPERTY_CONTROLS } from "../../native-widgets/menu-tree/propertyConfig";
import { CAPTURE_UPLOAD_PROPERTY_CONTROLS } from "../../native-widgets/capture-upload/propertyConfig";
import { CUSTOM_WIDGET_PROPERTY_CONTROLS } from "../../native-widgets/custom-widget/propertyConfig";
export type PropertyTab = "content" | "style";
export type PropertyValue = string | number | boolean;
export type PropertyValueType = "string" | "number" | "boolean" | "object";
export type PropertyControlType =
  | "INPUT_TEXT"
  | "INPUT_TEXT_AREA"
  | "SWITCH"
  | "DROP_DOWN"
  | "ICON_TABS"
  | "BUTTON_GROUP"
  | "COLOR_PICKER"
  | "BORDER_RADIUS_OPTIONS"
  | "BOX_SHADOW_OPTIONS"
  | "TABS_INPUT"
  | "CHART_DATA"
  | "JSON_ARRAY"
  | "LOCATION_SEARCH";

export interface PropertyOption {
  label: string;
  value: string | number;
  icon?: string;
  startIcon?: string;
  subText?: string;
}

/** Equivalent to the static part of an Appsmith `hidden` callback. */
export interface PropertyVisibility {
  propertyName: string;
  equals?: PropertyValue;
  notEquals?: PropertyValue;
  oneOf?: readonly PropertyValue[];
  notOneOf?: readonly PropertyValue[];
}

export interface PropertyValidation {
  min?: number;
  max?: number;
  integer?: boolean;
}

export interface PropertyControl {
  propertyName: string;
  label: string;
  controlType: PropertyControlType;
  valueType: PropertyValueType;
  helpText?: string;
  placeholderText?: string;
  defaultValue?: PropertyValue;
  options?: readonly PropertyOption[];
  fullWidth?: boolean;
  /** All conditions must match to show this control. */
  visibleWhen?: readonly PropertyVisibility[];
  validation?: PropertyValidation;
  /** The Appsmith source permits binding this property; local expression support is narrower. */
  isBindProperty?: boolean;
  isJSConvertible?: boolean;
}

export interface PropertySection {
  sectionName: string;
  children: readonly PropertyControl[];
}

export type SupportedPropertyWidgetType =
  | "TEXT_WIDGET"
  | "CHART_WIDGET"
  | "CONTAINER_WIDGET"
  | "STATBOX_WIDGET"
  | "TABS_WIDGET"
  | "MODAL_WIDGET"
  | "IMAGE_WIDGET"
  | "DIVIDER_WIDGET"
  | "PROGRESS_WIDGET"
  | "CHECKBOX_WIDGET"
  | "SWITCH_WIDGET"
  | "DOCUMENT_VIEWER_WIDGET"
  | "AUDIO_WIDGET"
  | "VIDEO_WIDGET"
  | "TABLE_WIDGET_V2"
  | "BUTTON_WIDGET"
  | "ICON_BUTTON_WIDGET"
  | "BUTTON_GROUP_WIDGET"
  | "INPUT_WIDGET_V2"
  | "RADIO_GROUP_WIDGET"
  | "RATE_WIDGET"
  | "NUMBER_SLIDER_WIDGET"
  | "RANGE_SLIDER_WIDGET"
  | "CATEGORY_SLIDER_WIDGET"
  | "FORM_WIDGET"
  | "CARD_WIDGET"
  | "SELECT_WIDGET"
  | "MULTI_SELECT_WIDGET_V2"
  | "CHECKBOX_GROUP_WIDGET"
  | "SWITCH_GROUP_WIDGET"
  | "DATE_PICKER_WIDGET2"
  | "PHONE_INPUT_WIDGET"
  | "CURRENCY_INPUT_WIDGET"
  | "IFRAME_WIDGET"
  | "MAP_WIDGET"
  | "MAP_CHART_WIDGET"
  | "RICH_TEXT_EDITOR_WIDGET"
  | "JSON_FORM_WIDGET"
  | "MENU_BUTTON_WIDGET"
  | "SINGLE_SELECT_TREE_WIDGET"
  | "MULTI_SELECT_TREE_WIDGET"
  | "FILE_PICKER_WIDGET_V2"
  | "AUDIO_RECORDER_WIDGET"
  | "CAMERA_WIDGET"
  | "CODE_SCANNER_WIDGET"
  | "CUSTOM_WIDGET"
  | "LIST_WIDGET_V2";

const BORDERS: readonly PropertyOption[] = [
  { label: "None", value: "0px" },
  { label: "M", value: "0.375rem" },
  { label: "L", value: "1.5rem" },
];

const SHADOWS: readonly PropertyOption[] = [
  { label: "None", value: "none" },
  { label: "Small", value: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)" },
  { label: "Medium", value: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)" },
  { label: "Large", value: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)" },
];

const VISIBLE: PropertyControl = {
  propertyName: "isVisible", label: "Visible", controlType: "SWITCH",
  valueType: "boolean", helpText: "Controls the visibility of the widget",
  defaultValue: true, isBindProperty: true, isJSConvertible: true,
};

// WidgetFeatures.PropertyPaneConfigTemplates injects Height into the Content
// tab's General section for widgets with the dynamicHeight feature enabled.
const HEIGHT: PropertyControl = {
  propertyName: "dynamicHeight", label: "Height", controlType: "DROP_DOWN",
  valueType: "string", defaultValue: "FIXED",
  helpText: "Configure the way the widget height reacts to content changes.",
  options: [
    { label: "Auto Height", value: "AUTO_HEIGHT" },
    { label: "Auto Height with limits", value: "AUTO_HEIGHT_WITH_LIMITS" },
    { label: "Fixed", value: "FIXED" },
  ],
};

// WidgetFeaturePropertyPaneEnhancements overrides Modal's height choices:
// app/client/src/utils/WidgetFeatures.ts offers only Auto Height and Fixed.
const MODAL_HEIGHT: PropertyControl = {
  ...HEIGHT,
  options: [
    { label: "Auto Height", value: "AUTO_HEIGHT" },
    { label: "Fixed", value: "FIXED" },
  ],
};

const HEIGHT_LIMITS: readonly PropertyControl[] = [
  { propertyName: "minDynamicHeight", label: "Minimum height (rows)",
    controlType: "INPUT_TEXT", valueType: "number",
    validation: { min: 4, max: 8999, integer: true },
    visibleWhen: [{ propertyName: "dynamicHeight", equals: "AUTO_HEIGHT_WITH_LIMITS" }] },
  { propertyName: "maxDynamicHeight", label: "Maximum height (rows)",
    controlType: "INPUT_TEXT", valueType: "number",
    validation: { min: 5, max: 9000, integer: true },
    visibleWhen: [{ propertyName: "dynamicHeight", equals: "AUTO_HEIGHT_WITH_LIMITS" }] },
];

const BORDER_RADIUS: PropertyControl = {
  propertyName: "borderRadius", label: "Border radius",
  controlType: "BORDER_RADIUS_OPTIONS", valueType: "string", options: BORDERS,
  helpText: "Rounds the corners of the widget's outer border edge",
  isBindProperty: true, isJSConvertible: true,
};

const BOX_SHADOW: PropertyControl = {
  propertyName: "boxShadow", label: "Box shadow",
  controlType: "BOX_SHADOW_OPTIONS", valueType: "string", options: SHADOWS,
  helpText: "Casts a drop shadow from the widget",
  isBindProperty: true, isJSConvertible: true,
};

const COLOR_HELP = "Use an HTML color name, HEX, RGB, or RGBA value";
const FONT_FAMILIES: readonly PropertyOption[] = [
  "System Default", "Nunito Sans", "Poppins", "Inter", "Montserrat",
  "Noto Sans", "Open Sans", "Roboto", "Rubik", "Ubuntu",
].map((value) => ({ label: value, value }));

const TEXT: Record<PropertyTab, readonly PropertySection[]> = {
  content: [
    {
      sectionName: "General",
      children: [
        { propertyName: "text", label: "Text", controlType: "INPUT_TEXT_AREA",
          valueType: "string", helpText: "Sets the text of the widget",
          placeholderText: "Name:", isBindProperty: true },
        { propertyName: "overflow", label: "Overflow Text", controlType: "ICON_TABS",
          valueType: "string", helpText: "Controls text that exceeds the widget",
          fullWidth: true, defaultValue: "NONE",
          options: [
            { label: "Scroll", value: "SCROLL" },
            { label: "Truncate", value: "TRUNCATE" },
            { label: "None", value: "NONE" },
          ] },
        VISIBLE,
        { propertyName: "disableLink", label: "Disable link",
          controlType: "SWITCH", valueType: "boolean",
          helpText: "Controls parsing text as a link",
          defaultValue: false, isBindProperty: true, isJSConvertible: true },
        HEIGHT, ...HEIGHT_LIMITS,
      ],
    },
  ],
  style: [
    {
      sectionName: "General",
      children: [
        { propertyName: "fontFamily", label: "Font family", controlType: "DROP_DOWN",
          valueType: "string", options: FONT_FAMILIES,
          helpText: "Controls the font family", defaultValue: "System Default",
          isBindProperty: true, isJSConvertible: true },
        { propertyName: "fontSize", label: "Font size", controlType: "DROP_DOWN",
          valueType: "string", defaultValue: "1rem", isBindProperty: true,
          isJSConvertible: true, options: [
            { label: "S", value: "0.875rem", subText: "0.875rem" },
            { label: "M", value: "1rem", subText: "1rem" },
            { label: "L", value: "1.25rem", subText: "1.25rem" },
            { label: "XL", value: "1.875rem", subText: "1.875rem" },
            { label: "XXL", value: "3rem", subText: "3rem" },
            { label: "3XL", value: "3.75rem", subText: "3.75rem" },
          ] },
      ],
    },
    {
      sectionName: "Color",
      children: [
        { propertyName: "textColor", label: "Text color", controlType: "COLOR_PICKER",
          valueType: "string", helpText: "Controls the color of the text",
          isBindProperty: true, isJSConvertible: true },
        { propertyName: "backgroundColor", label: "Background color",
          controlType: "COLOR_PICKER", valueType: "string", helpText: COLOR_HELP,
          isBindProperty: true, isJSConvertible: true },
        { propertyName: "borderColor", label: "Border color",
          controlType: "COLOR_PICKER", valueType: "string", helpText: COLOR_HELP,
          isBindProperty: true },
        { propertyName: "truncateButtonColor", label: "Truncate button color",
          controlType: "COLOR_PICKER", valueType: "string",
          helpText: "Controls the color of the truncate button",
          visibleWhen: [{ propertyName: "overflow", equals: "TRUNCATE" }],
          isBindProperty: true, isJSConvertible: true },
      ],
    },
    {
      sectionName: "Text formatting",
      children: [
        { propertyName: "textAlign", label: "Alignment", controlType: "ICON_TABS",
          valueType: "string", fullWidth: true, defaultValue: "LEFT",
          helpText: "Controls horizontal text alignment", isBindProperty: true,
          isJSConvertible: true, options: [
            { label: "Left", value: "LEFT", startIcon: "align-left" },
            { label: "Center", value: "CENTER", startIcon: "align-center" },
            { label: "Right", value: "RIGHT", startIcon: "align-right" },
          ] },
        { propertyName: "fontStyle", label: "Emphasis", controlType: "BUTTON_GROUP",
          valueType: "string", helpText: "Controls the emphasis of the text",
          isBindProperty: true, isJSConvertible: true, options: [
            { label: "Bold", value: "BOLD", icon: "text-bold" },
            { label: "Italic", value: "ITALIC", icon: "text-italic" },
          ] },
      ],
    },
    {
      sectionName: "Border and shadow",
      children: [
        { propertyName: "borderWidth", label: "Border width", controlType: "INPUT_TEXT",
          valueType: "number", placeholderText: "Enter value in px",
          helpText: "Enter border width", isBindProperty: true,
          validation: { min: 0 } },
      ],
    },
  ],
};

const CHART: Record<PropertyTab, readonly PropertySection[]> = {
  content: [
    {
      sectionName: "Data",
      children: [
        { propertyName: "chartType", label: "Chart type", controlType: "DROP_DOWN",
          valueType: "string", helpText: "Changes the visualization of chart data",
          isBindProperty: true, isJSConvertible: true, options: [
            { label: "Line chart", value: "LINE_CHART" },
            { label: "Bar chart", value: "BAR_CHART" },
            { label: "Pie chart", value: "PIE_CHART" },
            { label: "Column chart", value: "COLUMN_CHART" },
            { label: "Area chart", value: "AREA_CHART" },
          ] },
        { propertyName: "chartData", label: "Chart data", controlType: "CHART_DATA",
          valueType: "object", helpText: "Edit static series as JSON x/y points." },
      ],
    },
    {
      sectionName: "General",
      children: [
        { propertyName: "chartName", label: "Title", controlType: "INPUT_TEXT",
          valueType: "string", placeholderText: "Sales Report",
          helpText: "Adds a title to the chart", isBindProperty: true,
          visibleWhen: [{ propertyName: "chartType", notEquals: "CUSTOM_ECHART" }] },
        VISIBLE,
        { propertyName: "allowScroll", label: "Allow scroll", controlType: "SWITCH",
          valueType: "boolean", helpText: "Enables scrolling inside the chart",
          defaultValue: false,
          visibleWhen: [{ propertyName: "chartType", notOneOf: ["PIE_CHART", "CUSTOM_ECHART", "CUSTOM_FUSION_CHART"] }] },
        { propertyName: "showDataPointLabel", label: "Show Labels",
          controlType: "SWITCH", valueType: "boolean",
          helpText: "Shows data point labels on series",
          defaultValue: false,
          visibleWhen: [{ propertyName: "chartType", notOneOf: ["CUSTOM_ECHART", "CUSTOM_FUSION_CHART"] }] },
      ],
    },
    {
      sectionName: "Axis",
      children: [
        { propertyName: "setAdaptiveYMin", label: "Adaptive axis",
          controlType: "SWITCH", valueType: "boolean",
          helpText: "Define the minimum scale for the axis",
          defaultValue: false, isBindProperty: true,
          visibleWhen: [{ propertyName: "chartType", notEquals: "CUSTOM_ECHART" }] },
        { propertyName: "xAxisName", label: "x-axis label",
          controlType: "INPUT_TEXT", valueType: "string",
          placeholderText: "Dates", helpText: "Specifies the x-axis label",
          isBindProperty: true,
          visibleWhen: [{ propertyName: "chartType", notOneOf: ["CUSTOM_ECHART", "CUSTOM_FUSION_CHART"] }] },
        { propertyName: "yAxisName", label: "y-axis label",
          controlType: "INPUT_TEXT", valueType: "string",
          placeholderText: "Revenue", helpText: "Specifies the y-axis label",
          isBindProperty: true,
          visibleWhen: [{ propertyName: "chartType", notOneOf: ["CUSTOM_ECHART", "CUSTOM_FUSION_CHART"] }] },
        { propertyName: "labelOrientation", label: "x-axis label orientation",
          controlType: "DROP_DOWN", valueType: "string",
          visibleWhen: [{ propertyName: "chartType", oneOf: ["LINE_CHART", "COLUMN_CHART", "AREA_CHART"] }],
          options: [
            { label: "Auto", value: "auto" },
            { label: "Slant", value: "slant" },
            { label: "Rotate", value: "rotate" },
          ] },
      ],
    },
  ],
  style: [
    { sectionName: "Border and shadow", children: [BORDER_RADIUS, BOX_SHADOW] },
  ],
};

const CONTAINER: Record<PropertyTab, readonly PropertySection[]> = {
  content: [
    { sectionName: "General", children: [
      VISIBLE,
      { propertyName: "shouldScrollContents", label: "Scroll contents",
        controlType: "SWITCH", valueType: "boolean",
        helpText: "Enables scrolling for content inside the widget",
        defaultValue: false },
      HEIGHT, ...HEIGHT_LIMITS,
    ] },
  ],
  style: [
    { sectionName: "Color", children: [
      { propertyName: "backgroundColor", label: "Background color",
        controlType: "COLOR_PICKER", valueType: "string",
        placeholderText: "#FFFFFF / Gray / rgb(255, 99, 71)",
        helpText: COLOR_HELP, isBindProperty: true, isJSConvertible: true },
      { propertyName: "borderColor", label: "Border color",
        controlType: "COLOR_PICKER", valueType: "string",
        placeholderText: "#FFFFFF / Gray / rgb(255, 99, 71)",
        helpText: COLOR_HELP, isBindProperty: true },
    ] },
    { sectionName: "Border and shadow", children: [
      { propertyName: "borderWidth", label: "Border width",
        controlType: "INPUT_TEXT", valueType: "number",
        placeholderText: "Enter value in px", helpText: "Enter border width",
        validation: { min: 0 }, isBindProperty: true },
      BORDER_RADIUS, BOX_SHADOW,
    ] },
  ],
};

/** StatboxWidget inherits Container's Fixed canvas and uses these source sections. */
const STATBOX: Record<PropertyTab, readonly PropertySection[]> = {
  content: [
    { sectionName: "General", children: [
      VISIBLE,
      { propertyName: "shouldScrollContents", label: "Scroll contents",
        controlType: "SWITCH", valueType: "boolean",
        helpText: "Enables scrolling for content inside the widget",
        defaultValue: true },
      { propertyName: "animateLoading", label: "Animate loading",
        controlType: "SWITCH", valueType: "boolean",
        helpText: "Controls the loading of the widget",
        defaultValue: true, isBindProperty: true, isJSConvertible: true },
      HEIGHT, ...HEIGHT_LIMITS,
    ] },
  ],
  style: [
    { sectionName: "Color", children: [
      { propertyName: "backgroundColor", label: "Background color",
        controlType: "COLOR_PICKER", valueType: "string",
        placeholderText: "#FFFFFF / Gray / rgb(255, 99, 71)",
        helpText: COLOR_HELP, isBindProperty: true, isJSConvertible: true },
      { propertyName: "borderColor", label: "Border color",
        controlType: "COLOR_PICKER", valueType: "string",
        placeholderText: "#FFFFFF / Gray / rgb(255, 99, 71)",
        helpText: COLOR_HELP, isBindProperty: true, isJSConvertible: true },
    ] },
    { sectionName: "Border and shadow", children: [
      { propertyName: "borderWidth", label: "Border width",
        controlType: "INPUT_TEXT", valueType: "number",
        placeholderText: "Enter value in px", helpText: "Enter value for border width",
        validation: { min: 0 }, isBindProperty: true },
      BORDER_RADIUS, BOX_SHADOW,
    ] },
  ],
};

/** TabsWidget.getPropertyPaneContentConfig / getPropertyPaneStyleConfig. */
const TABS: Record<PropertyTab, readonly PropertySection[]> = {
  content: [
    { sectionName: "Data", children: [
      { propertyName: "tabsObj", label: "Tabs", controlType: "TABS_INPUT",
        valueType: "object", helpText: "Add, rename, reorder, and show tabs." },
      { propertyName: "defaultTab", label: "Default tab", controlType: "INPUT_TEXT",
        valueType: "string", placeholderText: "Tab 1",
        helpText: "Selects the tab shown by default." },
    ] },
    { sectionName: "General", children: [
      VISIBLE,
      { propertyName: "shouldScrollContents", label: "Scroll contents",
        controlType: "SWITCH", valueType: "boolean", defaultValue: true,
        helpText: "Enables scrolling for content inside the widget." },
      { propertyName: "shouldShowTabs", label: "Show tabs",
        controlType: "SWITCH", valueType: "boolean", defaultValue: true,
        helpText: "Shows the tab strip above the active canvas." },
      HEIGHT, ...HEIGHT_LIMITS,
    ] },
  ],
  style: [
    { sectionName: "Colors, Borders and Shadows", children: [
      { propertyName: "accentColor", label: "Accent color",
        controlType: "COLOR_PICKER", valueType: "string",
        helpText: "Sets the color of the selected tab's underline." },
      { propertyName: "backgroundColor", label: "Background color",
        controlType: "COLOR_PICKER", valueType: "string", helpText: COLOR_HELP },
      { propertyName: "borderColor", label: "Border color",
        controlType: "COLOR_PICKER", valueType: "string", helpText: COLOR_HELP },
      { propertyName: "borderWidth", label: "Border width",
        controlType: "INPUT_TEXT", valueType: "number",
        validation: { min: 0 }, helpText: "Enter value for border width." },
      BORDER_RADIUS, BOX_SHADOW,
    ] },
  ],
};

/** ModalWidget.getPropertyPaneContentConfig/getPropertyPaneStyleConfig.
 * The upstream onClose ACTION_SELECTOR is unavailable until product actions
 * have an execution contract; serialized dashboard events remain rejected.
 */
const MODAL: Record<PropertyTab, readonly PropertySection[]> = {
  content: [
    { sectionName: "General", children: [
      MODAL_HEIGHT,
      { propertyName: "shouldScrollContents", label: "Scroll contents",
        controlType: "SWITCH", valueType: "boolean", defaultValue: true,
        helpText: "Enables scrolling for content inside the widget",
        visibleWhen: [{ propertyName: "dynamicHeight",
          notOneOf: ["AUTO_HEIGHT", "AUTO_HEIGHT_WITH_LIMITS"] }] },
      { propertyName: "animateLoading", label: "Animate loading",
        controlType: "SWITCH", valueType: "boolean", defaultValue: true,
        helpText: "Controls the loading of the widget" },
      { propertyName: "canOutsideClickClose", label: "Quick Dismiss",
        controlType: "SWITCH", valueType: "boolean", defaultValue: true,
        helpText: "Allows dismissing the modal when user taps outside" },
    ] },
  ],
  style: [
    { sectionName: "Color", children: [
      { propertyName: "backgroundColor", label: "Background color",
        controlType: "COLOR_PICKER", valueType: "string",
        helpText: "Sets the background color of the widget" },
    ] },
    { sectionName: "Border and shadow", children: [BORDER_RADIUS] },
  ],
};

const IMAGE: Record<PropertyTab, readonly PropertySection[]> = {
  content: [
    { sectionName: "Data", children: [
      { propertyName: "image", label: "Image", controlType: "INPUT_TEXT",
        valueType: "string", placeholderText: "URL / Base64",
        helpText: "Sets the image to be displayed", isBindProperty: true },
      { propertyName: "defaultImage", label: "Default image",
        controlType: "INPUT_TEXT", valueType: "string",
        placeholderText: "URL / Base64",
        helpText: "Used when the primary image fails to load",
        isBindProperty: true },
    ] },
    { sectionName: "General", children: [
      { propertyName: "objectFit", label: "Object fit",
        controlType: "DROP_DOWN", valueType: "string",
        defaultValue: "contain",
        helpText: "Sets how the image fits its container",
        isBindProperty: true, isJSConvertible: true,
        options: [
          { label: "Contain", value: "contain" },
          { label: "Cover", value: "cover" },
          { label: "Auto", value: "auto" },
        ] },
      { propertyName: "maxZoomLevel", label: "Max zoom level",
        controlType: "DROP_DOWN", valueType: "number",
        helpText: "Controls the maximum image zoom",
        isBindProperty: true, isJSConvertible: true,
        options: [
          { label: "1x (No Zoom)", value: 1 },
          { label: "2x", value: 2 },
          { label: "4x", value: 4 },
          { label: "8x", value: 8 },
          { label: "16x", value: 16 },
        ] },
      VISIBLE,
      { propertyName: "enableRotation", label: "Enable rotation",
        controlType: "SWITCH", valueType: "boolean",
        helpText: "Allows the image to rotate",
        defaultValue: false, isBindProperty: true },
      { propertyName: "enableDownload", label: "Enable download",
        controlType: "SWITCH", valueType: "boolean",
        helpText: "Allows downloading the image",
        defaultValue: false, isBindProperty: true },
    ] },
  ],
  style: [
    { sectionName: "Border and shadow", children: [BORDER_RADIUS, BOX_SHADOW] },
  ],
};

const DIVIDER: Record<PropertyTab, readonly PropertySection[]> = {
  content: [
    { sectionName: "General", children: [VISIBLE] },
  ],
  style: [
    { sectionName: "General", children: [
      { propertyName: "orientation", label: "Direction",
        controlType: "ICON_TABS", valueType: "string", fullWidth: true,
        defaultValue: "horizontal", helpText: "Controls divider orientation",
        isBindProperty: true, isJSConvertible: true,
        options: [
          { label: "Horizontal", value: "horizontal" },
          { label: "Vertical", value: "vertical" },
        ] },
    ] },
    { sectionName: "Stroke", children: [
      { propertyName: "dividerColor", label: "Color",
        controlType: "COLOR_PICKER", valueType: "string",
        helpText: "Controls divider stroke color",
        isBindProperty: true, isJSConvertible: true },
      { propertyName: "strokeStyle", label: "Style",
        controlType: "DROP_DOWN", valueType: "string",
        helpText: "Controls divider stroke style",
        isBindProperty: true, isJSConvertible: true,
        options: [
          { label: "Solid", value: "solid", icon: "cap-solid" },
          { label: "Dashed", value: "dashed", icon: "line-dashed" },
          { label: "Dotted", value: "dotted", icon: "line-dotted" },
        ] },
      { propertyName: "thickness", label: "Thickness",
        controlType: "INPUT_TEXT", valueType: "number",
        placeholderText: "5", helpText: "Controls divider thickness",
        validation: { min: 0 },
        isBindProperty: true },
    ] },
    { sectionName: "Cap", children: [
      { propertyName: "capType", label: "Cap",
        controlType: "DROP_DOWN", valueType: "string",
        defaultValue: "nc",
        helpText: "Controls the type of divider cap",
        isBindProperty: true, isJSConvertible: true,
        options: [
          { label: "No cap", value: "nc", icon: "cap-solid" },
          { label: "Arrow", value: "arrow", icon: "arrow-forward" },
          { label: "Dot", value: "dot", icon: "cap-dot" },
        ] },
      { propertyName: "capSide", label: "Cap position",
        controlType: "ICON_TABS", valueType: "number", fullWidth: true,
        defaultValue: 0,
        helpText: "Changes the cap position",
        options: [
          { label: "Start", value: -1, startIcon: "contract-left-line" },
          { label: "Both", value: 0, startIcon: "column-freeze" },
          { label: "End", value: 1, startIcon: "contract-right-line" },
        ] },
    ] },
  ],
};

const PROGRESS: Record<PropertyTab, readonly PropertySection[]> = {
  content: [
    { sectionName: "Basic", children: [
      { propertyName: "isIndeterminate", label: "Infinite loading",
        controlType: "SWITCH", valueType: "boolean",
        helpText: "Sets determinate or indeterminate progress",
        defaultValue: false, isBindProperty: true },
      { propertyName: "progressType", label: "Type",
        controlType: "ICON_TABS", valueType: "string",
        fullWidth: true, defaultValue: "linear",
        helpText: "Determines the shape of the progress indicator",
        options: [
          { label: "Circular", value: "circular" },
          { label: "Linear", value: "linear" },
        ] },
      { propertyName: "progress", label: "Progress",
        controlType: "INPUT_TEXT", valueType: "number",
        defaultValue: 50, placeholderText: "Enter progress value",
        helpText: "Sets the value of the progress indicator",
        validation: { min: 0, max: 100 },
        visibleWhen: [{ propertyName: "isIndeterminate", notEquals: true }],
        isBindProperty: true },
    ] },
    { sectionName: "General", children: [
      { propertyName: "steps", label: "Number of steps",
        controlType: "INPUT_TEXT", valueType: "number",
        defaultValue: 1, placeholderText: "Enter number of steps",
        helpText: "Sets the number of steps",
        validation: { min: 1, max: 100, integer: true },
        visibleWhen: [{ propertyName: "isIndeterminate", notEquals: true }],
        isBindProperty: true },
      VISIBLE,
      { propertyName: "counterClockwise", label: "Counterclockwise",
        controlType: "SWITCH", valueType: "boolean",
        defaultValue: false,
        helpText: "Rotates circular progress counterclockwise",
        visibleWhen: [
          { propertyName: "progressType", equals: "circular" },
          { propertyName: "isIndeterminate", notEquals: true },
        ], isBindProperty: true },
      { propertyName: "showResult", label: "Show result",
        controlType: "SWITCH", valueType: "boolean",
        defaultValue: true,
        helpText: "Shows the value of the progress indicator",
        visibleWhen: [{ propertyName: "isIndeterminate", notEquals: true }],
        isBindProperty: true, isJSConvertible: true },
    ] },
  ],
  style: [
    { sectionName: "Color", children: [
      { propertyName: "fillColor", label: "Fill color",
        controlType: "COLOR_PICKER", valueType: "string",
        helpText: "Sets the color of the progress indicator",
        isBindProperty: true, isJSConvertible: true },
    ] },
  ],
};

const LIST_V2: Record<PropertyTab, readonly PropertySection[]> = {
  content: [
    { sectionName: "Data", children: [
      { propertyName: "listData", label: "Items", controlType: "JSON_ARRAY",
        valueType: "object", placeholderText: '[{ "name": "John" }]',
        helpText: "Write a literal JSON array to display in the List." },
    ] },
    { sectionName: "General", children: [
      VISIBLE,
      { propertyName: "animateLoading", label: "Animate loading",
        controlType: "SWITCH", valueType: "boolean", defaultValue: true,
        helpText: "Show loading cards while List data is loading." },
    ] },
  ],
  style: [
    { sectionName: "General", children: [
      { propertyName: "itemSpacing", label: "Item Spacing (px)",
        controlType: "INPUT_TEXT", valueType: "number",
        validation: { min: 0, max: 16, integer: true },
        helpText: "Sets the spacing between items in pixels to a max 16 px." },
    ] },
    { sectionName: "Color", children: [
      { propertyName: "backgroundColor", label: "Background color",
        controlType: "COLOR_PICKER", valueType: "string", helpText: COLOR_HELP },
    ] },
    { sectionName: "Border and shadow", children: [BORDER_RADIUS, BOX_SHADOW] },
  ],
};

const DOCUMENT_VIEWER: Record<PropertyTab, readonly PropertySection[]> = {
  content: [
    { sectionName: "Data", children: [
      { propertyName: "docUrl", label: "Document link", controlType: "INPUT_TEXT",
        valueType: "string", placeholderText: "URL / Base64", isBindProperty: true },
    ] },
    { sectionName: "General", children: [VISIBLE,
      { propertyName: "animateLoading", label: "Animate loading",
        controlType: "SWITCH", valueType: "boolean", defaultValue: true }] },
  ],
  style: [],
};

const MEDIA_DATA: readonly PropertySection[] = [
  { sectionName: "Data", children: [
    { propertyName: "url", label: "URL", controlType: "INPUT_TEXT",
      valueType: "string", placeholderText: "Enter URL", isBindProperty: true },
  ] },
  { sectionName: "General", children: [
    { propertyName: "autoPlay", label: "Autoplay", controlType: "SWITCH",
      valueType: "boolean", defaultValue: false, isBindProperty: true },
    VISIBLE,
    { propertyName: "animateLoading", label: "Animate loading",
      controlType: "SWITCH", valueType: "boolean", defaultValue: true },
  ] },
];

const AUDIO: Record<PropertyTab, readonly PropertySection[]> = {
  content: MEDIA_DATA,
  style: [],
};

const VIDEO: Record<PropertyTab, readonly PropertySection[]> = {
  content: MEDIA_DATA,
  style: [
    { sectionName: "Color", children: [
      { propertyName: "backgroundColor", label: "Background color",
        controlType: "COLOR_PICKER", valueType: "string", isBindProperty: true },
    ] },
    { sectionName: "Border and shadow", children: [BORDER_RADIUS, BOX_SHADOW] },
  ],
};

const TABLE_V2: Record<PropertyTab, readonly PropertySection[]> = {
  content: [
    { sectionName: "Data", children: [
      { propertyName: "tableData", label: "Table data",
        controlType: "JSON_ARRAY", valueType: "object",
        placeholderText: '[{ "name": "John" }]', isBindProperty: true },
    ] },
    { sectionName: "Pagination", children: [
      { propertyName: "isVisiblePagination", label: "Show pagination",
        controlType: "SWITCH", valueType: "boolean", defaultValue: true },
    ] },
    { sectionName: "Search & filters", children: [
      { propertyName: "isVisibleSearch", label: "Show search",
        controlType: "SWITCH", valueType: "boolean", defaultValue: true },
      { propertyName: "enableClientSideSearch", label: "Client side search",
        controlType: "SWITCH", valueType: "boolean", defaultValue: true },
      { propertyName: "isVisibleFilters", label: "Show filters",
        controlType: "SWITCH", valueType: "boolean", defaultValue: false },
      { propertyName: "isSortable", label: "Enable sorting",
        controlType: "SWITCH", valueType: "boolean", defaultValue: true },
    ] },
    { sectionName: "General", children: [
      { propertyName: "isVisibleDownload", label: "Show download",
        controlType: "SWITCH", valueType: "boolean", defaultValue: true },
      VISIBLE,
      { propertyName: "animateLoading", label: "Animate loading",
        controlType: "SWITCH", valueType: "boolean", defaultValue: true },
    ] },
  ],
  style: [
    { sectionName: "General", children: [
      { propertyName: "compactMode", label: "Default row height",
        controlType: "ICON_TABS", valueType: "string", defaultValue: "DEFAULT",
        options: [
          { label: "Short", value: "SHORT" },
          { label: "Default", value: "DEFAULT" },
          { label: "Tall", value: "TALL" },
        ] },
    ] },
    { sectionName: "Border", children: [
      { propertyName: "borderColor", label: "Border color",
        controlType: "COLOR_PICKER", valueType: "string" },
      { propertyName: "borderWidth", label: "Border width",
        controlType: "INPUT_TEXT", valueType: "string" },
    ] },
  ],
};

const BUTTON_VARIANTS: readonly PropertyOption[] = [
  { label: "Primary", value: "PRIMARY" },
  { label: "Secondary", value: "SECONDARY" },
  { label: "Tertiary", value: "TERTIARY" },
];

const BUTTON: Record<PropertyTab, readonly PropertySection[]> = {
  content: [
    { sectionName: "Label", children: [
      { propertyName: "text", label: "Text", controlType: "INPUT_TEXT",
        valueType: "string", placeholderText: "Submit", isBindProperty: true },
    ] },
    { sectionName: "General", children: [
      { propertyName: "tooltip", label: "Tooltip", controlType: "INPUT_TEXT",
        valueType: "string", isBindProperty: true },
      VISIBLE,
      { propertyName: "isDisabled", label: "Disabled", controlType: "SWITCH",
        valueType: "boolean", defaultValue: false },
      { propertyName: "animateLoading", label: "Animate loading",
        controlType: "SWITCH", valueType: "boolean", defaultValue: true },
    ] },
  ],
  style: [
    { sectionName: "General", children: [
      { propertyName: "buttonVariant", label: "Button variant",
        controlType: "ICON_TABS", valueType: "string",
        defaultValue: "PRIMARY", options: BUTTON_VARIANTS },
      { propertyName: "iconName", label: "Icon",
        controlType: "INPUT_TEXT", valueType: "string" },
      { propertyName: "iconAlign", label: "Icon position",
        controlType: "ICON_TABS", valueType: "string",
        options: [{ label: "Left", value: "left" }, { label: "Right", value: "right" }] },
      { propertyName: "placement", label: "Placement",
        controlType: "ICON_TABS", valueType: "string",
        options: [{ label: "Start", value: "START" },
          { label: "Center", value: "CENTER" },
          { label: "Between", value: "BETWEEN" }] },
    ] },
    { sectionName: "Color", children: [
      { propertyName: "buttonColor", label: "Button color",
        controlType: "COLOR_PICKER", valueType: "string" },
      { propertyName: "labelTextColor", label: "Label color",
        controlType: "COLOR_PICKER", valueType: "string" },
    ] },
    { sectionName: "Border and shadow", children: [BORDER_RADIUS, BOX_SHADOW] },
  ],
};

const ICON_BUTTON: Record<PropertyTab, readonly PropertySection[]> = {
  content: [
    { sectionName: "General", children: [
      { propertyName: "iconName", label: "Icon", controlType: "INPUT_TEXT",
        valueType: "string" },
      { propertyName: "tooltip", label: "Tooltip", controlType: "INPUT_TEXT",
        valueType: "string" },
      VISIBLE,
      { propertyName: "isDisabled", label: "Disabled", controlType: "SWITCH",
        valueType: "boolean", defaultValue: false },
      { propertyName: "animateLoading", label: "Animate loading",
        controlType: "SWITCH", valueType: "boolean", defaultValue: true },
    ] },
  ],
  style: [
    { sectionName: "General", children: [
      { propertyName: "buttonVariant", label: "Button variant",
        controlType: "ICON_TABS", valueType: "string",
        defaultValue: "PRIMARY", options: BUTTON_VARIANTS },
    ] },
    { sectionName: "Color", children: [
      { propertyName: "buttonColor", label: "Button color",
        controlType: "COLOR_PICKER", valueType: "string" },
    ] },
    { sectionName: "Border and shadow", children: [BORDER_RADIUS, BOX_SHADOW] },
  ],
};

const BUTTON_GROUP: Record<PropertyTab, readonly PropertySection[]> = {
  content: [{ sectionName: "General", children: [VISIBLE,
    { propertyName: "isDisabled", label: "Disabled", controlType: "SWITCH",
      valueType: "boolean", defaultValue: false },
    { propertyName: "animateLoading", label: "Animate loading",
      controlType: "SWITCH", valueType: "boolean", defaultValue: true },
  ] }],
  style: [
    { sectionName: "General", children: [
      { propertyName: "buttonVariant", label: "Button variant",
        controlType: "ICON_TABS", valueType: "string",
        defaultValue: "PRIMARY", options: BUTTON_VARIANTS },
      { propertyName: "orientation", label: "Orientation",
        controlType: "ICON_TABS", valueType: "string",
        options: [{ label: "Horizontal", value: "horizontal" },
          { label: "Vertical", value: "vertical" }] },
    ] },
    { sectionName: "Border and shadow", children: [BORDER_RADIUS, BOX_SHADOW] },
  ],
};

const FORM: Record<PropertyTab, readonly PropertySection[]> = {
  content: [{ sectionName: "General", children: [VISIBLE,
    { propertyName: "shouldScrollContents", label: "Scroll contents",
      controlType: "SWITCH", valueType: "boolean" },
    { propertyName: "animateLoading", label: "Animate loading",
      controlType: "SWITCH", valueType: "boolean", defaultValue: true },
    HEIGHT, ...HEIGHT_LIMITS,
  ] }],
  style: CONTAINER.style,
};

const CARD: Record<PropertyTab, readonly PropertySection[]> = {
  content: [
    { sectionName: "Media", children: [
      { propertyName: "mediaPosition", label: "Position", controlType: "DROP_DOWN",
        valueType: "string", options: [
          { label: "Top", value: "TOP" }, { label: "Left", value: "LEFT" },
          { label: "None", value: "NONE" },
        ] },
      { propertyName: "mediaImage", label: "Image", controlType: "INPUT_TEXT",
        valueType: "string", visibleWhen: [{ propertyName: "mediaPosition", notEquals: "NONE" }] },
      { propertyName: "mediaHeight", label: "Media height", controlType: "INPUT_TEXT",
        valueType: "number", validation: { min: 0 },
        visibleWhen: [{ propertyName: "mediaPosition", equals: "TOP" }] },
      { propertyName: "mediaObjectFit", label: "Image fit", controlType: "DROP_DOWN",
        valueType: "string", options: [
          { label: "Cover", value: "cover" }, { label: "Contain", value: "contain" },
        ] },
    ] },
    { sectionName: "Header", children: [
      { propertyName: "showHeader", label: "Show header", controlType: "SWITCH", valueType: "boolean" },
      { propertyName: "title", label: "Title", controlType: "INPUT_TEXT", valueType: "string" },
      { propertyName: "subtitle", label: "Subtitle", controlType: "INPUT_TEXT", valueType: "string" },
      { propertyName: "avatarImage", label: "Avatar image", controlType: "INPUT_TEXT", valueType: "string" },
      { propertyName: "avatarIcon", label: "Avatar icon", controlType: "INPUT_TEXT", valueType: "string" },
      { propertyName: "badgeText", label: "Badge text", controlType: "INPUT_TEXT", valueType: "string" },
      { propertyName: "badgeColor", label: "Badge color", controlType: "COLOR_PICKER", valueType: "string" },
      { propertyName: "showMenu", label: "Show menu", controlType: "SWITCH", valueType: "boolean" },
    ] },
    { sectionName: "Footer", children: [
      { propertyName: "showFooter", label: "Show footer", controlType: "SWITCH", valueType: "boolean" },
    ] },
    { sectionName: "Selection", children: [
      { propertyName: "selectionEnabled", label: "Enable selection", controlType: "SWITCH", valueType: "boolean" },
      { propertyName: "defaultSelected", label: "Default selected", controlType: "SWITCH", valueType: "boolean",
        visibleWhen: [{ propertyName: "selectionEnabled", equals: true }] },
    ] },
    { sectionName: "Expansion", children: [
      { propertyName: "expandCollapseEnabled", label: "Enable expand and collapse",
        controlType: "SWITCH", valueType: "boolean" },
      { propertyName: "defaultExpanded", label: "Default expanded", controlType: "SWITCH", valueType: "boolean",
        visibleWhen: [{ propertyName: "expandCollapseEnabled", equals: true }] },
    ] },
    { sectionName: "General", children: [VISIBLE,
      { propertyName: "isClickable", label: "Clickable", controlType: "SWITCH", valueType: "boolean" },
      { propertyName: "isDisabled", label: "Disabled", controlType: "SWITCH", valueType: "boolean" },
      { propertyName: "shouldScrollContents", label: "Scroll contents", controlType: "SWITCH", valueType: "boolean" },
      { propertyName: "animateLoading", label: "Animate loading", controlType: "SWITCH", valueType: "boolean" },
      HEIGHT, ...HEIGHT_LIMITS,
    ] },
  ],
  style: [
    { sectionName: "Color", children: [
      { propertyName: "backgroundColor", label: "Background color", controlType: "COLOR_PICKER", valueType: "string" },
      { propertyName: "borderColor", label: "Border color", controlType: "COLOR_PICKER", valueType: "string" },
      { propertyName: "selectedAccentColor", label: "Selected accent color",
        controlType: "COLOR_PICKER", valueType: "string" },
    ] },
    { sectionName: "Dividers and elevation", children: [
      { propertyName: "showHeaderDivider", label: "Header divider", controlType: "SWITCH", valueType: "boolean" },
      { propertyName: "showFooterDivider", label: "Footer divider", controlType: "SWITCH", valueType: "boolean" },
      { propertyName: "hoverElevation", label: "Hover elevation", controlType: "SWITCH", valueType: "boolean" },
    ] },
    { sectionName: "Border and shadow", children: [
      { propertyName: "borderWidth", label: "Border width", controlType: "INPUT_TEXT", valueType: "number" },
      BORDER_RADIUS, BOX_SHADOW,
    ] },
  ],
};

/** Section order and labels follow Appsmith's widget property pane configs. */
export const PROPERTY_CONTROLS: Record<SupportedPropertyWidgetType, Record<PropertyTab, readonly PropertySection[]>> = {
  TEXT_WIDGET: TEXT,
  CHART_WIDGET: CHART,
  CONTAINER_WIDGET: CONTAINER,
  STATBOX_WIDGET: STATBOX,
  TABS_WIDGET: TABS,
  MODAL_WIDGET: MODAL,
  IMAGE_WIDGET: IMAGE,
  DIVIDER_WIDGET: DIVIDER,
  PROGRESS_WIDGET: PROGRESS,
  CHECKBOX_WIDGET: FORM_PROPERTY_CONTROLS.CHECKBOX_WIDGET,
  SWITCH_WIDGET: FORM_PROPERTY_CONTROLS.SWITCH_WIDGET,
  DOCUMENT_VIEWER_WIDGET: DOCUMENT_VIEWER,
  AUDIO_WIDGET: AUDIO,
  VIDEO_WIDGET: VIDEO,
  TABLE_WIDGET_V2: TABLE_V2,
  BUTTON_WIDGET: BUTTON,
  ICON_BUTTON_WIDGET: ICON_BUTTON,
  BUTTON_GROUP_WIDGET: BUTTON_GROUP,
  INPUT_WIDGET_V2: FORM_PROPERTY_CONTROLS.INPUT_WIDGET_V2,
  RADIO_GROUP_WIDGET: FORM_PROPERTY_CONTROLS.RADIO_GROUP_WIDGET,
  RATE_WIDGET: SLIDER_PROPERTY_CONTROLS.RATE_WIDGET,
  NUMBER_SLIDER_WIDGET: SLIDER_PROPERTY_CONTROLS.NUMBER_SLIDER_WIDGET,
  RANGE_SLIDER_WIDGET: SLIDER_PROPERTY_CONTROLS.RANGE_SLIDER_WIDGET,
  CATEGORY_SLIDER_WIDGET: SLIDER_PROPERTY_CONTROLS.CATEGORY_SLIDER_WIDGET,
  FORM_WIDGET: FORM,
  CARD_WIDGET: CARD,
  SELECT_WIDGET: CHOICE_PROPERTY_CONTROLS.SELECT_WIDGET,
  MULTI_SELECT_WIDGET_V2: CHOICE_PROPERTY_CONTROLS.MULTI_SELECT_WIDGET_V2,
  CHECKBOX_GROUP_WIDGET: CHOICE_PROPERTY_CONTROLS.CHECKBOX_GROUP_WIDGET,
  SWITCH_GROUP_WIDGET: CHOICE_PROPERTY_CONTROLS.SWITCH_GROUP_WIDGET,
  DATE_PICKER_WIDGET2: SPECIAL_INPUT_PROPERTY_CONTROLS.DATE_PICKER_WIDGET2,
  PHONE_INPUT_WIDGET: SPECIAL_INPUT_PROPERTY_CONTROLS.PHONE_INPUT_WIDGET,
  CURRENCY_INPUT_WIDGET: SPECIAL_INPUT_PROPERTY_CONTROLS.CURRENCY_INPUT_WIDGET,
  IFRAME_WIDGET: MAP_EMBED_PROPERTY_CONTROLS.IFRAME_WIDGET,
  MAP_WIDGET: MAP_EMBED_PROPERTY_CONTROLS.MAP_WIDGET,
  MAP_CHART_WIDGET: MAP_EMBED_PROPERTY_CONTROLS.MAP_CHART_WIDGET,
  RICH_TEXT_EDITOR_WIDGET: RICH_JSON_PROPERTY_CONTROLS.RICH_TEXT_EDITOR_WIDGET,
  JSON_FORM_WIDGET: RICH_JSON_PROPERTY_CONTROLS.JSON_FORM_WIDGET,
  MENU_BUTTON_WIDGET: MENU_TREE_PROPERTY_CONTROLS.MENU_BUTTON_WIDGET,
  SINGLE_SELECT_TREE_WIDGET: MENU_TREE_PROPERTY_CONTROLS.SINGLE_SELECT_TREE_WIDGET,
  MULTI_SELECT_TREE_WIDGET: MENU_TREE_PROPERTY_CONTROLS.MULTI_SELECT_TREE_WIDGET,
  FILE_PICKER_WIDGET_V2: CAPTURE_UPLOAD_PROPERTY_CONTROLS.FILE_PICKER_WIDGET_V2,
  AUDIO_RECORDER_WIDGET: CAPTURE_UPLOAD_PROPERTY_CONTROLS.AUDIO_RECORDER_WIDGET,
  CAMERA_WIDGET: CAPTURE_UPLOAD_PROPERTY_CONTROLS.CAMERA_WIDGET,
  CODE_SCANNER_WIDGET: CAPTURE_UPLOAD_PROPERTY_CONTROLS.CODE_SCANNER_WIDGET,
  CUSTOM_WIDGET: CUSTOM_WIDGET_PROPERTY_CONTROLS,
  LIST_WIDGET_V2: LIST_V2,
};

export function isSupportedPropertyWidget(type: string): type is SupportedPropertyWidgetType {
  return Object.hasOwn(PROPERTY_CONTROLS, type);
}

function matchesVisibility(condition: PropertyVisibility, values: Record<string, unknown>): boolean {
  const value = values[condition.propertyName];
  if (condition.equals !== undefined && value !== condition.equals) return false;
  if (condition.notEquals !== undefined && value === condition.notEquals) return false;
  if (condition.oneOf && !condition.oneOf.includes(value as PropertyValue)) return false;
  if (condition.notOneOf?.includes(value as PropertyValue)) return false;
  return true;
}

/** Returns the visible Appsmith ordered sections for a selected widget. */
export function getPropertySections(
  widgetType: string,
  tab: PropertyTab,
  values: Record<string, unknown> = {},
): PropertySection[] {
  if (!isSupportedPropertyWidget(widgetType)) return [];
  return PROPERTY_CONTROLS[widgetType][tab]
    .map(({ sectionName, children }) => ({
      sectionName,
      children: children.filter((field) =>
        field.visibleWhen?.every((condition) => matchesVisibility(condition, values)) ?? true,
      ),
    }))
    .filter(({ children }) => children.length > 0);
}
