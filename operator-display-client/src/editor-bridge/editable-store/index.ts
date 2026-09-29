import { configureStore, createAction, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { nanoid } from "nanoid";
import sagaModule from "redux-saga";
import type { SagaIterator } from "redux-saga";
import { all, call, put, select, takeEvery, takeLeading } from "redux-saga/effects";
import { parseDashboardDocument, type DashboardDocument, type InlineDashboardTheme, type MarketplaceDashboardTheme } from "../../document";
import {
  IndexedDbDraftStore,
  type DraftRecord,
  type DraftScope,
} from "../../drafts/IndexedDbDraftStore";
import {
  addWidgetToDocument,
  commitFixedLayoutChange,
  deleteWidgetFromDocument,
  editTabsInDocument,
  moveWidgetInDocument,
  renameDocument,
  resizeWidgetInDocument,
  resizeModalInDocument,
  updateWidgetPropertyInDocument,
  updateCustomWidgetSourceInDocument,
  updateWidgetHeightModeInDocument,
  updateWidgetHeightLimitsInDocument,
  widgetFromDocument,
  type AddableWidgetType,
  type AddWidgetRequest,
  type DeleteWidgetRequest,
  type EditResult,
  type LayoutChange,
  type LayoutPreview,
  type MoveWidgetRequest,
  type RenameDocumentRequest,
  type TabEditRequest,
  type ResizeWidgetRequest,
  type ResizeModalRequest,
  type UpdateWidgetPropertyRequest,
  type UpdateCustomWidgetSourceRequest,
  type UpdateWidgetHeightModeRequest,
  type UpdateWidgetHeightLimitsRequest,
} from "./editDocument";
import {
  buildAutoHeightTree,
  measureAutoHeightInDocument,
  recomputeAutoHeightContainers,
  type AutoHeightLayoutTree,
} from "./autoHeightDocument";
import {
  removeWidgetBinding,
  removeWidgetBindings,
  saveWidgetBinding,
  type WidgetBindingDraft,
} from "../binding-editor/model";
import {
  copySelectedWidgets,
  cutSelectedWidgets,
  deleteSelectedWidgets,
  groupSelectedWidgets,
  moveSelectedWidgets,
  pasteSelectedWidgets,
  resolveFixedPasteTarget,
  type FixedWidgetClipboard,
  type GroupPlacementRequest,
  type GroupPlacementPreview,
  type MultiWidgetEditResult,
} from "../appsmith-fixed-selection/commands";
import {
  IndexedDbFixedWidgetClipboardStore,
  type FixedClipboardScope,
  type FixedWidgetClipboardStore,
} from "../appsmith-fixed-selection/commands/clipboardStorage";
import {
  assertOutsideListV2Template,
  listV2TemplateOwner,
} from "../native-widgets/list-v2/listV2EditBoundary";
import { projectActiveTabsAutoHeight } from "../native-widgets/tabs/projectActiveTabsAutoHeight";
import {
  applySavedThemeInDocument,
  selectThemePresetInDocument,
  updateReferencedThemePropertiesInDocument,
  updateThemePropertiesInDocument,
} from "../appsmith-theme/documentTheme";
import { resetWidgetStylesInDocument } from "../../features/theme-editor/resetWidgetStyles";

export type {
  AddableWidgetType,
  AddWidgetRequest,
  DeleteWidgetRequest,
  MoveWidgetRequest,
  RenameDocumentRequest,
  TabEditRequest,
  ResizeWidgetRequest,
  ResizeModalRequest,
  UpdateWidgetPropertyRequest,
  UpdateCustomWidgetSourceRequest,
  UpdateWidgetHeightModeRequest,
  UpdateWidgetHeightLimitsRequest,
} from "./editDocument";
export type { WidgetBindingDraft } from "../binding-editor/model";

interface EditorSnapshot {
  documentJson: string;
  selectedWidgetId: string | null;
  selectedWidgetIds: string[];
}

/** Appsmith-style shared drag lifecycle; pointer geometry stays in the canvas arena. */
export type EditorDragSession =
  | { kind: "palette"; type: AddableWidgetType }
  | { kind: "widget"; widgetId: string }
  | { kind: "group"; widgetIds: string[]; parentId: string };

export interface EditableWorkbenchState {
  documentJson: string;
  /** Appsmith ui.mainCanvas.width, separate from the authored root DSL. */
  canvasWidthPx: number;
  /** Transient Appsmith Tabs selectedTabWidgetId meta, keyed by Tabs widget ID. */
  activeTabCanvasIds: Record<string, string>;
  /** Appsmith Modal meta visibility, separate from the saved DSL. */
  openModalIds: Record<string, boolean>;
  /** Appsmith auto-height dependency graph, scoped to this editor store. */
  autoHeightTree: AutoHeightLayoutTree;
  selectedWidgetId: string | null;
  /** Appsmith's selection actions retain ordered IDs for marquee and group editing. */
  selectedWidgetIds: string[];
  dragSession: EditorDragSession | null;
  /** ModalResizableLayer's isResizing gate for deferred height measurements. */
  resizingModalWidgetId: string | null;
  activeDragCanvasId: string | null;
  past: EditorSnapshot[];
  future: EditorSnapshot[];
  savedDocumentJson: string;
  dirty: boolean;
  revision: number | null;
  saveStatus: "idle" | "saving" | "succeeded" | "failed";
  saveError: string | null;
  editError: string | null;
  /** Set after Save as local draft so the page can navigate to its new ID. */
  savedDraftId: string | null;
}

const MAX_UNDO_ENTRIES = 50;
// redux-saga 1.x exposes a CJS default in Node and a direct default in Vite.
const createSagaMiddleware = typeof sagaModule === "function"
  ? sagaModule
  : (sagaModule as unknown as { default: typeof sagaModule }).default;

function modalAncestorId(documentJson: string, widgetId: string | null): string | null {
  let current = widgetId ? widgetFromDocument(documentJson, widgetId) : null;
  while (current) {
    if (current.type === "MODAL_WIDGET") return current.widgetId;
    current = current.parentId ? widgetFromDocument(documentJson, current.parentId) : null;
  }
  return null;
}

function selectedListOwner(documentJson: string, widgetId: string): string | null {
  const root = (JSON.parse(documentJson) as DashboardDocument).layout.dsl;
  return listV2TemplateOwner(root, widgetId)?.widgetId ?? null;
}

function assertEditableSelection(documentJson: string, widgetIds: readonly string[]): void {
  const root = (JSON.parse(documentJson) as DashboardDocument).layout.dsl;
  widgetIds.forEach((id) => assertOutsideListV2Template(root, id));
}

function initialState(
  document: DashboardDocument,
  revision: number | null,
  selectedWidgetId?: string | null,
): EditableWorkbenchState {
  const savedDocumentJson = JSON.stringify(parseDashboardDocument(document));
  // Appsmith checks explicit AUTO_HEIGHT Containers when a page loads, even
  // before a child ResizeObserver reports. Legacy widgets without a height
  // mode remain untouched and behave as Fixed.
  const documentJson = recomputeAutoHeightContainers(savedDocumentJson);
  const normalized = JSON.parse(documentJson) as DashboardDocument;
  return {
    documentJson,
    canvasWidthPx: 0,
    activeTabCanvasIds: {},
    openModalIds: {},
    autoHeightTree: buildAutoHeightTree(normalized.layout.dsl),
    selectedWidgetId: selectedWidgetId === undefined
      ? document.layout.dsl.children?.[0]?.widgetId ?? null
      : selectedWidgetId,
    selectedWidgetIds: selectedWidgetId === undefined
      ? document.layout.dsl.children?.[0]?.widgetId
        ? [document.layout.dsl.children[0].widgetId] : []
      : selectedWidgetId ? [selectedWidgetId] : [],
    dragSession: null,
    resizingModalWidgetId: null,
    activeDragCanvasId: null,
    past: [],
    future: [],
    savedDocumentJson,
    dirty: documentJson !== savedDocumentJson,
    revision,
    saveStatus: "idle",
    saveError: null,
    editError: null,
    savedDraftId: null,
  };
}

const slice = createSlice({
  name: "editableWorkbench",
  initialState: initialState({
    assetKind: "dashboard",
    schemaVersion: 1,
    documentId: "uninitialized",
    name: "Uninitialized",
    compatibility: { renderer: "appsmith", layoutSystem: "FIXED", widgetDslVersion: 1 },
    layout: { dsl: {
      widgetId: "0", widgetName: "MainContainer", type: "CANVAS_WIDGET", version: 1,
      topRow: 0, bottomRow: 1, leftColumn: 0, rightColumn: 1, children: [],
    } },
    variables: [], bindings: [],
    theme: { kind: "inline", name: "Default", properties: {
      colors: { primaryColor: "#000000", backgroundColor: "#ffffff" },
      borderRadius: { appBorderRadius: "0" },
      boxShadow: { appBoxShadow: "none" },
      fontFamily: { appFont: "Inter" },
    } },
    componentDependencies: [],
  }, null),
  reducers: {
    setEditorCanvasWidth(state, action: PayloadAction<number>) {
      const width = action.payload;
      if (Number.isSafeInteger(width) && width > 0 && width <= 10000) {
        state.canvasWidthPx = width;
      }
    },
    selectEditorTabCanvas(state, action: PayloadAction<{
      tabsWidgetId: string; canvasWidgetId: string;
    }>) {
      const { tabsWidgetId, canvasWidgetId } = action.payload;
      const widget = widgetFromDocument(state.documentJson, tabsWidgetId);
      if (widget?.type !== "TABS_WIDGET" ||
        !Array.isArray(widget.children) ||
        !widget.children.some((child) => child.type === "CANVAS_WIDGET" &&
          child.widgetId === canvasWidgetId)) return;
      const tabs = widget.tabsObj;
      if (!tabs || typeof tabs !== "object" || Array.isArray(tabs) ||
        !Object.values(tabs).some((tab) => tab !== null &&
          typeof tab === "object" && !Array.isArray(tab) &&
          tab.widgetId === canvasWidgetId && tab.isVisible !== false)) return;
      state.activeTabCanvasIds[tabsWidgetId] = canvasWidgetId;
      // Appsmith's selected-widget ancestry reveals its tab. Clear a prior
      // child selection so clicking a different tab can actually switch it.
      state.selectedWidgetId = tabsWidgetId;
      state.selectedWidgetIds = [tabsWidgetId];
    },
    setEditorModalOpen(state, action: PayloadAction<{
      modalWidgetId: string; isOpen: boolean;
    }>) {
      const { modalWidgetId, isOpen } = action.payload;
      if (widgetFromDocument(state.documentJson, modalWidgetId)?.type !== "MODAL_WIDGET") return;
      state.openModalIds[modalWidgetId] = isOpen;
      if (!isOpen && modalAncestorId(state.documentJson, state.selectedWidgetId) === modalWidgetId) {
        // ModalWidget.closeModal clears its selected-widget ancestry as well as
        // the transient isVisible meta, otherwise the editor reopens it.
        state.selectedWidgetId = null;
        state.selectedWidgetIds = [];
      }
    },
    commitEditorChange(
      state,
      action: PayloadAction<EditResult & { previousDocumentJson: string;
        keepModalResizeActive?: boolean }>,
    ) {
      if (state.saveStatus === "saving" || state.documentJson !== action.payload.previousDocumentJson) {
        return;
      }
      if (state.documentJson === action.payload.documentJson) {
        state.selectedWidgetId = action.payload.selectedWidgetId;
        state.selectedWidgetIds = action.payload.selectedWidgetIds ??
          (action.payload.selectedWidgetId ? [action.payload.selectedWidgetId] : []);
        state.editError = null;
        return;
      }
      state.past.push({ documentJson: state.documentJson,
        selectedWidgetId: state.selectedWidgetId, selectedWidgetIds: [...state.selectedWidgetIds] });
      if (state.past.length > MAX_UNDO_ENTRIES) state.past.shift();
      state.future = [];
      state.documentJson = action.payload.documentJson;
      state.autoHeightTree = buildAutoHeightTree(
        (JSON.parse(state.documentJson) as DashboardDocument).layout.dsl,
        {}, true,
      );
      state.selectedWidgetId = action.payload.selectedWidgetId;
      state.selectedWidgetIds = action.payload.selectedWidgetIds ??
        (action.payload.selectedWidgetId ? [action.payload.selectedWidgetId] : []);
      state.dragSession = null;
      // The Modal's pixel commit precedes its deferred pointer-release end
      // event. Keep ResizeObserver measurements queued until that event.
      if (!action.payload.keepModalResizeActive) state.resizingModalWidgetId = null;
      state.activeDragCanvasId = null;
      state.dirty = state.documentJson !== state.savedDocumentJson;
      state.editError = null;
      state.saveError = null;
      state.saveStatus = "idle";
    },
    selectEditorWidget(state, action: PayloadAction<string | null>) {
      const widgetId = action.payload;
      if (!widgetId || widgetFromDocument(state.documentJson, widgetId)) {
        const selectedId = widgetId
          ? selectedListOwner(state.documentJson, widgetId) ?? widgetId : null;
        state.selectedWidgetId = selectedId;
        state.selectedWidgetIds = selectedId ? [selectedId] : [];
      }
    },
    selectEditorWidgets(state, action: PayloadAction<string[]>) {
      const seen = new Set<string>();
      state.selectedWidgetIds = action.payload.filter((id) => {
        if (!widgetFromDocument(state.documentJson, id)) return false;
        const selectedId = selectedListOwner(state.documentJson, id) ?? id;
        if (seen.has(selectedId)) return false;
        seen.add(selectedId);
        return true;
      }).map((id) => selectedListOwner(state.documentJson, id) ?? id);
      state.selectedWidgetId = state.selectedWidgetIds.at(-1) ?? null;
    },
    beginEditorDrag(state, action: PayloadAction<EditorDragSession>) {
      state.dragSession = action.payload;
      state.activeDragCanvasId = null;
      state.editError = null;
    },
    setEditorDragCanvas(state, action: PayloadAction<string | null>) {
      if (state.dragSession) state.activeDragCanvasId = action.payload;
    },
    endEditorDrag(state) {
      state.dragSession = null;
      state.activeDragCanvasId = null;
    },
    beginEditorModalResize(state, action: PayloadAction<string>) {
      if (widgetFromDocument(state.documentJson, action.payload)?.type !== "MODAL_WIDGET") return;
      state.resizingModalWidgetId = action.payload;
      state.editError = null;
    },
    endEditorModalResize(state, action: PayloadAction<string>) {
      if (state.resizingModalWidgetId === action.payload) state.resizingModalWidgetId = null;
    },
    undoEditorChange(state) {
      if (state.saveStatus === "saving") return;
      const previous = state.past.pop();
      if (!previous) return;
      state.future.push({ documentJson: state.documentJson,
        selectedWidgetId: state.selectedWidgetId, selectedWidgetIds: [...state.selectedWidgetIds] });
      state.documentJson = previous.documentJson;
      state.autoHeightTree = buildAutoHeightTree(
        (JSON.parse(state.documentJson) as DashboardDocument).layout.dsl,
        {}, true,
      );
      state.selectedWidgetId = previous.selectedWidgetId;
      state.selectedWidgetIds = previous.selectedWidgetIds;
      state.dragSession = null;
      state.resizingModalWidgetId = null;
      state.activeDragCanvasId = null;
      state.dirty = state.documentJson !== state.savedDocumentJson;
      state.editError = null;
      state.saveError = null;
      state.saveStatus = "idle";
    },
    redoEditorChange(state) {
      if (state.saveStatus === "saving") return;
      const next = state.future.pop();
      if (!next) return;
      state.past.push({ documentJson: state.documentJson,
        selectedWidgetId: state.selectedWidgetId, selectedWidgetIds: [...state.selectedWidgetIds] });
      state.documentJson = next.documentJson;
      state.autoHeightTree = buildAutoHeightTree(
        (JSON.parse(state.documentJson) as DashboardDocument).layout.dsl,
        {}, true,
      );
      state.selectedWidgetId = next.selectedWidgetId;
      state.selectedWidgetIds = next.selectedWidgetIds;
      state.dragSession = null;
      state.resizingModalWidgetId = null;
      state.activeDragCanvasId = null;
      state.dirty = state.documentJson !== state.savedDocumentJson;
      state.editError = null;
      state.saveError = null;
      state.saveStatus = "idle";
    },
    editorOperationFailed(state, action: PayloadAction<string>) {
      state.editError = action.payload;
    },
    commitAutoHeightMeasurement(state, action: PayloadAction<{
      previousDocumentJson: string;
      documentJson: string;
      tree: AutoHeightLayoutTree;
    }>) {
      if (state.documentJson !== action.payload.previousDocumentJson ||
        state.documentJson === action.payload.documentJson) return;
      state.documentJson = action.payload.documentJson;
      state.autoHeightTree = action.payload.tree;
      // A ResizeObserver measurement is not a user command. Keep past/future
      // untouched, as Appsmith's UPDATE_MULTIPLE_WIDGET_PROPERTIES does.
      state.dirty = state.documentJson !== state.savedDocumentJson;
    },
    editorSaveStarted(state) {
      state.saveStatus = "saving";
      state.saveError = null;
    },
    editorSaveSucceeded(state, action: PayloadAction<{ savedDocumentJson: string; record: DraftRecord }>) {
      state.revision = action.payload.record.revision;
      state.savedDocumentJson = action.payload.savedDocumentJson;
      state.dirty = state.documentJson !== state.savedDocumentJson;
      state.savedDraftId = action.payload.record.documentId;
      state.saveStatus = "succeeded";
      state.saveError = null;
    },
    editorSaveAsSucceeded(state, action: PayloadAction<{ documentJson: string; record: DraftRecord }>) {
      state.documentJson = action.payload.documentJson;
      state.autoHeightTree = buildAutoHeightTree(
        (JSON.parse(state.documentJson) as DashboardDocument).layout.dsl,
        {}, true,
      );
      state.savedDocumentJson = action.payload.documentJson;
      state.past = [];
      state.future = [];
      state.dirty = false;
      state.revision = action.payload.record.revision;
      state.savedDraftId = action.payload.record.documentId;
      state.saveStatus = "succeeded";
      state.saveError = null;
      state.editError = null;
    },
    editorSaveFailed(state, action: PayloadAction<string>) {
      state.saveStatus = "failed";
      state.saveError = action.payload;
    },
  },
});

export const {
  beginEditorDrag,
  beginEditorModalResize,
  editorOperationFailed,
  setEditorCanvasWidth,
  setEditorDragCanvas,
  endEditorDrag,
  endEditorModalResize,
  selectEditorWidget,
  selectEditorTabCanvas,
  setEditorModalOpen,
  selectEditorWidgets,
  undoEditorChange,
  redoEditorChange,
} = slice.actions;

/** Command actions mirror Appsmith's widget actions; sagas perform the DSL operation. */
export const addEditorWidget = createAction<AddWidgetRequest>("editableWorkbench/addWidget");
export const updateEditorWidgetProperty = createAction<UpdateWidgetPropertyRequest>(
  "editableWorkbench/updateWidgetProperty",
);
export const updateEditorCustomWidgetSource = createAction<UpdateCustomWidgetSourceRequest>(
  "editableWorkbench/updateCustomWidgetSource",
);
export const editEditorTab = createAction<TabEditRequest>("editableWorkbench/editTab");
export const updateEditorWidgetHeightMode = createAction<UpdateWidgetHeightModeRequest>(
  "editableWorkbench/updateWidgetHeightMode",
);
export const updateEditorWidgetHeightLimits = createAction<UpdateWidgetHeightLimitsRequest>(
  "editableWorkbench/updateWidgetHeightLimits",
);
export const measureEditorWidgetHeight = createAction<{
  widgetId: string;
  paddedHeightPx: number;
}>("editableWorkbench/measureWidgetHeight");
export const deleteEditorWidget = createAction<DeleteWidgetRequest>("editableWorkbench/deleteWidget");
export const renameEditorDocument = createAction<RenameDocumentRequest>("editableWorkbench/renameDocument");
export const updateEditorThemeProperties = createAction<InlineDashboardTheme["properties"]>(
  "editableWorkbench/updateThemeProperties",
);
export const updateEditorReferencedThemeProperties = createAction<{
  reference: MarketplaceDashboardTheme;
  resolvedTheme: InlineDashboardTheme;
  properties: InlineDashboardTheme["properties"];
}>("editableWorkbench/updateReferencedThemeProperties");
export const selectEditorThemePreset = createAction<string>(
  "editableWorkbench/selectThemePreset",
);
export const applyEditorSavedTheme = createAction<InlineDashboardTheme>(
  "editableWorkbench/applySavedTheme",
);
export const resetEditorWidgetStyles = createAction("editableWorkbench/resetWidgetStyles");
export const updateEditorCanvasWidthPreset = createAction<NonNullable<
  DashboardDocument["compatibility"]["canvasWidthPreset"]
>>("editableWorkbench/updateCanvasWidthPreset");
export const moveEditorWidget = createAction<MoveWidgetRequest>("editableWorkbench/moveWidget");
export const resizeEditorWidget = createAction<ResizeWidgetRequest>("editableWorkbench/resizeWidget");
export const resizeEditorModal = createAction<ResizeModalRequest>("editableWorkbench/resizeModal");
export const saveEditorBinding = createAction<WidgetBindingDraft>("editableWorkbench/saveBinding");
export const removeEditorBinding = createAction<string>("editableWorkbench/removeBinding");
export const removeEditorBindings = createAction<string[]>("editableWorkbench/removeBindings");
export const copyEditorWidgets = createAction<string[]>("editableWorkbench/copyWidgets");
export const cutEditorWidgets = createAction<string[]>("editableWorkbench/cutWidgets");
export const deleteEditorWidgets = createAction<string[]>("editableWorkbench/deleteWidgets");
export const groupEditorWidgets = createAction<string[]>("editableWorkbench/groupWidgets");
export const moveEditorWidgets = createAction<GroupPlacementRequest>("editableWorkbench/moveWidgets");
interface CanvasPlanBasis {
  expectedDocumentJson: string;
  expectedPlanningJson: string;
  expectedActiveTabCanvasIds: Record<string, string>;
}

export const commitEditorLayoutPlan = createAction<CanvasPlanBasis & {
  change: LayoutChange; plan: LayoutPreview;
}>("editableWorkbench/commitLayoutPlan");
export const commitEditorGroupPlan = createAction<CanvasPlanBasis & {
  request: GroupPlacementRequest; plan: GroupPlacementPreview;
}>("editableWorkbench/commitGroupPlan");
export const pasteEditorWidgets = createAction("editableWorkbench/pasteWidgets");
export const requestEditorSave = createAction("editableWorkbench/requestSave");
export const requestEditorSaveAs = createAction<{ accountId: string | number; documentId?: string }>(
  "editableWorkbench/requestSaveAs",
);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The editor operation failed.";
}

