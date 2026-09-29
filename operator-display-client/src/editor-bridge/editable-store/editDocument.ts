import { nanoid } from "nanoid";
import {
  parseDashboardDocument,
  type AppsmithWidgetDsl,
  type DashboardDocument,
} from "../../document";
import type { JsonValue } from "../../document/types";
import {
  DEFAULT_GRID_COLUMNS,
  DEFAULT_GRID_ROW_HEIGHT,
  MAX_HEIGHT_IN_ROWS,
  MIN_HEIGHT_IN_ROWS,
  DYNAMIC_HEIGHT_FEATURE_TYPES,
  defaultDynamicHeightProperties,
  dynamicHeightModeUpdates,
  calculateDropTargetRows,
  getFixedCanvasSnapGrid,
  normalizedMainCanvasBottomRow,
  type DynamicHeight,
} from "../appsmith-fixed-autoheight/autoHeightRules";
import {
  planFixedLayout,
  preferredDirections,
  rectOf,
  type FixedLayoutPlan,
  type GridRect,
} from "./fixedLayoutPlanner";
import {
  createTabCanvasBlueprint,
  createTabsWidgetBlueprint,
} from "../native-widgets/tabs/tabsBlueprint";
import {
  orderedTabs,
  orderedVisibleTabs,
  resolveSelectedTabCanvasId,
  tabsCanvasHeightOffsetRows,
} from "../native-widgets/tabs/tabsModel";
import { createModalWidgetBlueprint } from "../native-widgets/modal/modalBlueprint";
import { modalCanvasBottomRows, modalResizeDimensions } from "../native-widgets/modal/modalResizeModel";
import { createListV2Blueprint } from "../native-widgets/list-v2/listV2Blueprint";
import { createStatboxWidgetBlueprint } from "../native-widgets/statbox/statboxBlueprint";
import { getButtonControlDefaults } from "../native-widgets/button-controls/buttonControlsModel";
import { createFormWidgetBlueprint, createCardWidgetBlueprint } from "../native-widgets/form-card/blueprints";
import { cardChromeHeightInPx } from "../native-widgets/form-card/viewModel";
import { CHOICE_DEFAULTS } from "../native-widgets/choice-controls/choiceModel";
import { specialInputDefaults } from "../native-widgets/special-inputs/specialInputsModel";
import { getIframeDefaults, getMapDefaults } from "../native-widgets/map-embed/mapEmbedModel";
import { getMapChartDefaults, isMapType, mapTypeUpdates } from "../native-widgets/map-embed/mapChartModel";
import { RICH_TEXT_DEFAULTS } from "../native-widgets/rich-json-form/richTextModel";
import { JSON_FORM_DEFAULTS } from "../native-widgets/rich-json-form/jsonFormModel";
import { MENU_TREE_DEFAULTS } from "../native-widgets/menu-tree/menuTreeModel";
import { captureUploadDefaults } from "../native-widgets/capture-upload/model";
import { customWidgetDefaults, type CustomSrcDoc } from "../native-widgets/custom-widget/customWidgetModel";
import {
  RATE_DEFAULTS, NUMBER_SLIDER_DEFAULTS, RANGE_SLIDER_DEFAULTS,
  CATEGORY_SLIDER_DEFAULTS,
} from "../native-widgets/sliders/defaults";
import {
  assertOutsideListV2Template,
  assertStaticListV2Data,
} from "../native-widgets/list-v2/listV2EditBoundary";

export type { GridRect } from "./fixedLayoutPlanner";

export type AddableWidgetType =
  | "TEXT_WIDGET"
  | "CHART_WIDGET"
  | "CONTAINER_WIDGET"
  | "STATBOX_WIDGET"
  | "TABS_WIDGET"
  | "MODAL_WIDGET"
  | "LIST_WIDGET_V2"
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
  | "CUSTOM_WIDGET";

export interface AddWidgetRequest {
  type: AddableWidgetType;
  /** A canvas, container, or an existing widget whose parent canvas is used. */
  parentId?: string;
  leftColumn?: number;
  topRow?: number;
  /** Appsmith's dragged block dimensions after modifyBlockDimension. */
  columns?: number;
  rows?: number;
}

export interface UpdateWidgetPropertyRequest {
  widgetId: string;
  property: string;
  value: JsonValue;
}

export interface UpdateCustomWidgetSourceRequest {
  widgetId: string;
  srcDoc: CustomSrcDoc;
  uncompiledSrcDoc: CustomSrcDoc;
}

export interface UpdateWidgetHeightModeRequest {
  widgetId: string;
  mode: DynamicHeight;
}

export interface UpdateWidgetHeightLimitsRequest {
  widgetId: string;
  minRows?: number;
  maxRows?: number;
}

export interface MoveWidgetRequest {
  widgetId: string;
  leftColumn: number;
  topRow: number;
  /** Appsmith WIDGETS_MOVE includes the edge-adjusted opposite edges. */
  rightColumn?: number;
  bottomRow?: number;
  /** Destination canvas or container. Omitted to keep the current parent. */
  parentId?: string;
}

export interface ResizeWidgetRequest {
  widgetId: string;
  /** Updated origin for left and top resize handles. */
  leftColumn?: number;
  topRow?: number;
  width: number;
  height: number;
}

/** Detached Modal pixel resize, corresponding to Appsmith's MODAL_RESIZE. */
export interface ResizeModalRequest {
  widgetId: string;
  canvasWidgetId: string;
  width: number;
  height: number;
  mainCanvasWidth: number;
}

export type LayoutChange =
  | { kind: "add"; request: AddWidgetRequest }
  | { kind: "move"; request: MoveWidgetRequest }
  | { kind: "resize"; request: ResizeWidgetRequest };

export interface LayoutPreview {
  valid: boolean;
  error?: string;
  parentId: string | null;
  target: GridRect | null;
  reflowed: Record<string, GridRect>;
}

export interface LayoutPreviewOptions {
  /** Appsmith enables drop-target reflow after its drag-time 500 ms timer. */
  shouldReflowDropTarget?: boolean;
  /** Final preview from the same Appsmith drag session, committed atomically. */
  committedPlan?: LayoutPreview;
}

export interface DeleteWidgetRequest {
  widgetId: string;
}

export interface RenameDocumentRequest {
  name: string;
}

export type TabEditRequest =
  | { widgetId: string; kind: "add" }
  | { widgetId: string; kind: "delete"; tabId: string }
  | { widgetId: string; kind: "rename"; tabId: string; label: string }
  | { widgetId: string; kind: "reorder"; tabId: string; toIndex: number }
  | { widgetId: string; kind: "visibility"; tabId: string; isVisible: boolean };

export interface EditResult {
  documentJson: string;
  selectedWidgetId: string | null;
  selectedWidgetIds?: string[];
}

// Appsmith widget getDefaults(): columns and rows used by the Fixed drag arena.
const DIMENSIONS: Record<AddableWidgetType, { width: number; height: number; name: string }> = {
  TEXT_WIDGET: { width: 16, height: 4, name: "Text" },
  CHART_WIDGET: { width: 24, height: 32, name: "Chart" },
  CONTAINER_WIDGET: { width: 24, height: 10, name: "Container" },
  STATBOX_WIDGET: { width: 22, height: 14, name: "Statbox" },
  TABS_WIDGET: { width: 24, height: 15, name: "Tabs" },
  MODAL_WIDGET: { width: 24, height: 24, name: "Modal" },
  LIST_WIDGET_V2: { width: 24, height: 40, name: "List" },
  IMAGE_WIDGET: { width: 12, height: 12, name: "Image" },
  DIVIDER_WIDGET: { width: 20, height: 4, name: "Divider" },
  PROGRESS_WIDGET: { width: 28, height: 4, name: "Progress" },
  CHECKBOX_WIDGET: { width: 12, height: 4, name: "Checkbox" },
  SWITCH_WIDGET: { width: 12, height: 4, name: "Switch" },
  DOCUMENT_VIEWER_WIDGET: { width: 24, height: 40, name: "DocumentViewer" },
  AUDIO_WIDGET: { width: 28, height: 4, name: "Audio" },
  VIDEO_WIDGET: { width: 24, height: 28, name: "Video" },
  TABLE_WIDGET_V2: { width: 34, height: 28, name: "Table" },
  BUTTON_WIDGET: { width: 16, height: 4, name: "Button" },
  ICON_BUTTON_WIDGET: { width: 4, height: 4, name: "IconButton" },
  BUTTON_GROUP_WIDGET: { width: 24, height: 4, name: "ButtonGroup" },
  INPUT_WIDGET_V2: { width: 20, height: 7, name: "Input" },
  RADIO_GROUP_WIDGET: { width: 20, height: 6, name: "RadioGroup" },
  RATE_WIDGET: { width: 20, height: 4, name: "Rating" },
  NUMBER_SLIDER_WIDGET: { width: 40, height: 8, name: "NumberSlider" },
  RANGE_SLIDER_WIDGET: { width: 40, height: 8, name: "RangeSlider" },
  CATEGORY_SLIDER_WIDGET: { width: 40, height: 8, name: "CategorySlider" },
  FORM_WIDGET: { width: 24, height: 40, name: "Form" },
  CARD_WIDGET: { width: 24, height: 30, name: "Card" },
  SELECT_WIDGET: { width: 20, height: 7, name: "Select" },
  MULTI_SELECT_WIDGET_V2: { width: 20, height: 7, name: "MultiSelect" },
  CHECKBOX_GROUP_WIDGET: { width: 23, height: 6, name: "CheckboxGroup" },
  SWITCH_GROUP_WIDGET: { width: 26, height: 6, name: "SwitchGroup" },
  DATE_PICKER_WIDGET2: { width: 20, height: 7, name: "DatePicker" },
  PHONE_INPUT_WIDGET: { width: 20, height: 7, name: "PhoneInput" },
  CURRENCY_INPUT_WIDGET: { width: 20, height: 7, name: "CurrencyInput" },
  IFRAME_WIDGET: { width: 24, height: 32, name: "Iframe" },
  MAP_WIDGET: { width: 24, height: 40, name: "Map" },
  MAP_CHART_WIDGET: { width: 24, height: 32, name: "MapChart" },
  RICH_TEXT_EDITOR_WIDGET: { width: 24, height: 20, name: "RichTextEditor" },
  JSON_FORM_WIDGET: { width: 25, height: 41, name: "JSONForm" },
  MENU_BUTTON_WIDGET: { width: 16, height: 4, name: "MenuButton" },
  SINGLE_SELECT_TREE_WIDGET: { width: 20, height: 7, name: "TreeSelect" },
  MULTI_SELECT_TREE_WIDGET: { width: 20, height: 7, name: "MultiTreeSelect" },
  FILE_PICKER_WIDGET_V2: { width: 16, height: 4, name: "FilePicker" },
  AUDIO_RECORDER_WIDGET: { width: 16, height: 7, name: "AudioRecorder" },
  CAMERA_WIDGET: { width: 25, height: 33, name: "Camera" },
  CODE_SCANNER_WIDGET: { width: 25, height: 33, name: "CodeScanner" },
  CUSTOM_WIDGET: { width: 23, height: 30, name: "Custom" },
};

export function defaultWidgetGridSize(type: AddableWidgetType): { width: number; height: number } {
  const { width, height } = DIMENSIONS[type];
  return { width, height };
}

