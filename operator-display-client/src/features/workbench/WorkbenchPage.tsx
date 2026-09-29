import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { unstable_batchedUpdates } from "react-dom";
import {
  Button,
  IDEHeader,
  IDEHeaderTitle,
  Icon,
  Input,
  SearchInput,
  Text,
} from "@appsmith/ads";
import { AppIdeFrame } from "../../layouts/ide/AppIdeFrame";
import { FEATURED_FIXED_THEMES } from "../../editor-bridge/appsmith-theme/presets";
import { ThemePropertyPane } from "../theme-editor";
import { IndexedDbSavedThemeStore } from "../theme-editor/IndexedDbSavedThemeStore";
import type { SavedTheme } from "../theme-editor/IndexedDbSavedThemeStore";
import { MarketplaceClient, marketplaceErrorMessage } from "../../api/marketplace";
import { downloadReferencedThemeAsset } from "../../api/publishedDashboard";
import { applyThemeAsset } from "../../api/themeAsset";
import { parseDashboardDocument } from "../../document";
import type { AppsmithWidgetDsl, DashboardDocument, InlineDashboardTheme } from "../../document";
import { canvasPayloadForDocument } from "../../editor-bridge/canvasPayload";
import type { CanvasPayload } from "../../editor-bridge/canvasPayload";
import {
  createReadOnlyCompatStore,
  replaceCanvasPayload,
  selectWidget as selectCompatWidget,
  updateCanvasWidth,
} from "../../editor-bridge/compat-store";
import type { ReadOnlyCompatStore } from "../../editor-bridge/compat-store";
import { EditableCanvas } from "../../editor-bridge/editable-canvas";
import { NativeReadOnlyCanvas } from "../../editor-bridge/read-only/NativeReadOnlyCanvas";
import { diagnoseStaticReferenceErrors } from "../../editor-bridge/static-bindings/diagnoseStaticReferenceErrors";
import { projectActiveTabsAutoHeight } from "../../editor-bridge/native-widgets/tabs";
import { CUSTOM_WIDGET_BUILDER_EVENTS, eventReferences } from "../../editor-bridge/native-widgets/custom-widget/builderProtocol";
import { isRecord, resolveCustomModel, type CustomSrcDoc } from "../../editor-bridge/native-widgets/custom-widget/customWidgetModel";
import {
  APPSMITH_DEFAULT_CANVAS_WIDTH_PRESET,
  resolveCanvasWidth,
} from "../../editor-bridge/appsmith-fixed-width";
import {
  AppsmithMultiSelectPropertyPane,
  pushPopWidgetSelection,
  shiftSelectWidgets,
} from "../../editor-bridge/appsmith-fixed-selection";
import {
  type AddWidgetRequest,
} from "../../editor-bridge/editable-store/editDocument";
import {
  addEditorWidget,
  applyEditorSavedTheme,
  beginEditorDrag,
  beginEditorModalResize,
  copyEditorWidgets,
  commitEditorGroupPlan,
  commitEditorLayoutPlan,
  createEditableWorkbenchStore,
  cutEditorWidgets,
  deleteEditorWidget,
  deleteEditorWidgets,
  endEditorDrag,
  endEditorModalResize,
  editorOperationFailed,
  editEditorTab,
  moveEditorWidget,
  groupEditorWidgets,
  moveEditorWidgets,
  measureEditorWidgetHeight,
  pasteEditorWidgets,
  redoEditorChange,
  renameEditorDocument,
  resetEditorWidgetStyles,
  requestEditorSave,
  requestEditorSaveAs,
  removeEditorBinding,
  resizeEditorWidget,
  resizeEditorModal,
  saveEditorBinding,
  selectEditorDocument,
  selectEditorWidget,
  selectEditorWidgets,
  selectEditorTabCanvas,
  setEditorModalOpen,
  setEditorCanvasWidth,
  setEditorDragCanvas,
  undoEditorChange,
  updateEditorThemeProperties,
  updateEditorReferencedThemeProperties,
  selectEditorThemePreset,
  updateEditorWidgetProperty,
  updateEditorCustomWidgetSource,
  updateEditorWidgetHeightLimits,
  updateEditorWidgetHeightMode,
  updateEditorCanvasWidthPreset,
} from "../../editor-bridge/editable-store";
import type {
  EditorDragSession,
  EditableWorkbenchState,
  EditableWorkbenchStore,
} from "../../editor-bridge/editable-store";
import { TransientWidgetOverlay } from "../../editor-bridge/live-bindings";
import { useAppDispatch, useAppSelector } from "../../state/store";
import {
  chooseWorkbenchSection,
  loadWorkbenchDraft,
  setShowTabOrderOverlay,
  setWorkbenchPreviewMode,
  showExampleDocument,
} from "./workbenchSlice";
import type { WorkbenchSection } from "./workbenchSlice";
import { applyPreviewSamples } from "./sampleBindings";
import { PropertyPane } from "./WorkbenchPropertyPane";
import { WorkbenchRunPanel } from "./WorkbenchRunPanel";
import { WorkbenchAppSettings } from "./WorkbenchAppSettings";
import "./workbenchPage.css";

const SECTION_BUTTONS: ReadonlyArray<{
  id: WorkbenchSection;
  label: string;
  icon: "widgets-v3" | "layout-2-line" | "settings-v3";
}> = [
  { id: "widgets", label: "Widgets", icon: "widgets-v3" },
  { id: "outline", label: "Outline", icon: "layout-2-line" },
  { id: "tools", label: "Dashboard tools", icon: "settings-v3" },
];

const PALETTE_GROUPS = [
  {
    name: "Suggested widgets",
    widgets: [
      { name: "Text", type: "TEXT_WIDGET" },
      { name: "Chart", type: "CHART_WIDGET" },
      { name: "Container", type: "CONTAINER_WIDGET" },
    ],
  },
  {
    name: "Display",
    widgets: [
      { name: "Image", type: "IMAGE_WIDGET" },
      { name: "Divider", type: "DIVIDER_WIDGET" },
      { name: "Progress", type: "PROGRESS_WIDGET" },
      { name: "Table", type: "TABLE_WIDGET_V2" },
      { name: "Document Viewer", type: "DOCUMENT_VIEWER_WIDGET" },
      { name: "Audio", type: "AUDIO_WIDGET" },
      { name: "Video", type: "VIDEO_WIDGET" },
      { name: "Iframe", type: "IFRAME_WIDGET" },
      { name: "Map", type: "MAP_WIDGET" },
      { name: "Map Chart", type: "MAP_CHART_WIDGET" },
      { name: "List", type: "LIST_WIDGET_V2" },
      { name: "Stats Box", type: "STATBOX_WIDGET" },
      { name: "Card", type: "CARD_WIDGET" },
      { name: "Custom", type: "CUSTOM_WIDGET" },
    ],
  },
  {
    name: "Toggles",
    widgets: [
      { name: "Checkbox", type: "CHECKBOX_WIDGET" },
      { name: "Switch", type: "SWITCH_WIDGET" },
      { name: "Checkbox Group", type: "CHECKBOX_GROUP_WIDGET" },
      { name: "Switch Group", type: "SWITCH_GROUP_WIDGET" },
    ],
  },
  {
    name: "Buttons",
    widgets: [
      { name: "Button", type: "BUTTON_WIDGET" },
      { name: "Icon Button", type: "ICON_BUTTON_WIDGET" },
      { name: "Button Group", type: "BUTTON_GROUP_WIDGET" },
      { name: "Menu Button", type: "MENU_BUTTON_WIDGET" },
    ],
  },
  {
    name: "Inputs",
    widgets: [
      { name: "Input", type: "INPUT_WIDGET_V2" },
      { name: "Radio Group", type: "RADIO_GROUP_WIDGET" },
      { name: "Select", type: "SELECT_WIDGET" },
      { name: "Multi Select", type: "MULTI_SELECT_WIDGET_V2" },
      { name: "TreeSelect", type: "SINGLE_SELECT_TREE_WIDGET" },
      { name: "Multi TreeSelect", type: "MULTI_SELECT_TREE_WIDGET" },
      { name: "Date Picker", type: "DATE_PICKER_WIDGET2" },
      { name: "Phone Input", type: "PHONE_INPUT_WIDGET" },
      { name: "Currency Input", type: "CURRENCY_INPUT_WIDGET" },
      { name: "Rich Text Editor", type: "RICH_TEXT_EDITOR_WIDGET" },
      { name: "File Picker", type: "FILE_PICKER_WIDGET_V2" },
    ],
  },
  {
    name: "External",
    widgets: [
      { name: "Audio Recorder", type: "AUDIO_RECORDER_WIDGET" },
      { name: "Camera", type: "CAMERA_WIDGET" },
      { name: "Code Scanner", type: "CODE_SCANNER_WIDGET" },
    ],
  },
  {
    name: "Sliders & rating",
    widgets: [
      { name: "Rating", type: "RATE_WIDGET" },
      { name: "Number Slider", type: "NUMBER_SLIDER_WIDGET" },
      { name: "Range Slider", type: "RANGE_SLIDER_WIDGET" },
      { name: "Category Slider", type: "CATEGORY_SLIDER_WIDGET" },
    ],
  },
  {
    name: "Layout",
    widgets: [
      { name: "Tabs", type: "TABS_WIDGET" },
      { name: "Modal", type: "MODAL_WIDGET" },
      { name: "Form", type: "FORM_WIDGET" },
      { name: "JSON Form", type: "JSON_FORM_WIDGET" },
    ],
  },
] as const;

