import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import {
  ExplorerContainer,
  Tab,
  TabPanel,
  Tabs,
  TabsList,
} from "@appsmith/ads";
import { Router } from "react-router-dom";
import { Provider, useDispatch, useSelector } from "react-redux";
import type { DefaultRootState } from "react-redux";
import { ThemeProvider } from "styled-components";
import { nestDSL } from "@shared/dsl";
import { put, takeEvery } from "redux-saga/effects";
import type { ReduxAction } from "actions/ReduxActionTypes";
import { ReduxActionTypes } from "ee/constants/ReduxActionConstants";
import { ApplicationVersion } from "ee/actions/applicationActions";
import { DEFAULT_FEATURE_FLAG_VALUE } from "ee/entities/FeatureFlag";
import { APP_MODE } from "entities/App";
import type { ApplicationPayload } from "entities/Application";
import type { AppTheme } from "entities/AppTheming";
import { DefaultCurrentUserDetails } from "constants/userConstants";
import { Layers, LayersContext } from "constants/Layers";
import { RenderModes } from "constants/WidgetConstants";
import { updateWidgetPropertyRequest } from "actions/controlActions";
import {
  fetchAllPageEntityCompletion,
  initCanvasLayout,
  setAppMode,
} from "actions/pageActions";
import { setSelectedWidgets } from "actions/widgetSelectionActions";
import type { WidgetSelectionRequestPayload } from "actions/widgetSelectionActions";
import { widgetInitialisationSuccess } from "actions/widgetActions";
import { getCanvasWidgetsPayload } from "ee/sagas/PageSagas";
import { getCanvasWidgetsStructure } from "ee/selectors/entitiesSelector";
import {
  exampleDashboardDocument,
  importDashboardDocumentFile,
  parseDashboardDocument,
  serializeDashboardDocument,
} from "integration/document";
import type {
  AppsmithWidgetDsl,
  DashboardDocument,
} from "integration/document";
import {
  ComponentMarketplaceRepository,
  createComponentFromDashboard,
} from "integration/component-assets";
import { IndexedDbDraftStore } from "integration/drafts/IndexedDbDraftStore";
import type {
  DraftRecord,
  DraftScope,
} from "integration/drafts/IndexedDbDraftStore";
import type { DashboardWorkspaceService } from "integration/workspace";
import type { MarketplaceClient } from "integration/marketplace";
import { MarketplaceAssetPanel } from "integration/asset-ui";
import type { MarketplaceAssetPanelProps } from "integration/asset-ui";
import {
  applyThemeAsset,
  ThemeMarketplaceRepository,
  themeAssetFromDocument,
} from "integration/theme-assets";
import {
  TransientWidgetOverlay,
  TransientWidgetOverlayProvider,
} from "integration/runtime-ui";
import { PublishControls } from "integration/workspace-entry/PublishControls";
import { ViewerShell } from "integration/viewer-ui";
import { WidgetPalette } from "integration/widget-palette/WidgetPalette";
import { WidgetOutline } from "integration/widget-outline";
import {
  IntegrationSidebar,
  type IntegrationSection,
} from "integration/workbench/IntegrationSidebar";
import {
  IntegrationHeader,
  IntegrationStatusBar,
} from "integration/workbench/IntegrationHeader";
import { CanvasViewport } from "integration/workbench/CanvasViewport";
import { ExplorerResizeHandle } from "integration/workbench/ExplorerResizeHandle";
import { BindingEditor } from "integration/binding-editor/BindingEditor";
import type { WidgetBindingDraft } from "integration/binding-editor/model";
import {
  removeWidgetBinding,
  removeWidgetBindings,
  saveWidgetBinding,
} from "integration/binding-editor/model";
import { RunPanel } from "integration/workspace-ui/RunPanel";
import type {
  BrowserRunEnvironment,
  RunPanelProps,
} from "integration/workspace-ui/RunPanel";
import { LayoutSystemTypes } from "layoutSystems/types";
import EditorContextProvider from "components/editorComponents/EditorContextProvider";
import Canvas from "pages/Editor/Canvas";
import PropertyPane from "pages/Editor/PropertyPane";
import evaluationSagaListeners from "sagas/EvaluationsSaga";
import draggingCanvasSagas from "sagas/CanvasSagas/DraggingCanvasSagas";
import widgetOperationSagas from "sagas/WidgetOperationSagas";
import { lightTheme } from "selectors/themeSelectors";
import store, { runSagaMiddleware } from "store";
import { editorInitializer } from "utils/editor/EditorUtils";
import history from "utils/history";
import GlobalStyles from "globalStyles";
import {
  getBlockedAppsmithRequests,
  subscribeBlockedAppsmithRequests,
} from "./networkGuard";
import "./standalone.css";

const APPLICATION_ID = "standalone-dashboard";
const PAGE_ID = "standalone-page";
const LAYOUT_ID = "standalone-layout";
const TITLE_WIDGET_ID = "engine-title";
const ACTIVE_DOCUMENT_STORAGE_KEY = "standalone-active-dashboard-document";

export interface MarketplaceEditorContext {
  document: DashboardDocument;
  localDraft: DraftRecord | null;
  accountId: string;
  deploymentId: string;
  itemId: number | null;
  workspace: DashboardWorkspaceService;
  marketplace: MarketplaceClient;
  runEnvironment: BrowserRunEnvironment | null;
}

