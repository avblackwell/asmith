import React, { useEffect, useState } from "react";
import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";
import { Provider, useDispatch, useSelector } from "react-redux";
import type { AppsmithWidgetDsl, InlineDashboardTheme } from "../../document";
import {
  resolveThemeBinding,
  resolveThemeBindingsInWidget,
} from "../../features/theme-editor/resolveThemeBinding";
import {
  selectCanvasWidgets,
  selectChildWidgetIds,
  selectHydratedWidgetById,
  selectMainCanvas,
  selectSelectedWidgetId,
  selectUnresolvedDynamicPaths,
  selectWidget,
  selectWidgetMetaProps,
  batchSetWidgetMetaProperties,
} from "../compat-store";
import {
  fixedCanvasChildFrame,
  fixedInnerCanvasFrame,
  fixedRootCanvasMetrics,
  normalizedInnerCanvasBottomRow,
  type FixedGeometryWidget,
  type FixedPixelFrame,
  type FixedRootCanvasMetrics,
} from "../appsmith-fixed-geometry";
import type {
  CompatCanvasWidget,
  ReadOnlyCompatDispatch,
  ReadOnlyCompatState,
  ReadOnlyCompatStore,
} from "../compat-store";
import { BasicChartWidget } from "../native-widgets/chart";
import type { ChartTheme } from "../native-widgets/chart";
import { NativeProgressView } from "../native-widgets/progress";
import { LegacyProgressBarView, LegacyCircularProgressView } from "../native-widgets/legacy-progress";
import { NativeFormWidgetView, isFormWidget } from "../native-widgets/form-controls";
import { NativeChoiceWidgetView, isChoiceWidget } from "../native-widgets/choice-controls";
import { NativeSpecialInputView, isSpecialInputWidget } from "../native-widgets/special-inputs";
import { NativeIframeView, NativeMapView, NativeMapChartView } from "../native-widgets/map-embed";
import { NativeJsonFormView } from "../native-widgets/rich-json-form/NativeJsonFormView";
import { NativeMenuTreeView, isMenuTreeWidget } from "../native-widgets/menu-tree";
import { NativeCaptureUploadView, isCaptureUploadWidget } from "../native-widgets/capture-upload";
import { NativeCustomWidgetView } from "../native-widgets/custom-widget";
import { NativeTableView } from "../native-widgets/table";
import { NativeButtonControlsView } from "../native-widgets/button-controls";
import { NativeFormView, NativeCardView,
  cardChromeHeightInPx } from "../native-widgets/form-card";
import {
  NativeRateView, NativeNumberSliderView, NativeRangeSliderView,
  NativeCategorySliderView,
} from "../native-widgets/sliders";
import type { SliderMark, CategoryOption } from "../native-widgets/sliders/sliderModel";

const NativeRichTextEditorView = React.lazy(async () => ({
  default: (await import("../native-widgets/rich-json-form/NativeRichTextEditorView"))
    .NativeRichTextEditorView,
}));
import {
  NativeAudioView,
  NativeDocumentViewerView,
  NativeVideoView,
} from "../native-widgets/media";
import { NativeListV2View, NativeListV2Pagination } from "../native-widgets/list-v2/NativeListV2View";
import { materializeStaticListV2Rows } from "../native-widgets/list-v2/materializeStaticListV2Rows";
import { listV2PageSize, shouldPaginateListV2 } from "../native-widgets/list-v2/listV2Model";
import { NativeTabsView, tabsCanvasHeightOffsetRows } from "../native-widgets/tabs";
import { NativeStatboxIconButtonView } from "../native-widgets/statbox";
import {
  NativeModalButtonView,
  NativeModalIconButtonView,
  NativeModalView,
  modalIsVisible,
  modalRenderMetrics,
  type ModalCloseReason,
} from "../native-widgets/modal";
import {
  applyTransientWidgetProps,
  isSupportedDisplayTarget,
  TransientWidgetOverlay,
} from "../live-bindings";
import type { TransientWidgetUpdate } from "../live-bindings";
import {
  NativeContainerView,
  NativeTextView,
  OverflowTypes,
} from "../native-widgets/text-container";
import { NativeDividerView, NativeImageView, safeImageSource } from "../native-widgets/static-display";
import { AppsmithAutoHeightContainer } from "../appsmith-fixed-autoheight";
import {
  FixedLiveResizeWrapper,
  type FixedLiveResizePreview,
} from "../appsmith-fixed-drag/FixedLiveResizeWrapper";
import {
  AppsmithResizeHandles,
  AppsmithWidgetName,
  type AppsmithWidgetChromeProps,
} from "../appsmith-fixed-drag/WidgetChrome";
import { sanitizeTabOrder } from "../appsmith-fixed-selection/tabOrder";
import "./readOnlyCanvas.css";

