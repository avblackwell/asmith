# Read-only widget compatibility state

This store is created once per mounted dashboard. It accepts only the
validated, migrated, flattened `CanvasPayload` from `canvasPayloadForDocument`.
It does not import Appsmith's root reducer, root sagas, API modules, or the
original `withWidgetProps` HOC.

## State and selector correspondence

| Original Appsmith read path | Original source | This store / selector |
|---|---|---|
| `entities.canvasWidgets[widgetId]` | `sagas/selectors.tsx#getWidget`, `ce/selectors/entitiesSelector.ts#getCanvasWidgets` | `entities.canvasWidgets`, `selectWidgetById` |
| `evaluations.tree[widgetName]` | `selectors/dataTreeSelectors.ts#getWidgetEvalValues` | `evaluations.tree`, `selectEvaluatedWidgetById` |
| `evaluations.loadingEntities.has(widgetName)` | `selectors/dataTreeSelectors.ts#getIsWidgetLoading` | Empty `ReadonlySet` while using static DSL values |
| `ui.mainCanvas.width/height/isMobile` | `selectors/editorSelectors.tsx#getMainCanvasProps`, `ce/reducers/uiReducers/mainCanvasReducer.ts` | `ui.mainCanvas`, `selectMainCanvas` |
| `ui.widgetDragResize.selectedWidgets` | `selectors/ui.tsx#getSelectedWidgets` | `ui.widgetDragResize.selectedWidgets`, `selectSelectedWidgetId` |
| `entities.app.mode === PUBLISHED` | `selectors/editorSelectors.tsx#getRenderMode` | `entities.app.mode`, `selectRenderMode` returning `PAGE` |
| `ui.applications.currentApplication.applicationDetail.appPositioning.type` | `selectors/layoutSystemSelectors.ts#getLayoutSystemType` | Fixed `FIXED`, `selectLayoutSystemType` |
| `entities.metaWidgets` | `selectors/editorSelectors.tsx#getMetaWidget` | Empty map; the supported dashboard package has no meta widgets |

`selectHydratedWidgetById` merges resolved display properties over the static
DSL, then reapplies immutable identity, child structure, and fixed-layout
geometry. `replaceEvaluatedProperties` is for values already resolved by a
trusted evaluator or Cyflex binding adapter. It does not execute Appsmith
`{{...}}` expressions. Consumers should use `selectUnresolvedDynamicPaths` to
avoid displaying unevaluated expression text as a value.

The original `widgets/withWidgetProps.tsx` additionally reads global
`ConfigTreeActions`, `WidgetFactory`, Google Maps organization settings,
preview/Git mode, meta widget structure, auto-layout dimensions, and selection
ancestry. It can dispatch auto-height actions during rendering. Importing that
HOC unchanged would pull the editor/saga dependency graph into this product.
The lower-level Text, Container, and Chart renderers can instead use these
selectors through a new read-only adapter. This state has no dispatch path for
drag, resize, property editing, or Appsmith persistence.

## Lifecycle and verification

`createReadOnlyCompatStore(payload)` returns an isolated Redux store.
`createReadOnlyCompatStoreForDocument(document)` also validates and migrates
the document. `replaceReadOnlyCompatDocument(store, document)` validates and
replaces a mounted document; `selectWidget(id)` synchronizes selection from
the product workbench. Unmounting the nested React Redux `Provider` and
dropping its store reference disposes the state; there are no watchers,
workers, or subscriptions owned by this store.

Run `node src/editor-bridge/compat-store/contract.test.cjs` from
`operator-display-client`. It checks static state, flattening, selection,
evaluated display overlays, document replacement, and isolation across two
stores. The test uses this client's installed `esbuild` package for TS
compilation; the shipped store has no runtime import from `app/client`.