export interface PublishedViewerContext {
  document: DashboardDocument;
  itemId: number;
  marketplace: MarketplaceClient;
  runEnvironment: BrowserRunEnvironment | null;
}

interface StandaloneResult {
  message: string;
  record: DraftRecord | null;
  documentName: string;
  titleWidgetId: string | null;
  persisted: boolean;
  documentEpoch: number;
  isError?: boolean;
}

interface StandaloneShellProps {
  initialDocumentName: string;
  initialRecord: DraftRecord | null;
  initialStatus: string;
  initialTitleWidgetId: string | null;
  initialDocumentEpoch: number;
  onSave: () => Promise<StandaloneResult>;
  onRestore: (revision: number) => Promise<StandaloneResult>;
  onImport: (file: File) => Promise<StandaloneResult>;
  onExport: () => string;
  onRename: (name: string) => void;
  bindings: {
    getDocument: () => DashboardDocument;
    onSave: (draft: WidgetBindingDraft) => void;
    onRemove: (bindingId: string) => void;
    onRemoveMany: (bindingIds: string[]) => void;
    marketplace?: MarketplaceClient;
  };
  assets?: MarketplaceAssetPanelProps;
  marketplace?: {
    itemId: number | null;
    onPublishNew: (description: string, thumbnail: File) => Promise<string>;
    onReplace?: () => Promise<string>;
  };
  run?: RunPanelProps;
}

const cloneDocument = (document: DashboardDocument): DashboardDocument =>
  JSON.parse(JSON.stringify(document)) as DashboardDocument;

/** Appsmith's standard selection saga only accepts editor URLs. */
function* standaloneSelectionSaga() {
  yield takeEvery(
    ReduxActionTypes.SELECT_WIDGET_INIT,
    function* (action: ReduxAction<WidgetSelectionRequestPayload>) {
      yield put(
        setSelectedWidgets(
          action.payload.payload?.length ? action.payload.payload : ["0"],
        ),
      );
    },
  );
}

function themeForDocument(document: DashboardDocument): AppTheme {
  const properties =
    document.theme.kind === "inline"
      ? document.theme.properties
      : {
          colors: {
            primaryColor: "#126e9a",
            backgroundColor: "#f4f8fa",
          },
          borderRadius: { appBorderRadius: "0.375rem" },
          boxShadow: { appBoxShadow: "none" },
          fontFamily: { appFont: "Inter" },
        };

  return {
    id: "standalone-theme",
    name: document.theme.kind === "inline" ? document.theme.name : "Standalone",
    displayName:
      document.theme.kind === "inline" ? document.theme.name : "Standalone",
    created_by: "standalone",
    created_at: "",
    config: {
      order: 0,
      colors: properties.colors,
      borderRadius: {},
      boxShadow: {},
      fontFamily: {},
    },
    properties,
    stylesheet: {},
  };
}

function applicationForDocument(
  document: DashboardDocument,
): ApplicationPayload {
  return {
    id: APPLICATION_ID,
    baseId: APPLICATION_ID,
    name: document.name,
    workspaceId: "standalone-preview",
    defaultPageId: PAGE_ID,
    defaultBasePageId: PAGE_ID,
    appIsExample: true,
    slug: "standalone-dashboard",
    applicationVersion: ApplicationVersion.DEFAULT,
    pages: [
      {
        id: PAGE_ID,
        baseId: PAGE_ID,
        name: document.name,
        slug: "standalone",
        isDefault: true,
      },
    ],
    applicationDetail: { appPositioning: { type: LayoutSystemTypes.FIXED } },
  };
}

async function canvasForDocument(document: DashboardDocument) {
  const response = {
    responseMeta: { status: 200, success: true },
    data: {
      id: PAGE_ID,
      baseId: PAGE_ID,
      name: document.name,
      slug: "standalone",
      applicationId: APPLICATION_ID,
      lastUpdatedTime: Date.now(),
      layouts: [
        {
          id: LAYOUT_ID,
          dsl: document.layout.dsl,
          layoutOnLoadActions: [],
          layoutActions: [],
        },
      ],
    },
  } as Parameters<typeof getCanvasWidgetsPayload>[0];

  return await getCanvasWidgetsPayload(response);
}

type StandaloneCanvas = Awaited<ReturnType<typeof canvasForDocument>>;

function titleWidgetIdForCanvas(canvas: StandaloneCanvas): string | null {
  if (canvas.widgets[TITLE_WIDGET_ID]?.type === "TEXT_WIDGET") {
    return TITLE_WIDGET_ID;
  }

  return (
    Object.values(canvas.widgets).find(
      (widget) => widget.type === "TEXT_WIDGET",
    )?.widgetId ?? null
  );
}

function componentGroupsForDocument(document: DashboardDocument) {
  const groups: { widgetId: string; name: string }[] = [];

  function visit(widget: AppsmithWidgetDsl) {
    if (
      widget.type === "CONTAINER_WIDGET" ||
      widget.type === "STATBOX_WIDGET"
    ) {
      groups.push({ widgetId: widget.widgetId, name: widget.widgetName });
    }

    widget.children?.forEach(visit);
  }

  visit(document.layout.dsl);

  return groups;
}