/** Appsmith keeps ui.mainCanvas.width apart from the saved widget DSL. */
function withRootCanvasWidth(documentJson: string, width: number): string {
  if (!Number.isSafeInteger(width) || width <= 0) return documentJson;
  const document = JSON.parse(documentJson) as DashboardDocument;
  if (document.layout.dsl.rightColumn === width) return documentJson;
  document.layout.dsl.rightColumn = width;
  return JSON.stringify(document);
}

function matchesCanvasPlanBasis(state: EditableWorkbenchState,
  basis: CanvasPlanBasis): boolean {
  if (state.documentJson !== basis.expectedDocumentJson ||
    JSON.stringify(state.activeTabCanvasIds) !==
      JSON.stringify(basis.expectedActiveTabCanvasIds)) return false;
  return withRootCanvasWidth(projectActiveTabsAutoHeight(state.documentJson,
    state.activeTabCanvasIds).documentJson, state.canvasWidthPx) ===
      basis.expectedPlanningJson;
}

function* edit(
  transform: (documentJson: string, selectedWidgetId: string | null,
    selectedWidgetIds: readonly string[]) => EditResult,
  checkAutoHeightContainers = false,
  keepModalResizeActive = false,
): SagaIterator {
  const before = (yield select()) as EditableWorkbenchState;
  if (before.saveStatus === "saving") return;
  try {
    const authoredWidth = (JSON.parse(before.documentJson) as DashboardDocument)
      .layout.dsl.rightColumn;
    // Fixed drag planning reads the selected Tab's transient geometry. Start
    // layout transactions from that same projection, then normalize the
    // authored document back to its tallest-tab envelope after the command.
    const projectedSource = checkAutoHeightContainers
      ? projectActiveTabsAutoHeight(before.documentJson, before.activeTabCanvasIds).documentJson
      : before.documentJson;
    const renderedSource = withRootCanvasWidth(projectedSource, before.canvasWidthPx);
    let result = (yield call(() => transform(renderedSource,
      before.selectedWidgetId, before.selectedWidgetIds))) as EditResult;
    if (checkAutoHeightContainers) {
      result = { ...result, documentJson: recomputeAutoHeightContainers(result.documentJson) };
    }
    result = { ...result,
      documentJson: withRootCanvasWidth(result.documentJson, authoredWidth) };
    yield put(slice.actions.commitEditorChange({
      previousDocumentJson: before.documentJson,
      keepModalResizeActive,
      ...result,
    }));
  } catch (error) {
    yield put(slice.actions.editorOperationFailed(errorMessage(error)));
  }
}

