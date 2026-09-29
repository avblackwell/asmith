# Native editor dependency audit and extraction order

Audit date: 2026-09-28. Source is the checked-out `app/client` tree. The
separate product app is `operator-display-client`. This report distinguishes
static import reachability from browser requests; an import of an API module
does not prove a request is sent. The current `/standalone`, `/workspace`, and
`/view` routes demonstrate native editing and viewing inside the old Appsmith
bundle. The product app now mounts a **fixed-layout editing subset** over
Appsmith widget presentation code; the full native editor runtime remains outside it.

## Reproduce the graph

From `operator-display-client`:

```powershell
node scripts/audit-native-graph.cjs
node scripts/audit-native-graph.cjs ce/reducers/index.tsx integration/widget-palette/WidgetPalette.tsx widgets/registry.ts integration/document/index.ts
```

The script uses the installed TypeScript resolver and AST. It follows static
imports, exports, literal `import()` calls, and literal `require()` calls.
Type-only imports are omitted. Counts are **source files reachable under
`app/client/src`**; dependency packages such as `@shared/dsl`, CSS, assets,
Webpack loader expressions, and generated code are reported separately or
excluded. The graph is therefore a lower bound for an executable build, not
a complete bill of materials. It reports first-level import categories,
reachable reducer/saga/widget/layout/API modules, direct API import edges,
shortest API paths, and strongly connected components (Tarjan's algorithm).

| Root under `app/client/src` | Reachable source files | Reducers | Sagas | Widgets | Layout | API modules | Direct API edges | Largest cycle | Root's cycle |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `integration/document/index.ts` | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 |
| `integration/widget-palette/WidgetPalette.tsx` | 197 | 1 | 3 | 3 | 10 | 1 | 1 | 8 | 1 |
| `ce/reducers/index.tsx` | 362 | 94 | 3 | 3 | 12 | 1 | 1 | 8 | 1 |
| `store.ts` | 1,236 | 95 | 126 | 62 | 189 | 63 | 164 | 278 | 278 |
| `pages/Editor/Canvas.tsx` | 1,243 | 95 | 126 | 62 | 190 | 63 | 164 | 278 | 1 |
| `pages/Editor/PropertyPane/index.tsx` | 1,517 | 95 | 126 | 79 | 193 | 63 | 164 | 278 | 7 |
| `widgets/index.ts` | 2,169 | 95 | 126 | 879 | 201 | 63 | 164 | 278 | 1 |
| `integration/standalone/index.tsx` | 1,642 | 95 | 126 | 79 | 237 | 63 | 164 | 278 | 1 |

These counts came from the script after filtering type-only imports. The
`widgets/index.ts` total includes reachable lazy widget modules; the browser
need not download them all initially. The 164 API edges are import edges within
each reachable graph, not 164 independent calls.

First-level buckets explain the main fan-out. `integration/standalone/index.tsx`
directly imports 18 integration modules, 13 other source modules, 9 external
packages/assets, 4 sagas, 2 selectors, 2 pages, 2 utilities, 1 layout module,
and the global store. `store.ts` directly imports 1 root reducer and 1 root
saga registry along with 5 packages/assets and 3 other modules.
`widgets/index.ts` directly imports 98 widget modules. The document index
imports just 4 integration-local files.

The decisive backend paths are:

```text
integration/standalone/index.tsx
  -> ee/sagas/PageSagas.tsx -> ce/sagas/PageSagas.tsx -> api/PageApi.tsx

store.ts -> ee/sagas/index.tsx -> ce/sagas/index.tsx
  -> sagas/FavoritesSagas.ts -> ee/api/ApplicationApi.tsx

sagas/CanvasSagas/DraggingCanvasSagas.ts
  -> sagas/BuildingBlockSagas/BuildingBlockAdditionSagas.ts
  -> ee/api/ApplicationApi.tsx

sagas/EvaluationsSaga.ts -> sagas/InitSagas.ts -> api/index.ts
```

The native editor is a stateful subsystem. `integration/standalone/index.tsx`
seeds Appsmith user, feature, theme, application, page, and canvas Redux state;
then starts `widgetOperationSagas`, `draggingCanvasSagas`, its selection saga,
and `evaluationSagaListeners` before rendering `Canvas` and `PropertyPane`.
The viewer starts evaluation listeners alone. `WidgetPalette` dispatches into
this state and saga path. Property controls dispatch widget property actions.
The global `store.ts` imports `ee/sagas/index.tsx` even when a caller passes
only the four selected watchers to `runSagaMiddleware`. That root saga also
recurses without the selected watcher list after `SAFE_CRASH_APPSMITH`, so
copying the store would retain a path to the full Appsmith saga registry.

The product app exposes `/workbench` as a first editable AppIDE-shaped page. It uses the four-area Sidebar/Explorer/WidgetEditor/PropertyPane geometry, reads the extracted document and same-origin draft store, migrates and flattens DSL, renders Text, Container, basic Chart, Image, Divider, and Progress widgets plus Statbox container structure, and exports JSON. Its own Redux editor store and sagas add, update, move, resize, delete, undo, redo, and save supported fixed-layout widgets. The palette accepts click and drag placement on the main or nested Container canvas; selected widgets have snapped pointer/keyboard move and resize handles bounded by their parent canvas. The property pane now uses a product-owned adaptation of Appsmith's static widget control configuration: ordered Content/Style sections, choices, validation, and conditional visibility for the six supported widgets. It resolves a restricted set of saved widget references and projects local sample values through the product's transient bindings. This is an adapted fixed-layout editor, not Appsmith's native Canvas or full widget classes. The general JavaScript evaluator, action controls, broader widget catalog, and live data remain unavailable. The old Appsmith-built editor remains separate for its broader widget behavior.

`canvasForDocument` in standalone constructs a fake Page API response and
calls `getCanvasWidgetsPayload` from `ee/sagas/PageSagas.tsx`. That function
calls `extractCurrentDSL` in `utils/WidgetPropsUtils.tsx`, which migrates the
DSL via `@shared/dsl`, then flattens it. This single import reaches the page
API. `canvasPayloadForDocument` now performs the same conversion from a
validated dashboard document without importing PageSagas/PageApi. Applying
`flattenDSL` alone would have omitted migrations.

The `@shared/dsl` runtime has a bounded API-free closure: 95 package files
(91 under `migrate`, 3 under `transform`, and the index), plus two type-only
files that esbuild erases from its runtime graph. The complete historical
migration path includes the 3.07 MB `migrate/helpers/widget-configs.json`,
loaded lazily by migration 12. `src/editor-bridge/dsl` contains those exact
97 Appsmith-owned files, byte-for-byte; `scripts/extract-dsl-runtime.cjs`
recomputes the closure and verifies or refreshes the copy. Five external
packages (lodash, loglevel, micro-memoize, nanoid, normalizr) are declared as
dependencies and are not copied. The closure has no imports into
`app/client/src` or Appsmith's API modules.

## Ordered extraction manifest

Each stage is a source manifest and a required exit gate. The order follows
the small zero-API leaf, then data conversion, state, rendering, and finally
the editable interactions. Native behavior must be retained at each gate.

| Stage | Exact source entry files or package | Destination / change | Exit gate |
|---|---|---|---|
| 0. Dashboard document **done** | `integration/document/{types.ts,validation.ts,createBlankDashboardDocument.ts,exampleDashboardDocument.ts,index.ts,dashboard.schema.v1.json}` | `operator-display-client/src/document`; preserved source behavior | Parity test against original package, including valid, invalid, blank, serialized, and schema cases; zero Appsmith imports |
| 0a. Draft store and shell **done** | `integration/drafts/IndexedDbDraftStore.ts`, `pages/AppIDE/layouts/StaticLayout.tsx`, `integration/workbench` layout measurements | `src/drafts`, `src/layouts/ide`, `src/features/workbench`; product Redux holds route and draft load state | Same-origin draft load, widget selection, JSON export, browser width and zero-Appsmith-request checks. |
| 1. Native document payload **done** | `ce/sagas/PageSagas.tsx#getCanvasWidgetsPayload`, `utils/WidgetPropsUtils.tsx#extractCurrentDSL`, `packages/dsl/src/{transform,migrate}`, `constants/WidgetConstants.tsx` | `src/editor-bridge/canvasPayload.ts` converts a validated dashboard document using the copied 97-file DSL runtime; no PageSagas/PageApi import | Source-backed parity test passes for DSL versions 94, 89, 88, 12, and 1; byte-for-byte DSL copy verification passes |
| 2a. Read-only compatibility state **done** | `ce/selectors/entitiesSelector.ts`, `selectors/dataTreeSelectors.ts`, `selectors/editorSelectors.tsx`, `ce/reducers/uiReducers/mainCanvasReducer.ts` | `src/editor-bridge/compat-store` holds flattened widgets, already resolved display overlays, canvas size, and selection in a separate per-mount Redux store | State seeding, selection, document replacement, resolved overlays, and store isolation pass local contracts; no Appsmith API/store imports |
| 2b. Product fixed-layout editor state **done for supported widgets** | `actions/pageActions.tsx`, `sagas/{WidgetAdditionSagas.ts,WidgetOperationSagas.tsx,CanvasSagas/DraggingCanvasSagas.ts,ReplaySaga.ts}`, `ce/sagas/PageSagas.tsx` as behavior references | `src/editor-bridge/editable-store` owns a per-mount Redux Toolkit store and saga middleware. Command actions run pure DSL transforms, then dispatch a committed layout update; save saga writes revision-checked IndexedDB drafts. | Contract and browser checks cover six widget types, nested Container canvas, add, property update, move, resize, delete, undo/redo, conflict handling, save/reopen, and zero Appsmith requests. |
| 2b1. Static property controls **done for six widgets** | `pages/Editor/PropertyPane/{PropertyPaneView.tsx,PropertyControlsGenerator.tsx}`, `widgets/{TextWidget,ChartWidget,ContainerWidget,ImageWidget,DividerWidget,ProgressWidget}/widget` property configs, `constants/ThemeConstants.tsx` | `src/editor-bridge/property-controls` adapts source sections, field labels, options, validations, conditional visibility, and a static Chart series editor to local controls. `src/features/workbench/WorkbenchPropertyPane.tsx` dispatches each change through stage 2b. | Browser checks cover conditional Text/Progress fields, typed controls, Image interaction, Chart series, local save/reopen, and no Appsmith requests. |
| 2c. Full Appsmith editor compatibility state | `ce/reducers/index.tsx`, `ee/reducers/index.tsx`, `store.ts`, `ee/sagas/index.tsx`, `ce/sagas/index.tsx` | Add only editor-required state/evaluation watchers if broader native components are brought over; do not copy the global store | Full widget evaluation/editing and disposal work; no import edge to root saga, route/package middleware, Sentry enhancer, or Appsmith API |
| 3a. Read-only widget presentation **done for Text, Container, basic Chart, Image, Divider, Progress, and Statbox structure** | `widgets/{TextWidget,ContainerWidget,ChartWidget,ImageWidget,DividerWidget,ProgressWidget,StatboxWidget}`, `components/designSystems/appsmith/WidgetStyleContainer.tsx` | `src/editor-bridge/native-widgets` adapts presentation components; Statbox reuses Container. `/workbench` and `/viewer/items/:id` mount them over migrated DSL | Contract, build, and browser checks cover supported display types, Image source/fallback handling, Divider style, linear/circular Progress, nested Statbox Text, and zero Appsmith requests. Stock Statbox Icon Button content remains unsupported. |
| 3a1. Restricted saved references **done for supported paths** | `utils/DynamicBindingUtils.ts`, `workers/common/DataTreeEvaluator/index.ts` as behavior references | `src/editor-bridge/static-bindings` resolves `{{WidgetName.propertyPath}}` for Text text, basic Chart data, Image URLs, and numeric Progress values through own-property JSON traversal; unsupported JS, cycles, and missing names remain unresolved | Focused contract and browser drafts cover resolved text/chart/image/progress and visible fallbacks; no `eval` or network access |
| 3a2. Transient product bindings **done for local samples** | `integration/runtime/LiveBindingProjector.ts`, `integration/runtime-ui/TransientWidgetOverlay.tsx` | `src/editor-bridge/live-bindings` retains the Java/Cyflex document's latest/history projection rules and applies values only to in-memory render props. `/workbench` can feed labeled local sample values. | Contract and browser checks cover text/chart projection, clearing, export isolation, wrong cell/ID/unit, history bounds, and invalid property paths; no live transport |
| 3b. Widget/evaluation runtime | `utils/workerInstances.ts`, `workers/Evaluation/evaluation.worker.ts`, `widgets/{registry.ts,index.ts}`, `WidgetProvider/factory/registrationHelper.tsx`, `utils/editor/EditorUtils.ts` | Provide loader registry and evaluation worker in the editor-only bundle. Keep its supported widget types explicit and review each lazy import. | Supported widgets evaluate from a validated document; worker starts and terminates per session |
| 4. Canvas and controls | `pages/Editor/Canvas.tsx`, `layoutSystems/CanvasFactory.tsx`, `layoutSystems/fixedlayout/canvas/FixedLayoutEditorCanvas.tsx`, `layoutSystems/fixedlayout/editor/FixedLayoutCanvasArenas`, `integration/widget-palette/{WidgetPalette.tsx,buildPaletteWidget.ts}`, `pages/Editor/PropertyPane/{index.tsx,PropertyPaneView.tsx,PropertyControlsGenerator.tsx}`, `sagas/{WidgetOperationSagas.tsx,CanvasSagas/DraggingCanvasSagas.ts,CanvasSagas/SelectionCanvasSagas.ts,EvaluationsSaga.ts}` | Remove API/analytics/initialization imports from the reachable 278-module cycle, then mount the real components under the editor bridge. Preserve Appsmith widget config and control generation. | Add, move, resize, select, edit properties, undo where supported, snapshot, save, reopen, and browser check with zero Appsmith requests |
| 5a. Marketplace dashboard viewer **done for saved read-only content** | `integration/standalone/index.tsx#renderPublishedViewer`, `integration/viewer-entry/index.tsx`, `layoutSystems/fixedlayout/canvas/FixedLayoutViewerCanvas.tsx` | `/viewer/items/:id` loads Java marketplace bytes and any referenced theme into the shared read-only canvas; widget selection is disabled | Contract and browser fixtures cover POST download, content GET, theme resolution, supported widget display, error states, narrow-screen scrolling, and zero Appsmith requests |
| 5b. Live viewer runtime | `integration/runtime/{LiveBindingProjector.ts,CyflexService.ts}`, viewer run UI | Resolve authorized cell variables, connect Cyflex transport, and feed the transient display overlay | Authorized live latest/history values, connection lifecycle, controls, and real Java/Cyflex deployment checks |
| 6. Product services | `integration/{workspace,drafts,marketplace,publishing,theme-assets,run}` | Move the Java and local persistence clients behind product interfaces; keep Cyflex live transport separate | Marketplace and draft contract checks; same-origin storage migration; live deployment checks once available |

Stage 4 is not a claim that the listed files alone are sufficient. The graph
shows a large strongly connected import component and extra package/asset
edges; each stage must rerun the graph after removing API-facing imports and
record the reduced closure before copying more files. Copying all 1,642
reachable files would preserve the backend coupling rather than extract the
editor. The scoped product editor and adapted widget presentation code do not
yet provide full Appsmith widget, property, and evaluation parity.

The Text and Container component entries each reach about 190 Appsmith source
files and one API module through `WidgetUtils`; their full widget classes reach
about 1,240 source files and 63 API modules through `BaseWidget` and the root
store. The full Chart widget reaches 1,253 files and 63 API modules; its
component reaches 212 files and one API module. Its basic option-builder
branch reaches nine source files and zero API modules. The extracted
`NativeTextView`, `NativeContainerView`, and `BasicChartWidget` use that
smaller presentation boundary with already resolved values. The read-only
compatibility store has no saga or evaluation worker. See the READMEs under
`src/editor-bridge/compat-store` and `src/editor-bridge/native-widgets` for
source paths, supported properties, and fallbacks.

Image and Divider use small presentation adapters; Progress copies and adapts
its isolated component branch with no Appsmith API import. Image URLs are
limited to HTTP(S), same-origin relative paths, and `data:image` values. The
viewer sends no referrer for image requests and refuses same-origin Appsmith
API paths. The read-only Image omits zoom, rotation, download, and click
actions. Progress displays saved values or restricted numeric widget
references; the Cyflex binding target contract has not been extended to
numeric Progress updates. Statbox uses the Container renderer for its shell
and nested canvas, while stock Icon Button children still show an unsupported
widget placeholder.

The full Appsmith `evaluation.worker.ts` reaches 2,187 client source files and
63 API modules because it loads the widget registry and handler maps. Its
`DataTreeEvaluator` branch still reaches 179 files and one API module, and
the worker executes JavaScript expressions. The restricted resolver makes no
claim to general Appsmith expression parity. It accepts only simple widget
property references in the supported display paths and never runs expression code.
The separate product binding projector takes normalized, already authorized
cell samples; variable resolution, Cyflex frame decoding, NATS, and control
routes remain outside this new frontend runtime until deployment details are
available.

The read-only renderer now also serves marketplace dashboard documents. The
viewer calls Java's POST item download route, fetches the returned bytes,
validates the dashboard document, and resolves marketplace theme references
into an inline display copy. Java controls access at the download route;
catalog presence does not grant access. The downloaded document is displayed
without editor selection controls or local draft access. The backend does not
provide an immutable theme revision lookup, so a marketplace theme reference
uses its current bytes. Live Cyflex values and full Appsmith expression
evaluation remain stage 5b and stage 3b work.

## Same-origin compatibility route for remaining native behavior

The remaining native-editor transition can serve the existing Appsmith-built
integration bundle and the product bundle behind **one origin**, using full
page navigation to the old `/workspace?itemId=...` or
`/workspace?draftId=...` editor. The new product bundle now owns
`/viewer/items/:id` for saved marketplace dashboards. The old workspace
entry loads the Java dashboard/local draft and mounts the native editor. A
single origin is required for its IndexedDB draft scope and its
`deploymentId` key; the current development ports 3003 and 3004 are
different origins. The new product app owns bare `/workspace` as its
dashboard catalog. A gateway could route query-bearing
`/workspace?itemId=...` and `/workspace?draftId=...` to the old bundle and
bare `/workspace` to the new bundle. A simpler path-only static gateway could
instead reserve old `/workspace` and move the new catalog to `/dashboards`.
Route dispatch and static asset paths need a browser smoke check in that
gateway; this has not been deployed or verified yet.

An iframe can technically be same-origin under the checked-in `frame-ancestors
'self'` CSP default, but the old editor already renders header, palette,
canvas, and property panel. A product shell around the iframe would duplicate
chrome and introduce nested scrolling and focus handling. Full-page navigation
preserves the current editor behavior with fewer moving parts. Neither route
approach counts as moving native code into the product bundle.

The old entry installs `integration/standalone/networkGuard.ts` before its
other imports. Its integration routes block Appsmith `/api`, `/v1`, `/rts`,
OAuth, login/logout, and user requests while permitting Java
`/operator_display` requests. Existing browser scripts in `app/client/scripts`
exercise the workspace and native drag path with fixtures. The separate
product bridge now has a route-independent request guard and a tested mount
contract, but it deliberately has **no** `NativeEditorRuntime` implementation
until the stages above are executable.

## Verification and remaining limits

`scripts/document-contract.test.cjs` compares the extracted document package
against the original and passes. `scripts/canvas-payload.parity.test.cjs`
compares the adapter with the current `getCanvasWidgetsPayload` and
`extractCurrentDSL` **function bodies read from source**, using the original
shared DSL package for the expected result. It passes for versions 94, 89,
88, 12, and 1. It does not load the full PageSagas module, whose unrelated
imports include backend/API modules. `scripts/extract-dsl-runtime.cjs`
verifies 97 copied DSL files byte-for-byte. `scripts/editor-bridge.contract.test.cjs`
verifies guard-before-loader order, Java route allowance, Appsmith route block
across fetch/XHR/WebSocket/EventSource/beacon, single mount, validated
snapshot/events, and disposal with a fake runtime; it does not verify native
editing. The `editable-store` contract verifies command/saga updates,
nested Container creation, geometry, undo/redo, deletion, conflict-preserving
draft saves, and no transport calls. `tsconfig.editor-bridge.json` typechecks the extracted package and
the full product `tsconfig.json` typecheck passes. `scripts/check-boundary.cjs`
passes for product source. The read-only compatibility-store contract covers
state seeding, selection, display overlays, replacement, and isolation. The
Text/Container contract and browser harness cover resolved rich text, links,
overflow, and container styles. The Image/Divider and Progress contracts cover
URL filtering, static fallback, divider geometry, value bounds, and linear/
circular rendering. The Chart contract covers empty and populated
basic ECharts option paths and special category keys. The restricted-reference
contract covers typed chart arrays, mixed Text, missing names, cycles, unsafe
paths, Image URLs, and numeric Progress references. The live-binding contract
covers normalized samples, cell/ID/unit
isolation, time bounds, and transient overlays. The product browser flow
verifies `/workbench` with an example document, same-origin IndexedDB drafts,
palette click and drag placement, property edits, pointer move/resize,
revision-checked save, and reload,
empty and populated ECharts SVGs, resolved and unresolved saved references,
sample values, clearing samples, and export isolation. The browser fixture
also verifies `/viewer/items/:id` download and content retrieval, read-only
rendering, Image, Divider, Progress, nested Statbox Text, unresolved fallbacks,
detail/workspace navigation, error states, and mobile horizontal
scrolling. It reports no Appsmith API requests or page errors. These checks do not prove
full widget or JavaScript expression parity or a live Cyflex session.

The graph is reproducible with the commands above. A same-origin two-bundle
gateway, full native editor bundle extraction, and live Java/Cyflex deployment
verification remain open. The payload adapter feeds the product's editable
workbench presentation and the read-only published viewer, but Appsmith's native
editor runtime is not mounted in this bundle.