export interface NativeReadOnlyCanvasProps {
  store: ReadOnlyCompatStore;
  rootWidgetId: string;
  selectedWidgetId?: string | null;
  onSelect?: (widgetId: string, modifier?: "toggle" | "range") => void;
  theme: ChartTheme;
  overlay?: TransientWidgetOverlay;
  interactiveSelection?: boolean;
  draggableWidgets?: boolean;
  /** EditorContext.updateWidgetAutoHeight adapter; never used by the viewer. */
  onWidgetHeightChange?: (widgetId: string, paddedHeightPx: number) => void;
  /** Retry a suppressed measurement after the mounted editor receives a new payload. */
  measurementRetryEpoch?: number;
  /** Appsmith's Alt+T editor overlay. Hidden for the viewer. */
  showTabOrder?: boolean;
  activeTabCanvasIds?: Readonly<Record<string, string>>;
  onTabChange?: (tabsWidgetId: string, tabCanvasWidgetId: string) => void;
  /** Appsmith's transient Modal isVisible meta; never serialized to the DSL. */
  openModalIds?: Readonly<Record<string, boolean>>;
  onModalClose?: (modalWidgetId: string, reason: ModalCloseReason) => void;
  onModalResize?: (modalWidgetId: string, canvasWidgetId: string,
    dimensions: { width: number; height: number }) => void;
  onModalResizeStart?: (modalWidgetId: string) => void;
  onModalResizeEnd?: (modalWidgetId: string) => void;
  /** Appsmith FixedLayoutResizable's temporary inner-wrapper rectangle. Editor only. */
  liveResize?: FixedLiveResizePreview;
  /** Local editor state supplied to Appsmith's WidgetNameLayer and resizer. */
  fixedWidgetChrome?: Readonly<Record<string, AppsmithWidgetChromeProps>>;
  /** FixedLayoutEditorCanvas mounts one drag arena before each canvas's children. */
  renderFixedCanvasArena?: (
    canvasId: string,
    frame: { width: number; height: number },
    widget: CompatCanvasWidget,
  ) => React.ReactNode;
  /** DropTargetComponent.rowRef while a nested Fixed gesture extends its canvas. */
  temporaryCanvasRows?: Readonly<Record<string, number>>;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveValue(value: unknown, fallback: number): number {
  const number = numberValue(value, fallback);
  return number > 0 ? number : fallback;
}

function textAlign(value: unknown): "LEFT" | "CENTER" | "RIGHT" | "JUSTIFY" {
  return value === "CENTER" || value === "RIGHT" || value === "JUSTIFY"
    ? value
    : "LEFT";
}

function overflow(value: unknown): OverflowTypes {
  return value === OverflowTypes.SCROLL || value === OverflowTypes.TRUNCATE
    ? value
    : OverflowTypes.NONE;
}

function hasExpression(value: unknown): boolean {
  return typeof value === "string" && /\{\{[\s\S]*?\}\}/.test(value);
}

function themePropertiesFromCanvasTheme(theme: ChartTheme): InlineDashboardTheme["properties"] {
  return {
    colors: {
      primaryColor: theme.primaryColor ?? "#03B365",
      backgroundColor: theme.backgroundColor ?? "#ffffff",
    },
    borderRadius: { appBorderRadius: theme.appBorderRadius ?? "0px" },
    boxShadow: { appBoxShadow: theme.appBoxShadow ?? "none" },
    fontFamily: { appFont: theme.fontFamily ?? "Inter" },
  };
}

function useTransientUpdates(
  overlay: TransientWidgetOverlay | undefined,
  widgetId: string,
): readonly TransientWidgetUpdate[] {
  const [updates, setUpdates] = useState<readonly TransientWidgetUpdate[]>(
    () => overlay?.getWidgetUpdates(widgetId) ?? [],
  );

  useEffect(() => {
    if (!overlay) {
      setUpdates([]);
      return;
    }

    const refresh = () => setUpdates(overlay.getWidgetUpdates(widgetId));
    const unsubscribe = overlay.subscribe(widgetId, refresh);

    refresh();
    return unsubscribe;
  }, [overlay, widgetId]);

  return updates;
}

/** Rebuild one List template from the compat store's flattened Appsmith DSL. */
function authoredSubtreeFromFlat(
  widgetId: string,
  widgets: Record<string, CompatCanvasWidget>,
): AppsmithWidgetDsl | null {
  const flat = widgets[widgetId];
  if (!flat) return null;
  const children = (flat.children ?? []).map((childId) =>
    authoredSubtreeFromFlat(childId, widgets)).filter(
      (child): child is AppsmithWidgetDsl => child !== null);
  return { ...flat, children } as AppsmithWidgetDsl;
}

function widgetGeometry(
  widget: AppsmithWidgetDsl,
  root: boolean,
  parentFrame: FixedPixelFrame | undefined,
  parentType: string | undefined,
  parentIsRoot: boolean,
  parentNoPad: boolean,
  rootMetrics: FixedRootCanvasMetrics,
  parentScrolls: boolean,
  parentTabsOffsetRows: number,
  sourceWidgets: Record<string, CompatCanvasWidget>,
): { frame: FixedPixelFrame; style: CSSProperties } {
  let frame: FixedPixelFrame;
  if (root) {
    frame = { left: 0, top: 0, width: rootMetrics.widthPx,
      height: rootMetrics.dropTargetHeightPx };
  } else if (widget.type === "CANVAS_WIDGET" && parentFrame &&
    (parentType === "CONTAINER_WIDGET" || parentType === "STATBOX_WIDGET" ||
      parentType === "FORM_WIDGET")) {
    frame = fixedInnerCanvasFrame(parentFrame,
      parentScrolls ? Math.max(widget.bottomRow,
        normalizedInnerCanvasBottomRow(
          sourceWidgets as unknown as Record<string, FixedGeometryWidget>, widget.widgetId,
        )) : undefined,
      parentScrolls);
  } else if (widget.type === "CANVAS_WIDGET" && parentFrame &&
    parentType === "CARD_WIDGET") {
    const parent = widget.parentId ? sourceWidgets[widget.parentId] : undefined;
    const mediaLeft = parent?.mediaPosition === "LEFT" && Boolean(parent.mediaImage);
    const bodyFrame = {
      left: 0, top: 0,
      width: Math.max(1, parentFrame.width - (mediaLeft ? 120 : 0)),
      height: Math.max(1, parentFrame.height - cardChromeHeightInPx(parent ?? {})),
    };
    frame = fixedInnerCanvasFrame(bodyFrame,
      parentScrolls ? Math.max(widget.bottomRow,
        normalizedInnerCanvasBottomRow(
          sourceWidgets as unknown as Record<string, FixedGeometryWidget>, widget.widgetId,
        )) : undefined,
      parentScrolls);
  } else if (widget.type === "CANVAS_WIDGET" && parentFrame &&
    parentType === "TABS_WIDGET") {
    const bodyHeight = Math.max(1, parentFrame.height - parentTabsOffsetRows * 10);
    const contentHeight = Math.max(bodyHeight, ...((sourceWidgets[widget.widgetId]?.children ?? [])
      .map((id) => (sourceWidgets[id]?.bottomRow ?? 0) * 10)));
    frame = { left: 0, top: 0, width: parentFrame.width,
      height: parentScrolls ? contentHeight : bodyHeight };
  } else if (widget.type === "CANVAS_WIDGET" && parentFrame &&
    parentType === "MODAL_WIDGET") {
    frame = { left: 0, top: 0, width: parentFrame.width,
      height: Math.max(parentFrame.height, ...((sourceWidgets[widget.widgetId]?.children ?? [])
        .map((id) => (sourceWidgets[id]?.bottomRow ?? 0) * 10))) };
  } else if (parentFrame && parentType === "CANVAS_WIDGET") {
    frame = fixedCanvasChildFrame(widget, parentFrame.width, {
      isMainCanvas: parentIsRoot, noPad: parentNoPad,
    });
  } else {
    // Other Appsmith canvas-owning widgets are not in the current palette.
    const columnSpace = positiveValue(widget.parentColumnSpace, 19.4);
    const rowSpace = positiveValue(widget.parentRowSpace, 10);
    frame = { left: widget.leftColumn * columnSpace,
      top: widget.topRow * rowSpace,
      width: (widget.rightColumn - widget.leftColumn) * columnSpace,
      height: (widget.bottomRow - widget.topRow) * rowSpace };
  }
  // Appsmith's FixedLayoutEditorCanvas renders CANVAS_WIDGET through the
  // in-flow DropTargetComponent (position: relative, explicit snapped height).
  // Keeping its child canvas absolute removes that height from an Auto Height
  // Container's content and collapses the resize wrapper around it.
  const inFlowCanvas = root || widget.type === "CANVAS_WIDGET";
  return {
    frame,
    style: {
      position: inFlowCanvas ? "relative" : "absolute",
      left: inFlowCanvas ? undefined : frame.left,
      top: inFlowCanvas ? undefined : frame.top,
      width: Math.max(1, frame.width),
      height: Math.max(1, frame.height),
    },
  };
}

function WidgetTree({
  widgetId,
  runtimeWidget,
  rootWidgetId,
  onSelect,
  theme,
  overlay,
  interactiveSelection,
  draggableWidgets,
  onWidgetHeightChange,
  measurementRetryEpoch,
  showTabOrder,
  activeTabCanvasIds,
  onTabChange,
  openModalIds,
  onModalClose,
  onModalResize,
  onModalResizeStart,
  onModalResizeEnd,
  liveResize,
  fixedWidgetChrome,
  renderFixedCanvasArena,
  temporaryCanvasRows,
  mode,
  parentFrame,
  parentType,
  parentIsRoot,
  parentNoPad,
  parentScrolls,
  parentTabsOffsetRows,
  rootMetrics,
}: {
  widgetId: string;
  /** A generated List row: projected for this render only, absent from Redux and the DSL. */
  runtimeWidget?: AppsmithWidgetDsl;
  rootWidgetId: string;
  onSelect?: (widgetId: string, modifier?: "toggle" | "range") => void;
  theme: ChartTheme;
  overlay?: TransientWidgetOverlay;
  interactiveSelection: boolean;
  draggableWidgets: boolean;
  onWidgetHeightChange?: (widgetId: string, paddedHeightPx: number) => void;
  measurementRetryEpoch?: number;
  showTabOrder?: boolean;
  activeTabCanvasIds?: Readonly<Record<string, string>>;
  onTabChange?: (tabsWidgetId: string, tabCanvasWidgetId: string) => void;
  openModalIds?: Readonly<Record<string, boolean>>;
  onModalClose?: (modalWidgetId: string, reason: ModalCloseReason) => void;
  onModalResize?: (modalWidgetId: string, canvasWidgetId: string,
    dimensions: { width: number; height: number }) => void;
  onModalResizeStart?: (modalWidgetId: string) => void;
  onModalResizeEnd?: (modalWidgetId: string) => void;
  liveResize?: FixedLiveResizePreview;
  fixedWidgetChrome?: NativeReadOnlyCanvasProps["fixedWidgetChrome"];
  renderFixedCanvasArena?: NativeReadOnlyCanvasProps["renderFixedCanvasArena"];
  temporaryCanvasRows?: NativeReadOnlyCanvasProps["temporaryCanvasRows"];
  mode: "editor" | "viewer";
  parentFrame?: FixedPixelFrame;
  parentType?: string;
  parentIsRoot: boolean;
  parentNoPad: boolean;
  parentScrolls: boolean;
  parentTabsOffsetRows: number;
  rootMetrics?: FixedRootCanvasMetrics;
}): React.ReactElement | null {
  const dispatch = useDispatch<ReadOnlyCompatDispatch>();
  const storedWidget = useSelector((state: ReadOnlyCompatState) =>
    selectHydratedWidgetById(state, widgetId),
  );
  const storedChildIds = useSelector((state: ReadOnlyCompatState) =>
    selectChildWidgetIds(state, widgetId),
  );
  const [listPageNo, setListPageNo] = useState(1);
  const selectedId = useSelector(selectSelectedWidgetId);
  const metaProps = useSelector((state: ReadOnlyCompatState) =>
    selectWidgetMetaProps(state, widgetId),
  );
  const unresolvedDynamicPaths = useSelector((state: ReadOnlyCompatState) =>
    selectUnresolvedDynamicPaths(state, widgetId),
  );
  const updates = useTransientUpdates(overlay, widgetId);
  const sourceWidgets = useSelector(selectCanvasWidgets);
  const mainCanvas = useSelector(selectMainCanvas);

  const hydrated = runtimeWidget ?? storedWidget;
  const childIds = runtimeWidget
    ? (runtimeWidget.children ?? []).map((child) => child.widgetId)
    : storedChildIds;
  if (!hydrated) return null;
  const selectedWidgetAncestry: string[] = [];
  let ancestor = selectedId ? sourceWidgets[selectedId] : undefined;
  while (ancestor) {
    selectedWidgetAncestry.push(ancestor.widgetId);
    ancestor = ancestor.parentId ? sourceWidgets[ancestor.parentId] : undefined;
  }
  const editorModalAncestry = mode === "editor" ? selectedWidgetAncestry : undefined;
  const showModal = hydrated.type === "MODAL_WIDGET" && modalIsVisible(
    hydrated.widgetId,
    openModalIds?.[hydrated.widgetId] ?? hydrated.isVisible === true,
    editorModalAncestry,
  );
  // withWidgetProps keeps ordinary hidden widgets on the editing canvas so
  // their selection/resizer layer can still be used. View mode collapses them.
  if (hydrated.isVisible === false && !showModal &&
    (mode === "viewer" || hydrated.detachFromLayout === true &&
      selectedId !== widgetId)) return null;

  const displayUpdates = updates.filter((update) =>
    isSupportedDisplayTarget(hydrated.type, update.propertyPath),
  );
  const rawWidget = applyTransientWidgetProps(
    hydrated as unknown as AppsmithWidgetDsl,
    displayUpdates,
  );
  const themeProperties = themePropertiesFromCanvasTheme(theme);
  const widget = resolveThemeBindingsInWidget(rawWidget, themeProperties);
  const dynamicPaths = unresolvedDynamicPaths.filter((path) => {
    const rawValue = (rawWidget as Record<string, unknown>)[path];
    return resolveThemeBinding(rawValue, themeProperties) === rawValue;
  });
  const overlayPaths = new Set(displayUpdates.map((update) => update.propertyPath));
  const isRoot = widget.widgetId === rootWidgetId;
  const isCanvas = widget.type === "CANVAS_WIDGET";
  // Appsmith's isCanvas widget config also covers canvas-owning containers.
  // Their height is driven by their child canvas, not by this DOM wrapper.
  const isCanvasOwner = widget.type === "CONTAINER_WIDGET" ||
    widget.type === "STATBOX_WIDGET" || widget.type === "TABS_WIDGET" ||
    widget.type === "FORM_WIDGET" || widget.type === "CARD_WIDGET" ||
    widget.type === "MODAL_WIDGET";
  const resolvedRootMetrics = rootMetrics ?? fixedRootCanvasMetrics(
    sourceWidgets as unknown as Record<string, FixedGeometryWidget>,
    rootWidgetId, mainCanvas.width, mainCanvas.height, mode,
  );
  const { frame: authoredFrame, style: authoredStyle } = widgetGeometry(
    widget, isRoot, parentFrame, parentType, parentIsRoot, parentNoPad,
    resolvedRootMetrics, parentScrolls, parentTabsOffsetRows, sourceWidgets,
  );
  const temporaryHeight = mode === "editor" && isCanvas && !isRoot
    ? (temporaryCanvasRows?.[widget.widgetId] ?? 0) * 10 : 0;
  const frame = temporaryHeight > authoredFrame.height
    ? { ...authoredFrame, height: temporaryHeight } : authoredFrame;
  const style = temporaryHeight > authoredFrame.height
    ? { ...authoredStyle, height: temporaryHeight } : authoredStyle;
  const resizePreview = mode === "editor" && !runtimeWidget &&
    liveResize?.widgetId === widget.widgetId ? liveResize : undefined;
  const widgetChrome = mode === "editor" && !runtimeWidget
    ? fixedWidgetChrome?.[widget.widgetId] : undefined;
  // FixedLayoutResizable animates the inner wrapper; PositionedContainer keeps
  // the authored position until WidgetOperations.RESIZE commits. Children of a
  // canvas-owning widget use the live dimensions of that actual wrapper.
  const contentFrame = resizePreview
    ? { ...frame, width: resizePreview.width, height: resizePreview.height }
    : frame;
  const width = Math.max(1, contentFrame.width);
  const height = Math.max(1, contentFrame.height);
  // FixedLayoutEditorCanvas and FixedLayoutViewerCanvas render fixed children
  // by topRow so their stacking order follows their visual row position.
  const runtimeChildren = runtimeWidget?.children ?? [];
  const renderedChildIds = isCanvas ? [...childIds].sort((left, right) =>
    (runtimeChildren.find((child) => child.widgetId === left)?.topRow ??
      sourceWidgets[left]?.topRow ?? 0) -
    (runtimeChildren.find((child) => child.widgetId === right)?.topRow ??
      sourceWidgets[right]?.topRow ?? 0)) : childIds;
  const modalMetrics = widget.type === "MODAL_WIDGET" ? modalRenderMetrics({
    requestedWidthPx: numberValue(widget.width, 456),
    requestedHeightPx: numberValue(widget.height, 240),
    mainCanvasWidthPx: mainCanvas.width,
    shouldScrollContents: widget.shouldScrollContents === true,
  }) : null;
  const children = renderedChildIds.map((childId) => (
    <WidgetTree
      key={childId}
      onSelect={runtimeWidget ? undefined : onSelect}
      overlay={runtimeWidget ? undefined : overlay}
      interactiveSelection={runtimeWidget ? false : interactiveSelection}
      draggableWidgets={runtimeWidget ? false : draggableWidgets}
      onWidgetHeightChange={onWidgetHeightChange}
      measurementRetryEpoch={measurementRetryEpoch}
      showTabOrder={runtimeWidget ? false : showTabOrder}
      activeTabCanvasIds={activeTabCanvasIds}
      onTabChange={onTabChange}
      openModalIds={openModalIds}
      onModalClose={onModalClose}
      onModalResize={onModalResize}
      onModalResizeStart={onModalResizeStart}
      onModalResizeEnd={onModalResizeEnd}
      liveResize={runtimeWidget ? undefined : liveResize}
      fixedWidgetChrome={runtimeWidget ? undefined : fixedWidgetChrome}
      renderFixedCanvasArena={runtimeWidget ? undefined : renderFixedCanvasArena}
      temporaryCanvasRows={runtimeWidget ? undefined : temporaryCanvasRows}
      mode={runtimeWidget ? "viewer" : mode}
      parentFrame={modalMetrics ? { left: 0, top: 0,
        width: modalMetrics.childCanvasWidthPx,
        height: modalMetrics.childCanvasMinHeightPx } : contentFrame}
      parentType={widget.type}
      parentIsRoot={isRoot}
      parentNoPad={widget.noPad === true}
      parentScrolls={widget.shouldScrollContents === true &&
        widget.dynamicHeight !== "AUTO_HEIGHT"}
      parentTabsOffsetRows={widget.type === "TABS_WIDGET"
        ? tabsCanvasHeightOffsetRows(widget.borderWidth as string | number | undefined,
          widget.shouldShowTabs !== false) : 0}
      rootMetrics={resolvedRootMetrics}
      rootWidgetId={rootWidgetId}
      theme={theme}
      widgetId={childId}
      runtimeWidget={runtimeChildren.find((child) => child.widgetId === childId)}
    />
  ));

  function choose(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
    dispatch(selectWidget(widget.widgetId));
    onSelect?.(widget.widgetId, event.shiftKey ? "range" :
      event.ctrlKey || event.metaKey ? "toggle" : undefined);
  }

  function chooseWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    dispatch(selectWidget(widget.widgetId));
    onSelect?.(widget.widgetId, event.shiftKey ? "range" :
      event.ctrlKey || event.metaKey ? "toggle" : undefined);
  }