function* addWidgetSaga(action: ReturnType<typeof addEditorWidget>): SagaIterator {
  yield* edit((documentJson) => addWidgetToDocument(documentJson, action.payload), true);
}

function* updateWidgetSaga(action: ReturnType<typeof updateEditorWidgetProperty>): SagaIterator {
  yield* edit((documentJson) => updateWidgetPropertyInDocument(documentJson, action.payload),
    action.payload.property === "borderWidth" ||
    action.payload.property === "shouldShowTabs");
}

function* updateCustomWidgetSourceSaga(
  action: ReturnType<typeof updateEditorCustomWidgetSource>): SagaIterator {
  yield* edit((documentJson) => updateCustomWidgetSourceInDocument(documentJson,
    action.payload));
}

function* editTabSaga(action: ReturnType<typeof editEditorTab>): SagaIterator {
  yield* edit((documentJson) => editTabsInDocument(documentJson, action.payload), true);
}

function* updateWidgetHeightModeSaga(action: ReturnType<typeof updateEditorWidgetHeightMode>): SagaIterator {
  yield* edit((documentJson) => updateWidgetHeightModeInDocument(documentJson, action.payload), true);
}

function* updateWidgetHeightLimitsSaga(action: ReturnType<typeof updateEditorWidgetHeightLimits>): SagaIterator {
  yield* edit((documentJson) => updateWidgetHeightLimitsInDocument(documentJson, action.payload), true);
}

