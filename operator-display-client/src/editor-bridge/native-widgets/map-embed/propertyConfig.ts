import type { PropertyControl, PropertySection, PropertyTab } from "../../property-controls/config";
import { MAP_TYPES } from "./mapChartModel";

const toggle = (propertyName: string, label: string, defaultValue?: boolean): PropertyControl => ({
  propertyName, label, controlType: "SWITCH", valueType: "boolean",
  defaultValue, isBindProperty: true, isJSConvertible: true,
});
const text = (propertyName: string, label: string, placeholderText?: string): PropertyControl => ({
  propertyName, label, controlType: "INPUT_TEXT", valueType: "string",
  placeholderText, isBindProperty: true,
});
const radius: PropertyControl = { propertyName: "borderRadius", label: "Border radius",
  controlType: "BORDER_RADIUS_OPTIONS", valueType: "string", isBindProperty: true,
  options: [{ label: "None", value: "0px" }, { label: "M", value: "0.375rem" },
    { label: "L", value: "1.5rem" }] };
const shadow: PropertyControl = { propertyName: "boxShadow", label: "Box shadow",
  controlType: "BOX_SHADOW_OPTIONS", valueType: "string", isBindProperty: true,
  options: [{ label: "None", value: "none" },
    { label: "Small", value: "0 1px 3px rgba(0,0,0,.1)" },
    { label: "Medium", value: "0 4px 6px rgba(0,0,0,.1)" }] };
const border: PropertySection = { sectionName: "Border and shadow", children: [radius, shadow] };

/** Static controls from the three Appsmith widget property configs; action selectors await a product action contract. */
export const MAP_EMBED_PROPERTY_CONTROLS: Record<"IFRAME_WIDGET" | "MAP_WIDGET" | "MAP_CHART_WIDGET",
  Record<PropertyTab, readonly PropertySection[]>> = {
  IFRAME_WIDGET: {
    content: [
      { sectionName: "Data", children: [text("source", "URL", "https://docs.appsmith.com"),
        text("srcDoc", "srcDoc", "<p>Inline HTML</p>")] },
      { sectionName: "General", children: [text("title", "Title", "Documentation"),
        toggle("animateLoading", "Animate loading", true), toggle("isVisible", "Visible", true)] },
    ],
    style: [
      { sectionName: "Color", children: [{ propertyName: "borderColor", label: "Border color",
        controlType: "COLOR_PICKER", valueType: "string", isBindProperty: true }] },
      { sectionName: "Border and shadow", children: [
        { propertyName: "borderWidth", label: "Border width (px)", controlType: "INPUT_TEXT",
          valueType: "number", validation: { min: 0 }, isBindProperty: true },
        { propertyName: "borderOpacity", label: "Border opacity (%)", controlType: "INPUT_TEXT",
          valueType: "number", validation: { min: 0, max: 100 }, isBindProperty: true },
        radius, shadow,
      ] },
    ],
  },
  MAP_WIDGET: {
    content: [
      { sectionName: "Data", children: [
        { propertyName: "mapCenter", label: "Initial location", controlType: "LOCATION_SEARCH",
          valueType: "object", isBindProperty: true },
        { propertyName: "defaultMarkers", label: "Default markers", controlType: "JSON_ARRAY",
          valueType: "object", isBindProperty: true },
      ] },
      { sectionName: "General", children: [
        { propertyName: "zoomLevel", label: "Zoom level", controlType: "INPUT_TEXT",
          valueType: "number" },
        toggle("isVisible", "Visible", true), toggle("animateLoading", "Animate loading", true),
        toggle("enablePickLocation", "Enable pick location", true),
        toggle("isClickedMarkerCentered", "Map & marker centering", true),
        toggle("allowClustering", "Enable clustering", false),
        toggle("enableSearch", "Enable search location", true),
        toggle("enableMapTypeControl", "Enable map types", false),
      ] },
      { sectionName: "Create marker", children: [toggle("enableCreateMarker", "Create new marker", false)] },
    ],
    style: [border],
  },
  MAP_CHART_WIDGET: {
    content: [
      { sectionName: "Data", children: [
        { propertyName: "mapType", label: "Map Type", controlType: "DROP_DOWN",
          valueType: "string", isBindProperty: true,
          options: MAP_TYPES.map((value) => ({
            label: value === "SOURTH_AMERICA" ? "South America" :
              value.split("_").map((word) => word.charAt(0) + word.slice(1).toLowerCase()).join(" "),
            value,
          })) },
        { propertyName: "data", label: "Chart Data", controlType: "JSON_ARRAY",
          valueType: "object", isBindProperty: true },
      ] },
      { sectionName: "General", children: [text("mapTitle", "Title", "Enter title"),
        toggle("isVisible", "Visible", true), toggle("showLabels", "Show Labels", true)] },
    ],
    style: [
      { sectionName: "General", children: [{ propertyName: "colorRange", label: "Color Range",
        controlType: "JSON_ARRAY", valueType: "object", isBindProperty: true }] },
      border,
    ],
  },
};