type PaletteWidgetType = typeof PALETTE_GROUPS[number]["widgets"][number]["type"];
const PALETTE_THUMBNAILS: Record<PaletteWidgetType, string> = {
  TEXT_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/TextWidget.svg", import.meta.url).href,
  CHART_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/ChartWidget.svg", import.meta.url).href,
  CONTAINER_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/ContainerWidget.svg", import.meta.url).href,
  IMAGE_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/ImageWidget.svg", import.meta.url).href,
  DIVIDER_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/DividerWidget.svg", import.meta.url).href,
  PROGRESS_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/ProgressWidget.svg", import.meta.url).href,
  TABLE_WIDGET_V2: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/TableWidgetV2.svg", import.meta.url).href,
  DOCUMENT_VIEWER_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/DocumentViewerWidget.svg", import.meta.url).href,
  AUDIO_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/AudioWidget.svg", import.meta.url).href,
  VIDEO_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/VideoWidget.svg", import.meta.url).href,
  IFRAME_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/IframeWidget.svg", import.meta.url).href,
  MAP_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/MapWidget.svg", import.meta.url).href,
  MAP_CHART_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/MapChartWidget.svg", import.meta.url).href,
  CHECKBOX_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/CheckboxWidget.svg", import.meta.url).href,
  SWITCH_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/SwitchWidget.svg", import.meta.url).href,
  CHECKBOX_GROUP_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/CheckboxGroupWidget.svg", import.meta.url).href,
  SWITCH_GROUP_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/SwitchGroupWidget.svg", import.meta.url).href,
  BUTTON_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/ButtonWidget.svg", import.meta.url).href,
  ICON_BUTTON_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/IconButtonWidget.svg", import.meta.url).href,
  BUTTON_GROUP_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/ButtonGroupWidget.svg", import.meta.url).href,
  MENU_BUTTON_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/MenuButtonWidget.svg", import.meta.url).href,
  INPUT_WIDGET_V2: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/InputWidgetV2.svg", import.meta.url).href,
  RADIO_GROUP_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/RadioGroupWidget.svg", import.meta.url).href,
  SELECT_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/SelectWidget.svg", import.meta.url).href,
  MULTI_SELECT_WIDGET_V2: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/MultiSelectWidgetV2.svg", import.meta.url).href,
  SINGLE_SELECT_TREE_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/SingleSelectTreeWidget.svg", import.meta.url).href,
  MULTI_SELECT_TREE_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/MultiSelectTreeWidget.svg", import.meta.url).href,
  DATE_PICKER_WIDGET2: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/DatePickerWidget2.svg", import.meta.url).href,
  PHONE_INPUT_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/PhoneInputWidget.svg", import.meta.url).href,
  CURRENCY_INPUT_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/CurrencyInputWidget.svg", import.meta.url).href,
  RICH_TEXT_EDITOR_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/RichTextEditorWidget.svg", import.meta.url).href,
  FILE_PICKER_WIDGET_V2: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/FilePickerWidgetV2.svg", import.meta.url).href,
  AUDIO_RECORDER_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/AudioRecorderWidget.svg", import.meta.url).href,
  CAMERA_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/CameraWidget.svg", import.meta.url).href,
  CODE_SCANNER_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/CodeScannerWidget.svg", import.meta.url).href,
  RATE_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/RateWidget.svg", import.meta.url).href,
  NUMBER_SLIDER_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/NumberSliderWidget.svg", import.meta.url).href,
  RANGE_SLIDER_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/RangeSliderWidget.svg", import.meta.url).href,
  CATEGORY_SLIDER_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/CategorySliderWidget.svg", import.meta.url).href,
  LIST_WIDGET_V2: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/ListWidgetV2.svg", import.meta.url).href,
  STATBOX_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/StatboxWidget.svg", import.meta.url).href,
  CARD_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/CardWidget.svg", import.meta.url).href,
  CUSTOM_WIDGET: new URL("../../editor-bridge/native-widgets/custom-widget/thumbnail.svg", import.meta.url).href,
  TABS_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/TabsWidget.svg", import.meta.url).href,
  MODAL_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/ModalWidget.svg", import.meta.url).href,
  FORM_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/FormWidget.svg", import.meta.url).href,
  JSON_FORM_WIDGET: new URL("../../editor-bridge/appsmith-fixed-drag/thumbnails/JSONFormWidget.svg", import.meta.url).href,
};

function findWidget(
  root: AppsmithWidgetDsl,
  widgetId: string | null,
): AppsmithWidgetDsl | null {
  if (!widgetId) return null;
  if (root.widgetId === widgetId) return root;

  for (const child of root.children ?? []) {
    const found = findWidget(child, widgetId);

    if (found) return found;
  }

  return null;
}

function isCustomSrcDoc(value: unknown): value is CustomSrcDoc {
  return isRecord(value) && typeof value.html === "string" &&
    typeof value.css === "string" && typeof value.js === "string";
}