function* measureWidgetHeightSaga(context: EditorSagaContext,
  action: ReturnType<typeof measureEditorWidgetHeight>): SagaIterator {
  const before = (yield select()) as EditableWorkbenchState;
  if (before.dragSession || before.resizingModalWidgetId) {
    // Appsmith queues ResizeObserver updates while a widget is being dragged.
    // The queue belongs to this workbench store, never a module-global.
    context.pendingAutoHeights.set(action.payload.widgetId, action.payload.paddedHeightPx);
    return;
  }
  try {
    const result = (yield call(() => measureAutoHeightInDocument(
      before.documentJson, action.payload.widgetId, action.payload.paddedHeightPx,
      before.autoHeightTree,
    ))) as ReturnType<typeof measureAutoHeightInDocument>;
    yield put(slice.actions.commitAutoHeightMeasurement({
      previousDocumentJson: before.documentJson,
      documentJson: result.documentJson,
      tree: result.tree,
    }));
  } catch (error) {
    yield put(slice.actions.editorOperationFailed(errorMessage(error)));
  }
}

function* flushMeasuredHeightsSaga(context: EditorSagaContext): SagaIterator {
  const state = (yield select()) as EditableWorkbenchState;
  if (state.resizingModalWidgetId) return;
  if (context.pendingAutoHeights.size === 0) return;
  const pending = [...context.pendingAutoHeights];
  context.pendingAutoHeights.clear();
  for (const [widgetId, paddedHeightPx] of pending) {
    yield put(measureEditorWidgetHeight({ widgetId, paddedHeightPx }));
  }
}

