import type { PropertyControl, PropertySection, PropertyTab } from "../../property-controls/config";

// Appsmith CustomWidget/widget/index.tsx content and style sections. The
// source editor and dynamic event action selectors use control types outside
// the local property pane, so they are exposed by the source-editor contract.
const color = (propertyName: string, label: string): PropertyControl => ({
  propertyName, label, controlType: "COLOR_PICKER", valueType: "string",
  isBindProperty: true, isJSConvertible: true,
});

export const CUSTOM_WIDGET_PROPERTY_CONTROLS: Record<PropertyTab,
  readonly PropertySection[]> = {
  content: [
    { sectionName: "Default Model", children: [
      { propertyName: "defaultModel", label: "", controlType: "INPUT_TEXT_AREA",
        valueType: "string", defaultValue: "{}", isBindProperty: true },
    ] },
    { sectionName: "General", children: [
      { propertyName: "isVisible", label: "Visible", controlType: "SWITCH",
        valueType: "boolean", defaultValue: true,
        isBindProperty: true, isJSConvertible: true },
    ] },
  ],
  style: [
    { sectionName: "Color", children: [
      color("backgroundColor", "Background color"),
      color("borderColor", "Border color"),
    ] },
    { sectionName: "Border and shadow", children: [
      { propertyName: "borderWidth", label: "Border width", controlType: "INPUT_TEXT",
        valueType: "string", placeholderText: "Enter value in px", isBindProperty: true },
      { propertyName: "borderRadius", label: "Border radius",
        controlType: "BORDER_RADIUS_OPTIONS", valueType: "string",
        isBindProperty: true, isJSConvertible: true,
        options: [ { label: "None", value: "0px" },
          { label: "M", value: "0.375rem" }, { label: "L", value: "1.5rem" } ] },
      { propertyName: "boxShadow", label: "Box shadow", controlType: "BOX_SHADOW_OPTIONS",
        valueType: "string", isBindProperty: true, isJSConvertible: true,
        options: [ { label: "None", value: "none" },
          { label: "Small", value: "0 1px 3px rgba(0,0,0,.1)" },
          { label: "Medium", value: "0 4px 6px rgba(0,0,0,.1)" } ] },
    ] },
  ],
};