const EDITABLE_PROPERTIES: Record<AddableWidgetType, Record<string, "string" | "number" | "boolean" | "object" | "numberOrString" | "chartData" | "jsonArray">> = {
  TEXT_WIDGET: {
    text: "string", fontSize: "string", fontStyle: "string", textAlign: "string",
    textColor: "string", backgroundColor: "string", borderColor: "string",
    borderWidth: "numberOrString", overflow: "string", disableLink: "boolean",
    fontFamily: "string", truncateButtonColor: "string", isVisible: "boolean",
  },
  CHART_WIDGET: {
    chartData: "chartData", chartName: "string", chartType: "string", xAxisName: "string",
    yAxisName: "string", showDataPointLabel: "boolean", allowScroll: "boolean",
    setAdaptiveYMin: "boolean", labelOrientation: "string", borderRadius: "numberOrString",
    boxShadow: "string", isVisible: "boolean",
  },
  CONTAINER_WIDGET: {
    backgroundColor: "string", borderColor: "string", borderWidth: "numberOrString",
    borderRadius: "numberOrString", boxShadow: "string", shouldScrollContents: "boolean",
    isVisible: "boolean",
  },
  STATBOX_WIDGET: {
    backgroundColor: "string", borderColor: "string", borderWidth: "numberOrString",
    borderRadius: "numberOrString", boxShadow: "string", shouldScrollContents: "boolean",
    animateLoading: "boolean", isVisible: "boolean",
  },
  TABS_WIDGET: {
    defaultTab: "string", shouldShowTabs: "boolean", shouldScrollContents: "boolean",
    backgroundColor: "string", borderColor: "string", borderWidth: "numberOrString",
    borderRadius: "numberOrString", boxShadow: "string", accentColor: "string",
    isVisible: "boolean",
  },
  MODAL_WIDGET: {
    shouldScrollContents: "boolean", animateLoading: "boolean",
    canOutsideClickClose: "boolean", canEscapeKeyClose: "boolean",
    backgroundColor: "string", borderRadius: "numberOrString",
    width: "number", height: "number",
  },
  LIST_WIDGET_V2: {
    listData: "jsonArray", itemSpacing: "number", backgroundColor: "string",
    borderRadius: "numberOrString",
    boxShadow: "string", animateLoading: "boolean", isVisible: "boolean",
  },
  IMAGE_WIDGET: {
    image: "string", defaultImage: "string", objectFit: "string",
    borderRadius: "numberOrString", boxShadow: "string", maxZoomLevel: "number",
    enableRotation: "boolean", enableDownload: "boolean", isVisible: "boolean",
  },
  DIVIDER_WIDGET: {
    orientation: "string", strokeStyle: "string", dividerColor: "string",
    thickness: "number", capType: "string", capSide: "number", isVisible: "boolean",
  },
  PROGRESS_WIDGET: {
    progress: "number", progressType: "string", isIndeterminate: "boolean",
    fillColor: "string", showResult: "boolean", steps: "number",
    counterClockwise: "boolean", isVisible: "boolean",
  },
  CHECKBOX_WIDGET: {
    label: "string", labelPosition: "string", alignWidget: "string",
    labelTooltip: "string", defaultCheckedState: "boolean", isRequired: "boolean",
    isVisible: "boolean", isDisabled: "boolean", animateLoading: "boolean",
    labelTextColor: "string", labelTextSize: "string", labelStyle: "string",
    accentColor: "string", borderRadius: "numberOrString",
  },
  SWITCH_WIDGET: {
    label: "string", labelPosition: "string", alignWidget: "string",
    defaultSwitchState: "boolean", isVisible: "boolean", isDisabled: "boolean",
    animateLoading: "boolean", labelTextColor: "string", labelTextSize: "string",
    labelStyle: "string", accentColor: "string",
  },
  DOCUMENT_VIEWER_WIDGET: {
    docUrl: "string", isVisible: "boolean", animateLoading: "boolean",
  },
  AUDIO_WIDGET: {
    url: "string", autoPlay: "boolean", isVisible: "boolean",
    animateLoading: "boolean",
  },
  VIDEO_WIDGET: {
    url: "string", autoPlay: "boolean", isVisible: "boolean",
    animateLoading: "boolean", backgroundColor: "string",
    borderRadius: "numberOrString", boxShadow: "string",
  },
  TABLE_WIDGET_V2: {
    tableData: "jsonArray", isVisibleSearch: "boolean", isVisibleFilters: "boolean",
    isVisibleDownload: "boolean", isVisiblePagination: "boolean",
    enableClientSideSearch: "boolean", isSortable: "boolean",
    compactMode: "string", borderColor: "string", borderWidth: "numberOrString",
    isVisible: "boolean", animateLoading: "boolean",
  },
  BUTTON_WIDGET: {
    text: "string", tooltip: "string", isDisabled: "boolean",
    isVisible: "boolean", animateLoading: "boolean",
    buttonVariant: "string", buttonColor: "string", placement: "string",
    iconName: "string", iconAlign: "string", labelTextColor: "string",
    labelTextSize: "string", labelStyle: "string",
    borderRadius: "numberOrString", boxShadow: "string",
  },
  ICON_BUTTON_WIDGET: {
    iconName: "string", tooltip: "string", isDisabled: "boolean",
    isVisible: "boolean", animateLoading: "boolean",
    buttonVariant: "string", buttonColor: "string",
    borderRadius: "numberOrString", boxShadow: "string",
  },
  BUTTON_GROUP_WIDGET: {
    orientation: "string", buttonVariant: "string", isDisabled: "boolean",
    isVisible: "boolean", animateLoading: "boolean",
    borderRadius: "numberOrString", boxShadow: "string",
  },
  INPUT_WIDGET_V2: {
    inputType: "string", defaultText: "string", label: "string",
    labelPosition: "string", labelAlignment: "string", labelWidth: "number",
    isRequired: "boolean", maxChars: "number", minNum: "number",
    maxNum: "number", regex: "string", errorMessage: "string",
    isSpellCheck: "boolean", placeholderText: "string",
    isVisible: "boolean", isDisabled: "boolean", animateLoading: "boolean",
    showStepArrows: "boolean", labelTextColor: "string",
    labelTextSize: "string", labelStyle: "string", accentColor: "string",
    borderRadius: "numberOrString", boxShadow: "string",
  },
  RADIO_GROUP_WIDGET: {
    options: "jsonArray", defaultOptionValue: "string", label: "string",
    labelPosition: "string", labelAlignment: "string", labelWidth: "number",
    isRequired: "boolean", labelTooltip: "string", isVisible: "boolean",
    isDisabled: "boolean", isInline: "boolean", animateLoading: "boolean",
    labelTextColor: "string", labelTextSize: "string",
    labelStyle: "string", accentColor: "string",
  },
  RATE_WIDGET: {
    maxCount: "number", defaultRate: "number", tooltips: "jsonArray",
    isAllowHalf: "boolean", isVisible: "boolean", isDisabled: "boolean",
    isReadOnly: "boolean", animateLoading: "boolean", size: "string",
    activeColor: "string", inactiveColor: "string",
  },
  NUMBER_SLIDER_WIDGET: {
    min: "number", max: "number", step: "number", defaultValue: "number",
    labelText: "string", labelPosition: "string", labelAlignment: "string",
    labelWidth: "number", labelTooltip: "string", showMarksLabel: "boolean",
    marks: "jsonArray", isVisible: "boolean", isDisabled: "boolean",
    animateLoading: "boolean", tooltipAlwaysOn: "boolean",
    sliderSize: "string", labelTextColor: "string", labelTextSize: "string",
    labelStyle: "string", accentColor: "string",
  },
  RANGE_SLIDER_WIDGET: {
    min: "number", max: "number", step: "number", minRange: "number",
    defaultStartValue: "number", defaultEndValue: "number",
    labelText: "string", labelPosition: "string", labelAlignment: "string",
    labelWidth: "number", labelTooltip: "string", showMarksLabel: "boolean",
    marks: "jsonArray", isVisible: "boolean", isDisabled: "boolean",
    animateLoading: "boolean", tooltipAlwaysOn: "boolean",
    sliderSize: "string", labelTextColor: "string", labelTextSize: "string",
    labelStyle: "string", accentColor: "string",
  },
  CATEGORY_SLIDER_WIDGET: {
    options: "jsonArray", defaultOptionValue: "string", labelText: "string",
    labelPosition: "string", labelAlignment: "string", labelWidth: "number",
    labelTooltip: "string", showMarksLabel: "boolean",
    isVisible: "boolean", isDisabled: "boolean", animateLoading: "boolean",
    sliderSize: "string", labelTextColor: "string", labelTextSize: "string",
    labelStyle: "string", accentColor: "string",
  },
  FORM_WIDGET: {
    backgroundColor: "string", borderColor: "string",
    borderWidth: "numberOrString", borderRadius: "numberOrString",
    boxShadow: "string", shouldScrollContents: "boolean",
    animateLoading: "boolean", isVisible: "boolean",
  },
  CARD_WIDGET: {
    title: "string", subtitle: "string", avatarImage: "string",
    avatarIcon: "string", badgeText: "string", badgeColor: "string",
    mediaImage: "string", mediaPosition: "string", mediaHeight: "number",
    mediaObjectFit: "string", showHeader: "boolean", showMenu: "boolean",
    showFooter: "boolean", isClickable: "boolean", isDisabled: "boolean",
    selectionEnabled: "boolean", defaultSelected: "boolean",
    expandCollapseEnabled: "boolean", defaultExpanded: "boolean",
    showHeaderDivider: "boolean", showFooterDivider: "boolean",
    hoverElevation: "boolean", backgroundColor: "string",
    borderColor: "string", borderWidth: "numberOrString",
    borderRadius: "numberOrString", boxShadow: "string",
    selectedAccentColor: "string", shouldScrollContents: "boolean",
    animateLoading: "boolean", isVisible: "boolean",
  },
  SELECT_WIDGET: {
    sourceData: "jsonArray", optionLabel: "string", optionValue: "string",
    defaultOptionValue: "string", labelText: "string",
    labelPosition: "string", labelAlignment: "string", labelWidth: "number",
    isFilterable: "boolean", serverSideFiltering: "boolean",
    isRequired: "boolean", labelTooltip: "string", placeholderText: "string",
    isVisible: "boolean", isDisabled: "boolean", animateLoading: "boolean",
    labelTextColor: "string", labelTextSize: "string",
    labelStyle: "string", borderRadius: "numberOrString", boxShadow: "string",
  },
  MULTI_SELECT_WIDGET_V2: {
    sourceData: "jsonArray", optionLabel: "string", optionValue: "string",
    defaultOptionValue: "jsonArray", labelText: "string",
    labelPosition: "string", labelAlignment: "string", labelWidth: "number",
    isFilterable: "boolean", serverSideFiltering: "boolean",
    isRequired: "boolean", labelTooltip: "string", placeholderText: "string",
    isVisible: "boolean", isDisabled: "boolean", animateLoading: "boolean",
    allowSelectAll: "boolean", labelTextColor: "string",
    labelTextSize: "string", labelStyle: "string",
    borderRadius: "numberOrString", boxShadow: "string",
  },
  CHECKBOX_GROUP_WIDGET: {
    options: "jsonArray", defaultSelectedValues: "jsonArray",
    labelText: "string", labelPosition: "string",
    labelAlignment: "string", labelWidth: "number",
    isRequired: "boolean", labelTooltip: "string", isInline: "boolean",
    isSelectAll: "boolean", isVisible: "boolean", isDisabled: "boolean",
    animateLoading: "boolean", optionAlignment: "string",
    labelTextColor: "string", labelTextSize: "string",
    labelStyle: "string", accentColor: "string",
    borderRadius: "numberOrString",
  },
  SWITCH_GROUP_WIDGET: {
    options: "jsonArray", defaultSelectedValues: "jsonArray",
    labelText: "string", labelPosition: "string",
    labelAlignment: "string", labelWidth: "number",
    isRequired: "boolean", labelTooltip: "string", isInline: "boolean",
    isVisible: "boolean", isDisabled: "boolean", animateLoading: "boolean",
    alignment: "string", labelTextColor: "string",
    labelTextSize: "string", labelStyle: "string", accentColor: "string",
  },
  DATE_PICKER_WIDGET2: {
    dateFormat: "string", defaultDate: "string", firstDayOfWeek: "number",
    timePrecision: "string", label: "string", labelPosition: "string",
    labelAlignment: "string", labelWidth: "number", isRequired: "boolean",
    minDate: "string", maxDate: "string", labelTooltip: "string",
    isVisible: "boolean", isDisabled: "boolean", animateLoading: "boolean",
    shortcuts: "boolean", closeOnSelection: "boolean",
    labelTextColor: "string", labelTextSize: "string", labelStyle: "string",
    accentColor: "string", borderRadius: "numberOrString", boxShadow: "string",
  },
  PHONE_INPUT_WIDGET: {
    defaultText: "string", defaultDialCode: "string", allowDialCodeChange: "boolean",
    allowFormatting: "boolean", label: "string", labelPosition: "string",
    labelAlignment: "string", labelWidth: "number", isRequired: "boolean",
    regex: "string", errorMessage: "string", tooltip: "string",
    placeholderText: "string", isVisible: "boolean", isDisabled: "boolean",
    animateLoading: "boolean", autoFocus: "boolean", labelTextColor: "string",
    labelTextSize: "string", labelStyle: "string", accentColor: "string",
    borderRadius: "numberOrString", boxShadow: "string",
  },
  CURRENCY_INPUT_WIDGET: {
    defaultText: "string", defaultCurrencyCode: "string", allowCurrencyChange: "boolean",
    decimals: "number", showStepArrows: "boolean", label: "string",
    labelPosition: "string", labelAlignment: "string", labelWidth: "number",
    isRequired: "boolean", regex: "string", errorMessage: "string",
    tooltip: "string", placeholderText: "string", isVisible: "boolean",
    isDisabled: "boolean", animateLoading: "boolean", autoFocus: "boolean",
    labelTextColor: "string", labelTextSize: "string", labelStyle: "string",
    accentColor: "string", borderRadius: "numberOrString", boxShadow: "string",
  },
  IFRAME_WIDGET: {
    source: "string", srcDoc: "string", title: "string",
    animateLoading: "boolean", isVisible: "boolean",
    borderColor: "string", borderWidth: "number",
    borderOpacity: "number", borderRadius: "numberOrString", boxShadow: "string",
  },
  MAP_WIDGET: {
    mapCenter: "object", defaultMarkers: "jsonArray", zoomLevel: "number", isVisible: "boolean",
    animateLoading: "boolean", enablePickLocation: "boolean",
    isClickedMarkerCentered: "boolean", allowClustering: "boolean",
    enableSearch: "boolean", enableMapTypeControl: "boolean",
    enableCreateMarker: "boolean", borderRadius: "numberOrString",
    boxShadow: "string",
  },
  MAP_CHART_WIDGET: {
    mapType: "string", data: "jsonArray", mapTitle: "string",
    isVisible: "boolean", showLabels: "boolean", colorRange: "jsonArray",
    borderRadius: "numberOrString", boxShadow: "string",
  },
  RICH_TEXT_EDITOR_WIDGET: {
    inputType: "string", defaultText: "string", labelText: "string",
    labelPosition: "string", labelAlignment: "string", labelWidth: "number",
    isRequired: "boolean", labelTooltip: "string", isDisabled: "boolean",
    isToolbarHidden: "boolean", isVisible: "boolean", animateLoading: "boolean",
    labelTextColor: "string", labelTextSize: "string", labelStyle: "string",
    borderRadius: "numberOrString", boxShadow: "string",
  },
  JSON_FORM_WIDGET: {
    sourceData: "string", autoGenerateForm: "boolean", title: "string",
    useSourceData: "boolean", disabledWhenInvalid: "boolean",
    fixedFooter: "boolean", scrollContents: "boolean", showReset: "boolean",
    submitButtonLabel: "string", resetButtonLabel: "string",
    maxAllowedFields: "number", isVisible: "boolean", animateLoading: "boolean",
    backgroundColor: "string", borderColor: "string", borderWidth: "numberOrString",
    borderRadius: "numberOrString", boxShadow: "string",
  },
  MENU_BUTTON_WIDGET: {
    label: "string", menuVariant: "string", placement: "string",
    isCompact: "boolean", isDisabled: "boolean", isVisible: "boolean",
    animateLoading: "boolean", menuItemsSource: "string",
    sourceData: "jsonArray", iconName: "string", iconAlign: "string",
    menuColor: "string", borderRadius: "numberOrString", boxShadow: "string",
  },
  SINGLE_SELECT_TREE_WIDGET: {
    options: "jsonArray", defaultOptionValue: "string", labelText: "string",
    labelPosition: "string", labelAlignment: "string", labelWidth: "number",
    isRequired: "boolean", labelTooltip: "string", placeholderText: "string",
    isVisible: "boolean", isDisabled: "boolean", animateLoading: "boolean",
    allowClear: "boolean", expandAll: "boolean", labelTextColor: "string",
    labelTextSize: "string", labelStyle: "string",
    borderRadius: "numberOrString", boxShadow: "string",
  },
  MULTI_SELECT_TREE_WIDGET: {
    options: "jsonArray", defaultOptionValue: "jsonArray", mode: "string",
    labelText: "string", labelPosition: "string", labelAlignment: "string",
    labelWidth: "number", isRequired: "boolean", labelTooltip: "string",
    placeholderText: "string", isVisible: "boolean", isDisabled: "boolean",
    animateLoading: "boolean", allowClear: "boolean", expandAll: "boolean",
    labelTextColor: "string", labelTextSize: "string", labelStyle: "string",
    borderRadius: "numberOrString", boxShadow: "string",
  },
  FILE_PICKER_WIDGET_V2: {
    allowedFileTypes: "jsonArray", fileDataType: "string", dynamicTyping: "boolean",
    maxNumFiles: "number", label: "string", isRequired: "boolean",
    maxFileSize: "number", isVisible: "boolean", isDisabled: "boolean",
    animateLoading: "boolean", buttonColor: "string",
    borderRadius: "numberOrString", boxShadow: "string",
  },
  AUDIO_RECORDER_WIDGET: {
    isVisible: "boolean", isDisabled: "boolean", animateLoading: "boolean",
    iconColor: "string", accentColor: "string", borderRadius: "numberOrString",
    boxShadow: "string",
  },
  CAMERA_WIDGET: {
    mode: "string", isVisible: "boolean", isDisabled: "boolean",
    isMirrored: "boolean", defaultCamera: "string",
    borderRadius: "numberOrString", boxShadow: "string",
  },
  CODE_SCANNER_WIDGET: {
    scannerLayout: "string", label: "string", isVisible: "boolean",
    isDisabled: "boolean", animateLoading: "boolean", tooltip: "string",
    defaultCamera: "string", iconAlign: "string", placement: "string",
    buttonColor: "string", borderRadius: "numberOrString", boxShadow: "string",
  },
  CUSTOM_WIDGET: {
    defaultModel: "string", isVisible: "boolean", backgroundColor: "string",
    borderColor: "string", borderWidth: "numberOrString",
    borderRadius: "numberOrString", boxShadow: "string",
  },
};