function OutlineNode({
  widget,
  depth,
  selectedId,
  onSelect,
}: {
  widget: AppsmithWidgetDsl;
  depth: number;
  selectedId: string | null;
  onSelect: (widgetId: string) => void;
}): React.ReactElement {
  if (widget.type === "CANVAS_WIDGET" && depth > 0) {
    return <>
      {(widget.children ?? []).map((child) => (
        <OutlineNode
          depth={depth}
          key={child.widgetId}
          onSelect={onSelect}
          selectedId={selectedId}
          widget={child}
        />
      ))}
    </>;
  }

  return (
    <li>
      <button
        aria-current={selectedId === widget.widgetId ? "true" : undefined}
        className="od-workbench__outline-item"
        onClick={() => onSelect(widget.widgetId)}
        style={{ paddingLeft: 12 + depth * 14 }}
        type="button"
      >
        <span aria-hidden="true">▤</span>
        {widget.widgetName}
      </button>
      {widget.children && widget.children.length > 0 && (
        <ul>
          {widget.children.map((child) => (
            <OutlineNode
              depth={depth + 1}
              key={child.widgetId}
              onSelect={onSelect}
              selectedId={selectedId}
              widget={child}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function Explorer({
  document,
  section,
  selectedId,
  onSelect,
  onAdd,
  onPaletteDragStart,
  onRename,
  onSectionChange,
  runControls,
}: {
  document: DashboardDocument;
  section: WorkbenchSection;
  selectedId: string | null;
  onSelect: (widgetId: string) => void;
  onAdd: (type: PaletteWidgetType) => void;
  onPaletteDragStart: (type: PaletteWidgetType) => void;
  onRename: (name: string) => void;
  onSectionChange: (section: WorkbenchSection) => void;
  runControls: React.ReactNode;
}): React.ReactElement {
  const [widgetSearch, setWidgetSearch] = useState("");
  const [nameDraft, setNameDraft] = useState(document.name);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  useEffect(() => setNameDraft(document.name), [document.name]);
  const query = widgetSearch.trim().toLowerCase();
  const paletteGroups = PALETTE_GROUPS.map((group) => ({
    ...group,
    widgets: group.widgets.filter((widget) =>
      widget.name.toLowerCase().includes(query),
    ),
  })).filter((group) => group.widgets.length > 0);

  return (
    <div className="od-workbench__explorer-content">
      <div className="od-workbench__pane-heading">
        <Text kind="heading-xs" renderAs="h2">
          {section === "widgets" ? "Widgets" : section === "outline" ? "Outline" : "Dashboard tools"}
        </Text>
        {section === "widgets" && (
          <Button
            aria-label="Show widget outline"
            isIconButton
            kind="tertiary"
            onClick={() => onSectionChange("outline")}
            size="sm"
            startIcon="layout-2-line"
            title="Show widget outline"
          />
        )}
        {section === "outline" && (
          <Button
            kind="secondary"
            onClick={() => onSectionChange("widgets")}
            size="sm"
            startIcon="add-line"
          >
            Widgets
          </Button>
        )}
      </div>
      {section === "widgets" && (
        <div className="od-workbench__palette">
          <div className="od-workbench__palette-search">
            <SearchInput
              onChange={setWidgetSearch}
              placeholder="Search widgets"
              value={widgetSearch}
            />
          </div>
          <div className="od-workbench__palette-scroll">
            {paletteGroups.length === 0 && (
              <p className="od-workbench__pane-note">No widgets match this search.</p>
            )}
            {paletteGroups.map((group) => {
              const isExpanded = query.length > 0 || !collapsed[group.name];

              return (
                <section className="od-workbench__palette-group" key={group.name}>
                  <button
                    aria-expanded={isExpanded}
                    className="od-workbench__palette-group-heading"
                    onClick={() =>
                      setCollapsed((state) => ({
                        ...state,
                        [group.name]: !state[group.name],
                      }))
                    }
                    type="button"
                  >
                    <Icon
                      name={isExpanded ? "arrow-down-s-line" : "arrow-right-s-line"}
                      size="sm"
                    />
                    <Text kind="heading-xs">{group.name}</Text>
                  </button>
                  {isExpanded && (
                    <div className="od-workbench__palette-grid">
                      {group.widgets.map((widget) => (
                        <button
                          aria-label={`Add ${widget.name} widget`}
                          className="od-workbench__palette-card"
                          draggable
                          id={`widget-card-draggable-${widget.type.replace(/_/g, "").toLowerCase()}`}
                          key={`${group.name}-${widget.name}`}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            onAdd(widget.type);
                          }}
                          onDragStart={(event) => {
                            // Appsmith cancels native HTML drag and delegates mouse tracking
                            // to its fixed-layout arena through shared drag state.
                            event.preventDefault();
                            event.stopPropagation();
                            onPaletteDragStart(widget.type);
                          }}
                          title={`Drag ${widget.name} widget onto the canvas`}
                          type="button"
                        >
                          <span aria-hidden="true" className="od-workbench__palette-thumbnail">
                            <img alt="" src={PALETTE_THUMBNAILS[widget.type]} />
                          </span>
                          <Text kind="body-s">{widget.name}</Text>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}
      {section === "outline" && (
        <div className="od-workbench__outline-scroll">
          <ul className="od-workbench__outline">
            <OutlineNode
              depth={0}
              onSelect={onSelect}
              selectedId={selectedId}
              widget={document.layout.dsl}
            />
          </ul>
        </div>
      )}
      <div className="od-workbench__tools" hidden={section !== "tools"}>
          <Input
            label="Dashboard name"
            onBlur={() => {
              const name = nameDraft.trim();
              if (name && name !== document.name) onRename(name);
              else if (!name) setNameDraft(document.name);
            }}
            onChange={setNameDraft}
            value={nameDraft}
          />
          <p><strong>Document ID</strong><br />{document.documentId}</p>
          <p><strong>Layout</strong><br />{document.compatibility.layoutSystem}</p>
          <p><strong>Variables</strong><br />{document.variables.length}</p>
          <p><strong>Bindings</strong><br />{document.bindings.length}</p>
          {runControls}
      </div>
    </div>
  );
}

function exportDocument(dashboard: DashboardDocument): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(dashboard, null, 2)], {
    type: "application/json",
  }));
  const link = document.createElement("a");

  link.href = url;
  link.download = `${dashboard.name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-") || "dashboard"}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

interface CanvasSession {
  id: number;
  projectionEpoch: number;
  editorStore: EditableWorkbenchStore;
  sourceJson: string;
  projectionJson: string;
  payloadKey: string;
  payload: CanvasPayload;
  store: ReadOnlyCompatStore;
  overlay: TransientWidgetOverlay;
}

function canvasPlanningJson(documentJson: string, renderedWidth: number): string {
  if (!Number.isSafeInteger(renderedWidth) || renderedWidth <= 0) return documentJson;
  const document = JSON.parse(documentJson) as DashboardDocument;
  if (document.layout.dsl.rightColumn === renderedWidth) return documentJson;
  document.layout.dsl.rightColumn = renderedWidth;
  return JSON.stringify(document);
}

function useEditorSnapshot(store: EditableWorkbenchStore | null): EditableWorkbenchState | null {
  const [snapshot, setSnapshot] = useState<{
    store: EditableWorkbenchStore | null;
    state: EditableWorkbenchState | null;
  }>(() => ({ store, state: store?.getState() ?? null }));

  useEffect(() => {
    setSnapshot({ store, state: store?.getState() ?? null });
    if (!store) return;
    return store.subscribe(() => setSnapshot({ store, state: store.getState() }));
  }, [store]);

  return snapshot.store === store ? snapshot.state : store?.getState() ?? null;
}

/** AppIDE-shaped workbench with a local editor store and Appsmith widget rendering. */
export function WorkbenchPage(): React.ReactElement {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.session.user);
  const workbench = useAppSelector((state) => state.workbench);
  const viewPreview = workbench.isPreviewMode;
  const [canvasSession, setCanvasSession] = useState<CanvasSession | null>(null);
  const canvasSessionRef = useRef<CanvasSession | null>(null);
  const nextCanvasSessionId = useRef(0);
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [previewActive, setPreviewActive] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [runActive, setRunActive] = useState(false);
  const [referencedTheme, setReferencedTheme] = useState<{
    store: EditableWorkbenchStore;
    key: string;
    theme: InlineDashboardTheme;
  } | null>(null);
  const [referencedThemeError, setReferencedThemeError] = useState<{
    store: EditableWorkbenchStore;
    key: string;
    message: string;
  } | null>(null);
  const draftId = new URLSearchParams(window.location.search).get("draftId");
  const baseDocument = useMemo(
    () => parseDashboardDocument(JSON.parse(workbench.documentJson)),
    [workbench.documentJson],
  );
  const savedThemeStore = useMemo(() => new IndexedDbSavedThemeStore(), []);
  const themeScope = useMemo(() => user ? {
    deploymentId: `${window.location.origin}/operator_display`,
    accountId: String(user.id),
    documentId: baseDocument.documentId,
  } : null, [user?.id, baseDocument.documentId]);
  const themeScopeKey = themeScope
    ? JSON.stringify([themeScope.deploymentId, themeScope.accountId, themeScope.documentId]) : null;
  const [savedThemeSnapshot, setSavedThemeSnapshot] = useState<{
    key: string | null;
    themes: SavedTheme[];
    loading: boolean;
    error: string | null;
  }>({ key: null, themes: [], loading: false, error: null });
  const savedThemes = savedThemeSnapshot.key === themeScopeKey
    ? savedThemeSnapshot.themes : [];
  const savedThemesLoading = !!themeScopeKey && (
    savedThemeSnapshot.key !== themeScopeKey || savedThemeSnapshot.loading);
  const savedThemesError = savedThemeSnapshot.key === themeScopeKey
    ? savedThemeSnapshot.error : null;
  useEffect(() => {
    if (!themeScope || !themeScopeKey) return;
    let cancelled = false;
    setSavedThemeSnapshot({ key: themeScopeKey, themes: [], loading: true, error: null });
    void savedThemeStore.list(themeScope).then((themes) => {
      if (!cancelled) setSavedThemeSnapshot({ key: themeScopeKey, themes, loading: false, error: null });
    }).catch((cause: unknown) => {
      if (!cancelled) setSavedThemeSnapshot({ key: themeScopeKey, themes: [], loading: false,
        error: cause instanceof Error ? cause.message : "Loading saved themes failed." });
    });
    return () => { cancelled = true; };
  }, [themeScope, themeScopeKey, savedThemeStore]);
  const viewportRef = useRef<HTMLElement>(null);
  const builderWindowsRef = useRef(new Map<string, Window>());
  const [builderWindowVersion, setBuilderWindowVersion] = useState(0);
  const previousBuilderSelectionRef = useRef<string | null>(null);
  const previousBuilderReferencesRef = useRef("");
  const showDocument = !draftId ||
    (workbench.loadStatus === "succeeded" && workbench.source === "draft");
  const editorStore = useMemo(() => {
    if (!showDocument || (draftId && !user)) return null;

    return createEditableWorkbenchStore(baseDocument, {
      selectedWidgetId: workbench.selectedWidgetId,
      revision: draftId ? workbench.revision : null,
      clipboardScope: user ? {
        deploymentId: `${window.location.origin}/operator_display`,
        accountId: String(user.id),
      } : undefined,
      draftScope: draftId && user ? {
        deploymentId: `${window.location.origin}/operator_display`,
        accountId: String(user.id),
        documentId: draftId,
      } : undefined,
    });
  }, [baseDocument, showDocument, draftId, user?.id, workbench.revision]);
  const editorState = useEditorSnapshot(editorStore);
  const document = useMemo(
    () => editorState ? selectEditorDocument(editorState) : baseDocument,
    [editorState?.documentJson, baseDocument],
  );
  const themeReferenceKey = document.theme.kind === "marketplace"
    ? JSON.stringify([document.theme.itemId, document.theme.revision]) : null;
  useEffect(() => {
    setReferencedTheme(null);
    setReferencedThemeError(null);
    if (!editorStore || document.theme.kind !== "marketplace" || !themeReferenceKey) return;

    const controller = new AbortController();
    void downloadReferencedThemeAsset(document.theme, new MarketplaceClient(),
      controller.signal)
      .then((asset) => {
        if (controller.signal.aborted) return;
        const resolved = applyThemeAsset(document, asset).theme;
        if (resolved.kind !== "inline") return;
        setReferencedTheme({ store: editorStore, key: themeReferenceKey,
          theme: resolved });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setReferencedThemeError({ store: editorStore, key: themeReferenceKey,
          message: marketplaceErrorMessage(error, "Loading referenced theme") });
      });
    return () => controller.abort();
  }, [editorStore, themeReferenceKey]);
  const effectiveTheme = document.theme.kind === "inline" ? document.theme
    : referencedTheme?.store === editorStore &&
      referencedTheme.key === themeReferenceKey ? referencedTheme.theme : null;
  const documentJson = editorState?.documentJson ?? workbench.documentJson;
  const activeTabCanvasKey = JSON.stringify(editorState?.activeTabCanvasIds ?? {});
  const projectedCanvasJson = useMemo(() => projectActiveTabsAutoHeight(
    documentJson, editorState?.activeTabCanvasIds ?? {},
  ).documentJson, [documentJson, activeTabCanvasKey]);
  const projectedCanvasDocument = useMemo(() => projectedCanvasJson === documentJson
    ? document : parseDashboardDocument(JSON.parse(projectedCanvasJson)),
  [projectedCanvasJson, documentJson, document]);
  const canvasPayloadKey = useMemo(() => JSON.stringify({
    name: projectedCanvasDocument.name,
    layout: projectedCanvasDocument.layout.dsl,
    variables: projectedCanvasDocument.variables,
    bindings: projectedCanvasDocument.bindings,
  }), [projectedCanvasDocument]);
  const widthPreset = document.compatibility.canvasWidthPreset ??
    APPSMITH_DEFAULT_CANVAS_WIDTH_PRESET;
  const renderedCanvasWidth = editorState?.canvasWidthPx ?? 0;
  const canvasInitialized = renderedCanvasWidth > 0;
  const activeCanvas = canvasSession?.editorStore === editorStore
    ? canvasSession
    : null;
  const interactionDocumentJson = useMemo(() =>
    canvasPlanningJson(activeCanvas?.projectionJson ?? projectedCanvasJson, renderedCanvasWidth),
  [activeCanvas?.projectionJson, projectedCanvasJson, renderedCanvasWidth]);
  const canvasReady = canvasInitialized && activeCanvas?.sourceJson === documentJson &&
    activeCanvas.projectionJson === projectedCanvasJson;
  const canvasCommandReady = () => {
    const canvas = canvasSessionRef.current;
    const current = editorStore?.getState();
    const liveProjection = current
      ? projectActiveTabsAutoHeight(current.documentJson,
        current.activeTabCanvasIds).documentJson : null;

    return canvas?.editorStore === editorStore &&
      (current?.canvasWidthPx ?? 0) > 0 &&
      canvas.sourceJson === current?.documentJson &&
      canvas.projectionJson === liveProjection;
  };
  const canvasInteractionSourceRef = useRef<{
    sourceJson: string;
    planningJson: string;
    activeTabCanvasIds: Record<string, string>;
    width: number;
  } | null>(null);
  const beginCanvasInteraction = () => {
    if (canvasCommandReady()) {
      const current = editorStore!.getState();
      const projection = projectActiveTabsAutoHeight(current.documentJson,
        current.activeTabCanvasIds).documentJson;
      canvasInteractionSourceRef.current = {
        sourceJson: current.documentJson,
        planningJson: canvasPlanningJson(projection, current.canvasWidthPx),
        activeTabCanvasIds: { ...current.activeTabCanvasIds },
        width: current.canvasWidthPx,
      };
    }
  };
  const canCommitCanvasInteraction = () => {
    if (!canvasCommandReady() || !editorStore || !canvasInteractionSourceRef.current) return false;
    const current = editorStore.getState();
    const token = canvasInteractionSourceRef.current;
    return token.sourceJson === current.documentJson &&
      token.width === current.canvasWidthPx &&
      JSON.stringify(token.activeTabCanvasIds) === JSON.stringify(current.activeTabCanvasIds) &&
      token.planningJson === canvasPlanningJson(projectActiveTabsAutoHeight(
        current.documentJson, current.activeTabCanvasIds).documentJson, current.canvasWidthPx);
  };
  const root = (activeCanvas?.payload.dsl ?? document.layout.dsl) as AppsmithWidgetDsl;
  const evaluationErrorCounts = useMemo(() => activeCanvas
    ? diagnoseStaticReferenceErrors(activeCanvas.payload.widgets, {
        externalEntityNames: document.variables.map((variable) => variable.key),
      })
    : {}, [activeCanvas?.payload.widgets, document.variables]);
  const previewDocument = useMemo(
    () => ({ ...document, layout: { dsl: root } }),
    [document, root],
  );
  const selected = findWidget(projectedCanvasDocument.layout.dsl,
    editorState?.selectedWidgetId ?? null);

  const customBuilderPayload = (widgetId: string) => {
    if (!editorStore) return null;
    const currentDocument = selectEditorDocument(editorStore.getState());
    const widget = findWidget(currentDocument.layout.dsl, widgetId);
    if (!widget || widget.type !== "CUSTOM_WIDGET") return null;
    return {
      name: widget.widgetName,
      widgetId: widget.widgetId,
      srcDoc: widget.srcDoc,
      uncompiledSrcDoc: widget.uncompiledSrcDoc,
      model: resolveCustomModel(widget),
      events: eventReferences(widget),
      theme: effectiveTheme?.properties ?? {},
    };
  };

  useEffect(() => {
    if (!editorStore) return;
    const onBuilderMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isRecord(event.data)) return;
      const connection = [...builderWindowsRef.current.entries()].find(([, popup]) =>
        popup === event.source);
      if (!connection) return;
      const [widgetId, popup] = connection;
      const selectedWidgetId = editorStore.getState().selectedWidgetId;
      switch (event.data.type) {
        case CUSTOM_WIDGET_BUILDER_EVENTS.READY: {
          const payload = customBuilderPayload(widgetId);
          if (!payload) return;
          popup.postMessage({ type: CUSTOM_WIDGET_BUILDER_EVENTS.READY_ACK,
            ...payload }, window.location.origin);
          if (selectedWidgetId !== widgetId) {
            popup.postMessage({ type: CUSTOM_WIDGET_BUILDER_EVENTS.PAUSE },
              window.location.origin);
          }
          break;
        }
        case CUSTOM_WIDGET_BUILDER_EVENTS.UPDATE_SRCDOC:
          if (selectedWidgetId === widgetId &&
            isCustomSrcDoc(event.data.srcDoc) &&
            isCustomSrcDoc(event.data.uncompiledSrcDoc)) {
            editorStore.dispatch(updateEditorCustomWidgetSource({
              widgetId, srcDoc: event.data.srcDoc,
              uncompiledSrcDoc: event.data.uncompiledSrcDoc,
            }));
          }
          break;
        case CUSTOM_WIDGET_BUILDER_EVENTS.DISCONNECTED:
          builderWindowsRef.current.delete(widgetId);
          setBuilderWindowVersion((version) => version + 1);
          break;
      }
    };
    window.addEventListener("message", onBuilderMessage);
    return () => window.removeEventListener("message", onBuilderMessage);
  }, [editorStore, effectiveTheme]);

  useEffect(() => {
    const selectedWidgetId = selected?.type === "CUSTOM_WIDGET"
      ? selected.widgetId : null;
    const previous = previousBuilderSelectionRef.current;
    if (previous !== selectedWidgetId) {
      const previousPopup = previous && builderWindowsRef.current.get(previous);
      if (previousPopup && !previousPopup.closed) previousPopup.postMessage({
        type: CUSTOM_WIDGET_BUILDER_EVENTS.PAUSE,
      }, window.location.origin);
      const currentPopup = selectedWidgetId &&
        builderWindowsRef.current.get(selectedWidgetId);
      const payload = selectedWidgetId && customBuilderPayload(selectedWidgetId);
      if (currentPopup && !currentPopup.closed && payload) currentPopup.postMessage({
        type: CUSTOM_WIDGET_BUILDER_EVENTS.RESUME, ...payload,
      }, window.location.origin);
      previousBuilderSelectionRef.current = selectedWidgetId;
      previousBuilderReferencesRef.current = "";
    }
    if (!selectedWidgetId) return;
    const popup = builderWindowsRef.current.get(selectedWidgetId);
    const payload = customBuilderPayload(selectedWidgetId);
    if (!popup || popup.closed || !payload) return;
    const references = JSON.stringify([payload.name, payload.model,
      payload.events, payload.theme]);
    if (references !== previousBuilderReferencesRef.current) {
      popup.postMessage({ type: CUSTOM_WIDGET_BUILDER_EVENTS.UPDATE_REFERENCES,
        name: payload.name, model: payload.model, events: payload.events,
        theme: payload.theme }, window.location.origin);
      previousBuilderReferencesRef.current = references;
    }
  }, [editorStore, editorState?.selectedWidgetId, documentJson,
    builderWindowVersion, effectiveTheme]);

  useEffect(() => {
    const closeBuilders = () => {
      for (const popup of builderWindowsRef.current.values()) popup.close();
      builderWindowsRef.current.clear();
    };
    window.addEventListener("beforeunload", closeBuilders);
    return () => {
      window.removeEventListener("beforeunload", closeBuilders);
      closeBuilders();
    };
  }, []);

  const editCustomWidgetSource = (widgetId: string) => {
    const existing = builderWindowsRef.current.get(widgetId);
    if (existing && !existing.closed) { existing.focus(); return; }
    const popup = window.open(`${window.location.pathname.replace(/\/add$/, "")}/builder${window.location.search}`,
      "_blank");
    if (popup) {
      builderWindowsRef.current.set(widgetId, popup);
      setBuilderWindowVersion((version) => version + 1);
    }
  };

  // Appsmith's useCanvasWidthAutoResize resolves appLayout.type against the
  // available editor pane and updates ui.mainCanvas.width outside the DSL.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !showDocument || !editorStore) return;
    const measure = () => {
      const available = Math.max(1, viewport.clientWidth || viewport.offsetWidth);
      const width = resolveCanvasWidth({ appLayoutType: widthPreset,
        containerWidth: available });
      if (editorStore.getState().canvasWidthPx !== width) {
        editorStore.dispatch(setEditorCanvasWidth(width));
      }
      const compatStore = canvasSessionRef.current?.editorStore === editorStore
        ? canvasSessionRef.current.store : null;
      if (compatStore && compatStore.getState().ui.mainCanvas.width !== width) {
        compatStore.dispatch(updateCanvasWidth(width));
      }
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(measure) : null;
    observer?.observe(viewport);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [editorStore, showDocument, widthPreset, activeCanvas?.store]);

  useEffect(() => () => { editorStore?.dispose(); }, [editorStore]);

  // Appsmith GlobalHotKeys sends canvas commands through widget actions.
  // Read the local editor store at key time so the active selection stays fresh.
  useEffect(() => {
    if (!editorStore) return;
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (viewPreview) return;
      const canvas = canvasSessionRef.current;

      // Canvas commands must use the same document as the projected widgets.
      if (canvas?.editorStore !== editorStore ||
        canvas.sourceJson !== editorStore.getState().documentJson) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='textbox'], .t--colorpicker-v2-popover")) return;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const state = editorStore.getState();
      const ids = state.selectedWidgetIds;
      let handled = true;
      if (modifier && key === "c" && ids.length) editorStore.dispatch(copyEditorWidgets(ids));
      else if (modifier && key === "x" && ids.length) editorStore.dispatch(cutEditorWidgets(ids));
      else if (modifier && key === "v") editorStore.dispatch(pasteEditorWidgets());
      else if ((event.key === "Delete" || event.key === "Backspace") && ids.length) {
        editorStore.dispatch(deleteEditorWidgets(ids));
      } else if (modifier && key === "g" && ids.length > 1) {
        editorStore.dispatch(groupEditorWidgets(ids));
      } else if (modifier && key === "z") {
        editorStore.dispatch(event.shiftKey ? redoEditorChange() : undoEditorChange());
      } else if (modifier && key === "y") editorStore.dispatch(redoEditorChange());
      else if (event.key === "Escape") editorStore.dispatch(selectEditorWidgets([]));
      else if (modifier && key === "a") {
        const current = parseDashboardDocument(JSON.parse(state.documentJson));
        const active = findWidget(current.layout.dsl, ids.at(-1) ?? null);
        const parent = active?.parentId
          ? findWidget(current.layout.dsl, active.parentId) : current.layout.dsl;
        const canvas = ids.length <= 1 && active &&
          (active.type === "CONTAINER_WIDGET" || active.type === "STATBOX_WIDGET" ||
            active.type === "FORM_WIDGET" || active.type === "CARD_WIDGET")
          ? active.children?.find((child) => child.type === "CANVAS_WIDGET")
          : active?.type === "CANVAS_WIDGET" ? active : parent;
        editorStore.dispatch(selectEditorWidgets((canvas?.children ?? [])
          .filter((widget) => widget.type !== "CANVAS_WIDGET")
          .filter(() => canvas?.dropDisabled !== true)
          .map((widget) => widget.widgetId)));
      } else handled = false;
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", keydown, true);
    return () => window.removeEventListener("keydown", keydown, true);
  }, [editorStore, viewPreview]);

  // Appsmith GlobalHotKeys uses Alt+P for preview and Alt+T for tab order.
  useEffect(() => {
    if (!showDocument || !editorStore) return;
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key === "p") {
        event.preventDefault();
        event.stopPropagation();
        dispatch(setWorkbenchPreviewMode(!viewPreview));
      } else if (key === "t" && !viewPreview) {
        event.preventDefault();
        event.stopPropagation();
        dispatch(setShowTabOrderOverlay(!workbench.showTabOrderOverlay));
      }
    };
    window.addEventListener("keydown", keydown, true);
    return () => window.removeEventListener("keydown", keydown, true);
  }, [dispatch, editorStore, showDocument, viewPreview, workbench.showTabOrderOverlay]);

  useEffect(() => {
    if (!editorState?.dirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [editorState?.dirty]);

  useLayoutEffect(() => {
    let disposed = false;
    const currentSession = canvasSessionRef.current;
    const sameCanvas = currentSession?.editorStore === editorStore &&
      currentSession.payloadKey === canvasPayloadKey;
    if (sameCanvas) {
      // Appsmith theme updates replay evaluated properties against the same
      // widgets. The local document owns those properties, so keep the canvas
      // payload and live overlay mounted when only theme data changed.
      const next = { ...currentSession, sourceJson: documentJson,
        projectionJson: projectedCanvasJson };
      canvasSessionRef.current = next;
      setCanvasSession(next);
      return;
    }
    setCanvasError(null);
    const sourceChanged = currentSession?.sourceJson !== documentJson;
    if (sourceChanged) {
      setPreviewActive(false);
      setPreviewError(null);
    }

    // Document edits invalidate any sampled or live values, even though the
    // canvas and its overlay instance now remain mounted.
    if (sourceChanged && currentSession?.editorStore === editorStore) {
      currentSession.overlay.clear();
    }

    if (!editorStore) {
      canvasSessionRef.current = null;
      setCanvasSession(null);
      return;
    }

    void canvasPayloadForDocument(projectedCanvasDocument)
      .then((payload) => {
        if (disposed) return;
        const current = canvasSessionRef.current;

        if (current?.editorStore === editorStore) {
          const next = { ...current, sourceJson: documentJson,
            projectionJson: projectedCanvasJson, payloadKey: canvasPayloadKey, payload,
            projectionEpoch: current.projectionEpoch + 1 };

          // React 17 does not batch promise callbacks. Publish the Redux and
          // canvas-session changes together so a render cannot pair a new
          // widget tree with the previous document's drag plan.
          unstable_batchedUpdates(() => {
            current.store.dispatch(replaceCanvasPayload(payload));
            current.store.dispatch(selectCompatWidget(
              editorStore.getState().selectedWidgetId,
            ));
            canvasSessionRef.current = next;
            setCanvasSession(next);
          });
        } else {
          const next = {
            id: ++nextCanvasSessionId.current,
            projectionEpoch: 0,
            editorStore,
            sourceJson: documentJson,
            projectionJson: projectedCanvasJson,
            payloadKey: canvasPayloadKey,
            payload,
            store: createReadOnlyCompatStore(payload),
            overlay: new TransientWidgetOverlay(),
          };

          canvasSessionRef.current = next;
          setCanvasSession(next);
        }
      })
      .catch((error: unknown) => {
        if (disposed) return;
        setCanvasError(error instanceof Error ? error.message : "Dashboard renderer could not load.");
      });

    return () => { disposed = true; };
  }, [editorStore, documentJson, projectedCanvasJson, canvasPayloadKey]);

  useEffect(() => {
    if (!draftId) {
      dispatch(showExampleDocument());
      return;
    }

    if (!user) return;

    const request = dispatch(loadWorkbenchDraft({ accountId: user.id, draftId }));

    return () => request.abort();
  }, [dispatch, draftId, user?.id]);

  useEffect(() => {
    if (!draftId && editorState?.savedDraftId && editorState.saveStatus === "succeeded") {
      window.location.assign(`/workbench?draftId=${encodeURIComponent(editorState.savedDraftId)}`);
    }
  }, [draftId, editorState?.savedDraftId, editorState?.saveStatus]);

  const select = (widgetId: string, modifier?: "toggle" | "range") => {
    if (!editorStore) return;
    if (!modifier) {
      editorStore.dispatch(selectEditorWidget(widgetId));
      return;
    }
    const state = editorStore.getState();
    const current = state.selectedWidgetIds;
    const widget = findWidget(document.layout.dsl, widgetId);
    const parent = widget?.parentId
      ? findWidget(document.layout.dsl, widget.parentId) : null;
    const siblings = (parent?.children ?? []).map((child) => child.widgetId);
    editorStore.dispatch(selectEditorWidgets(modifier === "range"
      ? shiftSelectWidgets(widgetId, siblings, current, state.selectedWidgetId)
      : pushPopWidgetSelection(widgetId, current, siblings)));
  };
  const add = (type: PaletteWidgetType) => editorStore?.dispatch(addEditorWidget({
    type,
    parentId: editorState?.selectedWidgetId ?? undefined,
  }));
  const move = (widgetId: string, leftColumn: number, topRow: number, parentId?: string) =>
    editorStore?.dispatch(moveEditorWidget({ widgetId, leftColumn, topRow, parentId }));
  const resize = (widgetId: string, width: number, height: number) =>
    editorStore?.dispatch(resizeEditorWidget({ widgetId, width, height }));
  const resizeOnCanvas = (widgetId: string, leftColumn: number, topRow: number,
    width: number, height: number) => {
    if (canvasCommandReady()) editorStore?.dispatch(
      resizeEditorWidget({ widgetId, leftColumn, topRow, width, height }),
    );
  };

  const toggleSamplePreview = () => {
    if (!activeCanvas || !canvasCommandReady() || runActive) return;

    setPreviewError(null);

    if (previewActive) {
      activeCanvas.overlay.clear();
      setPreviewActive(false);
      return;
    }

    try {
      applyPreviewSamples(document, activeCanvas.overlay);
      setPreviewActive(true);
    } catch (error) {
      activeCanvas.overlay.clear();
      setPreviewError(error instanceof Error ? error.message : "Sample preview failed.");
    }
  };
  const background = effectiveTheme
    ? effectiveTheme.properties.colors.backgroundColor
    : "#ffffff";
  const nativeTheme = useMemo(() => effectiveTheme ? {
    primaryColor: effectiveTheme.properties.colors.primaryColor,
    backgroundColor: effectiveTheme.properties.colors.backgroundColor,
    fontFamily: effectiveTheme.properties.fontFamily.appFont,
    appBorderRadius: effectiveTheme.properties.borderRadius.appBorderRadius,
    appBoxShadow: effectiveTheme.properties.boxShadow.appBoxShadow,
  } : {}, [effectiveTheme]);

  return (
    <AppIdeFrame
      header={
        <IDEHeader>
          <IDEHeader.Left logo={<Icon name="dashboard-line" size="lg" />}>
            <IDEHeaderTitle title={
              showDocument ? document.name : workbench.loadStatus === "failed"
                ? "Draft unavailable"
                : "Loading local draft…"
            } />
          </IDEHeader.Left>
          <IDEHeader.Center>
            <nav aria-label="Dashboard location" className="od-workbench__breadcrumb">
              <a href="/workspace">Dashboards &amp; drafts</a>
              <Icon name="arrow-right-s-line" size="sm" />
              <span>{showDocument ? document.name : "Local draft"}</span>
            </nav>
          </IDEHeader.Center>
          <IDEHeader.Right>
            <span className="od-workbench__header-mode">{viewPreview ? "Preview" : "Local editor"}</span>
            <Button
              aria-label={viewPreview ? "Return to editor" : "Preview dashboard"}
              aria-pressed={viewPreview}
              isDisabled={!showDocument || !canvasReady}
              isIconButton
              kind="tertiary"
              onClick={() => dispatch(setWorkbenchPreviewMode(!viewPreview))}
              size="sm"
              startIcon={viewPreview ? "edit-line" : "play-line"}
              title={viewPreview ? "Return to editor (Alt+P)" : "Preview dashboard (Alt+P)"}
            />
            <Button
              aria-label="Undo"
              isDisabled={viewPreview || !editorState?.past.length || editorState.saveStatus === "saving"}
              isIconButton
              kind="tertiary"
              onClick={() => editorStore?.dispatch(undoEditorChange())}
              size="sm"
              startIcon="arrow-go-back"
              title="Undo"
            />
            <Button
              aria-label="Redo"
              isDisabled={viewPreview || !editorState?.future.length || editorState.saveStatus === "saving"}
              isIconButton
              kind="tertiary"
              onClick={() => editorStore?.dispatch(redoEditorChange())}
              size="sm"
              startIcon="arrow-go-forward"
              title="Redo"
            />
            {document.bindings.length > 0 && (
              <Button
                isDisabled={!showDocument || !canvasReady || runActive}
                kind="secondary"
                onClick={toggleSamplePreview}
                size="sm"
              >
                {previewActive ? "Clear sample values" : "Preview sample values"}
              </Button>
            )}
            <Button isDisabled={!showDocument} kind="secondary" onClick={() => exportDocument(document)} size="sm">
              Export JSON
            </Button>
            <Button
              isDisabled={viewPreview || !showDocument || !editorStore || !user || editorState?.saveStatus === "saving" ||
                Boolean(draftId && !editorState?.dirty)}
              kind="primary"
              onClick={() => {
                if (!editorStore || !user) return;
                editorStore.dispatch(draftId
                  ? requestEditorSave()
                  : requestEditorSaveAs({ accountId: user.id }));
              }}
              size="sm"
            >
              {editorState?.saveStatus === "saving"
                ? "Saving…" : draftId ? "Save draft" : "Save as local draft"}
            </Button>
          </IDEHeader.Right>
        </IDEHeader>
      }
      sidebar={
        <nav aria-label="Workbench sections" className="od-workbench__sidebar">
          <div className="od-workbench__sidebar-top">
            {SECTION_BUTTONS.filter(({ id }) => id !== "tools").map(({ icon, id, label }) => (
              <button
                aria-label={label}
                aria-pressed={workbench.section === id}
                key={id}
                onClick={() => dispatch(chooseWorkbenchSection(id))}
                title={label}
                type="button"
              >
                <Icon name={icon} size="lg" />
              </button>
            ))}
          </div>
          <div className="od-workbench__sidebar-bottom">
            <button
              aria-label="App settings"
              aria-pressed={workbench.section === "settings"}
              onClick={() => dispatch(chooseWorkbenchSection("settings"))}
              title="App settings and theme"
              type="button"
            >
              <Icon name="settings-v3" size="lg" />
            </button>
            <button
              aria-label="Dashboard tools"
              aria-pressed={workbench.section === "tools"}
              onClick={() => dispatch(chooseWorkbenchSection("tools"))}
              title="Dashboard tools"
              type="button"
            >
              <Icon name="play-line" size="lg" />
            </button>
          </div>
        </nav>
      }
      explorer={
        showDocument ? (
          <>
          <div style={{ display: workbench.section === "settings" ? "none" : "flex",
            flexDirection: "column", height: "100%" }}>
          <Explorer
            document={previewDocument}
            onAdd={add}
            onPaletteDragStart={(type) => {
              if (!canvasCommandReady()) return;
              beginCanvasInteraction();
              editorStore?.dispatch(beginEditorDrag({ kind: "palette", type }));
            }}
            onRename={(name) => editorStore?.dispatch(renameEditorDocument({ name }))}
            onSelect={select}
            onSectionChange={(section) => dispatch(chooseWorkbenchSection(section))}
            runControls={activeCanvas ? <WorkbenchRunPanel
              document={document}
              key={`${activeCanvas.id}:${activeCanvas.payloadKey}`}
              onActiveChange={setRunActive}
              onClearSamples={() => {
                activeCanvas.overlay.clear();
                setPreviewActive(false);
                setPreviewError(null);
              }}
              overlay={activeCanvas.overlay}
              visible={workbench.section === "tools"}
            /> : null}
            section={workbench.section}
            selectedId={editorState?.selectedWidgetId ?? null}
          />
          </div>
          {workbench.section === "settings" && <WorkbenchAppSettings
            document={document}
            onRename={(name) => editorStore?.dispatch(renameEditorDocument({ name }))}
            themePane={<>
              {document.theme.kind === "marketplace" && !effectiveTheme &&
                (referencedThemeError?.store === editorStore &&
                referencedThemeError.key === themeReferenceKey
                  ? <p role="alert">{referencedThemeError.message}</p>
                  : <p role="status">Loading referenced theme…</p>)}
              <ThemePropertyPane
              currentTheme={effectiveTheme}
              featuredThemes={FEATURED_FIXED_THEMES}
              savedThemes={savedThemes}
              savedThemesLoading={savedThemesLoading}
              savedThemesError={savedThemesError}
              onChange={(properties) => {
                if (!editorStore) return;
                if (document.theme.kind === "marketplace") {
                  if (!effectiveTheme) return;
                  editorStore.dispatch(updateEditorReferencedThemeProperties({
                    reference: document.theme, resolvedTheme: effectiveTheme, properties,
                  }));
                } else {
                  editorStore.dispatch(updateEditorThemeProperties(properties));
                }
              }}
              onSelectPreset={(theme) => editorStore?.dispatch(
                selectEditorThemePreset(theme.name))}
              onSelectSavedTheme={(theme) => editorStore?.dispatch(applyEditorSavedTheme({
                kind: "inline", name: theme.name, displayName: theme.displayName,
                basePresetName: theme.basePresetName, properties: theme.properties,
              }))}
              onSaveTheme={async (displayName) => {
                if (!themeScope || !themeScopeKey || !effectiveTheme) {
                  throw new Error("Sign in and choose a theme before saving it.");
                }
                const currentSavedTheme = savedThemes.find((theme) => theme.name === effectiveTheme.name);
                const basePresetName = FEATURED_FIXED_THEMES.find((theme) => theme.name === effectiveTheme.name)?.name
                  ?? currentSavedTheme?.basePresetName ?? effectiveTheme.basePresetName
                  ?? FEATURED_FIXED_THEMES[0].name;
                const saved = await savedThemeStore.save(themeScope, {
                  displayName, basePresetName, properties: effectiveTheme.properties,
                });
                setSavedThemeSnapshot((current) => current.key === themeScopeKey
                  ? { ...current, themes: [saved, ...current.themes], error: null } : current);
              }}
              onDeleteSavedTheme={async (theme) => {
                if (!themeScope || !themeScopeKey) throw new Error("Sign in to delete a saved theme.");
                await savedThemeStore.delete(themeScope, theme.id);
                setSavedThemeSnapshot((current) => current.key === themeScopeKey
                  ? { ...current, themes: current.themes.filter((saved) => saved.id !== theme.id), error: null }
                  : current);
              }}
              onResetWidgetStyles={() => editorStore?.dispatch(resetEditorWidgetStyles())}
              />
            </>}
          />}
          </>
        ) : <p className="od-workbench__pane-note">Local draft unavailable for inspection.</p>
      }
      canvas={
        <section aria-label="Dashboard canvas" className={`od-workbench__viewport canvas${
          viewPreview ? " od-workbench__viewport--preview" : ""}`} ref={viewportRef}>
          {draftId && !showDocument && workbench.loadStatus !== "failed" && (
            <p role="status">Loading local draft…</p>
          )}
          {workbench.loadStatus === "failed" && (
            <div className="od-workbench__error" role="alert">
              <p>{workbench.loadError}</p>
              <a href="/workspace">Back to dashboards</a>
            </div>
          )}
          {showDocument && canvasError && (
            <div className="od-workbench__error" role="alert">
              Dashboard preview could not load: {canvasError}
            </div>
          )}
          {showDocument && !canvasError && (!activeCanvas || !canvasInitialized) && (
            <p className="od-workbench__pane-note" role="status">Preparing dashboard preview…</p>
          )}
          {showDocument && previewError && (
            <p className="od-workbench__preview-error" role="alert">{previewError}</p>
          )}
          {showDocument && editorState?.editError && (
            <p className="od-workbench__preview-error" role="alert">{editorState.editError}</p>
          )}
          {showDocument && editorState?.saveError && (
            <p className="od-workbench__preview-error" role="alert">{editorState.saveError}</p>
          )}
          {showDocument && activeCanvas && canvasInitialized && (
            <div
              className={`od-workbench__artboard${
                viewPreview ? " od-workbench__artboard--preview" : ""}`}
              aria-busy={!canvasReady}
              onClick={(event) => {
                if (viewPreview || !canvasCommandReady()) return;
                const target = event.target as HTMLElement;
                if (target.closest(".od-editable-canvas__selection")) return;
                const widget = target.closest<HTMLElement>("[data-widget-id]");
                // Pointer-down selection can rerender a widget before its click
                // bubbles here. A detached click target must not clear it.
                if (target === event.currentTarget || widget?.dataset.widgetId === root.widgetId) {
                  editorStore?.dispatch(selectEditorWidget(null));
                }
              }}
              onKeyDownCapture={(event) => {
                if (canvasCommandReady()) return;
                event.preventDefault();
                event.stopPropagation();
              }}
              onPointerDownCapture={() => { if (!viewPreview) beginCanvasInteraction(); }}
              style={{ background, width: renderedCanvasWidth || root.rightColumn || 1242,
                pointerEvents: canvasReady ? undefined : "none" }}
            >
              {viewPreview ? <NativeReadOnlyCanvas
                activeTabCanvasIds={editorState?.activeTabCanvasIds ?? {}}
                interactiveSelection={false}
                openModalIds={editorState?.openModalIds ?? {}}
                onModalClose={(modalWidgetId) => editorStore?.dispatch(
                  setEditorModalOpen({ modalWidgetId, isOpen: false }))}
                onTabChange={(tabsWidgetId, canvasWidgetId) => editorStore?.dispatch(
                  selectEditorTabCanvas({ tabsWidgetId, canvasWidgetId }))}
                overlay={activeCanvas.overlay}
                rootWidgetId={activeCanvas.payload.pageWidgetId}
                store={activeCanvas.store}
                theme={nativeTheme}
              /> : <EditableCanvas
                activeTabCanvasIds={editorState?.activeTabCanvasIds ?? {}}
                openModalIds={editorState?.openModalIds ?? {}}
                documentJson={interactionDocumentJson}
                dragSession={editorState?.dragSession ?? null}
                selectedWidgetIds={editorState?.selectedWidgetIds ?? []}
                onSelectMany={(ids: string[]) => editorStore?.dispatch(selectEditorWidgets(ids))}
                onAddAt={(request: AddWidgetRequest) => {
                  if (canvasCommandReady()) editorStore?.dispatch(addEditorWidget(request));
                }}
                onBeginDrag={(session: EditorDragSession) => {
                  if (!canvasCommandReady()) return;
                  beginCanvasInteraction();
                  editorStore?.dispatch(beginEditorDrag(session));
                }}
                onDragCanvasChange={(id: string | null) => {
                  if (id === null || canvasCommandReady()) editorStore?.dispatch(setEditorDragCanvas(id));
                }}
                onEndDrag={() => editorStore?.dispatch(endEditorDrag())}
                onCopyMany={(ids) => {
                  if (canvasCommandReady()) editorStore?.dispatch(copyEditorWidgets(ids));
                }}
                onCutMany={(ids) => {
                  if (canvasCommandReady()) editorStore?.dispatch(cutEditorWidgets(ids));
                }}
                onDeleteMany={(ids) => {
                  if (canvasCommandReady()) editorStore?.dispatch(deleteEditorWidgets(ids));
                }}
                onGroupMany={(ids) => {
                  if (canvasCommandReady()) editorStore?.dispatch(groupEditorWidgets(ids));
                }}
                onHeightLimitsChange={(widgetId, limits) => {
                  if (canCommitCanvasInteraction()) editorStore?.dispatch(
                    updateEditorWidgetHeightLimits({ widgetId, ...limits }));
                }}
                onTabChange={(tabsWidgetId, canvasWidgetId) => editorStore?.dispatch(
                  selectEditorTabCanvas({ tabsWidgetId, canvasWidgetId }))}
                onModalClose={(modalWidgetId) => editorStore?.dispatch(
                  setEditorModalOpen({ modalWidgetId, isOpen: false }))}
                onModalResizeStart={(modalWidgetId) => {
                  if (!canvasCommandReady()) return;
                  beginCanvasInteraction();
                  editorStore?.dispatch(beginEditorModalResize(modalWidgetId));
                }}
                onModalResize={(modalWidgetId, canvasWidgetId, dimensions) => {
                  if (!canCommitCanvasInteraction()) {
                    editorStore?.dispatch(editorOperationFailed("Canvas changed during drag. Try again."));
                    return;
                  }
                  if (!editorStore) return;
                  editorStore.dispatch(resizeEditorModal({
                    widgetId: modalWidgetId, canvasWidgetId,
                    ...dimensions,
                    mainCanvasWidth: editorStore.getState().canvasWidthPx,
                  }));
                }}
                onModalResizeEnd={(modalWidgetId) => editorStore?.dispatch(
                  endEditorModalResize(modalWidgetId))}
                onWidgetHeightChange={(widgetId, paddedHeightPx) => {
                  if (canvasCommandReady()) editorStore?.dispatch(
                    measureEditorWidgetHeight({ widgetId, paddedHeightPx }));
                }}
                onMoveGroup={(widgetIds, parentId, leftColumn, topRow) => {
                  if (canCommitCanvasInteraction()) editorStore?.dispatch(
                    moveEditorWidgets({ widgetIds, parentId, leftColumn, topRow }));
                }}
                onCommitLayoutPlan={(change, plan) => {
                  if (canCommitCanvasInteraction()) {
                    const token = canvasInteractionSourceRef.current!;
                    editorStore?.dispatch(commitEditorLayoutPlan({ change, plan,
                      expectedDocumentJson: token.sourceJson,
                      expectedPlanningJson: token.planningJson,
                      expectedActiveTabCanvasIds: token.activeTabCanvasIds }));
                  } else {
                    editorStore?.dispatch(editorOperationFailed("Canvas changed during drag. Try again."));
                  }
                }}
                onCommitGroupPlan={(request, plan) => {
                  if (canCommitCanvasInteraction()) {
                    const token = canvasInteractionSourceRef.current!;
                    editorStore?.dispatch(commitEditorGroupPlan({ request, plan,
                      expectedDocumentJson: token.sourceJson,
                      expectedPlanningJson: token.planningJson,
                      expectedActiveTabCanvasIds: token.activeTabCanvasIds }));
                  } else {
                    editorStore?.dispatch(editorOperationFailed("Canvas changed during drag. Try again."));
                  }
                }}
                onMove={(...args) => {
                  if (canvasCommandReady()) move(...args);
                }}
                onResize={resizeOnCanvas}
                onSelect={(...args) => select(...args)}
                measurementRetryEpoch={activeCanvas.projectionEpoch}
                showTabOrder={workbench.showTabOrderOverlay}
                evaluationErrorCounts={evaluationErrorCounts}
                overlay={activeCanvas.overlay}
                rootWidgetId={activeCanvas.payload.pageWidgetId}
                selectedWidgetId={editorState?.selectedWidgetId}
                store={activeCanvas.store}
                theme={nativeTheme}
              />}
            </div>
          )}
        </section>
      }
      properties={
        editorState && editorState.selectedWidgetIds.length > 1
          ? <AppsmithMultiSelectPropertyPane
              onSelectWidget={select}
              selectedWidgets={editorState.selectedWidgetIds
                .map((id) => findWidget(document.layout.dsl, id))
                .filter((widget): widget is AppsmithWidgetDsl => !!widget)
                .map((widget) => ({ widgetId: widget.widgetId, widgetName: widget.widgetName }))}
            />
          : <PropertyPane
          bindingDisabled={editorState?.saveStatus === "saving"}
          bindingError={editorState?.editError}
          document={document}
          layoutSystem={document.compatibility.layoutSystem}
          onDelete={(widgetId) => editorStore?.dispatch(deleteEditorWidget({ widgetId }))}
          onMove={move}
          onPropertyChange={(widgetId, property, value) => editorStore?.dispatch(
            updateEditorWidgetProperty({ widgetId, property, value }),
          )}
          onCustomWidgetEditSource={editCustomWidgetSource}
          customWidgetSourceOpen={selected?.type === "CUSTOM_WIDGET" &&
            !!builderWindowsRef.current.get(selected.widgetId) &&
            !builderWindowsRef.current.get(selected.widgetId)!.closed}
          onHeightModeChange={(widgetId, mode) => editorStore?.dispatch(
            updateEditorWidgetHeightMode({ widgetId, mode }))}
          onHeightLimitsChange={(widgetId, limits) => editorStore?.dispatch(
            updateEditorWidgetHeightLimits({ widgetId, ...limits }))}
          onRemoveBinding={(bindingId) => editorStore?.dispatch(removeEditorBinding(bindingId))}
          onTabEdit={(request) => editorStore?.dispatch(editEditorTab(request))}
          modalOpen={selected?.type === "MODAL_WIDGET"}
          onModalOpenChange={(modalWidgetId, isOpen) => editorStore?.dispatch(
            setEditorModalOpen({ modalWidgetId, isOpen }))}
          onResize={resize}
          canvasWidthPreset={widthPreset}
          onCanvasWidthPresetChange={(preset) => editorStore?.dispatch(
            updateEditorCanvasWidthPreset(preset))}
          resolvedCanvasWidth={renderedCanvasWidth || root.rightColumn || 1242}
          onSaveBinding={(draft) => editorStore?.dispatch(saveEditorBinding(draft))}
          root={document.layout.dsl}
          widget={showDocument ? selected : null}
            />
      }
      footer={
        <div className="od-workbench__status">
          <div className="od-workbench__status-left">
            <span className="od-workbench__status-dot" />
            <span>{draftId && showDocument
              ? `Local draft · revision ${editorState?.revision ?? workbench.revision}`
              : "Example document"}</span>
            <span className="od-workbench__status-divider" />
            <span>{viewPreview ? "Preview mode" : runActive ? "Live Run"
              : previewActive ? "Local sample values"
              : editorState?.dirty ? "Unsaved changes"
                : draftId ? "Saved locally" : "Example not saved"}</span>
          </div>
          <span>{document.compatibility.layoutSystem} layout · {document.schemaVersion} document schema</span>
        </div>
      }
      previewMode={viewPreview}
      settingsMode={!viewPreview && workbench.section === "settings"}
    />
  );
}