function StandaloneShell({
  assets,
  bindings,
  initialDocumentEpoch,
  initialDocumentName,
  initialRecord,
  initialStatus,
  initialTitleWidgetId,
  marketplace,
  onExport,
  onImport,
  onRename,
  onRestore,
  onSave,
  run,
}: StandaloneShellProps) {
  const dispatch = useDispatch();
  const structure = useSelector(getCanvasWidgetsStructure);
  const canvasWidth = useSelector(
    (state: DefaultRootState) => state.ui.mainCanvas.width,
  );
  const [documentName, setDocumentName] = useState(initialDocumentName);
  const [activeSection, setActiveSection] =
    useState<IntegrationSection>("widgets");
  const [explorerWidth, setExplorerWidth] = useState(320);
  const [documentEpoch, setDocumentEpoch] = useState(initialDocumentEpoch);
  const [bindingRevision, setBindingRevision] = useState(0);
  const [titleWidgetId, setTitleWidgetId] = useState(initialTitleWidgetId);
  const [record, setRecord] = useState(initialRecord);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const title = useSelector((state: DefaultRootState) =>
    titleWidgetId
      ? String(state.entities.canvasWidgets[titleWidgetId]?.text ?? "")
      : "",
  );
  const [status, setStatus] = useState(initialStatus);
  const [isError, setIsError] = useState(false);
  const [blockedCount, setBlockedCount] = useState(
    getBlockedAppsmithRequests(),
  );
  const [busy, setBusy] = useState(false);

  useEffect(function subscribeToBlockedRequests() {
    return subscribeBlockedAppsmithRequests(() =>
      setBlockedCount(getBlockedAppsmithRequests()),
    );
  }, []);

  useEffect(function trackCanvasEdits() {
    let priorWidgets = store.getState().entities.canvasWidgets;

    return store.subscribe(() => {
      const nextWidgets = store.getState().entities.canvasWidgets;

      if (nextWidgets !== priorWidgets) {
        priorWidgets = nextWidgets;
        setHasUnsavedChanges(true);
      }
    });
  }, []);

  function showResult(result: StandaloneResult) {
    setRecord(result.record);
    setDocumentName(result.documentName);
    setDocumentEpoch(result.documentEpoch);
    setTitleWidgetId(result.titleWidgetId);
    setHasUnsavedChanges(!result.persisted);
    setStatus(result.message);
    setIsError(Boolean(result.isError));
  }

  async function runOperation(
    label: string,
    operation: () => Promise<StandaloneResult>,
  ) {
    setBusy(true);

    try {
      showResult(await operation());
    } catch (error) {
      setStatus(
        `${label} failed: ${String(error)}. Export JSON to keep your current work.`,
      );
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    await runOperation("Local save", onSave);
  }

  async function restore(revision: number) {
    await runOperation("Restore", async () => onRestore(revision));
  }

  async function importFile(file: File) {
    await runOperation("Import", async () => onImport(file));
  }

  function exportFile() {
    try {
      setStatus(onExport());
      setIsError(false);
    } catch (error) {
      setStatus(
        `Export failed: ${String(error)}. Your work remains in this tab.`,
      );
      setIsError(true);
    }
  }

  function noteBindingChange(message: string) {
    setBindingRevision((value) => value + 1);
    setHasUnsavedChanges(true);
    setStatus(message);
    setIsError(false);
  }

  return (
    <div className="standalone-editor">
      <IntegrationHeader
        busy={busy}
        canEditTitle={Boolean(titleWidgetId)}
        catalogHref={marketplace ? "/workspace" : undefined}
        documentName={documentName}
        editorLabel={
          marketplace
            ? marketplace.itemId === null
              ? "Independent local draft"
              : `Marketplace item #${marketplace.itemId}`
            : "Local dashboard editor"
        }
        hasUnsavedChanges={hasUnsavedChanges}
        onDocumentNameChange={(name) => {
          setDocumentName(name);
          setHasUnsavedChanges(true);
          onRename(name);
        }}
        onExport={exportFile}
        onImport={marketplace ? undefined : importFile}
        onOpenRun={run ? () => setActiveSection("tools") : undefined}
        onSave={save}
        onTitleTextChange={(value) =>
          titleWidgetId &&
          dispatch(updateWidgetPropertyRequest(titleWidgetId, "text", value))
        }
        titleText={title}
      />
      <main
        className="standalone-editor__workspace"
        style={
          {
            "--workbench-explorer-width": `${explorerWidth}px`,
          } as React.CSSProperties
        }
      >
        <IntegrationSidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />
        <aside
          aria-label="Workbench explorer"
          className="standalone-editor__palette"
        >
          <ExplorerContainer
            borderRight="STANDARD"
            className="standalone-editor__explorer"
            height="100%"
            width="100%"
          >
            <section
              className="standalone-editor__left-section"
              hidden={activeSection !== "widgets"}
            >
              <WidgetPalette disabled={busy} />
            </section>
            <section
              className="standalone-editor__left-section"
              hidden={activeSection !== "outline"}
            >
              <WidgetOutline />
            </section>
            <section
              aria-label="Dashboard tools"
              className="standalone-editor__left-section standalone-editor__tools"
              hidden={activeSection !== "tools"}
            >
              <h2 className="standalone-editor__tools-heading">
                Dashboard tools
              </h2>
              <details
                className="standalone-editor__history"
                data-testid="t--standalone-history"
              >
                <summary>Local history ({record?.history.length ?? 0})</summary>
                {record?.historyIssue && (
                  <p role="alert">History unavailable: {record.historyIssue}</p>
                )}
                {!record?.history.length && <p>No earlier revisions saved.</p>}
                {record?.history
                  .slice()
                  .reverse()
                  .map((snapshot) => (
                    <div
                      className="standalone-editor__history-row"
                      key={snapshot.revision}
                    >
                      <span>
                        Revision {snapshot.revision}
                        <small>
                          {new Date(snapshot.savedAt).toLocaleString()}
                        </small>
                      </span>
                      <button
                        data-testid={`t--standalone-restore-${snapshot.revision}`}
                        disabled={busy || Boolean(record.historyIssue)}
                        onClick={async () => restore(snapshot.revision)}
                        type="button"
                      >
                        Restore revision {snapshot.revision}
                      </button>
                    </div>
                  ))}
              </details>
              {run && (
                <RunPanel
                  key={`${documentEpoch}:${bindingRevision}`}
                  {...run}
                />
              )}
              {assets && (
                <MarketplaceAssetPanel
                  {...assets}
                  applyTheme={async (itemId) => {
                    const message = await assets.applyTheme(itemId);

                    setDocumentEpoch((value) => value + 1);
                    setHasUnsavedChanges(true);
                    setStatus(message);
                    setIsError(false);

                    return message;
                  }}
                  installComponent={async (itemId) => {
                    const message = await assets.installComponent(itemId);

                    setDocumentEpoch((value) => value + 1);
                    setHasUnsavedChanges(true);
                    setStatus(message);
                    setIsError(false);

                    return message;
                  }}
                />
              )}
              {marketplace && (
                <PublishControls
                  itemId={marketplace.itemId}
                  onPublishNew={marketplace.onPublishNew}
                  onReplace={marketplace.onReplace}
                />
              )}
            </section>
          </ExplorerContainer>
        </aside>
        <ExplorerResizeHandle
          onWidthChange={setExplorerWidth}
          width={explorerWidth}
        />
        <CanvasViewport canvasWidth={canvasWidth}>
          <Canvas canvasWidth={canvasWidth} widgetsStructure={structure} />
        </CanvasViewport>
        <aside
          aria-label="Widget properties"
          className="standalone-editor__properties"
        >
          <div className="standalone-editor__properties-heading">
            Widget properties
            <button
              disabled={!titleWidgetId}
              onClick={() =>
                titleWidgetId && dispatch(setSelectedWidgets([titleWidgetId]))
              }
              type="button"
            >
              Select title
            </button>
          </div>
          <Tabs
            className="standalone-editor__inspector-tabs"
            defaultValue="properties"
          >
            <TabsList aria-label="Widget inspector">
              <Tab data-testid="t--workbench-properties-tab" value="properties">
                Properties
              </Tab>
              <Tab data-testid="t--workbench-live-data-tab" value="live-data">
                Live data
              </Tab>
            </TabsList>
            <TabPanel
              className="standalone-editor__inspector-panel"
              forceMount
              value="properties"
            >
              <PropertyPane integrationMode />
            </TabPanel>
            <TabPanel
              className="standalone-editor__inspector-panel standalone-editor__inspector-panel--bindings"
              forceMount
              value="live-data"
            >
              <BindingEditor
                disabled={busy}
                documentEpoch={documentEpoch}
                getDocument={bindings.getDocument}
                marketplace={bindings.marketplace}
                onRemove={(bindingId) => {
                  bindings.onRemove(bindingId);
                  noteBindingChange(
                    "Removed live data binding. Save local draft to keep it.",
                  );
                }}
                onRemoveMany={(bindingIds) => {
                  bindings.onRemoveMany(bindingIds);
                  noteBindingChange(
                    "Removed invalid live data bindings. Save local draft to keep it.",
                  );
                }}
                onSave={(draft) => {
                  bindings.onSave(draft);
                  noteBindingChange(
                    "Updated live data binding. Save local draft to keep it.",
                  );
                }}
              />
            </TabPanel>
          </Tabs>
        </aside>
      </main>
      <IntegrationStatusBar
        blockedAppsmithRequests={blockedCount}
        hasUnsavedChanges={hasUnsavedChanges}
        revision={record?.revision ?? null}
        status={status}
        statusIsError={isError}
      />
    </div>
  );
}

export async function startStandalone(
  root: HTMLElement,
  marketplaceContext?: MarketplaceEditorContext,
) {
  const drafts = new IndexedDbDraftStore();
  const transientOverlay = new TransientWidgetOverlay();
  const componentRepository = marketplaceContext
    ? new ComponentMarketplaceRepository(marketplaceContext.marketplace)
    : null;
  const themeRepository = marketplaceContext
    ? new ThemeMarketplaceRepository(marketplaceContext.marketplace)
    : null;
  const scopeFor = (documentId: string): DraftScope => ({
    deploymentId: marketplaceContext?.deploymentId ?? window.location.origin,
    accountId: marketplaceContext?.accountId ?? "standalone-preview",
    documentId,
  });
  let document = cloneDocument(
    marketplaceContext?.document ?? exampleDashboardDocument,
  );
  let scope = scopeFor(document.documentId);
  let currentRecord: DraftRecord | null =
    marketplaceContext?.localDraft ?? null;
  let initialStatus = marketplaceContext
    ? marketplaceContext.itemId === null
      ? currentRecord
        ? `Local dashboard draft revision ${currentRecord.revision} loaded.`
        : "Independent local dashboard loaded. Save locally to keep it."
      : currentRecord
        ? `Marketplace item #${marketplaceContext.itemId}: local draft revision ${currentRecord.revision} loaded.`
        : `Marketplace item #${marketplaceContext.itemId} loaded. Save locally to create a private working copy.`
    : "Example fixture loaded. Changes are local to this browser.";
  let preferredDocumentId: string | null = null;

  if (!marketplaceContext) {
    try {
      preferredDocumentId = window.localStorage.getItem(
        ACTIVE_DOCUMENT_STORAGE_KEY,
      );
    } catch {
      // IndexedDB remains usable when localStorage is disabled.
    }

    try {
      const preferred = preferredDocumentId
        ? await drafts.load(scopeFor(preferredDocumentId))
        : null;
      const draft =
        preferred ??
        (await drafts.load(scopeFor(exampleDashboardDocument.documentId)));

      if (draft) {
        document = cloneDocument(draft.document);
        scope = scopeFor(document.documentId);
        currentRecord = draft;
        initialStatus = `Local draft revision ${draft.revision} loaded.`;

        if (draft.historyIssue) {
          initialStatus += ` History unavailable: ${draft.historyIssue}`;
        }
      }
    } catch (error) {
      initialStatus = `Local storage unavailable; editing in memory. ${String(error)}`;
    }
  }

  await editorInitializer();
  store.dispatch(widgetInitialisationSuccess());
  store.dispatch({
    type: ReduxActionTypes.FETCH_FEATURE_FLAGS_SUCCESS,
    payload: DEFAULT_FEATURE_FLAG_VALUE,
  });
  store.dispatch({
    type: ReduxActionTypes.FETCH_USER_DETAILS_SUCCESS,
    payload: DefaultCurrentUserDetails,
  });
  store.dispatch({
    type: ReduxActionTypes.FETCH_SELECTED_APP_THEME_SUCCESS,
    payload: themeForDocument(document),
  });
  store.dispatch({
    type: ReduxActionTypes.FETCH_APPLICATION_SUCCESS,
    payload: applicationForDocument(document),
  });
  store.dispatch({
    type: ReduxActionTypes.FETCH_PAGE_LIST_SUCCESS,
    payload: {
      pages: [
        {
          pageName: document.name,
          pageId: PAGE_ID,
          basePageId: PAGE_ID,
          isDefault: true,
          slug: "standalone",
        },
      ],
      applicationId: APPLICATION_ID,
      baseApplicationId: APPLICATION_ID,
    },
  });
  store.dispatch(setAppMode(APP_MODE.EDIT));
  store.dispatch({ type: ReduxActionTypes.SET_PROTECTED_MODE, payload: false });

  const canvas = await canvasForDocument(document);
  const initialTitleWidgetId = titleWidgetIdForCanvas(canvas);

  store.dispatch(initCanvasLayout(canvas));
  store.dispatch({
    type: ReduxActionTypes.UPDATE_CANVAS_LAYOUT,
    payload: {
      width: canvas.dsl.rightColumn ?? 1242,
      height: canvas.dsl.minHeight ?? 1200,
    },
  });
  store.dispatch({ type: ReduxActionTypes.INITIALIZE_EDITOR_SUCCESS });

  runSagaMiddleware([
    widgetOperationSagas,
    draggingCanvasSagas,
    standaloneSelectionSaga,
    evaluationSagaListeners,
  ]);
  // Allow the saga watchers to subscribe before the first evaluation action.
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  store.dispatch({ type: ReduxActionTypes.START_EVALUATION });
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  store.dispatch(fetchAllPageEntityCompletion([]));
  store.dispatch(setSelectedWidgets([initialTitleWidgetId ?? "0"]));

  let titleWidgetId = initialTitleWidgetId;
  let documentEpoch = 0;

  function result(
    message: string,
    persisted: boolean,
    isError = false,
  ): StandaloneResult {
    return {
      message,
      record: currentRecord,
      documentName: document.name,
      titleWidgetId,
      persisted,
      documentEpoch,
      isError,
    };
  }

  function workingDocumentSnapshot(): DashboardDocument {
    const widgets = store.getState().entities.canvasWidgets;
    const nested = nestDSL(widgets, "0");
    const nextDocument = cloneDocument(document);

    nextDocument.name = nextDocument.name.trim();
    nextDocument.layout.dsl = JSON.parse(JSON.stringify(nested));
    nextDocument.compatibility.widgetDslVersion =
      nextDocument.layout.dsl.version;
    // A copied group's origin is meaningful only while its root is on canvas.
    nextDocument.componentDependencies =
      nextDocument.componentDependencies.filter((dependency) =>
        Boolean(widgets[dependency.rootWidgetId]),
      );

    return nextDocument;
  }

  function currentWorkingDocument(): DashboardDocument {
    return parseDashboardDocument(workingDocumentSnapshot());
  }

  function updateBinding(draft: WidgetBindingDraft) {
    document = saveWidgetBinding(workingDocumentSnapshot(), draft);
  }

  function removeBinding(bindingId: string) {
    document = removeWidgetBinding(workingDocumentSnapshot(), bindingId);
  }

  function removeBindings(bindingIds: string[]) {
    document = removeWidgetBindings(workingDocumentSnapshot(), bindingIds);
  }

  function showDocument(
    nextDocument: DashboardDocument,
    nextCanvas: StandaloneCanvas,
  ) {
    transientOverlay.clear();
    documentEpoch += 1;
    document = cloneDocument(nextDocument);
    titleWidgetId = titleWidgetIdForCanvas(nextCanvas);
    store.dispatch({
      type: ReduxActionTypes.FETCH_SELECTED_APP_THEME_SUCCESS,
      payload: themeForDocument(document),
    });
    store.dispatch({
      type: ReduxActionTypes.FETCH_APPLICATION_SUCCESS,
      payload: applicationForDocument(document),
    });
    store.dispatch({
      type: ReduxActionTypes.FETCH_PAGE_LIST_SUCCESS,
      payload: {
        pages: [
          {
            pageName: document.name,
            pageId: PAGE_ID,
            basePageId: PAGE_ID,
            isDefault: true,
            slug: "standalone",
          },
        ],
        applicationId: APPLICATION_ID,
        baseApplicationId: APPLICATION_ID,
      },
    });
    store.dispatch(initCanvasLayout(nextCanvas));
    store.dispatch({
      type: ReduxActionTypes.UPDATE_CANVAS_LAYOUT,
      payload: {
        width: nextCanvas.dsl.rightColumn ?? 1242,
        height: nextCanvas.dsl.minHeight ?? 1200,
      },
    });
    store.dispatch(fetchAllPageEntityCompletion([]));
    store.dispatch(setSelectedWidgets([titleWidgetId ?? "0"]));
  }

  async function saveDraft(): Promise<StandaloneResult> {
    const nextDocument = currentWorkingDocument();

    // Preserve the current edit in memory even if IndexedDB rejects the write.
    document = nextDocument;

    try {
      // The account was resolved when this editor opened. Local saving stays
      // available when the marketplace connection later drops.
      currentRecord = await drafts.save(
        scope,
        nextDocument,
        currentRecord?.revision ?? null,
      );
      let activeDocumentWarning = "";

      if (!marketplaceContext) {
        try {
          window.localStorage.setItem(
            ACTIVE_DOCUMENT_STORAGE_KEY,
            document.documentId,
          );
        } catch {
          if (document.documentId !== exampleDashboardDocument.documentId) {
            activeDocumentWarning =
              " The imported document cannot be reopened automatically because browser preferences are unavailable.";
          }
        }
      }

      return result(
        `Saved locally as revision ${currentRecord.revision}.${activeDocumentWarning}`,
        true,
        Boolean(activeDocumentWarning),
      );
    } catch (error) {
      return result(
        `Local save failed: ${String(error)}. Changes remain in this tab; export JSON to keep them.`,
        false,
        true,
      );
    }
  }

  async function restoreRevision(
    historyRevision: number,
  ): Promise<StandaloneResult> {
    if (!currentRecord) throw new Error("No local draft revision is available");

    const snapshot = currentRecord.history.find(
      ({ revision }) => revision === historyRevision,
    );

    if (!snapshot)
      throw new Error(`Revision ${historyRevision} is unavailable`);

    // Check renderer compatibility before changing the stored current revision.
    const restoredCanvas = await canvasForDocument(snapshot.document);
    const restored = await drafts.restore(
      scope,
      historyRevision,
      currentRecord.revision,
    );

    currentRecord = restored;
    showDocument(restored.document, restoredCanvas);

    return result(
      `Restored revision ${historyRevision} as new local revision ${restored.revision}.`,
      true,
    );
  }

  async function importFile(file: File): Promise<StandaloneResult> {
    const importedDocument = cloneDocument(
      await importDashboardDocumentFile(file),
    );
    const importedCanvas = await canvasForDocument(importedDocument);
    const importedScope = scopeFor(importedDocument.documentId);
    let existing: DraftRecord | null = null;
    let storageWarning = "";

    try {
      existing = await drafts.load(importedScope);
    } catch (error) {
      storageWarning = ` Local history could not be read: ${String(error)}.`;
    }

    scope = importedScope;
    currentRecord = existing;
    showDocument(importedDocument, importedCanvas);

    return result(
      `Imported ${file.name} into this tab. Save local draft to persist it.${storageWarning}`,
      false,
      Boolean(storageWarning),
    );
  }

  function exportFile(): string {
    const workingDocument = currentWorkingDocument();
    const json = serializeDashboardDocument(workingDocument);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const name =
      workingDocument.name
        .trim()
        .replace(/[^a-z0-9_-]+/gi, "-")
        .replace(/^-+|-+$/g, "") || "dashboard";
    const anchor = window.document.createElement("a");

    anchor.href = url;
    anchor.download = `${name}.json`;
    window.document.body.appendChild(anchor);

    try {
      anchor.click();
    } finally {
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    return `Exported ${anchor.download} with current edits.`;
  }

  async function publishNew(description: string, thumbnail: File) {
    if (!marketplaceContext) throw new Error("Marketplace is unavailable");

    const item = await marketplaceContext.workspace.publishNewDashboard({
      document: currentWorkingDocument(),
      description,
      thumbnail,
    });

    return `Uploaded a new dashboard item #${item.id}. Local draft revision is unchanged.`;
  }

  async function replacePublished() {
    if (!marketplaceContext || marketplaceContext.itemId === null) {
      throw new Error("No shared marketplace item is selected");
    }

    await marketplaceContext.workspace.replacePublishedDashboard(
      marketplaceContext.itemId,
      { document: currentWorkingDocument() },
    );

    return `Replaced marketplace item #${marketplaceContext.itemId} with the current snapshot. Local draft revision is unchanged.`;
  }

  async function installComponent(itemId: number): Promise<string> {
    if (!componentRepository) throw new Error("Marketplace is unavailable");

    const installed = await componentRepository.installComponent(
      itemId,
      currentWorkingDocument(),
    );
    const nextCanvas = await canvasForDocument(installed.document);

    showDocument(installed.document, nextCanvas);

    const review = installed.unresolvedDynamicPaths.length
      ? ` Review ${installed.unresolvedDynamicPaths.length} dynamic expression path(s) before uploading.`
      : "";

    return `Installed ${installed.metadata.name} into this tab. Save local draft to keep it.${review}`;
  }

  async function applyTheme(itemId: number): Promise<string> {
    if (!themeRepository) throw new Error("Marketplace is unavailable");

    const downloaded = await themeRepository.downloadTheme(itemId);
    const nextDocument = applyThemeAsset(
      currentWorkingDocument(),
      downloaded.asset,
    );
    const nextCanvas = await canvasForDocument(nextDocument);

    showDocument(nextDocument, nextCanvas);

    return `Applied ${downloaded.metadata.name} in this tab. Save local draft to keep it.`;
  }

  async function publishNewComponent(
    widgetId: string,
    description: string,
    thumbnail: File,
  ): Promise<string> {
    if (!componentRepository) throw new Error("Marketplace is unavailable");

    const working = currentWorkingDocument();
    const group = componentGroupsForDocument(working).find(
      (candidate) => candidate.widgetId === widgetId,
    );

    if (!group) throw new Error("Choose a widget group to upload");

    const component = createComponentFromDashboard(working, widgetId, {
      componentId: window.crypto.randomUUID(),
      name: group.name,
    });
    const item = await componentRepository.publishNewComponent({
      component,
      description,
      thumbnail,
    });

    return `Uploaded a new component item #${item.id}. Local draft revision is unchanged.`;
  }

  async function replaceComponent(
    itemId: number,
    widgetId: string,
  ): Promise<string> {
    if (!componentRepository) throw new Error("Marketplace is unavailable");

    const existing = await componentRepository.downloadComponent(itemId);
    const component = createComponentFromDashboard(
      currentWorkingDocument(),
      widgetId,
      {
        componentId: existing.component.componentId,
        name: existing.component.name,
      },
    );

    await componentRepository.replacePublishedComponent(itemId, { component });

    return `Replaced marketplace component #${itemId}. Local draft revision is unchanged.`;
  }

  async function publishNewTheme(
    description: string,
    thumbnail: File,
  ): Promise<string> {
    if (!themeRepository) throw new Error("Marketplace is unavailable");

    const item = await themeRepository.publishNewTheme({
      asset: themeAssetFromDocument(currentWorkingDocument()),
      description,
      thumbnail,
    });

    return `Uploaded a new theme item #${item.id}. Local draft revision is unchanged.`;
  }

  async function replaceTheme(itemId: number): Promise<string> {
    if (!themeRepository) throw new Error("Marketplace is unavailable");

    await themeRepository.replacePublishedTheme(itemId, {
      asset: themeAssetFromDocument(currentWorkingDocument()),
    });

    return `Replaced marketplace theme #${itemId}. Local draft revision is unchanged.`;
  }

  const assets: MarketplaceAssetPanelProps | undefined = marketplaceContext
    ? {
        loadComponents: async (query, signal) => {
          if (!componentRepository)
            throw new Error("Marketplace is unavailable");

          return componentRepository.browseComponents(query, signal);
        },
        loadThemes: async (query, signal) => {
          if (!themeRepository) throw new Error("Marketplace is unavailable");

          return themeRepository.listThemes(query, signal);
        },
        listSourceGroups: () =>
          componentGroupsForDocument(currentWorkingDocument()),
        installComponent,
        applyTheme,
        publishNewComponent,
        replaceComponent,
        publishNewTheme,
        replaceTheme,
      }
    : undefined;

  ReactDOM.render(
    <Provider store={store}>
      <Router history={history}>
        <LayersContext.Provider value={Layers}>
          <ThemeProvider theme={lightTheme}>
            <GlobalStyles />
            <TransientWidgetOverlayProvider overlay={transientOverlay}>
              <EditorContextProvider renderMode={RenderModes.CANVAS}>
                <StandaloneShell
                  assets={assets}
                  bindings={{
                    getDocument: () => cloneDocument(document),
                    onSave: updateBinding,
                    onRemove: removeBinding,
                    onRemoveMany: removeBindings,
                    marketplace: marketplaceContext?.marketplace,
                  }}
                  initialDocumentEpoch={documentEpoch}
                  initialDocumentName={document.name}
                  initialRecord={currentRecord}
                  initialStatus={initialStatus}
                  initialTitleWidgetId={initialTitleWidgetId}
                  marketplace={
                    marketplaceContext
                      ? {
                          itemId: marketplaceContext.itemId,
                          onPublishNew: publishNew,
                          onReplace:
                            marketplaceContext.itemId === null
                              ? undefined
                              : replacePublished,
                        }
                      : undefined
                  }
                  onExport={exportFile}
                  onImport={importFile}
                  onRename={(name) => {
                    document.name = name;
                  }}
                  onRestore={restoreRevision}
                  onSave={saveDraft}
                  run={
                    marketplaceContext
                      ? {
                          marketplace: marketplaceContext.marketplace,
                          environment: marketplaceContext.runEnvironment,
                          getDocument: currentWorkingDocument,
                          onUpdates: (updates) =>
                            transientOverlay.apply(updates),
                          onClear: () => transientOverlay.clear(),
                        }
                      : undefined
                  }
                />
              </EditorContextProvider>
            </TransientWidgetOverlayProvider>
          </ThemeProvider>
        </LayersContext.Provider>
      </Router>
    </Provider>,
    root,
  );
}

/** Mount the published marketplace snapshot without opening local drafts or edit sagas. */
export async function renderPublishedViewer(
  root: HTMLElement,
  context: PublishedViewerContext,
): Promise<void> {
  const sourceDocument = parseDashboardDocument(context.document);
  const transientOverlay = new TransientWidgetOverlay();

  await editorInitializer();
  store.dispatch(widgetInitialisationSuccess());
  store.dispatch({
    type: ReduxActionTypes.FETCH_FEATURE_FLAGS_SUCCESS,
    payload: DEFAULT_FEATURE_FLAG_VALUE,
  });
  store.dispatch({
    type: ReduxActionTypes.FETCH_USER_DETAILS_SUCCESS,
    payload: DefaultCurrentUserDetails,
  });
  store.dispatch({
    type: ReduxActionTypes.FETCH_SELECTED_APP_THEME_SUCCESS,
    payload: themeForDocument(sourceDocument),
  });
  store.dispatch({
    type: ReduxActionTypes.FETCH_APPLICATION_SUCCESS,
    payload: applicationForDocument(sourceDocument),
  });
  store.dispatch({
    type: ReduxActionTypes.FETCH_PAGE_LIST_SUCCESS,
    payload: {
      pages: [
        {
          pageName: sourceDocument.name,
          pageId: PAGE_ID,
          basePageId: PAGE_ID,
          isDefault: true,
          slug: "standalone",
        },
      ],
      applicationId: APPLICATION_ID,
      baseApplicationId: APPLICATION_ID,
    },
  });
  // The stock published evaluator waits for Appsmith's JS-library API.
  // Initialize its browser worker through the local editor path, then switch
  // to the read-only renderer before mounting any UI.
  store.dispatch(setAppMode(APP_MODE.EDIT));

  const canvas = await canvasForDocument(sourceDocument);
  const renderedDocument = cloneDocument(sourceDocument);

  renderedDocument.layout.dsl = JSON.parse(JSON.stringify(canvas.dsl));
  renderedDocument.compatibility.widgetDslVersion =
    renderedDocument.layout.dsl.version;
  const document = parseDashboardDocument(renderedDocument);

  store.dispatch(initCanvasLayout(canvas));
  store.dispatch({
    type: ReduxActionTypes.UPDATE_CANVAS_LAYOUT,
    payload: {
      width: canvas.dsl.rightColumn ?? 1242,
      height: canvas.dsl.minHeight ?? 1200,
    },
  });
  store.dispatch({ type: ReduxActionTypes.INITIALIZE_EDITOR_SUCCESS });

  runSagaMiddleware([evaluationSagaListeners]);
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  store.dispatch({ type: ReduxActionTypes.START_EVALUATION });
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  store.dispatch(fetchAllPageEntityCompletion([]));
  store.dispatch(setAppMode(APP_MODE.PUBLISHED));

  ReactDOM.render(
    <Provider store={store}>
      <Router history={history}>
        <LayersContext.Provider value={Layers}>
          <ThemeProvider theme={lightTheme}>
            <GlobalStyles />
            <TransientWidgetOverlayProvider overlay={transientOverlay}>
              <ViewerShell
                itemId={context.itemId}
                run={{
                  marketplace: context.marketplace,
                  environment: context.runEnvironment,
                  getDocument: () => document,
                  onUpdates: (updates) => transientOverlay.apply(updates),
                  onClear: () => transientOverlay.clear(),
                }}
                title={document.name}
              />
            </TransientWidgetOverlayProvider>
          </ThemeProvider>
        </LayersContext.Provider>
      </Router>
    </Provider>,
    root,
  );
}