function* deleteWidgetSaga(action: ReturnType<typeof deleteEditorWidget>): SagaIterator {
  yield* edit((documentJson) => deleteWidgetFromDocument(documentJson, action.payload), true);
}

function* renameDocumentSaga(action: ReturnType<typeof renameEditorDocument>): SagaIterator {
  yield* edit((documentJson, selectedWidgetId) =>
    renameDocument(documentJson, action.payload, selectedWidgetId));
}

function* updateThemePropertiesSaga(
  action: ReturnType<typeof updateEditorThemeProperties>,
): SagaIterator {
  yield* edit((documentJson, selectedWidgetId, selectedWidgetIds) =>
    updateThemePropertiesInDocument(documentJson, action.payload,
      selectedWidgetId, selectedWidgetIds));
}

function* updateReferencedThemePropertiesSaga(
  action: ReturnType<typeof updateEditorReferencedThemeProperties>,
): SagaIterator {
  yield* edit((documentJson, selectedWidgetId, selectedWidgetIds) =>
    updateReferencedThemePropertiesInDocument(documentJson,
      action.payload.reference, action.payload.resolvedTheme,
      action.payload.properties, selectedWidgetId, selectedWidgetIds));
}

function* selectThemePresetSaga(
  action: ReturnType<typeof selectEditorThemePreset>,
): SagaIterator {
  yield* edit((documentJson, selectedWidgetId, selectedWidgetIds) =>
    selectThemePresetInDocument(documentJson, action.payload,
      selectedWidgetId, selectedWidgetIds));
}