const EXPRESSION = /\{\{([\s\S]*?)\}\}/g;
const STATIC_REFERENCE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/;
const FORBIDDEN_REFERENCE_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);
function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertStaticChartData(value: JsonValue): void {
  if (!isRecord(value) || Object.keys(value).length > 50) {
    throw new Error("Chart data must be a series map with at most 50 series.");
  }
  for (const [seriesId, series] of Object.entries(value)) {
    if (FORBIDDEN_REFERENCE_SEGMENTS.has(seriesId) || !isRecord(series) ||
      (series.seriesName !== undefined && typeof series.seriesName !== "string") ||
      (series.color !== undefined && typeof series.color !== "string") ||
      !Array.isArray(series.data) || series.data.length > 10000) {
      throw new Error("Each chart series needs a name and at most 10,000 static points.");
    }
    for (const point of series.data) {
      if (!isRecord(point) ||
        !(typeof point.x === "string" || typeof point.x === "number") ||
        !(typeof point.y === "string" || typeof point.y === "number") ||
        (typeof point.x === "number" && !Number.isFinite(point.x)) ||
        (typeof point.y === "number" && !Number.isFinite(point.y))) {
        throw new Error("Chart points must contain static x and y values.");
      }
    }
  }
}

function dynamicExpressionForEdit(
  value: JsonValue,
  type: AddableWidgetType,
  property: string,
): boolean {
  if (typeof value !== "string" || (!value.includes("{{") && !value.includes("}}"))) {
    return false;
  }
  const supported = (type === "TEXT_WIDGET" && property === "text") ||
    (type === "IMAGE_WIDGET" && (property === "image" || property === "defaultImage"));
  if (!supported) {
    throw new Error(`Dynamic expressions are unavailable for ${type}.${property}.`);
  }
  const matches = [...value.matchAll(EXPRESSION)];
  const remainder = value.replace(EXPRESSION, "");
  if (!matches.length || remainder.includes("{{") || remainder.includes("}}")) {
    throw new Error("Use a complete {{WidgetName.property}} reference.");
  }
  for (const match of matches) {
    const reference = match[1].trim();
    if (!STATIC_REFERENCE.test(reference) ||
      reference.split(".").some((segment) => FORBIDDEN_REFERENCE_SEGMENTS.has(segment))) {
      throw new Error("Only {{WidgetName.property}} references are available in the local editor.");
    }
  }
  return true;
}

function synchronizeDynamicPath(
  widget: AppsmithWidgetDsl,
  property: string,
  dynamic: boolean,
): boolean {
  const current = widget.dynamicBindingPathList;
  if (current !== undefined && !Array.isArray(current)) {
    throw new Error("This widget has invalid dynamic binding metadata.");
  }
  const paths = (current ?? []) as JsonValue[];
  const matching = (entry: JsonValue) =>
    entry !== null && typeof entry === "object" && !Array.isArray(entry) &&
    entry.key === property;
  const hasPath = paths.some(matching);
  if (dynamic && !hasPath) {
    widget.dynamicBindingPathList = [...paths, { key: property }];
    return true;
  }
  if (!dynamic && hasPath) {
    widget.dynamicBindingPathList = paths.filter((entry) => !matching(entry));
    return true;
  }
  return false;
}

function assertWidgetNameNotReferenced(root: AppsmithWidgetDsl, oldName: string): void {
  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nameToken = new RegExp(`(?:^|[^A-Za-z0-9_$])${escaped}(?:$|[^A-Za-z0-9_$])`);

  function visit(value: unknown): boolean {
    if (typeof value === "string") {
      return [...value.matchAll(EXPRESSION)].some((match) => nameToken.test(match[1]));
    }
    if (Array.isArray(value)) return value.some(visit);
    if (value !== null && typeof value === "object") {
      return Object.values(value).some(visit);
    }
    return false;
  }

  if (visit(root)) {
    throw new Error(`Cannot rename ${oldName}: a dashboard expression references it. Update the expression first.`);
  }
}

function cloneDocument(sourceJson: string): DashboardDocument {
  return parseDashboardDocument(JSON.parse(sourceJson)) as DashboardDocument;
}

function findWidget(root: AppsmithWidgetDsl, id: string): AppsmithWidgetDsl | null {
  if (root.widgetId === id) return root;
  for (const child of root.children ?? []) {
    const found = findWidget(child, id);
    if (found) return found;
  }
  return null;
}

function allWidgets(root: AppsmithWidgetDsl): AppsmithWidgetDsl[] {
  return [root, ...(root.children ?? []).flatMap(allWidgets)];
}

function asAddable(type: string): AddableWidgetType {
  if (!Object.hasOwn(DIMENSIONS, type)) throw new Error(`Editing ${type} is not available yet.`);
  return type as AddableWidgetType;
}

