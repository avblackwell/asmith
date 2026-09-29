import { configureStore, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { CanvasPayload } from "../canvasPayload";
import { canvasPayloadForDocument } from "../canvasPayload";
import { resolveStaticReferences } from "../static-bindings/resolveStaticReferences";
import { fixedRootCanvasMetrics, type FixedGeometryWidget } from "../appsmith-fixed-geometry";

/** The flattened Appsmith DSL shape returned by the API-free canvas adapter. */
export type CompatCanvasWidget = Omit<
  CanvasPayload["widgets"][string],
  "children"
> & { children?: string[] };

export interface CompatEvaluatedWidget extends Record<string, unknown> {
  ENTITY_TYPE: "WIDGET";
  widgetId: string;
  widgetName: string;
  type: string;
}

/**
 * Only the Appsmith state branches used for read-only widget hydration.
 * Each call to createReadOnlyCompatStore owns a fresh instance of this state.
 */
export interface ReadOnlyCompatState {
  entities: {
    canvasWidgets: Record<string, CompatCanvasWidget>;
    meta: Record<string, Record<string, unknown>>;
    metaWidgets: Record<string, never>;
    app: { mode: "PUBLISHED" };
  };
  evaluations: {
    tree: Record<string, CompatEvaluatedWidget>;
    loadingEntities: ReadonlySet<string>;
    mode: "STATIC";
    resolvedPaths: Record<string, string[]>;
  };
  ui: {
    mainCanvas: {
      initialized: true;
      width: number;
      height: number;
      isMobile: boolean;
    };
    widgetDragResize: {
      selectedWidgets: string[];
      focusedWidget: null;
      isDragging: false;
      isResizing: false;
    };
    applications: {
      currentApplication: {
        applicationDetail: { appPositioning: { type: "FIXED" } };
      };
    };
  };
}

function positiveFinite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function staticEvaluatedTree(
  widgets: Record<string, CompatCanvasWidget>,
): Record<string, CompatEvaluatedWidget> {
  const tree: Record<string, CompatEvaluatedWidget> = {};

  for (const widget of Object.values(widgets)) {
    // Canvas payloads originate in parseDashboardDocument, which has already
    // established unique widget IDs and names. No JS expressions are evaluated.
    tree[widget.widgetName] = {
      ...widget,
      ENTITY_TYPE: "WIDGET",
      widgetId: widget.widgetId,
      widgetName: widget.widgetName,
      type: widget.type,
    };
  }

  return tree;
}

function withResolvedPath(
  source: unknown,
  segments: readonly string[],
  value: unknown,
): unknown {
  if (
    source === null ||
    typeof source !== "object" ||
    Array.isArray(source) ||
    !segments.length
  ) return source;

  const record = source as Record<string, unknown>;
  const [segment, ...remaining] = segments;

  if (!Object.prototype.hasOwnProperty.call(record, segment)) return source;

  if (!remaining.length) {
    return { ...record, [segment]: JSON.parse(JSON.stringify(value)) };
  }

  const child = withResolvedPath(record[segment], remaining, value);

  return child === record[segment]
    ? source
    : { ...record, [segment]: child };
}

function stateFromPayload(payload: CanvasPayload): ReadOnlyCompatState {
  // Keep callers' migrated DSL independent of RTK/Immer's immutable state.
  const widgets = JSON.parse(JSON.stringify(payload.widgets)) as Record<
    string,
    CompatCanvasWidget
  >;
  const root = widgets[payload.pageWidgetId];

  if (!root || root.type !== "CANVAS_WIDGET") {
    throw new TypeError("Canvas payload must contain its root CANVAS_WIDGET.");
  }

  const tree = staticEvaluatedTree(widgets);
  const resolvedPaths: Record<string, string[]> = {};

  for (const resolved of resolveStaticReferences(widgets)) {
    const widget = widgets[resolved.widgetId];

    if (!widget) continue;

    const current = tree[widget.widgetName];
    const next = withResolvedPath(
      current,
      resolved.propertyPath.split("."),
      resolved.value,
    );

    if (next === current) continue;

    tree[widget.widgetName] = next as CompatEvaluatedWidget;
    (resolvedPaths[widget.widgetId] ??= []).push(resolved.propertyPath);
  }

  const initialWidth = positiveFinite(root.rightColumn, 1242);
  return {
    entities: {
      canvasWidgets: widgets,
      meta: {},
      metaWidgets: {},
      app: { mode: "PUBLISHED" },
    },
    evaluations: {
      tree,
      loadingEntities: new Set<string>(),
      mode: "STATIC",
      resolvedPaths,
    },
    ui: {
      mainCanvas: {
        initialized: true,
        width: initialWidth,
        height: positiveFinite(
          root.minHeight,
          positiveFinite(root.bottomRow, 120) * 10,
        ),
        isMobile: initialWidth <= 450,
      },
      widgetDragResize: {
        selectedWidgets: [],
        focusedWidget: null,
        isDragging: false,
        isResizing: false,
      },
      applications: {
        currentApplication: {
          applicationDetail: { appPositioning: { type: "FIXED" } },
        },
      },
    },
  };
}

const initialState: ReadOnlyCompatState = {
  entities: { canvasWidgets: {}, meta: {}, metaWidgets: {}, app: { mode: "PUBLISHED" } },
  evaluations: {
    tree: {},
    loadingEntities: new Set(),
    mode: "STATIC",
    resolvedPaths: {},
  },
  ui: {
    mainCanvas: {
      initialized: true,
      width: 1242,
      height: 1200,
      isMobile: false,
    },
    widgetDragResize: {
      selectedWidgets: [],
      focusedWidget: null,
      isDragging: false,
      isResizing: false,
    },
    applications: {
      currentApplication: {
        applicationDetail: { appPositioning: { type: "FIXED" } },
      },
    },
  },
};

const slice = createSlice({
  name: "readOnlyCompat",
  initialState,
  reducers: {
    replaceCanvasPayload(state, action: PayloadAction<CanvasPayload>) {
      const next = stateFromPayload(action.payload);

      // Appsmith's initialized mainCanvas branch survives DSL updates. A
      // document projection must not undo the viewport's resolved width.
      next.ui.mainCanvas.width = state.ui.mainCanvas.width;
      next.ui.mainCanvas.isMobile = state.ui.mainCanvas.isMobile;

      // NativeReadOnlyCanvas only synchronizes selection when its selected ID
      // or store changes. A document edit changes neither, so retain valid
      // selection when updating the mounted store in place.
      next.ui.widgetDragResize.selectedWidgets =
        state.ui.widgetDragResize.selectedWidgets.filter((widgetId) =>
          Boolean(next.entities.canvasWidgets[widgetId]),
        );

      // Appsmith's SET_META_PROP values belong to the mounted widget, not the
      // authored DSL. Preserve them across an editor document projection.
      for (const [widgetId, values] of Object.entries(state.entities.meta)) {
        const previousWidget = state.entities.canvasWidgets[widgetId];
        const nextWidget = next.entities.canvasWidgets[widgetId];
        if (!nextWidget) continue;
        const defaultMap = nextWidget.type === "CHECKBOX_WIDGET"
          ? { authored: ["defaultCheckedState"], current: ["isChecked"] }
          : nextWidget.type === "SWITCH_WIDGET"
            ? { authored: ["defaultSwitchState"], current: ["isSwitchedOn"] }
            : nextWidget.type === "INPUT_WIDGET_V2"
              ? { authored: ["defaultText"], current: ["inputText", "text"] }
              : nextWidget.type === "RADIO_GROUP_WIDGET"
                ? { authored: ["defaultOptionValue"], current: ["selectedOptionValue"] }
                : nextWidget.type === "RATE_WIDGET"
                  ? { authored: ["defaultRate"], current: ["rate", "value"] }
                  : nextWidget.type === "NUMBER_SLIDER_WIDGET"
                    ? { authored: ["defaultValue"], current: ["value"] }
                    : nextWidget.type === "RANGE_SLIDER_WIDGET"
                      ? { authored: ["defaultStartValue", "defaultEndValue"], current: ["start", "end"] }
                      : nextWidget.type === "CATEGORY_SLIDER_WIDGET"
                        ? { authored: ["defaultOptionValue"], current: ["value"] }
                        : nextWidget.type === "CARD_WIDGET"
                          ? { authored: ["defaultSelected", "defaultExpanded"],
                            current: ["isSelected", "isExpanded"] }
                          : nextWidget.type === "SELECT_WIDGET"
                            ? { authored: ["defaultOptionValue"],
                              current: ["value", "label", "filterText"] }
                            : nextWidget.type === "MULTI_SELECT_WIDGET_V2"
                              ? { authored: ["defaultOptionValue"],
                                current: ["selectedOptions", "filterText"] }
                              : nextWidget.type === "CHECKBOX_GROUP_WIDGET"
                                ? { authored: ["defaultSelectedValues"],
                                  current: ["selectedValues"] }
                                : nextWidget.type === "SWITCH_GROUP_WIDGET"
                                  ? { authored: ["defaultSelectedValues"],
                                    current: ["selectedValuesArray"] }
                                  : nextWidget.type === "DATE_PICKER_WIDGET2"
                                    ? { authored: ["defaultDate"], current: ["value"] }
                                    : nextWidget.type === "PHONE_INPUT_WIDGET"
                                      ? { authored: ["defaultText", "defaultDialCode"],
                                        current: ["text", "value", "dialCode", "countryCode"] }
                                      : nextWidget.type === "CURRENCY_INPUT_WIDGET"
                                        ? { authored: ["defaultText", "defaultCurrencyCode"],
                                          current: ["text", "value", "currencyCode", "countryCode"] }
                                        : nextWidget.type === "MAP_WIDGET"
                                          ? { authored: ["mapCenter", "defaultMarkers"],
                                            current: ["center", "markers", "selectedMarker"] }
                                          : nextWidget.type === "RICH_TEXT_EDITOR_WIDGET"
                                            ? { authored: ["defaultText"], current: ["text"] }
                                            : nextWidget.type === "CUSTOM_WIDGET"
                                              ? { authored: ["defaultModel"], current: ["model"] }
                                            : nextWidget.type === "SINGLE_SELECT_TREE_WIDGET"
                                              ? { authored: ["defaultOptionValue"],
                                                current: ["selectedOption", "selectedLabel"] }
                                              : nextWidget.type === "MULTI_SELECT_TREE_WIDGET"
                                                ? { authored: ["defaultOptionValue"],
                                                  current: ["selectedOptionValueArr", "selectedLabel"] }
                : null;
        if (defaultMap && defaultMap.authored.some((property) =>
          JSON.stringify(previousWidget?.[property]) !==
            JSON.stringify(nextWidget[property]))) {
          const reset: Record<string, unknown> = { ...values, isDirty: false };
          for (const current of defaultMap.current) delete reset[current];
          next.entities.meta[widgetId] = reset;
        } else next.entities.meta[widgetId] = values;
      }

      return next;
    },
    setWidgetMetaProperty(state, action: PayloadAction<{
      widgetId: string;
      propertyName: string;
      propertyValue: unknown;
    }>) {
      const { widgetId, propertyName, propertyValue } = action.payload;
      if (!state.entities.canvasWidgets[widgetId]) return;
      if (!Object.hasOwn(state.entities.meta, widgetId)) state.entities.meta[widgetId] = {};
      state.entities.meta[widgetId][propertyName] = propertyValue;
    },
    batchSetWidgetMetaProperties(state, action: PayloadAction<{
      widgetId: string;
      properties: Record<string, unknown>;
    }>) {
      const { widgetId, properties } = action.payload;
      if (!state.entities.canvasWidgets[widgetId]) return;
      state.entities.meta[widgetId] = {
        ...state.entities.meta[widgetId],
        ...properties,
      };
    },
    /** Appsmith UPDATE_CANVAS_LAYOUT: viewport state, never a DSL edit. */
    updateCanvasWidth(state, action: PayloadAction<number>) {
      if (!Number.isFinite(action.payload)) return;
      const width = Math.trunc(action.payload);
      if (width <= 0) return;
      state.ui.mainCanvas.width = width;
      state.ui.mainCanvas.isMobile = state.ui.mainCanvas.width <= 450;
    },
    selectWidget(state, action: PayloadAction<string | null>) {
      const widgetId = action.payload;

      state.ui.widgetDragResize.selectedWidgets =
        widgetId && state.entities.canvasWidgets[widgetId] ? [widgetId] : [];
    },
    replaceEvaluatedProperties(
      state,
      action: PayloadAction<{
        widgetId: string;
        properties: Record<string, unknown>;
      }>,
    ) {
      const raw = state.entities.canvasWidgets[action.payload.widgetId];

      if (!raw) return;

      const current = state.evaluations.tree[raw.widgetName];

      // Resolved values may change display properties, but cannot rewrite the
      // structural identity used by the canvas and selection selectors.
      state.evaluations.tree[raw.widgetName] = {
        ...current,
        ...action.payload.properties,
        ENTITY_TYPE: "WIDGET",
        widgetId: raw.widgetId,
        widgetName: raw.widgetName,
        type: raw.type,
      };

      const existing = state.evaluations.resolvedPaths[raw.widgetId] ?? [];
      const resolved = new Set(existing);

      for (const path of declaredDynamicPaths(raw)) {
        if (Object.hasOwn(action.payload.properties, path.split(".")[0])) {
          resolved.add(path);
        }
      }

      state.evaluations.resolvedPaths[raw.widgetId] = [...resolved];
    },
  },
});

export const {
  replaceCanvasPayload,
  setWidgetMetaProperty,
  batchSetWidgetMetaProperties,
  updateCanvasWidth,
  replaceEvaluatedProperties,
  selectWidget,
} = slice.actions;

/** Create this once for each mounted read-only dashboard. No saga or API client. */
export function createReadOnlyCompatStore(payload: CanvasPayload) {
  return configureStore({
    reducer: slice.reducer,
    preloadedState: stateFromPayload(payload),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
}

/** Validate and migrate a saved dashboard, then create its isolated store. */
export async function createReadOnlyCompatStoreForDocument(input: unknown) {
  return createReadOnlyCompatStore(await canvasPayloadForDocument(input));
}

/** Replace the saved dashboard only after the pure validation/migration step. */
export async function replaceReadOnlyCompatDocument(
  store: ReadOnlyCompatStore,
  input: unknown,
): Promise<void> {
  store.dispatch(replaceCanvasPayload(await canvasPayloadForDocument(input)));
}

export type ReadOnlyCompatStore = ReturnType<typeof createReadOnlyCompatStore>;
export type ReadOnlyCompatDispatch = ReadOnlyCompatStore["dispatch"];

// These selectors mirror the read path of Appsmith's withWidgetProps without
// importing the original HOC or its editor, saga, worker, and API graph.
export const selectCanvasWidgets = (state: ReadOnlyCompatState) =>
  state.entities.canvasWidgets;

export const selectWidgetMetaProps = (state: ReadOnlyCompatState, widgetId: string) =>
  state.entities.meta[widgetId];

export const selectWidgetById = (state: ReadOnlyCompatState, widgetId: string) =>
  state.entities.canvasWidgets[widgetId];

export const selectChildWidgetIds = (
  state: ReadOnlyCompatState,
  widgetId: string,
): string[] => {
  const children = selectWidgetById(state, widgetId)?.children;

  return Array.isArray(children)
    ? children.filter((child): child is string => typeof child === "string")
    : [];
};

export const selectEvaluatedWidgetById = (
  state: ReadOnlyCompatState,
  widgetId: string,
) => {
  const widget = selectWidgetById(state, widgetId);

  return widget ? state.evaluations.tree[widget.widgetName] : undefined;
};

export const selectHydratedWidgetById = (
  state: ReadOnlyCompatState,
  widgetId: string,
): CompatCanvasWidget | undefined => {
  const widget = selectWidgetById(state, widgetId);

  if (!widget) return undefined;

  const evaluated = selectEvaluatedWidgetById(state, widgetId);

  return {
    ...widget,
    ...evaluated,
    // Appsmith takes structure and geometry from the static canvas DSL.
    widgetId: widget.widgetId,
    widgetName: widget.widgetName,
    type: widget.type,
    parentId: widget.parentId,
    children: widget.children,
    topRow: widget.topRow,
    bottomRow: widget.bottomRow,
    leftColumn: widget.leftColumn,
    rightColumn: widget.rightColumn,
    parentColumnSpace: widget.parentColumnSpace,
    parentRowSpace: widget.parentRowSpace,
  };
};

export const selectSelectedWidgetId = (state: ReadOnlyCompatState) =>
  state.ui.widgetDragResize.selectedWidgets[0] ?? null;

export const selectMainCanvas = (state: ReadOnlyCompatState) =>
  state.ui.mainCanvas;

/** Appsmith INIT/UPDATE_CANVAS_LAYOUT + withWidgetProps geometry. */
export const selectFixedRootCanvasMetrics = (
  state: ReadOnlyCompatState,
  rootId: string,
  mode: "editor" | "viewer",
) => fixedRootCanvasMetrics(
  state.entities.canvasWidgets as unknown as Record<string, FixedGeometryWidget>,
  rootId,
  state.ui.mainCanvas.width,
  state.ui.mainCanvas.height,
  mode,
);

export const selectRenderMode = (_state: ReadOnlyCompatState): "PAGE" =>
  "PAGE";

export const selectLayoutSystemType = (_state: ReadOnlyCompatState): "FIXED" =>
  "FIXED";

/** Appsmith dynamic expressions stay unresolved until an evaluator is ported. */
function declaredDynamicPaths(widget: CompatCanvasWidget | undefined): string[] {
  const paths = widget?.dynamicBindingPathList;

  if (!Array.isArray(paths)) return [];

  return paths.flatMap((entry) =>
    entry && typeof entry === "object" && typeof entry.key === "string"
      ? [entry.key]
      : [],
  );
}

export const selectUnresolvedDynamicPaths = (
  state: ReadOnlyCompatState,
  widgetId: string,
): string[] => {
  const resolved = new Set(state.evaluations.resolvedPaths[widgetId] ?? []);

  return declaredDynamicPaths(selectWidgetById(state, widgetId)).filter(
    (path) => !resolved.has(path),
  );
};
