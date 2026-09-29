import type { PropertyControl, PropertySection, PropertyTab } from "../../property-controls/config";
import type { CaptureUploadWidgetType } from "./model";
import { FileDataTypes, ScannerLayout } from "./model";

const bool = (propertyName: string, label: string): PropertyControl => ({
  propertyName, label, controlType: "SWITCH", valueType: "boolean",
  isBindProperty: true, isJSConvertible: true,
});
const text = (propertyName: string, label: string): PropertyControl => ({
  propertyName, label, controlType: "INPUT_TEXT", valueType: "string",
  isBindProperty: true,
});
const color = (propertyName: string, label: string): PropertyControl => ({
  propertyName, label, controlType: "COLOR_PICKER", valueType: "string",
  isBindProperty: true, isJSConvertible: true,
});
const general = (includeLoading = true): PropertySection => ({
  sectionName: "General", children: [
    bool("isVisible", "Visible"), bool("isDisabled", "Disabled"),
    ...(includeLoading ? [bool("animateLoading", "Animate loading")] : []),
  ],
});
const border: PropertySection = { sectionName: "Border and shadow", children: [
  { propertyName: "borderRadius", label: "Border radius",
    controlType: "BORDER_RADIUS_OPTIONS", valueType: "string",
    isBindProperty: true, isJSConvertible: true },
  { propertyName: "boxShadow", label: "Box shadow",
    controlType: "BOX_SHADOW_OPTIONS", valueType: "string",
    isBindProperty: true, isJSConvertible: true },
] };

/** Appsmith event ACTION_SELECTOR controls are omitted until product actions exist. */
export const CAPTURE_UPLOAD_PROPERTY_CONTROLS: Record<CaptureUploadWidgetType,
  Record<PropertyTab, readonly PropertySection[]>> = {
  FILE_PICKER_WIDGET_V2: {
    content: [
      { sectionName: "Basic", children: [
        // Appsmith uses a multiselect DROP_DOWN; the local property pane currently
        // supports arrays through JSON_ARRAY, preserving the authored value.
        { propertyName: "allowedFileTypes", label: "Allowed file types",
          controlType: "JSON_ARRAY", valueType: "object", isBindProperty: true },
        { propertyName: "fileDataType", label: "Data format",
          controlType: "DROP_DOWN", valueType: "string", options: [
            { label: "Base64", value: FileDataTypes.Base64 },
            { label: "Binary", value: FileDataTypes.Binary },
            { label: "Text", value: FileDataTypes.Text },
            { label: "Array of Objects (CSV, XLS(X), JSON, TSV)", value: FileDataTypes.Array },
          ] },
        { ...bool("dynamicTyping", "Infer data-types from CSV"),
          visibleWhen: [{ propertyName: "fileDataType", equals: FileDataTypes.Array }] },
        { propertyName: "maxNumFiles", label: "Max no. of files",
          controlType: "INPUT_TEXT", valueType: "number", isBindProperty: true,
          validation: { min: 1, integer: true } },
      ] },
      { sectionName: "Label", children: [text("label", "Text")] },
      { sectionName: "Validation", children: [
        bool("isRequired", "Required"),
        { propertyName: "maxFileSize", label: "Max file size(Mb)",
          controlType: "INPUT_TEXT", valueType: "number", isBindProperty: true,
          validation: { min: 1, max: 200, integer: true } },
      ] },
      general(),
    ],
    style: [{ sectionName: "Color", children: [color("buttonColor", "Button color")] }, border],
  },
  AUDIO_RECORDER_WIDGET: {
    content: [general()],
    style: [{ sectionName: "Styles", children: [
      { ...color("iconColor", "Icon color"), isBindProperty: false, isJSConvertible: false },
      color("accentColor", "Button color"),
    ] }, border],
  },
  CAMERA_WIDGET: {
    content: [{ sectionName: "General", children: [
      { propertyName: "mode", label: "Mode", controlType: "ICON_TABS",
        valueType: "string", defaultValue: "CAMERA", fullWidth: true,
        options: [{ label: "Image", value: "CAMERA" }, { label: "Video", value: "VIDEO" }] },
      bool("isVisible", "Visible"), bool("isDisabled", "Disabled"),
      bool("isMirrored", "Mirrored"),
      { propertyName: "defaultCamera", label: "Default camera",
        controlType: "DROP_DOWN", valueType: "string", defaultValue: "environment",
        isBindProperty: true, options: [
          { label: "Front", value: "user" }, { label: "Back", value: "environment" },
        ] },
    ] }],
    style: [border],
  },
  CODE_SCANNER_WIDGET: {
    content: [
      { sectionName: "Basic", children: [
        { propertyName: "scannerLayout", label: "Scanner layout",
          controlType: "ICON_TABS", valueType: "string", fullWidth: true,
          defaultValue: ScannerLayout.ALWAYS_ON,
          options: [{ label: "Always on", value: ScannerLayout.ALWAYS_ON },
            { label: "Click to scan", value: ScannerLayout.CLICK_TO_SCAN }] },
        { ...text("label", "Text"),
          visibleWhen: [{ propertyName: "scannerLayout", equals: ScannerLayout.CLICK_TO_SCAN }] },
      ] },
      { sectionName: "General", children: [
        bool("isVisible", "Visible"), bool("isDisabled", "Disabled"),
        bool("animateLoading", "Animate loading"),
        { ...text("tooltip", "Tooltip"),
          visibleWhen: [{ propertyName: "scannerLayout", equals: ScannerLayout.CLICK_TO_SCAN }] },
        { propertyName: "defaultCamera", label: "Default camera",
          controlType: "DROP_DOWN", valueType: "string", defaultValue: "environment",
          isBindProperty: true, options: [
            { label: "Front", value: "user" }, { label: "Back", value: "environment" },
          ] },
      ] },
    ],
    style: [
      { sectionName: "Icon", children: [
        { propertyName: "iconAlign", label: "Position", controlType: "ICON_TABS",
          valueType: "string", options: [
            { label: "Left", value: "left" }, { label: "Right", value: "right" },
          ], visibleWhen: [{ propertyName: "scannerLayout", equals: ScannerLayout.CLICK_TO_SCAN }] },
        { propertyName: "placement", label: "Placement", controlType: "ICON_TABS",
          valueType: "string", options: [
            { label: "Start", value: "START" }, { label: "Between", value: "BETWEEN" },
            { label: "Center", value: "CENTER" },
          ], visibleWhen: [{ propertyName: "scannerLayout", equals: ScannerLayout.CLICK_TO_SCAN }] },
      ] },
      { sectionName: "Color", children: [
        { ...color("buttonColor", "Button color"),
          visibleWhen: [{ propertyName: "scannerLayout", equals: ScannerLayout.CLICK_TO_SCAN }] },
      ] },
      border,
    ],
  },
};