function finiteGridCoordinate(value: number, label: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be an integer of at least ${minimum}.`);
  }
  return value;
}

function assertRootHeight(parent: AppsmithWidgetDsl, root: AppsmithWidgetDsl, childBottom: number) {
  if (parent.widgetId === root.widgetId && childBottom > MAX_HEIGHT_IN_ROWS) {
    throw new Error(`A widget cannot extend beyond ${MAX_HEIGHT_IN_ROWS} canvas rows.`);
  }
}

function canvasWidthInPixels(canvas: AppsmithWidgetDsl, root: AppsmithWidgetDsl): number {
  if (canvas.widgetId === root.widgetId) {
    return root.rightColumn - root.leftColumn;
  }
  const container = canvas.parentId ? findWidget(root, canvas.parentId) : null;
  const outerCanvas = container?.parentId ? findWidget(root, container.parentId) : null;
  if (!container || !outerCanvas || outerCanvas.type !== "CANVAS_WIDGET") {
    throw new Error("The nested canvas is not attached to a fixed container.");
  }
  if (container.type === "MODAL_WIDGET") {
    return typeof container.width === "number" && container.width > 0
      ? Math.min(container.width, (root.rightColumn - root.leftColumn) * 0.95) + 8
      : 464;
  }
  const outerWidth = (container.rightColumn - container.leftColumn) *
    childSpaces(outerCanvas, root).parentColumnSpace;
  return container.type === "CARD_WIDGET" && container.mediaPosition === "LEFT" &&
    Boolean(container.mediaImage) ? Math.max(1, outerWidth - 120) : outerWidth;
}

/** Appsmith getSnappedGrid uses the rendered canvas width and 64 columns. */
function childSpaces(canvas: AppsmithWidgetDsl, root: AppsmithWidgetDsl) {
  const grid = getFixedCanvasSnapGrid(canvasWidthInPixels(canvas, root), {
    isMainCanvas: canvas.widgetId === root.widgetId,
    noPad: canvas.noPad === true,
  });
  return {
    parentColumnSpace: grid.columnSpace,
    parentRowSpace: grid.rowSpace,
  };
}

/** ContainerWidget passes its pixel height to the inner canvas renderer. */
function canvasRows(canvas: AppsmithWidgetDsl, root: AppsmithWidgetDsl): number {
  if (canvas.widgetId === root.widgetId) return MAX_HEIGHT_IN_ROWS;
  const container = canvas.parentId ? findWidget(root, canvas.parentId) : null;
  if (!container) throw new Error("The nested canvas is missing its container.");
  if (container.shouldScrollContents === true) return MAX_HEIGHT_IN_ROWS;
  const heightPx = (container.bottomRow - container.topRow) * DEFAULT_GRID_ROW_HEIGHT;
  const headerRows = container.type === "TABS_WIDGET"
    ? tabsCanvasHeightOffsetRows(container.borderWidth as string | number | undefined,
      container.shouldShowTabs !== false)
    : container.type === "CARD_WIDGET"
      ? Math.ceil(cardChromeHeightInPx(container) / DEFAULT_GRID_ROW_HEIGHT) : 0;
  // WidgetPropsUtils.getCanvasSnapRows reserves one row at the bottom.
  return Math.max(0, Math.floor(heightPx / DEFAULT_GRID_ROW_HEIGHT) - headerRows - 1);
}

function parentCanvas(root: AppsmithWidgetDsl, requestedId?: string): AppsmithWidgetDsl {
  if (requestedId) {
    assertOutsideListV2Template(root, requestedId);
    if (findWidget(root, requestedId)?.type === "LIST_WIDGET_V2") {
      throw new Error("List template drops require Appsmith meta widgets and are unavailable here.");
    }
  }
  const target = requestedId ? findWidget(root, requestedId) : root;
  if (!target) throw new Error("The selected parent widget no longer exists.");
  if (target.type === "CANVAS_WIDGET") return target;
  if (target.type === "CONTAINER_WIDGET" || target.type === "STATBOX_WIDGET" ||
    target.type === "FORM_WIDGET" || target.type === "CARD_WIDGET") {
    const canvas = target.children?.find((child) => child.type === "CANVAS_WIDGET");
    if (canvas) return canvas;
  }
  if (target.type === "TABS_WIDGET") {
    const selectedId = resolveSelectedTabCanvasId(target.tabsObj,
      typeof target.defaultTab === "string" ? target.defaultTab : undefined);
    const canvas = target.children?.find((child) => child.widgetId === selectedId);
    if (canvas?.type === "CANVAS_WIDGET") return canvas;
  }
  if (target.type === "MODAL_WIDGET") {
    const canvas = target.children?.find((child) => child.type === "CANVAS_WIDGET");
    if (canvas) return canvas;
  }
  const parent = target.parentId ? findWidget(root, target.parentId) : null;
  if (parent?.type === "CANVAS_WIDGET") return parent;
  throw new Error("Select a canvas or container to add a widget.");
}

function nextName(used: Set<string>, base: string): string {
  let index = 1;
  while (used.has(`${base}${index}`) || used.has(`${base}${index}Canvas`)) index += 1;
  const name = `${base}${index}`;
  used.add(name);
  return name;
}

function uniqueName(used: Set<string>, base: string): string {
  let name = base;
  let index = 2;
  while (used.has(name)) name = `${base}${index++}`;
  used.add(name);
  return name;
}

function uniqueId(used: Set<string>): string {
  let id = `widget-${nanoid(12)}`;
  while (used.has(id) || used.has(`${id}-canvas`)) id = `widget-${nanoid(12)}`;
  used.add(id);
  return id;
}

function defaultProperties(type: AddableWidgetType): Record<string, JsonValue> {
  switch (type) {
    case "TEXT_WIDGET":
      return { text: "Text", fontSize: "1rem", fontStyle: "NORMAL", textAlign: "LEFT",
        textColor: "#231f20", overflow: "NONE", disableLink: false,
        fontFamily: "System Default", isVisible: true, dynamicBindingPathList: [],
        ...defaultDynamicHeightProperties(false) };
    case "CHART_WIDGET":
      return { chartType: "LINE_CHART", chartName: "Chart", chartData: {
        series1: { seriesName: "Series 1", data: [] },
      }, xAxisName: "X axis", yAxisName: "Y axis", showDataPointLabel: false,
      allowScroll: false, setAdaptiveYMin: false, labelOrientation: "auto",
      isVisible: true, dynamicBindingPathList: [] };
    case "CONTAINER_WIDGET":
      return { containerStyle: "card", backgroundColor: "#ffffff", borderColor: "#d8e1e8",
        borderWidth: "1", shouldScrollContents: false,
        isVisible: true, dynamicBindingPathList: [],
        ...defaultDynamicHeightProperties(true) };
    case "STATBOX_WIDGET":
      return {}; // createStatboxWidgetBlueprint materializes its default children.
    case "TABS_WIDGET":
      return {}; // createTabsWidgetBlueprint materializes its child canvases and defaults.
    case "MODAL_WIDGET":
      return {}; // createModalWidgetBlueprint materializes its child canvas and controls.
    case "LIST_WIDGET_V2":
      return {}; // createListV2Blueprint materializes the locked template subtree.
    case "IMAGE_WIDGET":
      return { image: "", defaultImage: "", objectFit: "cover", maxZoomLevel: 1,
        enableRotation: false, enableDownload: false, isVisible: true,
        dynamicBindingPathList: [] };
    case "DIVIDER_WIDGET":
      return { orientation: "horizontal", strokeStyle: "solid", dividerColor: "#858282",
        thickness: 2, capType: "nc", capSide: 0, isVisible: true,
        dynamicBindingPathList: [] };
    case "PROGRESS_WIDGET":
      return { progress: 50, progressType: "linear", isIndeterminate: false,
        fillColor: "#126e9a", showResult: true, steps: 1,
        counterClockwise: false, isVisible: true, dynamicBindingPathList: [] };
    case "CHECKBOX_WIDGET":
      return { label: "Label", defaultCheckedState: true, alignWidget: "LEFT",
        labelPosition: "Left", isDisabled: false, isRequired: false,
        animateLoading: true, isVisible: true, dynamicBindingPathList: [],
        ...defaultDynamicHeightProperties(false) };
    case "SWITCH_WIDGET":
      return { label: "Label", defaultSwitchState: true, alignWidget: "LEFT",
        labelPosition: "Left", isDisabled: false, animateLoading: true,
        isVisible: true, dynamicBindingPathList: [],
        ...defaultDynamicHeightProperties(false) };
    case "DOCUMENT_VIEWER_WIDGET":
      return { docUrl: "https://www.learningcontainer.com/wp-content/uploads/2019/09/sample-pdf-file.pdf",
        animateLoading: true, isVisible: true, dynamicBindingPathList: [] };
    case "AUDIO_WIDGET":
      return { url: "https://assets.appsmith.com/widgets/birds_chirping.mp3",
        autoPlay: false, animateLoading: true, isVisible: true,
        dynamicBindingPathList: [] };
    case "VIDEO_WIDGET":
      return { url: "https://assets.appsmith.com/widgets/bird.mp4",
        autoPlay: false, backgroundColor: "#000", animateLoading: true,
        isVisible: true, dynamicBindingPathList: [] };
    case "TABLE_WIDGET_V2":
      return { tableData: [], primaryColumns: {}, columnWidthMap: {},
        columnOrder: [], columnUpdatedAt: Date.now(), canFreezeColumn: true,
        defaultSelectedRowIndex: 0, defaultSelectedRowIndices: [0],
        defaultPageSize: 0, enableClientSideSearch: true, isVisibleSearch: true,
        isVisibleFilters: false, isVisibleDownload: true,
        isVisiblePagination: true, isSortable: true, animateLoading: true,
        compactMode: "DEFAULT", borderColor: "#d7d7d7", borderWidth: "1",
        isVisible: true, dynamicBindingPathList: [] };
    case "BUTTON_WIDGET":
    case "ICON_BUTTON_WIDGET":
    case "BUTTON_GROUP_WIDGET":
      return { ...getButtonControlDefaults(type) as Record<string, JsonValue>,
        dynamicBindingPathList: [] };
    case "INPUT_WIDGET_V2":
      return { label: "Label", labelPosition: "Top", labelAlignment: "LEFT",
        labelTextSize: "0.875rem", labelWidth: 5, defaultText: "",
        inputType: "TEXT", showStepArrows: false, iconAlign: "left",
        autoFocus: false, labelStyle: "", resetOnSubmit: true,
        isRequired: false, isDisabled: false, animateLoading: true,
        responsiveBehavior: "fill", isVisible: true,
        dynamicBindingPathList: [], ...defaultDynamicHeightProperties(false),
        dynamicHeight: "FIXED" };
    case "RADIO_GROUP_WIDGET":
      return { label: "Label", labelPosition: "Top", labelAlignment: "LEFT",
        labelTextSize: "0.875rem", labelWidth: 5,
        options: [{ label: "Yes", value: "Y" }, { label: "No", value: "N" }],
        defaultOptionValue: "Y", isRequired: false, isDisabled: false,
        isInline: true, alignment: "LEFT", animateLoading: true,
        isVisible: true, dynamicBindingPathList: [],
        ...defaultDynamicHeightProperties(false) };
    case "RATE_WIDGET":
      return { ...RATE_DEFAULTS, tooltips: [...RATE_DEFAULTS.tooltips],
        isVisible: true, dynamicBindingPathList: [],
        ...defaultDynamicHeightProperties(false) };
    case "NUMBER_SLIDER_WIDGET":
      return { ...NUMBER_SLIDER_DEFAULTS,
        marks: NUMBER_SLIDER_DEFAULTS.marks.map((mark) => ({ ...mark })),
        dynamicBindingPathList: [] };
    case "RANGE_SLIDER_WIDGET":
      return { ...RANGE_SLIDER_DEFAULTS,
        marks: RANGE_SLIDER_DEFAULTS.marks.map((mark) => ({ ...mark })),
        dynamicBindingPathList: [] };
    case "CATEGORY_SLIDER_WIDGET":
      return { ...CATEGORY_SLIDER_DEFAULTS,
        options: CATEGORY_SLIDER_DEFAULTS.options.map((option) => ({ ...option })),
        dynamicBindingPathList: [] };
    case "FORM_WIDGET":
    case "CARD_WIDGET":
      return {}; // Source blueprints materialize nested canvas and defaults.
    case "SELECT_WIDGET":
    case "MULTI_SELECT_WIDGET_V2":
    case "CHECKBOX_GROUP_WIDGET":
    case "SWITCH_GROUP_WIDGET": {
      const defaults = JSON.parse(JSON.stringify(CHOICE_DEFAULTS[type])) as Record<string, JsonValue>;
      return { ...defaults, ...defaultDynamicHeightProperties(false),
        ...((type === "SELECT_WIDGET" || type === "MULTI_SELECT_WIDGET_V2")
          ? { dynamicHeight: "FIXED" } : {}) };
    }
    case "DATE_PICKER_WIDGET2":
    case "PHONE_INPUT_WIDGET":
    case "CURRENCY_INPUT_WIDGET":
      return { ...specialInputDefaults(type) as Record<string, JsonValue>,
        dynamicBindingPathList: [], ...defaultDynamicHeightProperties(false),
        dynamicHeight: "FIXED" };
    case "IFRAME_WIDGET":
      return { ...getIframeDefaults() as Record<string, JsonValue>,
        dynamicBindingPathList: [] };
    case "MAP_WIDGET":
      return { ...getMapDefaults() as Record<string, JsonValue>,
        dynamicBindingPathList: [] };
    case "MAP_CHART_WIDGET":
      return { ...getMapChartDefaults() as Record<string, JsonValue>,
        dynamicBindingPathList: [] };
    case "RICH_TEXT_EDITOR_WIDGET":
      return { ...RICH_TEXT_DEFAULTS, dynamicBindingPathList: [],
        ...defaultDynamicHeightProperties(false), dynamicHeight: "FIXED" };
    case "JSON_FORM_WIDGET":
      return { ...JSON_FORM_DEFAULTS, schema: {}, dynamicBindingPathList: [],
        ...defaultDynamicHeightProperties(false) };
    case "MENU_BUTTON_WIDGET":
    case "SINGLE_SELECT_TREE_WIDGET":
    case "MULTI_SELECT_TREE_WIDGET":
      return { ...JSON.parse(JSON.stringify(MENU_TREE_DEFAULTS[type])) as Record<string, JsonValue>,
        dynamicBindingPathList: [],
        ...((type === "MENU_BUTTON_WIDGET") ? {} : {
          ...defaultDynamicHeightProperties(false), dynamicHeight: "FIXED",
        }) };
    case "FILE_PICKER_WIDGET_V2":
    case "AUDIO_RECORDER_WIDGET":
    case "CAMERA_WIDGET":
    case "CODE_SCANNER_WIDGET":
      return { ...captureUploadDefaults(type) as Record<string, JsonValue>,
        dynamicBindingPathList: [] };
    case "CUSTOM_WIDGET": {
      const defaults = customWidgetDefaults();
      // Appsmith's sample alert is an Appsmith action expression. This product's
      // authored document rejects those until its action contract is defined.
      delete defaults.onResetClick;
      defaults.dynamicTriggerPathList = [];
      return { ...defaults, minDynamicHeight: MIN_HEIGHT_IN_ROWS,
        maxDynamicHeight: MAX_HEIGHT_IN_ROWS } as Record<string, JsonValue>;
    }
  }
}

function finish(document: DashboardDocument, selectedWidgetId: string | null,
  layoutChanged = false): EditResult {
  if (layoutChanged) {
    const root = document.layout.dsl;
    // canvasWidgetsReducer.UPDATE_LAYOUT stores the canvas content bottom in
    // pixels. mainCanvas.minHeight belongs to separate UI state and stays put.
    root.bottomRow = normalizedMainCanvasBottomRow(root.children ?? []);
  }
  parseDashboardDocument(document);
  return { documentJson: JSON.stringify(document), selectedWidgetId };
}

interface PlannedLayoutChange {
  canvas: AppsmithWidgetDsl;
  sourceParent?: AppsmithWidgetDsl;
  widget?: AppsmithWidgetDsl;
  plan: FixedLayoutPlan;
}

class LayoutPlanningError extends Error {
  constructor(message: string, readonly parentId: string, readonly target: GridRect) {
    super(message);
  }
}

function canFitContainedWidgets(widget: AppsmithWidgetDsl, proposed: GridRect,
  parentCanvas: AppsmithWidgetDsl, root: AppsmithWidgetDsl): boolean {
  // Appsmith shows the List's template-too-tall state after a short resize.
  if (widget.type === "LIST_WIDGET_V2") return true;
  const canvases = widget.children?.filter((child) => child.type === "CANVAS_WIDGET") ?? [];
  if (!canvases.length) return true;
  const width = proposed.rightColumn - proposed.leftColumn;
  const height = proposed.bottomRow - proposed.topRow;
  const proposedWidthPx = width * childSpaces(parentCanvas, root).parentColumnSpace;
  // An inner CANVAS_WIDGET always has 64 columns, even if its Container has
  // fewer columns in the outer canvas. It only needs positive snap space.
  const innerGrid = getFixedCanvasSnapGrid(proposedWidthPx, {
    isMainCanvas: false,
    noPad: canvases[0].noPad === true,
  });
  if (innerGrid.columnSpace <= 0) return false;
  if (widget.shouldScrollContents === true) return true;
  const headerRows = widget.type === "TABS_WIDGET"
    ? tabsCanvasHeightOffsetRows(widget.borderWidth as string | number | undefined,
      widget.shouldShowTabs !== false)
    : 0;
  return canvases.every((canvas) => (canvas.children ?? []).every((child) =>
    child.bottomRow <= height - headerRows - 1));
}

function planOnCanvas(
  root: AppsmithWidgetDsl,
  canvas: AppsmithWidgetDsl,
  target: GridRect,
  mode: "add" | "move" | "resize",
  widget?: AppsmithWidgetDsl,
  sourceParent?: AppsmithWidgetDsl,
  options: LayoutPreviewOptions = {},
  detachedTarget = false,
): PlannedLayoutChange {
  try {
    if (canvas.dropDisabled === true && (mode === "add" ||
      (mode === "move" && sourceParent?.widgetId !== canvas.widgetId))) {
      throw new Error("This canvas does not accept dropped widgets.");
    }
    const columns = DEFAULT_GRID_COLUMNS;
    // FixedLayoutResizable does not stop a bottom-edge resize at the current
    // DropTarget height. Its updateBottomRow callback grows that canvas while
    // the handle is moving. Add/move still use the current target bounds.
    const rows = mode === "resize" ? MAX_HEIGHT_IN_ROWS : canvasRows(canvas, root);
    if (target.rightColumn > columns) {
      throw new Error("The widget extends beyond the canvas width.");
    }
    if (mode !== "resize" && canvas.widgetId !== root.widgetId &&
      target.bottomRow > rows) {
      throw new Error("The widget extends beyond the selected container.");
    }
    assertRootHeight(canvas, root, target.bottomRow);
    if (widget && !detachedTarget && !canFitContainedWidgets(widget, target, canvas, root)) {
      throw new Error("Resize the widgets inside this container before making it smaller.");
    }
    const committed = options.committedPlan;
    if (committed && (!committed.valid || committed.parentId !== canvas.widgetId ||
      !committed.target || !sameRect(committed.target, target))) {
      throw new Error("The drag preview no longer matches this canvas edit.");
    }
    if (detachedTarget) {
      if (committed && Object.keys(committed.reflowed).length) {
        throw new Error("A detached widget cannot reflow the canvas.");
      }
      // ModalWidget.getDefaults.detachFromLayout: it bypasses collision checks
      // and never displaces fixed widgets under its overlay.
      return { canvas, sourceParent, widget, plan: { target, reflowed: {} } };
    }
    const spaces = childSpaces(canvas, root);
    const previousTarget = widget && sourceParent?.widgetId === canvas.widgetId
      ? rectOf(widget) : undefined;
    const plan = planFixedLayout({
      target,
      previousTarget,
      targetId: widget?.widgetId,
      siblings: canvas.children ?? [],
      columns,
      rows,
      columnSpace: spaces.parentColumnSpace,
      rowSpace: spaces.parentRowSpace,
      directions: preferredDirections(previousTarget, target, mode),
      canReflowWidget: (candidate, proposed) =>
        canFitContainedWidgets(candidate, proposed, canvas, root),
      shouldReflowDropTarget: options.shouldReflowDropTarget,
      committedReflowed: committed?.reflowed,
    });
    return { canvas, sourceParent, widget, plan };
  } catch (error) {
    throw new LayoutPlanningError(
      error instanceof Error ? error.message : "Invalid canvas edit.",
      canvas.widgetId,
      target,
    );
  }
}

function planAdd(root: AppsmithWidgetDsl, request: AddWidgetRequest,
  options: LayoutPreviewOptions = {}): PlannedLayoutChange {
  const canvas = parentCanvas(root, request.parentId);
  const config = DIMENSIONS[asAddable(request.type)];
  const columns = DEFAULT_GRID_COLUMNS;
  if (columns < 2) throw new Error("This canvas is too narrow for another widget.");
  const width = finiteGridCoordinate(request.columns ?? config.width, "Columns", 1);
  const height = finiteGridCoordinate(request.rows ?? config.height, "Rows", 1);
  if (width > columns) throw new Error("The widget extends beyond the canvas width.");
  const requestedLeft = finiteGridCoordinate(
    request.leftColumn ?? Math.min(2, columns - width), "Left column", 0,
  );
  // A drawn Fixed block already has its final Appsmith edge adjustment. Do
  // not move it again at commit; an invalid minimum-size block stays invalid.
  const leftColumn = request.columns !== undefined || request.rows !== undefined
    ? requestedLeft : Math.min(requestedLeft, columns - width);
  const nextRow = Math.max(2, ...(canvas.children ?? []).map((child) => child.bottomRow + 2));
  const topRow = finiteGridCoordinate(request.topRow ?? nextRow, "Top row", 0);
  return planOnCanvas(root, canvas, {
    leftColumn, topRow,
    rightColumn: leftColumn + width,
    bottomRow: topRow + height,
  }, "add", undefined, undefined, options, request.type === "MODAL_WIDGET");
}

function planMove(root: AppsmithWidgetDsl, request: MoveWidgetRequest,
  options: LayoutPreviewOptions = {}): PlannedLayoutChange {
  const { widget, parent } = editableWidgetAndParent(root, request.widgetId);
  if (widget.dragDisabled === true) throw new Error("Dragging this widget is disabled.");
  const canvas = request.parentId ? parentCanvas(root, request.parentId) : parent;
  if (allWidgets(widget).some((child) => child.widgetId === canvas.widgetId)) {
    throw new Error("A container cannot be moved inside itself.");
  }
  const leftColumn = finiteGridCoordinate(request.leftColumn, "Left column", 0);
  const topRow = finiteGridCoordinate(request.topRow, "Top row", 0);
  const rightColumn = finiteGridCoordinate(request.rightColumn ??
    leftColumn + widget.rightColumn - widget.leftColumn,
  "Right column", leftColumn + 1);
  const bottomRow = finiteGridCoordinate(request.bottomRow ??
    topRow + widget.bottomRow - widget.topRow,
  "Bottom row", topRow + 1);
  return planOnCanvas(root, canvas, {
    leftColumn, topRow,
    rightColumn, bottomRow,
  }, "move", widget, parent, options, widget.detachFromLayout === true);
}

function planResize(root: AppsmithWidgetDsl, request: ResizeWidgetRequest,
  options: LayoutPreviewOptions = {}): PlannedLayoutChange {
  const { widget, parent } = editableWidgetAndParent(root, request.widgetId);
  if (widget.resizeDisabled === true) throw new Error("Resizing this widget is disabled.");
  const leftColumn = finiteGridCoordinate(
    request.leftColumn ?? widget.leftColumn, "Left column", 0,
  );
  const topRow = finiteGridCoordinate(request.topRow ?? widget.topRow, "Top row", 0);
  const width = finiteGridCoordinate(request.width, "Width", 1);
  const height = finiteGridCoordinate(request.height, "Height", 1);
  return planOnCanvas(root, parent, {
    leftColumn, topRow,
    rightColumn: leftColumn + width,
    bottomRow: topRow + height,
  }, "resize", widget, parent, options, widget.detachFromLayout === true);
}

/** WidgetOperationSagas.resizeSaga -> getCanvasSizeAfterWidgetMove (Fixed). */
function canvasBottomRowAfterResize(canvas: AppsmithWidgetDsl,
  root: AppsmithWidgetDsl, resizedWidgetId: string,
  resizedBottomRow: number): number {
  const parent = canvas.parentId ? findWidget(root, canvas.parentId) : null;
  const parentMinHeight = parent && parent.detachFromLayout !== true
    ? (parent.bottomRow - parent.topRow) * DEFAULT_GRID_ROW_HEIGHT
    : typeof canvas.minHeight === "number" ? canvas.minHeight : undefined;
  // Appsmith keeps the main canvas minimum in UI state. The local DSL's
  // minHeight is the corresponding persisted value.
  const mainMinHeight = canvas.widgetId === root.widgetId &&
    typeof root.minHeight === "number" ? root.minHeight : undefined;
  const canvasMinHeight = mainMinHeight ?? parentMinHeight ?? 380;
  const occupied = (canvas.children ?? [])
    .filter((child) => child.detachFromLayout !== true)
    .map((child) => ({ id: child.widgetId, bottom: child.bottomRow }));
  const newRows = calculateDropTargetRows([resizedWidgetId], resizedBottomRow,
    occupied, canvas.widgetId === root.widgetId);
  const rowsToPersist = Math.max(canvasMinHeight / DEFAULT_GRID_ROW_HEIGHT - 1, newRows);
  return Math.round(rowsToPersist * DEFAULT_GRID_ROW_HEIGHT);
}

function planChange(root: AppsmithWidgetDsl, change: LayoutChange,
  options: LayoutPreviewOptions = {}): PlannedLayoutChange {
  switch (change.kind) {
    case "add": return planAdd(root, change.request, options);
    case "move": return planMove(root, change.request, options);
    case "resize": return planResize(root, change.request, options);
  }
}

let lastPreviewJson: string | null = null;
let lastPreviewRoot: AppsmithWidgetDsl | null = null;

/** Fast, pure pointer preview: source JSON is already validated by the store. */
export function previewLayoutChange(sourceJson: string, change: LayoutChange,
  options: LayoutPreviewOptions = {}): LayoutPreview {
  try {
    if (sourceJson !== lastPreviewJson || !lastPreviewRoot) {
      const source = JSON.parse(sourceJson) as DashboardDocument;
      lastPreviewJson = sourceJson;
      lastPreviewRoot = source.layout.dsl;
    }
    const { canvas, plan } = planChange(lastPreviewRoot, change, options);
    return {
      valid: true,
      parentId: canvas.widgetId,
      target: plan.target,
      reflowed: plan.reflowed,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid canvas edit.",
      parentId: error instanceof LayoutPlanningError ? error.parentId : null,
      target: error instanceof LayoutPlanningError ? error.target : null,
      reflowed: {},
    };
  }
}

/** Validate a history-aware drag preview with the same bounds used by commit. */
export function previewCommittedLayoutChange(sourceJson: string,
  change: LayoutChange, proposedPlan: LayoutPreview): LayoutPreview {
  return previewLayoutChange(sourceJson, change, { committedPlan: proposedPlan });
}

/** One local Redux command commits the exact Appsmith drag-session preview. */
export function commitFixedLayoutChange(sourceJson: string,
  change: LayoutChange, plan: LayoutPreview): EditResult {
  const options = { committedPlan: plan };
  switch (change.kind) {
    case "add": return addWidgetToDocument(sourceJson, change.request, options);
    case "move": return moveWidgetInDocument(sourceJson, change.request, options);
    case "resize": return resizeWidgetInDocument(sourceJson, change.request, options);
  }
}

function sameRect(left: GridRect, right: GridRect): boolean {
  return left.leftColumn === right.leftColumn && left.topRow === right.topRow &&
    left.rightColumn === right.rightColumn && left.bottomRow === right.bottomRow;
}

function applyRect(widget: AppsmithWidgetDsl, rect: GridRect): void {
  widget.leftColumn = rect.leftColumn;
  widget.topRow = rect.topRow;
  widget.rightColumn = rect.rightColumn;
  widget.bottomRow = rect.bottomRow;
  for (const innerCanvas of widget.children?.filter((child) => child.type === "CANVAS_WIDGET") ?? []) {
    if (widget.type === "LIST_WIDGET_V2") {
      innerCanvas.rightColumn = (rect.rightColumn - rect.leftColumn) *
        (typeof widget.parentColumnSpace === "number" ? widget.parentColumnSpace : 1);
      innerCanvas.bottomRow = (rect.bottomRow - rect.topRow) *
        (typeof widget.parentRowSpace === "number" ? widget.parentRowSpace : 10);
      innerCanvas.minHeight = innerCanvas.bottomRow;
      continue;
    }
    // Fixed nested canvases keep Appsmith's logical 64-column coordinate space.
    // Their rendered pixel width is derived from the enclosing Container.
    innerCanvas.rightColumn = DEFAULT_GRID_COLUMNS;
    if (widget.type !== "TABS_WIDGET" && widget.type !== "MODAL_WIDGET") {
      innerCanvas.bottomRow = widget.type === "CARD_WIDGET"
        ? Math.max(1, rect.bottomRow - rect.topRow -
          Math.ceil(cardChromeHeightInPx(widget) / DEFAULT_GRID_ROW_HEIGHT))
        : rect.bottomRow - rect.topRow;
    }
  }
}

function refreshNestedSpaces(widget: AppsmithWidgetDsl, root: AppsmithWidgetDsl): void {
  for (const innerCanvas of widget.children?.filter((child) => child.type === "CANVAS_WIDGET") ?? []) {
    const spaces = childSpaces(innerCanvas, root);
    innerCanvas.parentColumnSpace = spaces.parentColumnSpace;
    innerCanvas.parentRowSpace = spaces.parentRowSpace;
    for (const child of innerCanvas.children ?? []) {
      child.parentColumnSpace = spaces.parentColumnSpace;
      child.parentRowSpace = spaces.parentRowSpace;
      refreshNestedSpaces(child, root);
    }
  }
}

function applyReflow(root: AppsmithWidgetDsl, planned: PlannedLayoutChange): void {
  const { canvas, plan } = planned;
  for (const sibling of canvas.children ?? []) {
    const rect = plan.reflowed[sibling.widgetId];
    if (rect) {
      applyRect(sibling, rect);
      refreshNestedSpaces(sibling, root);
    }
  }
}

/** Pure Appsmith-style add operation against the authored DSL; no backend request. */
export function addWidgetToDocument(sourceJson: string, request: AddWidgetRequest,
  options: LayoutPreviewOptions = {}): EditResult {
  const document = cloneDocument(sourceJson);
  const root = document.layout.dsl;
  const planned = planAdd(root, request, options);
  const { canvas, plan } = planned;
  const type = asAddable(request.type);
  const config = DIMENSIONS[type];
  const { leftColumn, topRow, rightColumn, bottomRow } = plan.target;
  const height = bottomRow - topRow;
  const usedWidgets = allWidgets(root);
  const usedIds = new Set(usedWidgets.map((widget) => widget.widgetId));
  const usedNames = new Set(usedWidgets.map((widget) => widget.widgetName));
  const widgetId = uniqueId(usedIds);
  const widgetName = nextName(usedNames, config.name);
  const spaces = childSpaces(canvas, root);
  const widget: AppsmithWidgetDsl = type === "TABS_WIDGET"
    ? createTabsWidgetBlueprint({
        widgetId, widgetName, parentId: canvas.widgetId,
        topRow, bottomRow, leftColumn, rightColumn,
        parentColumnSpace: spaces.parentColumnSpace,
        parentRowSpace: spaces.parentRowSpace,
        childCanvasIds: [uniqueId(usedIds), uniqueId(usedIds)],
        childCanvasNames: [
          uniqueName(usedNames, `${widgetName}Tab1Canvas`),
          uniqueName(usedNames, `${widgetName}Tab2Canvas`),
        ],
        canvasVersion: root.version,
      })
    : type === "STATBOX_WIDGET"
      ? createStatboxWidgetBlueprint({
          widgetId, widgetName, parentId: canvas.widgetId,
          topRow, bottomRow, leftColumn, rightColumn,
          parentColumnSpace: spaces.parentColumnSpace,
          parentRowSpace: spaces.parentRowSpace,
          childIds: {
            canvas: uniqueId(usedIds), label: uniqueId(usedIds),
            value: uniqueId(usedIds), icon: uniqueId(usedIds),
            caption: uniqueId(usedIds),
          },
          childNames: {
            canvas: uniqueName(usedNames, `${widgetName}Canvas`),
            label: uniqueName(usedNames, `${widgetName}Label`),
            value: uniqueName(usedNames, `${widgetName}Value`),
            icon: uniqueName(usedNames, `${widgetName}Icon`),
            caption: uniqueName(usedNames, `${widgetName}Caption`),
          },
        })
    : type === "FORM_WIDGET"
      ? createFormWidgetBlueprint({
          widgetId, widgetName, parentId: canvas.widgetId,
          topRow, bottomRow, leftColumn, rightColumn,
          parentColumnSpace: spaces.parentColumnSpace,
          parentRowSpace: spaces.parentRowSpace,
          childIds: {
            canvas: uniqueId(usedIds), title: uniqueId(usedIds),
            submit: uniqueId(usedIds), reset: uniqueId(usedIds),
          },
          childNames: {
            canvas: uniqueName(usedNames, `${widgetName}Canvas`),
            title: uniqueName(usedNames, `${widgetName}Title`),
            submit: uniqueName(usedNames, `${widgetName}Submit`),
            reset: uniqueName(usedNames, `${widgetName}Reset`),
          },
        })
    : type === "CARD_WIDGET"
      ? createCardWidgetBlueprint({
          widgetId, widgetName, parentId: canvas.widgetId,
          topRow, bottomRow, leftColumn, rightColumn,
          parentColumnSpace: spaces.parentColumnSpace,
          parentRowSpace: spaces.parentRowSpace,
          childIds: { canvas: uniqueId(usedIds), bodyHint: uniqueId(usedIds) },
          childNames: {
            canvas: uniqueName(usedNames, `${widgetName}Canvas`),
            bodyHint: uniqueName(usedNames, `${widgetName}BodyHint`),
          },
        })
    : type === "LIST_WIDGET_V2"
      ? createListV2Blueprint({
          widgetId, widgetName, parentId: canvas.widgetId,
          topRow, bottomRow, leftColumn, rightColumn,
          parentColumnSpace: spaces.parentColumnSpace,
          parentRowSpace: spaces.parentRowSpace,
          childIds: {
            mainCanvas: uniqueId(usedIds), itemContainer: uniqueId(usedIds),
            itemCanvas: uniqueId(usedIds), image: uniqueId(usedIds),
            heading: uniqueId(usedIds), body: uniqueId(usedIds),
          },
          childNames: {
            mainCanvas: uniqueName(usedNames, `${widgetName}Canvas`),
            itemContainer: uniqueName(usedNames, `${widgetName}ItemContainer`),
            itemCanvas: uniqueName(usedNames, `${widgetName}ItemCanvas`),
            image: uniqueName(usedNames, `${widgetName}Image`),
            heading: uniqueName(usedNames, `${widgetName}Heading`),
            body: uniqueName(usedNames, `${widgetName}Body`),
          },
        })
    : type === "MODAL_WIDGET"
      ? createModalWidgetBlueprint({
          widgetId, widgetName, parentId: canvas.widgetId,
          topRow, bottomRow, leftColumn, rightColumn,
          parentColumnSpace: spaces.parentColumnSpace,
          parentRowSpace: spaces.parentRowSpace,
          childIds: {
            canvas: uniqueId(usedIds), closeIcon: uniqueId(usedIds),
            title: uniqueId(usedIds), closeButton: uniqueId(usedIds),
            confirmButton: uniqueId(usedIds),
          },
          childNames: {
            canvas: uniqueName(usedNames, `${widgetName}Canvas`),
            closeIcon: uniqueName(usedNames, `${widgetName}CloseIcon`),
            title: uniqueName(usedNames, `${widgetName}Title`),
            closeButton: uniqueName(usedNames, `${widgetName}CloseButton`),
            confirmButton: uniqueName(usedNames, `${widgetName}ConfirmButton`),
          },
        })
    : {
        ...defaultProperties(type),
        widgetId, widgetName, type, version: type === "DATE_PICKER_WIDGET2" ||
          type === "TABLE_WIDGET_V2" ||
          type === "INPUT_WIDGET_V2" || type === "CHECKBOX_GROUP_WIDGET" ? 2 : 1,
        parentId: canvas.widgetId,
        topRow, bottomRow, leftColumn, rightColumn,
        ...spaces,
      };

  if (type === "CONTAINER_WIDGET") {
    const canvasId = `${widgetId}-canvas`;
    usedIds.add(canvasId);
    const canvasName = `${widgetName}Canvas`;
    usedNames.add(canvasName);
    widget.children = [{
      widgetId: canvasId, widgetName: canvasName, type: "CANVAS_WIDGET",
      version: root.version, parentId: widgetId, topRow: 0, bottomRow: height,
      leftColumn: 0, rightColumn: DEFAULT_GRID_COLUMNS, ...spaces,
      detachFromLayout: true, canExtend: false, backgroundColor: "none",
      dynamicBindingPathList: [], children: [],
    }];
  }

  applyReflow(root, planned);
  (canvas.children ??= []).push(widget);
  if (type === "TABS_WIDGET" || type === "STATBOX_WIDGET" ||
    type === "FORM_WIDGET" || type === "CARD_WIDGET" ||
    type === "MODAL_WIDGET" || type === "LIST_WIDGET_V2") {
    refreshNestedSpaces(widget, root);
  }
  return finish(document, widgetId, true);
}

export function updateWidgetPropertyInDocument(
  sourceJson: string,
  request: UpdateWidgetPropertyRequest,
): EditResult {
  const document = cloneDocument(sourceJson);
  const widget = findWidget(document.layout.dsl, request.widgetId);
  if (!widget || widget.type === "CANVAS_WIDGET") {
    throw new Error("Select an editable widget before changing its properties.");
  }
  assertOutsideListV2Template(document.layout.dsl, request.widgetId);
  const type = asAddable(widget.type);
  const { property, value } = request;
  if (property === "widgetName") {
    if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
      throw new Error("Widget name must start with a letter and contain only letters, numbers, or underscores.");
    }
    if (widget.widgetName === value) {
      return { documentJson: sourceJson, selectedWidgetId: widget.widgetId };
    }
    if (type === "LIST_WIDGET_V2") {
      const current = `{{${widget.widgetName}.listData.map((currentItem, currentIndex) => currentItem["id"] )}}`;
      if (widget.primaryKeys === current) {
        widget.primaryKeys = `{{${value}.listData.map((currentItem, currentIndex) => currentItem["id"] )}}`;
      }
    }
    assertWidgetNameNotReferenced(document.layout.dsl, widget.widgetName);
  } else {
    const expected = EDITABLE_PROPERTIES[type][property];
    if (!expected) throw new Error(`${property} cannot be edited for ${widget.type}.`);
    if (expected === "chartData") {
      assertStaticChartData(value);
    } else if (expected === "jsonArray") {
      assertStaticListV2Data(value);
    } else if (expected === "object") {
      if (!isRecord(value)) throw new Error(`${property} must be an object.`);
      if (type === "MAP_WIDGET" && property === "mapCenter" &&
        (typeof value.lat !== "number" || !Number.isFinite(value.lat) ||
          value.lat < -90 || value.lat > 90 || typeof value.long !== "number" ||
          !Number.isFinite(value.long) || value.long < -180 || value.long > 180)) {
        throw new Error("Initial location must have valid latitude and longitude.");
      }
    } else if (expected === "numberOrString") {
      if (typeof value !== "number" && typeof value !== "string") {
        throw new Error(`${property} must be a number or string.`);
      }
    } else if (typeof value !== expected) {
      throw new Error(`${property} must be a ${expected}.`);
    }
    if (type === "TABS_WIDGET" && property === "defaultTab" &&
      !orderedVisibleTabs(widget.tabsObj).some((tab) => tab.label === value)) {
      throw new Error("Default tab must name a visible tab.");
    }
    if (type === "MODAL_WIDGET" && (property === "width" || property === "height") &&
      (typeof value !== "number" || !Number.isSafeInteger(value) || value < 100 ||
        value > (property === "width" ? 10000 : 90000))) {
      throw new Error(`${property} must be a whole number of at least 100 pixels.`);
    }
    if (type === "MODAL_WIDGET" && property === "height" &&
      (widget.dynamicHeight === "AUTO_HEIGHT" ||
        widget.dynamicHeight === "AUTO_HEIGHT_WITH_LIMITS")) {
      throw new Error("Choose Fixed height before editing Modal height.");
    }
    if (type === "LIST_WIDGET_V2" && property === "itemSpacing" &&
      (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 16)) {
      throw new Error("Item spacing must be a whole number from 0 to 16 pixels.");
    }
    if (type === "MAP_CHART_WIDGET" && property === "mapType" && !isMapType(value)) {
      throw new Error("Map type must be one of Appsmith's supported regions.");
    }
  }
  const dynamic = property === "widgetName"
    ? false
    : dynamicExpressionForEdit(value, type, property);
  const metadataChanged = property === "widgetName"
    ? false
    : synchronizeDynamicPath(widget, property, dynamic);
  if (widget[property] === value && !metadataChanged) {
    return { documentJson: sourceJson, selectedWidgetId: widget.widgetId };
  }
  // Cyflex bindings are independent runtime overlays. A literal edit changes
  // the saved fallback but intentionally keeps any binding for this property.
  widget[property] = value;
  if (type === "MAP_CHART_WIDGET" && property === "mapType" && isMapType(value)) {
    for (const update of mapTypeUpdates(value)) {
      widget[update.propertyPath] = update.propertyValue;
    }
  }
  if (type === "MODAL_WIDGET" && (property === "width" || property === "height")) {
    const canvas = widget.children?.find((child) => child.type === "CANVAS_WIDGET");
    if (canvas && property === "height" && typeof value === "number") {
      canvas.bottomRow = Math.max(1, Math.ceil(value / DEFAULT_GRID_ROW_HEIGHT));
      canvas.minHeight = value;
      widget.bottomRow = widget.topRow + canvas.bottomRow;
      widget.minHeight = value;
    }
    refreshNestedSpaces(widget, document.layout.dsl);
  }
  if (property === "chartData" && isRecord(value)) {
    // Removing a series also removes its no-longer-valid live target in the
    // same undoable edit. Other series and reusable variable declarations stay.
    document.bindings = document.bindings.filter((binding) => {
      if (binding.target.widgetId !== widget.widgetId) return true;
      const seriesId = /^chartData\.([^.]+)\./.exec(binding.target.propertyPath)?.[1];
      return !seriesId || Object.hasOwn(value, seriesId);
    });
  }
  return finish(document, widget.widgetId);
}

/** Appsmith's Custom source control submits these two properties in one batch. */
export function updateCustomWidgetSourceInDocument(sourceJson: string,
  request: UpdateCustomWidgetSourceRequest): EditResult {
  const document = cloneDocument(sourceJson);
  const widget = findWidget(document.layout.dsl, request.widgetId);
  if (!widget || widget.type !== "CUSTOM_WIDGET") {
    throw new Error("Select a Custom widget before editing its source.");
  }
  assertOutsideListV2Template(document.layout.dsl, request.widgetId);
  for (const source of [request.srcDoc, request.uncompiledSrcDoc]) {
    if (!source || typeof source.html !== "string" ||
      typeof source.css !== "string" || typeof source.js !== "string") {
      throw new Error("Custom widget source must include HTML, CSS, and JS strings.");
    }
  }
  widget.srcDoc = { ...request.srcDoc };
  widget.uncompiledSrcDoc = { ...request.uncompiledSrcDoc };
  return finish(document, widget.widgetId);
}

/** Appsmith's TabControl and add/delete tab sagas as one local DSL transaction. */
export function editTabsInDocument(sourceJson: string, request: TabEditRequest): EditResult {
  const document = cloneDocument(sourceJson);
  const root = document.layout.dsl;
  const widget = findWidget(root, request.widgetId);
  if (!widget || widget.type !== "TABS_WIDGET") {
    throw new Error("Select a Tabs widget before editing its tabs.");
  }
  const original = widget.tabsObj;
  if (!original || typeof original !== "object" || Array.isArray(original)) {
    throw new Error("The Tabs widget has invalid tab metadata.");
  }
  const originalMap = original as Record<string, JsonValue>;
  const tabs = orderedTabs(original).map((tab) => ({ ...tab }));
  if (!tabs.length || tabs.some((tab) =>
    !widget.children?.some((child) => child.widgetId === tab.widgetId &&
      child.type === "CANVAS_WIDGET"))) {
    throw new Error("The Tabs widget has a missing child canvas.");
  }
  const targetIndex = "tabId" in request
    ? tabs.findIndex((tab) => tab.id === request.tabId) : -1;
  if ("tabId" in request && targetIndex < 0) {
    throw new Error("The selected tab no longer exists.");
  }

  switch (request.kind) {
    case "add": {
      const usedWidgets = allWidgets(root);
      const usedIds = new Set(usedWidgets.map((entry) => entry.widgetId));
      const usedNames = new Set(usedWidgets.map((entry) => entry.widgetName));
      let ordinal = tabs.length + 1;
      while (tabs.some((tab) => tab.label === `Tab ${ordinal}`)) ordinal++;
      const label = `Tab ${ordinal}`;
      const id = `tab${nanoid(8)}`;
      const canvasId = uniqueId(usedIds);
      const canvasName = uniqueName(usedNames, `${widget.widgetName}Tab${ordinal}Canvas`);
      const parent = widget.parentId ? findWidget(root, widget.parentId) : null;
      if (!parent || parent.type !== "CANVAS_WIDGET") {
        throw new Error("The Tabs widget is not attached to a fixed canvas.");
      }
      const spaces = childSpaces(parent, root);
      (widget.children ??= []).push(createTabCanvasBlueprint({
        widgetId: canvasId, widgetName: canvasName, parentId: widget.widgetId,
        tabId: id, tabName: label, parentColumnSpace: spaces.parentColumnSpace,
        parentRowSpace: spaces.parentRowSpace, canvasVersion: root.version,
      }));
      tabs.push({ id, label, widgetId: canvasId, index: tabs.length,
        isVisible: true, positioning: "vertical" });
      refreshNestedSpaces(widget, root);
      break;
    }
    case "delete": {
      if (tabs.length <= 1) throw new Error("A Tabs widget needs at least one tab.");
      const [removed] = tabs.splice(targetIndex, 1);
      const removedCanvas = widget.children?.find((child) => child.widgetId === removed.widgetId);
      const removedIds = new Set(removedCanvas ? allWidgets(removedCanvas)
        .map((entry) => entry.widgetId) : [removed.widgetId]);
      widget.children = widget.children?.filter((child) => child.widgetId !== removed.widgetId);
      document.bindings = document.bindings.filter((binding) => !removedIds.has(binding.target.widgetId));
      document.componentDependencies = document.componentDependencies.filter(
        (dependency) => !removedIds.has(dependency.rootWidgetId));
      if (widget.defaultTab === removed.label) {
        widget.defaultTab = tabs.find((tab) => tab.isVisible !== false)?.label ?? tabs[0].label;
      }
      break;
    }
    case "rename": {
      const label = request.label.trim();
      if (!label) throw new Error("Tab title cannot be empty.");
      if (tabs.some((tab, index) => index !== targetIndex && tab.label === label)) {
        throw new Error("Tab titles must be unique.");
      }
      const previousLabel = tabs[targetIndex].label;
      if (previousLabel === label) return { documentJson: sourceJson, selectedWidgetId: widget.widgetId };
      tabs[targetIndex].label = label;
      const canvas = widget.children?.find((child) => child.widgetId === tabs[targetIndex].widgetId);
      if (canvas) canvas.tabName = label;
      if (widget.defaultTab === previousLabel) widget.defaultTab = label;
      break;
    }
    case "reorder": {
      if (!Number.isSafeInteger(request.toIndex) || request.toIndex < 0 ||
        request.toIndex >= tabs.length) throw new Error("Tab order is out of range.");
      if (targetIndex === request.toIndex) {
        return { documentJson: sourceJson, selectedWidgetId: widget.widgetId };
      }
      const [moved] = tabs.splice(targetIndex, 1);
      tabs.splice(request.toIndex, 0, moved);
      break;
    }
    case "visibility": {
      if (tabs[targetIndex].isVisible === request.isVisible) {
        return { documentJson: sourceJson, selectedWidgetId: widget.widgetId };
      }
      if (!request.isVisible && tabs.filter((tab) => tab.isVisible !== false).length <= 1) {
        throw new Error("A Tabs widget needs at least one visible tab.");
      }
      tabs[targetIndex].isVisible = request.isVisible;
      if (!request.isVisible && widget.defaultTab === tabs[targetIndex].label) {
        widget.defaultTab = tabs.find((tab) => tab.isVisible !== false)?.label ?? tabs[0].label;
      }
      break;
    }
  }

  widget.tabsObj = Object.fromEntries(tabs.map((tab, index) => [tab.id, {
    ...((originalMap[tab.id] !== null && typeof originalMap[tab.id] === "object" &&
      !Array.isArray(originalMap[tab.id])) ? originalMap[tab.id] as Record<string, JsonValue> : {}),
    ...tab,
    index,
  }])) as JsonValue;
  return finish(document, widget.widgetId, request.kind === "add" || request.kind === "delete");
}

function heightEditableWidget(root: AppsmithWidgetDsl, widgetId: string): AppsmithWidgetDsl {
  const widget = findWidget(root, widgetId);
  if (!widget || !DYNAMIC_HEIGHT_FEATURE_TYPES.has(widget.type)) {
    throw new Error("The selected widget does not support automatic height.");
  }
  return widget;
}

/** Appsmith WidgetFeatures.updateMinMaxDynamicHeight as one undoable edit. */
export function updateWidgetHeightModeInDocument(sourceJson: string,
  request: UpdateWidgetHeightModeRequest): EditResult {
  if (!["FIXED", "AUTO_HEIGHT", "AUTO_HEIGHT_WITH_LIMITS"].includes(request.mode)) {
    throw new Error("Choose a supported widget height mode.");
  }
  const document = cloneDocument(sourceJson);
  const widget = heightEditableWidget(document.layout.dsl, request.widgetId);
  if (widget.type === "MODAL_WIDGET" && request.mode === "AUTO_HEIGHT_WITH_LIMITS") {
    throw new Error("Modal supports only Auto Height and Fixed height.");
  }
  const mode = typeof widget.dynamicHeight === "string" ? widget.dynamicHeight : "FIXED";
  if (mode === request.mode && widget.dynamicHeight === request.mode) {
    return { documentJson: sourceJson, selectedWidgetId: widget.widgetId };
  }
  const updates = dynamicHeightModeUpdates({
    topRow: widget.topRow,
    bottomRow: widget.bottomRow,
    isCanvas: widget.type === "CONTAINER_WIDGET" || widget.type === "STATBOX_WIDGET" ||
      widget.type === "FORM_WIDGET" || widget.type === "CARD_WIDGET" ||
      widget.type === "TABS_WIDGET" || widget.type === "MODAL_WIDGET",
    dynamicHeight: mode as DynamicHeight,
    minDynamicHeight: typeof widget.minDynamicHeight === "number" ? widget.minDynamicHeight : undefined,
    maxDynamicHeight: typeof widget.maxDynamicHeight === "number" ? widget.maxDynamicHeight : undefined,
    shouldScrollContents: widget.shouldScrollContents === true,
    overflow: typeof widget.overflow === "string" ? widget.overflow : undefined,
    scrollContents: widget.scrollContents === true,
    fixedFooter: widget.fixedFooter === true,
  }, request.mode);
  for (const { propertyPath, propertyValue } of updates) {
    if (propertyValue === undefined) delete widget[propertyPath];
    else widget[propertyPath] = propertyValue;
  }
  if (widget.type === "MODAL_WIDGET" && request.mode === "FIXED") {
    const height = typeof widget.height === "number" && widget.height > 0
      ? widget.height : (widget.bottomRow - widget.topRow) * DEFAULT_GRID_ROW_HEIGHT;
    widget.height = height;
    widget.minHeight = height;
    widget.bottomRow = widget.topRow + Math.ceil(height / DEFAULT_GRID_ROW_HEIGHT);
    const canvas = widget.children?.find((child) => child.type === "CANVAS_WIDGET");
    if (canvas) {
      canvas.bottomRow = Math.ceil(height / DEFAULT_GRID_ROW_HEIGHT);
      canvas.minHeight = height;
    }
  }
  return finish(document, widget.widgetId);
}

/** Paired min/max overlay commit; both limits enter history together. */
export function updateWidgetHeightLimitsInDocument(sourceJson: string,
  request: UpdateWidgetHeightLimitsRequest): EditResult {
  const document = cloneDocument(sourceJson);
  const widget = heightEditableWidget(document.layout.dsl, request.widgetId);
  if (widget.dynamicHeight !== "AUTO_HEIGHT_WITH_LIMITS") {
    throw new Error("Height limits require the limited automatic height mode.");
  }
  if (request.minRows === undefined && request.maxRows === undefined) {
    return { documentJson: sourceJson, selectedWidgetId: widget.widgetId };
  }
  const minRows = request.minRows ?? (typeof widget.minDynamicHeight === "number"
    ? widget.minDynamicHeight : MIN_HEIGHT_IN_ROWS);
  const maxRows = request.maxRows ?? (typeof widget.maxDynamicHeight === "number"
    ? widget.maxDynamicHeight : MAX_HEIGHT_IN_ROWS);
  if (!Number.isInteger(minRows) || !Number.isInteger(maxRows) ||
      minRows < MIN_HEIGHT_IN_ROWS || maxRows > MAX_HEIGHT_IN_ROWS || maxRows <= minRows) {
    throw new Error("Height limits must be whole rows with a maximum above the minimum.");
  }
  if (widget.minDynamicHeight === minRows && widget.maxDynamicHeight === maxRows) {
    return { documentJson: sourceJson, selectedWidgetId: widget.widgetId };
  }
  widget.minDynamicHeight = minRows;
  widget.maxDynamicHeight = maxRows;
  return finish(document, widget.widgetId);
}

function editableWidgetAndParent(root: AppsmithWidgetDsl, id: string) {
  assertOutsideListV2Template(root, id);
  const widget = findWidget(root, id);
  if (!widget || widget.type === "CANVAS_WIDGET") {
    throw new Error("Select an editable widget before changing its position or size.");
  }
  const parent = widget.parentId ? findWidget(root, widget.parentId) : null;
  if (!parent || parent.type !== "CANVAS_WIDGET") {
    throw new Error("The widget is not inside a fixed canvas.");
  }
  return { widget, parent };
}

export function moveWidgetInDocument(sourceJson: string, request: MoveWidgetRequest,
  options: LayoutPreviewOptions = {}): EditResult {
  const document = cloneDocument(sourceJson);
  const root = document.layout.dsl;
  const planned = planMove(root, request, options);
  const { canvas, sourceParent, widget, plan } = planned;
  if (!widget || !sourceParent) throw new Error("The widget is not attached to a canvas.");
  if (sourceParent.widgetId === canvas.widgetId &&
    sameRect(plan.target, rectOf(widget))) {
    return { documentJson: sourceJson, selectedWidgetId: widget.widgetId };
  }
  applyReflow(root, planned);
  if (sourceParent.widgetId !== canvas.widgetId) {
    const destinationSpaces = childSpaces(canvas, root);
    sourceParent.children = (sourceParent.children ?? []).filter((child) =>
      child.widgetId !== widget.widgetId);
    (canvas.children ??= []).push(widget);
    widget.parentId = canvas.widgetId;
    widget.parentColumnSpace = destinationSpaces.parentColumnSpace;
    widget.parentRowSpace = destinationSpaces.parentRowSpace;
  }
  applyRect(widget, plan.target);
  refreshNestedSpaces(widget, root);
  return finish(document, widget.widgetId, true);
}

export function resizeWidgetInDocument(sourceJson: string, request: ResizeWidgetRequest,
  options: LayoutPreviewOptions = {}): EditResult {
  const document = cloneDocument(sourceJson);
  const root = document.layout.dsl;
  const planned = planResize(root, request, options);
  const { canvas, widget, plan } = planned;
  if (!widget) throw new Error("The selected widget no longer exists.");
  assertOutsideListV2Template(root, request.widgetId);
  if (plan.target.leftColumn === widget.leftColumn &&
    plan.target.topRow === widget.topRow &&
    plan.target.rightColumn === widget.rightColumn &&
    plan.target.bottomRow === widget.bottomRow) {
    return { documentJson: sourceJson, selectedWidgetId: widget.widgetId };
  }
  const canvasBottomRow = canvasBottomRowAfterResize(canvas, root,
    widget.widgetId, plan.target.bottomRow);
  applyReflow(root, planned);
  applyRect(widget, plan.target);
  refreshNestedSpaces(widget, root);
  // Appsmith stores CANVAS_WIDGET.bottomRow in pixels after Fixed resize.
  // Keep the canvas's extension rows even when the resized widget is nested.
  canvas.bottomRow = canvasBottomRow;
  return finish(document, widget.widgetId);
}

/** Appsmith ModalSagas.resizeModalSaga as one local, undoable DSL transaction. */
export function resizeModalInDocument(sourceJson: string, request: ResizeModalRequest): EditResult {
  const document = cloneDocument(sourceJson);
  const root = document.layout.dsl;
  const modal = findWidget(root, request.widgetId);
  if (!modal || modal.type !== "MODAL_WIDGET" || modal.detachFromLayout !== true) {
    throw new Error("The selected Modal no longer exists.");
  }
  const canvas = modal.children?.find((child) => child.widgetId === request.canvasWidgetId);
  if (!canvas || canvas.type !== "CANVAS_WIDGET") {
    throw new Error("The Modal child canvas has changed.");
  }
  if (!Number.isFinite(request.mainCanvasWidth) || request.mainCanvasWidth <= 0) {
    throw new Error("The Modal canvas width is unavailable.");
  }
  const currentHeight = typeof modal.height === "number" ? modal.height : 240;
  const dimensions = modalResizeDimensions({
    width: request.width,
    height: request.height,
    currentHeight,
    mainCanvasWidth: request.mainCanvasWidth,
    autoHeight: modal.dynamicHeight === "AUTO_HEIGHT" ||
      modal.dynamicHeight === "AUTO_HEIGHT_WITH_LIMITS",
  });
  if (dimensions.width > 10000 || dimensions.height > 90000) {
    throw new Error("The Modal dimensions exceed the supported pixel limits.");
  }
  if (modal.width === dimensions.width && modal.height === dimensions.height) {
    return { documentJson: sourceJson, selectedWidgetId: modal.widgetId };
  }
  modal.width = dimensions.width;
  modal.height = dimensions.height;
  // Appsmith stores child-canvas minHeight in pixels. The local DSL retains
  // row bounds, so translate getModalCanvasBottomRow's pixel result to rows.
  canvas.bottomRow = modalCanvasBottomRows(dimensions.height, canvas);
  canvas.minHeight = dimensions.height;
  modal.bottomRow = modal.topRow + Math.ceil(dimensions.height / DEFAULT_GRID_ROW_HEIGHT);
  modal.minHeight = dimensions.height;
  refreshNestedSpaces(modal, root);
  return finish(document, modal.widgetId);
}

export function deleteWidgetFromDocument(sourceJson: string, request: DeleteWidgetRequest): EditResult {
  const document = cloneDocument(sourceJson);
  const root = document.layout.dsl;
  const widget = findWidget(root, request.widgetId);
  if (!widget) throw new Error("The selected widget no longer exists.");
  if (widget.type === "CANVAS_WIDGET") {
    throw new Error("Canvas widgets are structural. Delete their container instead.");
  }
  const parent = widget.parentId ? findWidget(root, widget.parentId) : null;
  if (!parent?.children?.some((child) => child.widgetId === widget.widgetId)) {
    throw new Error("The widget is not attached to a canvas.");
  }
  const removedIds = new Set(allWidgets(widget).map((child) => child.widgetId));
  parent.children = parent.children.filter((child) => child.widgetId !== widget.widgetId);
  document.bindings = document.bindings.filter((binding) => !removedIds.has(binding.target.widgetId));
  document.componentDependencies = document.componentDependencies.filter(
    (dependency) => !removedIds.has(dependency.rootWidgetId),
  );
  const parentContainer = parent.type === "CANVAS_WIDGET" && parent.parentId
    ? findWidget(root, parent.parentId)
    : null;
  const selectedWidgetId = parentContainer?.type === "CONTAINER_WIDGET" ||
    parentContainer?.type === "STATBOX_WIDGET" ||
    parentContainer?.type === "FORM_WIDGET" ||
    parentContainer?.type === "CARD_WIDGET" ||
    parentContainer?.type === "TABS_WIDGET"
    ? parentContainer.widgetId
    : parent.widgetId;
  return finish(document, selectedWidgetId, true);
}

export function renameDocument(
  sourceJson: string,
  request: RenameDocumentRequest,
  selectedWidgetId: string | null,
): EditResult {
  const document = cloneDocument(sourceJson);
  const name = request.name.trim();
  if (!name) throw new Error("Dashboard name cannot be empty.");
  if (name === document.name) return { documentJson: sourceJson, selectedWidgetId };
  const starterTitle = findWidget(document.layout.dsl, "dashboard-title");
  const titleIsDynamic = (typeof starterTitle?.text === "string" &&
    /\{\{[\s\S]*?\}\}/.test(starterTitle.text)) ||
    (Array.isArray(starterTitle?.dynamicBindingPathList) &&
      starterTitle.dynamicBindingPathList.some((entry) =>
        entry !== null && typeof entry === "object" && !Array.isArray(entry) &&
        entry.key === "text"));
  const titleHasCyflexBinding = document.bindings.some((binding) =>
    binding.target.widgetId === "dashboard-title" && binding.target.propertyPath === "text");
  if (starterTitle?.type === "TEXT_WIDGET" && starterTitle.text === document.name &&
    !titleIsDynamic && !titleHasCyflexBinding) {
    starterTitle.text = name;
  }
  document.name = name;
  return finish(document, selectedWidgetId);
}

export function widgetFromDocument(documentJson: string, widgetId: string | null): AppsmithWidgetDsl | null {
  if (!widgetId) return null;
  return findWidget(cloneDocument(documentJson).layout.dsl, widgetId);
}