  let content: React.ReactNode;

  if (widget.type === "CANVAS_WIDGET") {
    content = <>
      {mode === "editor" && !runtimeWidget && renderFixedCanvasArena?.(
        widget.widgetId,
        { width, height },
        widget as CompatCanvasWidget,
      )}
      {children}
    </>;
  } else if (widget.type === "LIST_WIDGET_V2") {
    const template = authoredSubtreeFromFlat(widget.widgetId, sourceWidgets);
    const listDsl: AppsmithWidgetDsl | null = template
      ? { ...template, ...widget, children: template.children } as AppsmithWidgetDsl : null;
    const itemContainer = listDsl?.children?.[0]?.children?.find((child) =>
      child.widgetId === listDsl.mainContainerId) ??
      listDsl?.children?.[0]?.children?.find((child) => child.isListItemContainer === true);
    const templateHeight = itemContainer
      ? (itemContainer.bottomRow - itemContainer.topRow) * 10 : 0;
    const itemCount = Array.isArray(widget.listData) ? widget.listData.length : 0;
    const pageSize = templateHeight > 0 ? listV2PageSize({
      componentHeight: height,
      templateHeight,
      itemSpacing: numberValue(widget.itemSpacing, 8),
      itemCount,
    }) : 0;
    const pageCount = pageSize > 0 ? Math.ceil(itemCount / pageSize) : 0;
    const currentPage = Math.max(1, Math.min(listPageNo, pageCount || 1));
    const projection = pageSize > 0 && listDsl
      ? materializeStaticListV2Rows(listDsl, { pageNo: currentPage, pageSize })
      : null;
    if (projection?.status === "unsupported" && widget.isLoading !== true) {
      content = <div className="od-read-only-canvas__unresolved" data-list-state="unsupported">
        This List needs Appsmith runtime features unavailable in the local preview.
      </div>;
    } else {
      const rowHeight = Math.max(height,
        Math.max(1, pageSize) * (templateHeight + numberValue(widget.itemSpacing, 8)));
      content = <NativeListV2View
        backgroundColor={stringValue(widget.backgroundColor, "transparent")}
        borderRadius={widget.borderRadius as string | number | undefined}
        boxShadow={stringValue(widget.boxShadow, "none")}
        componentHeight={height}
        emptyBorderColor={stringValue(widget.borderColor, "#e7e7e7")}
        isLoading={widget.isLoading === true}
        itemSpacing={numberValue(widget.itemSpacing, 8)}
        listData={Array.isArray(widget.listData) ? widget.listData : undefined}
        materializedRows={<div className="od-read-only-canvas__list-rows"
          style={{ position: "relative", width, height: rowHeight }}>
          {projection?.status === "ready" && projection.rows.map((row) =>
            <div data-list-runtime-row={row.key} key={row.key}>
              <WidgetTree
                draggableWidgets={false}
                interactiveSelection={false}
                mode="viewer"
                parentFrame={{ left: 0, top: 0, width, height: rowHeight }}
                parentIsRoot={false}
                parentNoPad={true}
                parentScrolls={false}
                parentTabsOffsetRows={0}
                parentType="CANVAS_WIDGET"
                rootMetrics={resolvedRootMetrics}
                rootWidgetId={rootWidgetId}
                runtimeWidget={row.runtimeWidget.dsl}
                theme={theme}
                widgetId={row.runtimeWidget.dsl.widgetId}
              />
            </div>) }
        </div>}
        pageSize={Math.max(0, pageSize)}
        pagination={projection?.status === "ready" && shouldPaginateListV2({
          itemCount, pageSize, serverSidePagination: false, infiniteScroll: false,
        }) ? <NativeListV2Pagination
          currentPage={currentPage}
          onPageChange={setListPageNo}
          pageCount={pageCount}
          widgetId={widget.widgetId}
        /> : null}
        templateHeight={templateHeight}
        widgetId={widget.widgetId}
      />;
    }
  } else if (widget.type === "CONTAINER_WIDGET" || widget.type === "STATBOX_WIDGET") {
    content = (
      <NativeContainerView
        backgroundColor={stringValue(widget.backgroundColor, "transparent")}
        borderColor={stringValue(widget.borderColor, "transparent")}
        borderRadius={hasExpression(widget.borderRadius)
          ? theme.appBorderRadius : (widget.borderRadius as string | number | undefined) ?? theme.appBorderRadius}
        borderWidth={numberValue(widget.borderWidth, 0)}
        boxShadow={hasExpression(widget.boxShadow)
          ? theme.appBoxShadow : stringValue(widget.boxShadow, "none")}
        detachFromLayout={widget.detachFromLayout === true}
        layoutSystemType="FIXED"
        noScroll={widget.dynamicHeight === "AUTO_HEIGHT"}
        shouldScrollContents={widget.shouldScrollContents === true}
        widgetId={widget.widgetId}
      >
        {children}
      </NativeContainerView>
    );
  } else if (widget.type === "FORM_WIDGET") {
    content = <NativeFormView widget={widget}
      themeBorderRadius={theme.appBorderRadius}
      themeBoxShadow={theme.appBoxShadow}>{children}</NativeFormView>;
  } else if (widget.type === "CARD_WIDGET") {
    const card = { ...widget,
      isSelected: typeof metaProps?.isSelected === "boolean"
        ? metaProps.isSelected : widget.isSelected,
      isExpanded: typeof metaProps?.isExpanded === "boolean"
        ? metaProps.isExpanded : widget.isExpanded,
    };
    content = <NativeCardView widget={card}
      themeBorderRadius={theme.appBorderRadius}
      themeBoxShadow={theme.appBoxShadow}
      themePrimaryColor={theme.primaryColor}
      onToggleSelection={mode === "viewer" ? () =>
        dispatch(batchSetWidgetMetaProperties({ widgetId: widget.widgetId,
          properties: { isSelected: (card.isSelected ?? widget.defaultSelected) !== true } })) : undefined}
      onToggleExpand={mode === "viewer" ? () =>
        dispatch(batchSetWidgetMetaProperties({ widgetId: widget.widgetId,
          properties: { isExpanded: (card.isExpanded ?? widget.defaultExpanded) === false } })) : undefined}
    >{children}</NativeCardView>;
  } else if (widget.type === "TABS_WIDGET") {
    content = (
      <NativeTabsView
        accentColor={stringValue(widget.accentColor, theme.primaryColor)}
        backgroundColor={stringValue(widget.backgroundColor, "#FFFFFF")}
        borderColor={stringValue(widget.borderColor, "#E0DEDE")}
        borderRadius={widget.borderRadius as string | number | undefined ?? theme.appBorderRadius}
        borderWidth={widget.borderWidth as string | number | undefined}
        boxShadow={stringValue(widget.boxShadow, "none")}
        defaultTab={stringValue(widget.defaultTab, "Tab 1")}
        dynamicHeight={stringValue(widget.dynamicHeight, "FIXED")}
        onTabChange={onTabChange ? (canvasId) => onTabChange(widget.widgetId, canvasId) : undefined}
        primaryColor={theme.primaryColor}
        renderCanvas={(canvasId) => {
          const index = renderedChildIds.indexOf(canvasId);
          return index >= 0 ? children[index] : null;
        }}
        selectedTabWidgetId={activeTabCanvasIds?.[widget.widgetId]}
        selectedWidgetAncestry={editorModalAncestry}
        shouldScrollContents={widget.shouldScrollContents === true}
        shouldShowTabs={widget.shouldShowTabs !== false}
        tabsObj={widget.tabsObj}
        widgetId={widget.widgetId}
      />
    );
  } else if (widget.type === "MODAL_WIDGET") {
    const childCanvasId = childIds.find((id) => sourceWidgets[id]?.type === "CANVAS_WIDGET");
    content = childCanvasId ? <NativeModalView
      backgroundColor={stringValue(widget.backgroundColor, "#FFFFFF")}
      borderRadius={hasExpression(widget.borderRadius)
        ? theme.appBorderRadius : widget.borderRadius as string | number | undefined}
      canEscapeKeyClose={widget.canEscapeKeyClose !== false}
      canOutsideClickClose={widget.canOutsideClickClose !== false}
      canvasWidgetId={childCanvasId}
      autoHeight={widget.dynamicHeight === "AUTO_HEIGHT" ||
        widget.dynamicHeight === "AUTO_HEIGHT_WITH_LIMITS"}
      disabledResizeHandles={Array.isArray(widget.disabledResizeHandles)
        ? widget.disabledResizeHandles.filter((handle): handle is string => typeof handle === "string")
        : undefined}
      heightPx={numberValue(widget.height, 240)}
      isEditMode={mode === "editor"}
      isVisible={openModalIds?.[widget.widgetId] ?? widget.isVisible === true}
      mainCanvasWidthPx={mainCanvas.width}
      onRequestClose={onModalClose ? (reason) => onModalClose(widget.widgetId, reason) : undefined}
      onResize={mode === "editor" ? onModalResize : undefined}
      onResizeStart={mode === "editor" ? onModalResizeStart : undefined}
      onResizeEnd={mode === "editor" ? onModalResizeEnd : undefined}
      onSelect={mode === "editor" ? () => {
        dispatch(selectWidget(widget.widgetId));
        onSelect?.(widget.widgetId);
      } : undefined}
      renderCanvas={(canvasId) => {
        const index = renderedChildIds.indexOf(canvasId);
        return index >= 0 ? children[index] : null;
      }}
      selectedWidgetAncestry={editorModalAncestry}
      shouldScrollContents={widget.shouldScrollContents === true}
      themeBorderRadius={theme.appBorderRadius}
      widgetId={widget.widgetId}
      widgetName={widget.widgetName}
      widthPx={numberValue(widget.width, 456)}
    /> : null;
  } else if (widget.type === "BUTTON_WIDGET" &&
    sourceWidgets[sourceWidgets[typeof widget.parentId === "string"
      ? widget.parentId : ""]?.parentId ?? ""]?.type === "MODAL_WIDGET") {
    content = <NativeModalButtonView
      color={widget.buttonColor}
      text={stringValue(widget.text, "Button")}
      themePrimaryColor={theme.primaryColor || "#553de9"}
      variant={widget.buttonVariant}
    />;
  } else if (widget.type === "ICON_BUTTON_WIDGET" &&
    (widget.iconName === "arrow-top-right" ||
      sourceWidgets[sourceWidgets[typeof widget.parentId === "string"
        ? widget.parentId : ""]?.parentId ?? ""]?.type === "MODAL_WIDGET")) {
    content = widget.iconName === "arrow-top-right" ? <NativeStatboxIconButtonView
      borderRadius={hasExpression(widget.borderRadius)
        ? theme.appBorderRadius : widget.borderRadius}
      boxShadow={hasExpression(widget.boxShadow)
        ? theme.appBoxShadow : widget.boxShadow}
      buttonColor={hasExpression(widget.buttonColor)
        ? theme.primaryColor : widget.buttonColor}
      buttonVariant={widget.buttonVariant}
      height={height}
      iconName="arrow-top-right"
      isDisabled={widget.isDisabled === true}
      themeBorderRadius={theme.appBorderRadius || "0px"}
      themeBoxShadow={theme.appBoxShadow || "none"}
      themePrimaryColor={theme.primaryColor || "#553de9"}
      width={width}
    /> : <NativeModalIconButtonView
      color={widget.buttonColor}
      iconName={stringValue(widget.iconName, "cross")}
    />;
  } else if (widget.type === "BUTTON_WIDGET" ||
    widget.type === "ICON_BUTTON_WIDGET" || widget.type === "BUTTON_GROUP_WIDGET") {
    content = <NativeButtonControlsView height={height} mode={mode}
      themeBorderRadius={theme.appBorderRadius}
      themeBoxShadow={theme.appBoxShadow}
      themePrimaryColor={theme.primaryColor}
      widget={widget} width={width} />;
  } else if (widget.type === "TEXT_WIDGET") {
    const unresolvedText = dynamicPaths.some((path) =>
      path === "text" && !overlayPaths.has(path),
    ) ||
      hasExpression(widget.text);
    content = (
      <NativeTextView
        accentColor={stringValue(widget.accentColor, theme.primaryColor || "#553de9")}
        backgroundColor={stringValue(widget.backgroundColor, "transparent")}
        borderColor={stringValue(widget.borderColor, "transparent")}
        borderWidth={numberValue(widget.borderWidth, 0)}
        disableLink={widget.disableLink === true}
        fontFamily={stringValue(widget.fontFamily, theme.fontFamily || "Inter")}
        fontSize={stringValue(widget.fontSize, "1rem")}
        fontStyle={stringValue(widget.fontStyle)}
        overflow={overflow(widget.overflow)}
        text={unresolvedText
          ? "Dynamic text unavailable in read-only preview"
          : stringValue(widget.text)}
        textAlign={textAlign(widget.textAlign)}
        textColor={stringValue(widget.textColor, "#231f20")}
        truncateButtonColor={stringValue(widget.truncateButtonColor, theme.primaryColor)}
        widgetId={widget.widgetId}
      />
    );
  } else if (widget.type === "CHART_WIDGET") {
    const unresolvedChart = dynamicPaths.some((path) =>
      (path === "chartData" || path.startsWith("chartData.")) &&
      !overlayPaths.has(path),
    ) || hasExpression(widget.chartData);
    content = unresolvedChart ? (
      <div className="od-read-only-canvas__unresolved">Dynamic chart data unavailable in read-only preview</div>
    ) : (
      <BasicChartWidget
        dimensions={{ width, height }}
        theme={theme}
        widget={widget}
      />
    );
  } else if (widget.type === "IMAGE_WIDGET") {
    const unresolvedPrimary = dynamicPaths.includes("image") && !overlayPaths.has("image") ||
      hasExpression(widget.image);
    const unresolvedFallback = dynamicPaths.includes("defaultImage") && !overlayPaths.has("defaultImage") ||
      hasExpression(widget.defaultImage);
    const image = unresolvedPrimary ? "" : stringValue(widget.image);
    const defaultImage = unresolvedFallback ? "" : stringValue(widget.defaultImage);
    const missingDynamicSource = (unresolvedPrimary || unresolvedFallback) &&
      !safeImageSource(image) && !safeImageSource(defaultImage);
    content = missingDynamicSource ? (
      <div className="od-read-only-canvas__unresolved">Dynamic image unavailable in read-only preview</div>
    ) : (
      <NativeImageView
        borderRadius={hasExpression(widget.borderRadius)
          ? theme.appBorderRadius : stringValue(widget.borderRadius, theme.appBorderRadius)}
        boxShadow={hasExpression(widget.boxShadow)
          ? theme.appBoxShadow : stringValue(widget.boxShadow, theme.appBoxShadow || "none")}
        defaultImage={defaultImage}
        image={image}
        maxZoomLevel={numberValue(widget.maxZoomLevel, 1)}
        enableRotation={widget.enableRotation === true}
        enableDownload={widget.enableDownload === true}
        objectFit={stringValue(widget.objectFit, "cover")}
        widgetName={widget.widgetName}
      />
    );
  } else if (widget.type === "DIVIDER_WIDGET") {
    const dividerProperties = new Set([
      "orientation", "strokeStyle", "dividerColor", "thickness", "capType", "capSide",
    ]);
    const unresolvedDivider = dynamicPaths.some((path) =>
      dividerProperties.has(path) && !overlayPaths.has(path) &&
      !(path === "dividerColor" && widget.dividerColor === "{{appsmith.theme.colors.primaryColor}}"),
    ) || [
      widget.orientation, widget.strokeStyle, widget.thickness, widget.capType,
      widget.capSide,
    ].some(hasExpression) ||
      (hasExpression(widget.dividerColor) && widget.dividerColor !== "{{appsmith.theme.colors.primaryColor}}");
    content = unresolvedDivider ? (
      <div className="od-read-only-canvas__unresolved">Dynamic divider unavailable in read-only preview</div>
    ) : (
      <NativeDividerView
        capSide={numberValue(widget.capSide, 0)}
        capType={stringValue(widget.capType, "nc")}
        dividerColor={hasExpression(widget.dividerColor)
          ? theme.primaryColor : stringValue(widget.dividerColor, "#858282")}
        orientation={stringValue(widget.orientation, "horizontal")}
        strokeStyle={stringValue(widget.strokeStyle, "solid")}
        thickness={numberValue(widget.thickness, 2)}
      />
    );
  } else if (widget.type === "PROGRESS_WIDGET") {
    const isIndeterminate = widget.isIndeterminate === true;
    const dynamicProgressProperties = new Set([
      "progressType", "isIndeterminate", "fillColor",
      ...(isIndeterminate ? [] : ["progress", "steps", "showResult", "counterClockwise"]),
    ]);
    const unresolvedProgress = dynamicPaths.some((path) =>
      dynamicProgressProperties.has(path) &&
      !overlayPaths.has(path) &&
      !(path === "fillColor" && widget.fillColor === "{{appsmith.theme.colors.primaryColor}}"),
    ) || [
      widget.progressType, widget.isIndeterminate,
      ...(isIndeterminate ? [] : [
        widget.progress, widget.steps, widget.showResult, widget.counterClockwise,
      ]),
    ].some(hasExpression) ||
      (hasExpression(widget.fillColor) && widget.fillColor !== "{{appsmith.theme.colors.primaryColor}}");
    content = unresolvedProgress ? (
      <div className="od-read-only-canvas__unresolved">Dynamic progress unavailable in read-only preview</div>
    ) : (
      <NativeProgressView
        borderRadius={hasExpression(widget.borderRadius)
          ? theme.appBorderRadius : stringValue(widget.borderRadius, theme.appBorderRadius)}
        counterClockwise={widget.counterClockwise === true}
        dimensions={{ width, height }}
        fillColor={stringValue(widget.fillColor, theme.primaryColor)}
        isIndeterminate={widget.isIndeterminate === true}
        progress={numberValue(widget.progress, 50)}
        progressType={stringValue(widget.progressType, "linear")}
        showResult={widget.showResult === true}
        steps={numberValue(widget.steps, 1)}
        themePrimaryColor={theme.primaryColor}
        widgetId={widget.widgetId}
        widgetName={widget.widgetName}
      />
    );
  } else if (widget.type === "PROGRESSBAR_WIDGET") {
    content = <LegacyProgressBarView
      barType={stringValue(widget.barType, "indeterminate")}
      borderRadius={widget.borderRadius as string | number | undefined}
      fillColor={stringValue(widget.fillColor, theme.primaryColor)}
      progress={numberValue(widget.progress, 50)}
      showResult={widget.showResult === true}
      steps={numberValue(widget.steps, 1)}
      themePrimaryColor={theme.primaryColor}
      widgetId={widget.widgetId}
    />;
  } else if (widget.type === "CIRCULAR_PROGRESS_WIDGET") {
    content = <LegacyCircularProgressView
      counterClockwise={widget.counterClockwise === true}
      fillColor={stringValue(widget.fillColor, theme.primaryColor)}
      progress={numberValue(widget.progress, 65)}
      showResult={widget.showResult !== false}
      themePrimaryColor={theme.primaryColor}
      widgetId={widget.widgetId}
    />;
  } else if (widget.type === "TABLE_WIDGET_V2" || widget.type === "TABLE_WIDGET") {
    content = <NativeTableView height={height} mode={mode} widget={widget}
      width={width} />;
  } else if (widget.type === "RATE_WIDGET") {
    content = <NativeRateView widgetId={widget.widgetId} widgetName={widget.widgetName}
      maxCount={numberValue(widget.maxCount, 5)}
      defaultRate={numberValue(widget.defaultRate, 3)}
      rate={typeof metaProps?.rate === "number" ? metaProps.rate : undefined}
      size={widget.size === "SMALL" || widget.size === "MEDIUM" ? widget.size : "LARGE"}
      activeColor={stringValue(widget.activeColor, "#FFCB45")}
      inactiveColor={stringValue(widget.inactiveColor, "#E0DEDE")}
      isAllowHalf={widget.isAllowHalf === true}
      isDisabled={widget.isDisabled === true || mode === "editor"}
      isReadOnly={widget.isReadOnly === true}
      tooltips={Array.isArray(widget.tooltips) ? widget.tooltips as string[] : undefined}
      onMetaChange={mode === "viewer" ? (meta) =>
        dispatch(batchSetWidgetMetaProperties({ widgetId: widget.widgetId,
          properties: { rate: meta.rate } })) : undefined}
    />;
  } else if (widget.type === "NUMBER_SLIDER_WIDGET") {
    content = <NativeNumberSliderView widgetName={widget.widgetName}
      min={numberValue(widget.min, 0)} max={numberValue(widget.max, 100)}
      step={numberValue(widget.step, 1)}
      defaultValue={numberValue(widget.defaultValue, 10)}
      value={typeof metaProps?.value === "number" ? metaProps.value : undefined}
      marks={Array.isArray(widget.marks) ? widget.marks as unknown as SliderMark[] : undefined}
      isDirty={metaProps?.isDirty === true}
      isDisabled={widget.isDisabled === true || mode === "editor"}
      accentColor={stringValue(widget.accentColor, theme.primaryColor)}
      labelText={stringValue(widget.labelText, "Percentage")}
      labelPosition={stringValue(widget.labelPosition, "Top")}
      labelTextColor={stringValue(widget.labelTextColor)}
      labelTextSize={stringValue(widget.labelTextSize, "0.875rem")}
      labelStyle={stringValue(widget.labelStyle)}
      labelTooltip={stringValue(widget.labelTooltip)}
      showMarksLabel={widget.showMarksLabel !== false}
      sliderSize={widget.sliderSize === "s" || widget.sliderSize === "l" ? widget.sliderSize : "m"}
      tooltipAlwaysOn={widget.tooltipAlwaysOn === true}
      onMetaChange={mode === "viewer" ? (meta) =>
        dispatch(batchSetWidgetMetaProperties({ widgetId: widget.widgetId,
          properties: meta })) : undefined}
    />;
  } else if (widget.type === "RANGE_SLIDER_WIDGET") {
    content = <NativeRangeSliderView widgetName={widget.widgetName}
      min={numberValue(widget.min, 0)} max={numberValue(widget.max, 100)}
      minRange={numberValue(widget.minRange, 5)} step={numberValue(widget.step, 1)}
      defaultStartValue={numberValue(widget.defaultStartValue, 10)}
      defaultEndValue={numberValue(widget.defaultEndValue, 100)}
      start={typeof metaProps?.start === "number" ? metaProps.start : undefined}
      end={typeof metaProps?.end === "number" ? metaProps.end : undefined}
      marks={Array.isArray(widget.marks) ? widget.marks as unknown as SliderMark[] : undefined}
      isDirty={metaProps?.isDirty === true}
      isDisabled={widget.isDisabled === true || mode === "editor"}
      accentColor={stringValue(widget.accentColor, theme.primaryColor)}
      labelText={stringValue(widget.labelText, "Percentage")}
      labelPosition={stringValue(widget.labelPosition, "Top")}
      labelTextColor={stringValue(widget.labelTextColor)}
      labelTextSize={stringValue(widget.labelTextSize, "0.875rem")}
      labelStyle={stringValue(widget.labelStyle)}
      labelTooltip={stringValue(widget.labelTooltip)}
      showMarksLabel={widget.showMarksLabel !== false}
      sliderSize={widget.sliderSize === "s" || widget.sliderSize === "l" ? widget.sliderSize : "m"}
      tooltipAlwaysOn={widget.tooltipAlwaysOn === true}
      onMetaChange={mode === "viewer" ? (meta) =>
        dispatch(batchSetWidgetMetaProperties({ widgetId: widget.widgetId,
          properties: meta })) : undefined}
    />;
  } else if (widget.type === "CATEGORY_SLIDER_WIDGET") {
    content = <NativeCategorySliderView widgetName={widget.widgetName}
      options={Array.isArray(widget.options) ? widget.options as unknown as CategoryOption[] : undefined}
      defaultOptionValue={typeof widget.defaultOptionValue === "number" ||
        typeof widget.defaultOptionValue === "string" ? widget.defaultOptionValue : undefined}
      value={typeof metaProps?.value === "number" || typeof metaProps?.value === "string"
        ? metaProps.value : undefined}
      isDirty={metaProps?.isDirty === true}
      isDisabled={widget.isDisabled === true || mode === "editor"}
      accentColor={stringValue(widget.accentColor, theme.primaryColor)}
      labelText={stringValue(widget.labelText, "Size")}
      labelPosition={stringValue(widget.labelPosition, "Top")}
      labelTextColor={stringValue(widget.labelTextColor)}
      labelTextSize={stringValue(widget.labelTextSize, "0.875rem")}
      labelStyle={stringValue(widget.labelStyle)}
      labelTooltip={stringValue(widget.labelTooltip)}
      showMarksLabel={widget.showMarksLabel !== false}
      sliderSize={widget.sliderSize === "s" || widget.sliderSize === "l" ? widget.sliderSize : "m"}
      onMetaChange={mode === "viewer" ? (meta) =>
        dispatch(batchSetWidgetMetaProperties({ widgetId: widget.widgetId,
          properties: meta })) : undefined}
    />;
  } else if (widget.type === "DOCUMENT_VIEWER_WIDGET") {
    content = dynamicPaths.includes("docUrl") && !overlayPaths.has("docUrl")
      ? <div className="od-read-only-canvas__unresolved">Dynamic document URL unavailable in read-only preview</div>
      : <NativeDocumentViewerView docUrl={stringValue(widget.docUrl)}
        widgetName={widget.widgetName} />;
  } else if (widget.type === "AUDIO_WIDGET") {
    content = dynamicPaths.includes("url") && !overlayPaths.has("url")
      ? <div className="od-read-only-canvas__unresolved">Dynamic audio URL unavailable in read-only preview</div>
      : <NativeAudioView autoPlay={widget.autoPlay === true}
        url={stringValue(widget.url)} widgetName={widget.widgetName} />;
  } else if (widget.type === "VIDEO_WIDGET") {
    content = dynamicPaths.includes("url") && !overlayPaths.has("url")
      ? <div className="od-read-only-canvas__unresolved">Dynamic video URL unavailable in read-only preview</div>
      : <NativeVideoView autoPlay={widget.autoPlay === true}
        backgroundColor={stringValue(widget.backgroundColor, "#000")}
        borderRadius={stringValue(widget.borderRadius, theme.appBorderRadius)}
        boxShadow={stringValue(widget.boxShadow, theme.appBoxShadow || "none")}
        url={stringValue(widget.url)} widgetName={widget.widgetName} />;
  } else if (widget.type === "IFRAME_WIDGET") {
    content = <NativeIframeView widget={widget} mode={mode}
      isSelected={selectedId === widget.widgetId}
      onMessageReceived={(event) => dispatch(batchSetWidgetMetaProperties({
        widgetId: widget.widgetId,
        properties: { message: event.data,
          messageMetadata: { lastEventId: event.lastEventId, origin: event.origin } },
      }))} />;
  } else if (widget.type === "MAP_WIDGET") {
    content = <NativeMapView widget={widget}
      apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
      meta={metaProps}
      onMetaChange={(property, value) => dispatch(batchSetWidgetMetaProperties({
        widgetId: widget.widgetId, properties: { [property]: value },
      }))} />;
  } else if (widget.type === "MAP_CHART_WIDGET") {
    content = <NativeMapChartView widget={widget} dimensions={{ width, height }}
      onDataPointClick={(point) => dispatch(batchSetWidgetMetaProperties({
        widgetId: widget.widgetId, properties: { selectedDataPoint: point },
      }))} />;
  } else if (widget.type === "RICH_TEXT_EDITOR_WIDGET") {
    content = <React.Suspense fallback={<div className="od-read-only-canvas__unresolved">Loading editor…</div>}>
      <NativeRichTextEditorView widget={widget} meta={metaProps}
        editor={mode === "editor"} themeBorderRadius={theme.appBorderRadius}
        themeBoxShadow={theme.appBoxShadow}
        onMetaChange={(properties) => dispatch(batchSetWidgetMetaProperties({
          widgetId: widget.widgetId, properties,
        }))} />
    </React.Suspense>;
  } else if (widget.type === "JSON_FORM_WIDGET") {
    content = <NativeJsonFormView widget={widget} meta={metaProps}
      editor={mode === "editor"} themePrimaryColor={theme.primaryColor}
      themeBorderRadius={theme.appBorderRadius}
      onMetaChange={(properties) => dispatch(batchSetWidgetMetaProperties({
        widgetId: widget.widgetId, properties,
      }))} />;
  } else if (widget.type === "CUSTOM_WIDGET") {
    content = <NativeCustomWidgetView widget={widget} meta={metaProps}
      dimensions={{ width, height }} theme={theme} mode={mode}
      isSelected={selectedId === widget.widgetId}
      onMetaChange={(properties) => dispatch(batchSetWidgetMetaProperties({
        widgetId: widget.widgetId, properties,
      }))} />;
  } else if (isMenuTreeWidget(widget.type)) {
    content = <NativeMenuTreeView widget={widget} width={width} height={height}
      themePrimaryColor={theme.primaryColor} themeBorderRadius={theme.appBorderRadius}
      editor={mode === "editor"} meta={metaProps}
      onMetaChange={(properties) => dispatch(batchSetWidgetMetaProperties({
        widgetId: widget.widgetId, properties,
      }))} />;
  } else if (isCaptureUploadWidget(widget.type)) {
    content = <NativeCaptureUploadView widget={widget} meta={metaProps}
      editor={mode === "editor"} themePrimaryColor={theme.primaryColor}
      themeBorderRadius={theme.appBorderRadius}
      onMetaChange={(properties) => dispatch(batchSetWidgetMetaProperties({
        widgetId: widget.widgetId, properties,
      }))} />;
  } else if (isSpecialInputWidget(widget.type)) {
    content = <NativeSpecialInputView widget={widget}
      editor={mode === "editor"} meta={metaProps}
      themeBorderRadius={theme.appBorderRadius}
      themePrimaryColor={theme.primaryColor}
      onMetaChange={(properties) =>
        dispatch(batchSetWidgetMetaProperties({ widgetId: widget.widgetId,
          properties }))} />;
  } else if (isChoiceWidget(widget.type)) {
    content = <NativeChoiceWidgetView widget={widget}
      editor={mode === "editor"} meta={metaProps}
      themeBorderRadius={theme.appBorderRadius}
      themePrimaryColor={theme.primaryColor}
      onMetaChange={(properties) =>
        dispatch(batchSetWidgetMetaProperties({ widgetId: widget.widgetId,
          properties }))} />;
  } else if (isFormWidget(widget.type)) {
    const metaProperty = widget.type === "CHECKBOX_WIDGET"
      ? "isChecked" : widget.type === "SWITCH_WIDGET"
        ? "isSwitchedOn" : widget.type === "INPUT_WIDGET_V2"
          ? "inputText" : "selectedOptionValue";
    content = <NativeFormWidgetView
      editor={mode === "editor"}
      onValueChange={(propertyValue) => {
        const properties: Record<string, unknown> = {
          [metaProperty]: propertyValue,
          isDirty: true,
        };
        if (widget.type === "INPUT_WIDGET_V2") {
          const input = String(propertyValue);
          const number = Number(input);
          properties.text = widget.inputType === "NUMBER"
            ? input === "" || Number.isNaN(number) ? null : number
            : input;
        }
        dispatch(batchSetWidgetMetaProperties({ widgetId: widget.widgetId, properties }));
      }}
      themeBorderRadius={theme.appBorderRadius}
      themePrimaryColor={theme.primaryColor}
      value={metaProps?.[metaProperty]}
      widget={widget}
    />;
  } else {
    content = (
      <div className="od-read-only-canvas__unresolved">
        {widget.widgetName}: renderer for {widget.type} is not yet available
      </div>
    );
  }