function* applySavedThemeSaga(
  action: ReturnType<typeof applyEditorSavedTheme>,
): SagaIterator {
  yield* edit((documentJson, selectedWidgetId, selectedWidgetIds) =>
    applySavedThemeInDocument(documentJson, action.payload,
      selectedWidgetId, selectedWidgetIds));
}

function* resetWidgetStylesSaga(): SagaIterator {
  yield* edit((documentJson, selectedWidgetId, selectedWidgetIds) => ({
    documentJson: resetWidgetStylesInDocument(documentJson).documentJson,
    selectedWidgetId,
    selectedWidgetIds: [...selectedWidgetIds],
  }));
}

function* updateCanvasWidthPresetSaga(
  action: ReturnType<typeof updateEditorCanvasWidthPreset>,
): SagaIterator {
  yield* edit((documentJson, selectedWidgetId) => {
    const document = parseDashboardDocument(JSON.parse(documentJson));
    document.compatibility.canvasWidthPreset = action.payload;
    return { documentJson: JSON.stringify(parseDashboardDocument(document)), selectedWidgetId };
  });
}

function* moveWidgetSaga(action: ReturnType<typeof moveEditorWidget>): SagaIterator {
  yield* edit((documentJson) => moveWidgetInDocument(documentJson, action.payload), true);
}

function* resizeWidgetSaga(action: ReturnType<typeof resizeEditorWidget>): SagaIterator {
  yield* edit((documentJson) => resizeWidgetInDocument(documentJson, action.payload), true);
}

function* resizeModalSaga(action: ReturnType<typeof resizeEditorModal>): SagaIterator {
  yield* edit((documentJson) => resizeModalInDocument(documentJson, action.payload), true, true);
}

function* saveBindingSaga(action: ReturnType<typeof saveEditorBinding>): SagaIterator {
  yield* edit((documentJson, selectedWidgetId) => ({
    documentJson: JSON.stringify(saveWidgetBinding(
      parseDashboardDocument(JSON.parse(documentJson)), action.payload,
    )),
    selectedWidgetId,
  }));
}

function* removeBindingSaga(action: ReturnType<typeof removeEditorBinding>): SagaIterator {
  yield* edit((documentJson, selectedWidgetId) => ({
    documentJson: JSON.stringify(removeWidgetBinding(
      parseDashboardDocument(JSON.parse(documentJson)), action.payload,
    )),
    selectedWidgetId,
  }));
}

function* removeBindingsSaga(action: ReturnType<typeof removeEditorBindings>): SagaIterator {
  yield* edit((documentJson, selectedWidgetId) => ({
    documentJson: JSON.stringify(removeWidgetBindings(
      parseDashboardDocument(JSON.parse(documentJson)), action.payload,
    )),
    selectedWidgetId,
  }));
}

function multiEditResult(result: MultiWidgetEditResult): EditResult {
  return { ...result, selectedWidgetId: result.selectedWidgetIds.at(-1) ?? null };
}

function* deleteWidgetsSaga(action: ReturnType<typeof deleteEditorWidgets>): SagaIterator {
  yield* edit((documentJson) => {
    assertEditableSelection(documentJson, action.payload);
    return multiEditResult(deleteSelectedWidgets(documentJson, action.payload));
  }, true);
}

function* groupWidgetsSaga(action: ReturnType<typeof groupEditorWidgets>): SagaIterator {
  yield* edit((documentJson) => {
    assertEditableSelection(documentJson, action.payload);
    return multiEditResult(groupSelectedWidgets(documentJson, action.payload));
  }, true);
}

function* moveWidgetsSaga(action: ReturnType<typeof moveEditorWidgets>): SagaIterator {
  yield* edit((documentJson) => {
    assertEditableSelection(documentJson, action.payload.widgetIds);
    assertEditableSelection(documentJson, [action.payload.parentId]);
    return multiEditResult(moveSelectedWidgets(documentJson, action.payload));
  }, true);
}

function* commitLayoutPlanSaga(action: ReturnType<typeof commitEditorLayoutPlan>): SagaIterator {
  const before = (yield select()) as EditableWorkbenchState;
  if (!matchesCanvasPlanBasis(before, action.payload)) {
    yield put(slice.actions.editorOperationFailed("Canvas changed during drag. Try again."));
    return;
  }
  yield* edit((documentJson) => commitFixedLayoutChange(
    documentJson, action.payload.change, action.payload.plan), true);
}