  if (mode === "editor" && onWidgetHeightChange && !isCanvas && !isCanvasOwner &&
    widget.detachFromLayout !== true && widget.isFlexChild !== true &&
    widget.isAutoGeneratedWidget !== true &&
    (widget.dynamicHeight === "AUTO_HEIGHT" ||
      widget.dynamicHeight === "AUTO_HEIGHT_WITH_LIMITS")) {
    content = (
      <AppsmithAutoHeightContainer
        backgroundColor={stringValue(widget.backgroundColor, "transparent")}
        bottomRow={widget.bottomRow}
        dynamicHeight={widget.dynamicHeight}
        maxDynamicHeight={numberValue(widget.maxDynamicHeight, 9000)}
        minDynamicHeight={numberValue(widget.minDynamicHeight, 4)}
        onHeightUpdate={onWidgetHeightChange}
        retryEpoch={measurementRetryEpoch}
        topRow={widget.topRow}
        type={widget.type}
        widgetId={widget.widgetId}
        widgetName={widget.widgetName}
      >
        {content}
      </AppsmithAutoHeightContainer>
    );
  }

  // ResizableComponent keeps VisibilityContainer around widget content, inside
  // its ResizeWrapper, so hidden content never dims the name or handles.
  // FixedResizableLayer bypasses both wrappers for disabled/Skeleton widgets.
  const hasFixedResizer = mode === "editor" && !isCanvas &&
    widget.type !== "SKELETON_WIDGET" && widget.resizeDisabled !== true;
  const visibleContent = hasFixedResizer
    ? <div className={`od-read-only-canvas__visibility${widget.isVisible === false
      ? " od-read-only-canvas__visibility--invisible" : ""}`}>{content}</div>
    : content;

  // Appsmith's ModalOnion renders a portal-like fixed overlay instead of a
  // positioned widget surface in the canvas. Its panel supplies selection.
  if (widget.type === "MODAL_WIDGET") return content as React.ReactElement | null;

  return (
    <div
      aria-label={interactiveSelection && !isCanvas ? `Select ${widget.widgetName}` : undefined}
      aria-pressed={interactiveSelection && !isCanvas ? selectedId === widget.widgetId : undefined}
      className={[
        "od-read-only-canvas__widget",
        `od-read-only-canvas__widget--${widget.type.toLowerCase().replace(/_/g, "-")}`,
        interactiveSelection && selectedId === widget.widgetId
          ? "od-read-only-canvas__widget--selected" : "",
        mode === "editor" && widget.isVisible === false
          ? "od-read-only-canvas__widget--invisible" : "",
        resizePreview ? "od-read-only-canvas__widget--live-resizing" : "",
        widgetChrome ? "od-editable-canvas__selection" : "",
      ].filter(Boolean).join(" ")}
      data-editing-widget-id={widgetChrome ? widget.widgetId : undefined}
      data-widget-id={runtimeWidget ? undefined : widget.widgetId}
      data-widget-name={!isRoot ? widget.widgetName : undefined}
      data-tab-order={sanitizeTabOrder(widget.tabOrder)}
      draggable={draggableWidgets && !isCanvas && widget.dragDisabled !== true}
      onClick={interactiveSelection && !isCanvas ? choose : undefined}
      onKeyDown={interactiveSelection && !isCanvas ? chooseWithKeyboard : undefined}
      role={interactiveSelection && !isCanvas ? "button" : undefined}
      style={style}
      tabIndex={interactiveSelection && !isCanvas ? 0 : undefined}
    >
      {mode === "editor" && showTabOrder && sanitizeTabOrder(widget.tabOrder) !== undefined &&
        <div className="od-read-only-canvas__tab-order-badge" data-testid="t--tab-order-badge">
          {sanitizeTabOrder(widget.tabOrder)}
        </div>}
      {widgetChrome && <AppsmithWidgetName {...widgetChrome} />}
      {hasFixedResizer
        ? <FixedLiveResizeWrapper
            // Appsmith ResizableComponent derives isCanvas from WidgetFactory's
            // widget config, which is absent from authored DSL. Text remains a
            // fixed-height resize wrapper even when its content is auto height.
            autoHeight={widget.dynamicHeight === "AUTO_HEIGHT" && (
              widget.type === "CONTAINER_WIDGET" || widget.type === "STATBOX_WIDGET" ||
              widget.type === "FORM_WIDGET" || widget.type === "CARD_WIDGET" ||
              widget.type === "TABS_WIDGET" || widget.type === "MODAL_WIDGET" ||
              widget.type === "LIST_WIDGET_V2")}
            height={Number(style.height) || 1}
            maxHeightInPx={widget.dynamicHeight === "AUTO_HEIGHT_WITH_LIMITS"
              ? positiveValue(widget.maxDynamicHeight, 9000) * 10 : undefined}
            preview={resizePreview}
            showBoundary={!!widgetChrome}
            isHovered={widgetChrome?.hovered === true}
            handles={widgetChrome ? <AppsmithResizeHandles {...widgetChrome} /> : undefined}
            widgetId={widget.widgetId}
            width={Number(style.width) || 1}
          >
            {visibleContent}
          </FixedLiveResizeWrapper>
        : visibleContent}
    </div>
  );
}