function* commitGroupPlanSaga(action: ReturnType<typeof commitEditorGroupPlan>): SagaIterator {
  const before = (yield select()) as EditableWorkbenchState;
  if (!matchesCanvasPlanBasis(before, action.payload)) {
    yield put(slice.actions.editorOperationFailed("Canvas changed during drag. Try again."));
    return;
  }
  yield* edit((documentJson) => {
    assertEditableSelection(documentJson, action.payload.request.widgetIds);
    assertEditableSelection(documentJson, [action.payload.request.parentId]);
    return multiEditResult(moveSelectedWidgets(
      documentJson, action.payload.request, action.payload.plan));
  }, true);
}

function* copyWidgetsSaga(context: EditorSagaContext,
  action: ReturnType<typeof copyEditorWidgets>): SagaIterator {
  const state = (yield select()) as EditableWorkbenchState;
  try {
    assertEditableSelection(state.documentJson, action.payload);
    const clipboard = (yield call(() => copySelectedWidgets(
      state.documentJson, action.payload,
    ))) as FixedWidgetClipboard;
    if (context.clipboardScope) {
      yield call(() => context.clipboardStore.save(
        context.clipboardScope as FixedClipboardScope, clipboard));
    }
    context.clipboard = clipboard;
  } catch (error) {
    yield put(slice.actions.editorOperationFailed(errorMessage(error)));
  }
}

function* cutWidgetsSaga(context: EditorSagaContext,
  action: ReturnType<typeof cutEditorWidgets>): SagaIterator {
  const state = (yield select()) as EditableWorkbenchState;
  if (state.saveStatus === "saving") return;
  try {
    assertEditableSelection(state.documentJson, action.payload);
    const result = (yield call(() => cutSelectedWidgets(
      state.documentJson, action.payload,
    ))) as MultiWidgetEditResult & { clipboard: FixedWidgetClipboard };
    if (context.clipboardScope) {
      yield call(() => context.clipboardStore.save(
        context.clipboardScope as FixedClipboardScope, result.clipboard));
    }
    context.clipboard = result.clipboard;
    yield put(slice.actions.commitEditorChange({
      previousDocumentJson: state.documentJson,
      ...multiEditResult(result),
      documentJson: recomputeAutoHeightContainers(result.documentJson),
    }));
  } catch (error) {
    yield put(slice.actions.editorOperationFailed(errorMessage(error)));
  }
}

function* pasteWidgetsSaga(context: EditorSagaContext,
  _action: ReturnType<typeof pasteEditorWidgets>): SagaIterator {
  let clipboard = context.clipboard;
  if (context.clipboardScope) {
    try {
      clipboard = (yield call(() => context.clipboardStore.load(
        context.clipboardScope as FixedClipboardScope))) as FixedWidgetClipboard | null;
    } catch (error) {
      yield put(slice.actions.editorOperationFailed(errorMessage(error)));
      return;
    }
  }
  if (!clipboard) return;
  yield* edit((documentJson, _selectedWidgetId, selectedWidgetIds) =>
    multiEditResult(pasteSelectedWidgets(documentJson, clipboard,
      resolveFixedPasteTarget(documentJson, clipboard, selectedWidgetIds))), true);
}

interface EditorSagaContext {
  scope: DraftScope | undefined;
  draftStore: Pick<IndexedDbDraftStore, "save">;
  clipboardScope: FixedClipboardScope | undefined;
  clipboardStore: FixedWidgetClipboardStore;
  clipboard: FixedWidgetClipboard | null;
  pendingAutoHeights: Map<string, number>;
}

function* saveDraftSaga(context: EditorSagaContext): SagaIterator {
  const before = (yield select()) as EditableWorkbenchState;
  if (before.saveStatus === "saving") return;
  if (!before.dirty && before.revision !== null) return;
  if (!context.scope) {
    yield put(slice.actions.editorSaveFailed("Use Save as local draft to create a draft first."));
    return;
  }
  try {
    const document = parseDashboardDocument(JSON.parse(before.documentJson));
    yield put(slice.actions.editorSaveStarted());
    const record = (yield call(
      () => context.draftStore.save(context.scope as DraftScope, document, before.revision),
    )) as DraftRecord;
    yield put(slice.actions.editorSaveSucceeded({
      savedDocumentJson: before.documentJson,
      record,
    }));
  } catch (error) {
    yield put(slice.actions.editorSaveFailed(errorMessage(error)));
  }
}

function* saveAsDraftSaga(
  context: EditorSagaContext,
  action: ReturnType<typeof requestEditorSaveAs>,
): SagaIterator {
  const before = (yield select()) as EditableWorkbenchState;
  if (before.saveStatus === "saving") return;
  try {
    const document = JSON.parse(before.documentJson) as DashboardDocument;
    const documentId = action.payload.documentId ?? `dashboard-${nanoid(12)}`;
    document.documentId = documentId;
    parseDashboardDocument(document);
    const documentJson = JSON.stringify(document);
    const scope: DraftScope = {
      deploymentId: `${window.location.origin}/operator_display`,
      accountId: String(action.payload.accountId),
      documentId,
    };
    yield put(slice.actions.editorSaveStarted());
    const record = (yield call(() => context.draftStore.save(scope, document, null))) as DraftRecord;
    context.scope = scope;
    let clipboardError: string | null = null;
    if (!context.clipboardScope) {
      context.clipboardScope = { deploymentId: scope.deploymentId,
        accountId: scope.accountId };
      if (context.clipboard) {
        try {
          yield call(() => context.clipboardStore.save(
            context.clipboardScope as FixedClipboardScope,
            context.clipboard as FixedWidgetClipboard));
        } catch (error) {
          clipboardError = errorMessage(error);
        }
      }
    }
    yield put(slice.actions.editorSaveAsSucceeded({ documentJson, record }));
    if (clipboardError) yield put(slice.actions.editorOperationFailed(clipboardError));
  } catch (error) {
    yield put(slice.actions.editorSaveFailed(errorMessage(error)));
  }
}

function* editorSaga(context: EditorSagaContext): SagaIterator {
  yield all([
    takeEvery(addEditorWidget.type, addWidgetSaga),
    takeEvery(updateEditorWidgetProperty.type, updateWidgetSaga),
    takeEvery(updateEditorCustomWidgetSource.type, updateCustomWidgetSourceSaga),
    takeEvery(editEditorTab.type, editTabSaga),
    takeEvery(updateEditorWidgetHeightMode.type, updateWidgetHeightModeSaga),
    takeEvery(updateEditorWidgetHeightLimits.type, updateWidgetHeightLimitsSaga),
    takeEvery(measureEditorWidgetHeight.type, measureWidgetHeightSaga, context),
    takeEvery(endEditorDrag.type, flushMeasuredHeightsSaga, context),
    takeEvery(endEditorModalResize.type, flushMeasuredHeightsSaga, context),
    takeEvery(slice.actions.commitEditorChange.type, flushMeasuredHeightsSaga, context),
    takeEvery(deleteEditorWidget.type, deleteWidgetSaga),
    takeEvery(renameEditorDocument.type, renameDocumentSaga),
    takeEvery(updateEditorThemeProperties.type, updateThemePropertiesSaga),
    takeEvery(updateEditorReferencedThemeProperties.type, updateReferencedThemePropertiesSaga),
    takeEvery(selectEditorThemePreset.type, selectThemePresetSaga),
    takeEvery(applyEditorSavedTheme.type, applySavedThemeSaga),
    takeEvery(resetEditorWidgetStyles.type, resetWidgetStylesSaga),
    takeEvery(updateEditorCanvasWidthPreset.type, updateCanvasWidthPresetSaga),
    takeEvery(moveEditorWidget.type, moveWidgetSaga),
    takeEvery(resizeEditorWidget.type, resizeWidgetSaga),
    takeEvery(resizeEditorModal.type, resizeModalSaga),
    takeEvery(saveEditorBinding.type, saveBindingSaga),
    takeEvery(removeEditorBinding.type, removeBindingSaga),
    takeEvery(removeEditorBindings.type, removeBindingsSaga),
    takeEvery(copyEditorWidgets.type, copyWidgetsSaga, context),
    takeEvery(cutEditorWidgets.type, cutWidgetsSaga, context),
    takeEvery(deleteEditorWidgets.type, deleteWidgetsSaga),
    takeEvery(groupEditorWidgets.type, groupWidgetsSaga),
    takeEvery(moveEditorWidgets.type, moveWidgetsSaga),
    takeEvery(commitEditorLayoutPlan.type, commitLayoutPlanSaga),
    takeEvery(commitEditorGroupPlan.type, commitGroupPlanSaga),
    takeEvery(pasteEditorWidgets.type, pasteWidgetsSaga, context),
    takeLeading(requestEditorSave.type, saveDraftSaga, context),
    takeLeading(requestEditorSaveAs.type, saveAsDraftSaga, context),
  ]);
}

export interface EditableWorkbenchOptions {
  draftScope?: DraftScope;
  /** Shared across this account's drafts, never between accounts or deployments. */
  clipboardScope?: FixedClipboardScope;
  revision?: number | null;
  selectedWidgetId?: string | null;
  /** Dependency injection for local storage verification. */
  draftStore?: Pick<IndexedDbDraftStore, "save">;
  clipboardStore?: FixedWidgetClipboardStore;
}

/** Each workbench mount owns its editor Redux store and saga middleware. */
export function createEditableWorkbenchStore(
  input: DashboardDocument,
  options: EditableWorkbenchOptions = {},
) {
  const document = parseDashboardDocument(input);
  if (options.draftScope && document.documentId !== options.draftScope.documentId) {
    throw new Error("Editor draft scope must match the dashboard document ID.");
  }
  if (options.clipboardScope && options.draftScope &&
    (options.clipboardScope.deploymentId !== options.draftScope.deploymentId ||
      options.clipboardScope.accountId !== options.draftScope.accountId)) {
    throw new Error("Editor clipboard scope must match the draft owner.");
  }
  const clipboardScope = options.clipboardScope ?? (options.draftScope
    ? { deploymentId: options.draftScope.deploymentId,
      accountId: options.draftScope.accountId } : undefined);
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: slice.reducer,
    preloadedState: initialState(document, options.revision ?? null, options.selectedWidgetId),
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({ thunk: false }).concat(sagaMiddleware),
  });
  const task = sagaMiddleware.run(editorSaga, {
    scope: options.draftScope,
    draftStore: options.draftStore ?? new IndexedDbDraftStore(),
    clipboardScope,
    clipboardStore: options.clipboardStore ?? new IndexedDbFixedWidgetClipboardStore(),
    clipboard: null,
    pendingAutoHeights: new Map<string, number>(),
  });
  return Object.assign(store, { dispose: () => task.cancel() });
}

export type EditableWorkbenchStore = ReturnType<typeof createEditableWorkbenchStore>;
export type EditableWorkbenchDispatch = EditableWorkbenchStore["dispatch"];

export const selectEditorDocument = (state: EditableWorkbenchState): DashboardDocument =>
  parseDashboardDocument(JSON.parse(state.documentJson));
export const selectEditorSelectedWidget = (state: EditableWorkbenchState) =>
  widgetFromDocument(state.documentJson, state.selectedWidgetId);
export const selectEditorSelectedWidgets = (state: EditableWorkbenchState) =>
  state.selectedWidgetIds.map((id) => widgetFromDocument(state.documentJson, id)).filter(Boolean);
export const selectEditorWidgetById = (state: EditableWorkbenchState, widgetId: string) =>
  widgetFromDocument(state.documentJson, widgetId);
export const selectEditorCanUndo = (state: EditableWorkbenchState): boolean => state.past.length > 0;
export const selectEditorCanRedo = (state: EditableWorkbenchState): boolean => state.future.length > 0;