export function NativeReadOnlyCanvas({
  store,
  rootWidgetId,
  selectedWidgetId,
  onSelect,
  theme,
  overlay,
  interactiveSelection = true,
  draggableWidgets = false,
  onWidgetHeightChange,
  measurementRetryEpoch,
  showTabOrder,
  activeTabCanvasIds,
  onTabChange,
  openModalIds,
  onModalClose,
  onModalResize,
  onModalResizeStart,
  onModalResizeEnd,
  liveResize,
  fixedWidgetChrome,
  renderFixedCanvasArena,
  temporaryCanvasRows,
}: NativeReadOnlyCanvasProps): React.ReactElement {
  useEffect(() => {
    store.dispatch(selectWidget(interactiveSelection ? selectedWidgetId ?? null : null));
  }, [store, selectedWidgetId, interactiveSelection]);

  return (
    <Provider store={store}>
      <WidgetTree
        onSelect={onSelect}
        overlay={overlay}
        interactiveSelection={interactiveSelection}
        draggableWidgets={draggableWidgets}
        onWidgetHeightChange={onWidgetHeightChange}
        measurementRetryEpoch={measurementRetryEpoch}
        showTabOrder={showTabOrder}
        activeTabCanvasIds={activeTabCanvasIds}
        onTabChange={onTabChange}
        openModalIds={openModalIds}
        onModalClose={onModalClose}
        onModalResize={onModalResize}
        onModalResizeStart={onModalResizeStart}
        onModalResizeEnd={onModalResizeEnd}
        liveResize={liveResize}
        fixedWidgetChrome={fixedWidgetChrome}
        renderFixedCanvasArena={renderFixedCanvasArena}
        temporaryCanvasRows={temporaryCanvasRows}
        mode={draggableWidgets ? "editor" : "viewer"}
        parentIsRoot={false}
        parentNoPad={false}
        parentScrolls={false}
        parentTabsOffsetRows={0}
        rootWidgetId={rootWidgetId}
        theme={theme}
        widgetId={rootWidgetId}
      />
    </Provider>
  );
}
