# Operator Display client

This is the product-owned frontend entry point outside `app/client/src`. The marketplace uses the Appsmith Templates page geometry; the dashboard library follows the Applications rail and card layout; administration uses the extracted Admin Settings frame. The published dashboard viewer shares the workbench's display canvas. These screens use the `operator_display` Java API or account-scoped local drafts. The application has its own Redux Toolkit store and a scoped workbench editor store with saga middleware. It does not mount the Appsmith router, global Redux store, backend sagas, or `/api/v1` client.

## Run locally

With Node.js and pnpm on your `PATH`, install dependencies with `pnpm install --frozen-lockfile`, then run `pnpm run dev:mock-java` and `pnpm dev` in separate terminals. Open `http://127.0.0.1:3004/workspace`.

### Windows Codex host without Node on `PATH`

Node and pnpm are available through the Codex workspace runtime even if they are not on your `PATH`. In PowerShell from this directory, install the locked dependencies once (the first install needs npm registry access):

```powershell
$pnpmBin = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'
& $pnpmBin install --frozen-lockfile
```

Start the local Java-shaped fixture API:

```powershell
$nodeBin = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $nodeBin scripts/mock-java.cjs
```

In a second PowerShell terminal, from this directory:

```powershell
$nodeBin = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $nodeBin scripts/vite.cjs --host 127.0.0.1 --port 3004
```

Open `http://127.0.0.1:3004/marketplace`, `/workspace`, `/workbench`, or `/viewer/items/7`. Select a dashboard card in the workspace, or **View dashboard** on its marketplace detail page, to open the viewer. The mock server provides Java shaped catalog, group, item, dashboard download, and test-cell variable discovery responses. The viewer obtains its document through POST `/operator_display/marketplace/items/{id}/download` and a subsequent content GET, validates the document, resolves a referenced marketplace theme, then mounts the shared display renderer. The renderer supports the Fixed Text, Container, Stats Box, Tabs, Modal, literal List V2, basic Chart, Image, Divider, and Progress slices described below. The viewer has no editor selection or property controls. The mock dashboard starts with `scripts/fixtures/published-dashboard.json`, generated from `src/document/exampleDashboardDocument.ts`, and adds Image, Divider, and Progress widgets for local inspection. The workbench opens an editable example document; **Save as local draft** creates an account-owned IndexedDB draft, and `/workbench?draftId=...` reopens one saved on this same origin. For a real Java deployment, set `OPERATOR_DISPLAY_BACKEND_ORIGIN` to its origin before starting Vite and omit the mock server. Vite proxies `/operator_display` to that origin so session cookies stay same origin in the browser. The Java development storage URL `http://localhost:8080/operator_display/asset/...` is rewritten to that proxy only when this frontend runs on local port 3004; other storage URLs are used as returned.

## Verify

```powershell
& $nodeBin node_modules\typescript\bin\tsc --noEmit -p tsconfig.json
& $nodeBin scripts/check-boundary.cjs
& $nodeBin scripts/marketplace-contract.test.cjs
& $nodeBin src/api/publishedDashboard.contract.test.cjs
& $nodeBin scripts/document-contract.test.cjs
& $nodeBin scripts/editor-bridge.contract.test.cjs
& $nodeBin scripts/canvas-payload.parity.test.cjs
& $nodeBin src/editor-bridge/compat-store/contract.test.cjs
& $nodeBin src/editor-bridge/editable-store/contract.test.cjs
& $nodeBin src/editor-bridge/editable-store/appsmith-auto-height/source-parity.contract.test.cjs
& $nodeBin src/editor-bridge/editable-store/auto-height.contract.test.cjs
& $nodeBin src/editor-bridge/editable-store/list-v2.contract.test.cjs
& $nodeBin src/editor-bridge/editable-store/statbox.contract.test.cjs
& $nodeBin src/editor-bridge/native-widgets/tabs/activeTabAutoHeight.contract.test.cjs
& $nodeBin src/editor-bridge/native-widgets/tabs/projectedCommandConsistency.contract.test.cjs
& $nodeBin src/editor-bridge/native-widgets/modal/modalAutoHeight.contract.test.cjs
& $nodeBin src/editor-bridge/native-widgets/modal/modal-resize.contract.test.cjs
& $nodeBin src/editor-bridge/binding-editor/contract.test.cjs
& $nodeBin src/cyflex/contract.test.cjs
& $nodeBin src/editor-bridge/native-widgets/text-container/text-container.contract.test.cjs
& $nodeBin src/editor-bridge/native-widgets/chart/chart.contract.test.cjs
& $nodeBin src/editor-bridge/native-widgets/static-display/static-display.contract.test.cjs
& $nodeBin src/editor-bridge/native-widgets/progress/progress.contract.test.cjs
& $nodeBin src/editor-bridge/static-bindings/contract.test.cjs
& $nodeBin src/editor-bridge/live-bindings/contract.test.cjs
& $nodeBin scripts/extract-dsl-runtime.cjs
& $nodeBin scripts/vendor-ads.cjs
& $nodeBin scripts/vite.cjs build
& $nodeBin scripts/verify-browser.cjs
& $nodeBin scripts/verify-admin.cjs
```

The first browser check serves the built files and returns controlled Java shaped responses. It verifies the catalog, group filter, item detail and 404, search, dashboard-only workspace filter, viewer navigation/download/error states, local draft loading and editing, palette add, typed and conditional property controls, static Chart series editing, property-local Cyflex Text and Chart binding authoring, authorized-cell variable discovery, Run control requests through Java with an unavailable broker, sample preview, binding undo/redo and IndexedDB persistence, Image zoom/rotation/download, Fixed drag/resize and autoheight, Tabs, Modal grow/shrink, List V2 literal rows, Stats Box, Image, Divider, Progress, empty and populated basic Chart rendering, restricted saved references, export isolation, mobile width, and absence of Appsmith API requests. The admin check expects a running local frontend at port 3004 and verifies group, user, tag, site, test cell, universal variable, and access setup screens with intercepted Java responses. Neither check verifies a live backend.

Local drafts use IndexedDB and are scoped to the browser origin. A draft saved at port 3003 is not visible at port 3004; this bundle reads the existing draft schema when served on the same origin.

Saved Fixed themes also live in IndexedDB. In **App settings → Theme**, use **Theme actions → Save theme** to add a named copy to **Your themes**; the selector can apply or delete it. The library is scoped to the browser origin, signed-in account, and dashboard document ID. Applying a saved theme copies its properties into the dashboard draft, so deleting the library entry does not change an already applied theme. Theme library actions make no backend request. These local themes do not sync to another browser or device.

The workbench has an AppIDE-shaped four-area layout. **New dashboard** in the workspace creates a blank local draft and opens it here. Its per-mount Redux editor store follows Appsmith's command action → operation saga → committed layout update pattern. A save saga validates the document and writes it through the revision-checked IndexedDB draft store. The palette adds Text, Chart, Container, Stats Box, Tabs, Modal, List V2, Image, Divider, and Progress by click or drag into the main or a supported nested Fixed canvas. Tabs has two child canvases by default and supports add, rename, reorder, hide, delete, and nested widget placement through undoable document commands. Modal opens as a detached canvas overlay with static default controls. List V2 renders literal data into runtime-only rows and locks its template while Appsmith's meta-widget editor is absent. Stats Box has Appsmith's three default Text children and a static Icon Button. Supported static properties can be edited in the right pane, including position and size; the pane can delete a widget. **Dashboard tools** contains the dashboard name field. Selected widgets in Fixed canvases have grid-snapped move and resize handles. Undo and redo keep up to 50 local document snapshots. The renderer projects each edit through the migrated/flattened DSL and isolated display store. The canvas property pane offers Appsmith's Fluid, Desktop, Tablet, and Mobile width choices; its resolved pixel width stays out of saved DSL. Alt+T toggles tab-order markers, and Alt+P switches the editor to a full-width viewer preview. A basic Chart with resolved data displays through ECharts; an empty chart shows Appsmith's empty-data message. Images use checked HTTP(S), same-origin relative, or `data:image` URLs with no referrer; image click, zoom, rotation, and download actions are not mounted.

New Text, Container, Stats Box, Tabs, and Modal widgets use Appsmith's Fixed auto-height defaults. Text measures content in the editor; the source-derived auto-height tree moves overlapping siblings and grows Container/Stats Box ancestors. Tabs uses the selected child canvas and four-row header offset for transient view geometry; layout commits normalize to the authored document, then project back to the selected tab so a dragged widget remains at its preview position. Modal is detached: its child Text can grow or shrink the panel without moving root siblings. The editor Modal has Appsmith's four symmetric edge handles; horizontal resize works in both height modes, while vertical resize is available in Fixed mode. The pixel dimensions and nested canvas bounds are undoable and saved with the draft. The property pane supports Fixed, Auto Height, and Auto Height with limits where Appsmith exposes them; Modal offers only Fixed and Auto Height. Measurement changes do not add undo entries; mode and limit changes do. Existing imported widgets without a height mode remain Fixed. The [auto-height source map](src/editor-bridge/appsmith-fixed-autoheight/README.md), [Tabs source map](src/editor-bridge/native-widgets/tabs/README.md), [Modal source map](src/editor-bridge/native-widgets/modal/MODAL_AUTOHEIGHT.md), and [Stats Box source map](src/editor-bridge/native-widgets/statbox/README.md) record the adapters and verification.

There are two binding paths. A restricted resolver supports saved `{{WidgetName.propertyPath}}` references in Text text, Chart data, Image URLs, and numeric Progress values. Missing references, cycles, unsupported types, and arbitrary JavaScript remain visibly unresolved; Appsmith's full evaluator is not mounted. Separately, dashboard `variables` and `bindings` describe Cyflex latest/history projection. In the property pane, **Connect data** beside Text `text` or a Chart series `data` opens a guided Cyflex declaration editor; it can create or reuse a variable, choose a logical label or decimal Cyflex ID, set a signed unit code, and configure text formatting or chart history. **Browse Cyflex variables** lists authorized cells through Java, then requests the selected cell's variables through `/operator_display/remote/tc/{softwareId}/cyflex/variables`; choosing a variable saves only its exact logical label, never the temporary cell or its raw ID. These edits use the per-mount Redux/saga store, can be undone, and persist in local drafts. **Preview sample values** feeds local synthetic values through the extracted projector and a transient widget overlay, then **Clear sample values** restores the saved display. Export JSON always uses the unchanged fallback widget values. The source comparison and boundary are recorded in [binding-editor/README.md](src/editor-bridge/binding-editor/README.md).

**Run dashboard** is in Dashboard tools. It resolves the chosen cell and document bindings using Java's authenticated `/remote/tc/{softwareId}/cyflex` and `/cyflex/variables` proxy routes, sends stream configuration and keepalives through the same proxy, and consumes the exact returned NATS subject directly in the browser over WebSocket. Live values go into the transient widget overlay and are cleared on Stop, document change, or unmount. Run requires the deployment to set `window.operatorDisplayRunEnvironment` before the app starts. Its `connectionForCell(cell, signal)` method returns browser-scoped `natsConnection` options and a deployment-verified `timestampToMs(utime, goTime)` function; see [WorkbenchRunPanel.tsx](src/features/workbench/WorkbenchRunPanel.tsx). The supplied source does not establish the timestamp conversion or a live NATS endpoint. Without that environment, the panel explains that Run is unavailable. The mock Java server demonstrates discovery only and does not simulate live NATS. No Cyflex Basic credentials, NATS credentials, selected cell, or live values are stored in a dashboard document.

This fixed-layout editor renders Appsmith-derived Content and Style sections for the ten palette widget types. Its local control adapter provides text and number inputs, switches, selects, segmented choices, color inputs, conditional fields, section collapse, property search, literal List data, and a static Chart series editor with validated JSON points. Changes dispatch through the per-mount Redux/saga editor store and can be undone, saved, and reopened. Image zoom, rotation, and download controls also work in the shared display view. The local editor accepts literal values and restricted saved references; Appsmith's arbitrary JavaScript evaluation, action dispatch, and full widget registry remain outside this runtime. The viewer displays saved content and unresolved dynamic paths as such; it does not start a Cyflex session. The old Appsmith-built editor remains separate. [NATIVE_EDITOR_EXTRACTION_REPORT.md](NATIVE_EDITOR_EXTRACTION_REPORT.md) records the dependency graph and ordered extraction stages.

## Dependency boundary

`vendor/ads` contains a graph-traced subset of Appsmith ADS: 281 source and asset files, including the components used by this client, design tokens, fonts, and icons. The full source package has about 941 files. `scripts/vendor-ads.cjs` audits the import closure and `--sync` refreshes the copy from this repository. The copy has one documented type-only cast in `Box.styles.tsx`; its rendered CSS is unchanged. The vendored package records its 14 external runtime package imports and keeps source attribution in `vendor/ads/NOTICE.md`.

`pnpm install --frozen-lockfile` succeeded on this host after the first registry-backed install. `pnpm-workspace.yaml` allows postinstall scripts only for `esbuild` and `styled-components`. Local TypeScript, Vite build, and the browser flow passed. A TypeScript resolution trace found zero modules resolved from `app/client`. The browser smoke uses the locally installed `@playwright/test` package and this host's Chrome installation. An initial offline install failed because the pnpm metadata cache was incomplete; a first install on a new machine needs registry access or a populated cache.

`vite.config.cjs` and `scripts/vite.cjs` require this client's own `node_modules`; there is no runtime or build fallback to `app/client`. Refreshing `vendor/ads` still requires the Appsmith source checkout; installing, typechecking, building, and running the already copied client do not. pnpm currently reports a peer-range warning because Vite 6 is outside the declared ranges of the pinned React and SVG Vite plugins; the verified build and browser flow pass with these versions.

The three source parity/audit commands in Verify (`canvas-payload.parity.test.cjs`, `extract-dsl-runtime.cjs`, and `vendor-ads.cjs`) still need the Appsmith checkout. They compare the copied code with upstream source and are not part of the app's runtime or production build.

Adapted layout sources:

- `app/client/src/pages/Templates/index.tsx`
- `app/client/src/pages/Templates/TemplateContent/StyledComponents.tsx`
- `app/client/src/pages/Templates/Template/index.tsx`
- `app/client/src/pages/Templates/TemplateView.tsx`
- `app/client/src/pages/Templates/TemplateViewHeader.tsx`
- `app/client/src/pages/Templates/Template/TemplateDescription.tsx`
- `app/client/src/pages/AdminSettings/SettingsLayout.tsx`
- `app/client/src/pages/AppIDE/layouts/StaticLayout.tsx`
- `app/client/src/pages/AppIDE/components/WidgetAdd/index.tsx`
- `app/client/src/pages/Editor/widgetSidebar/UIEntitySidebar.tsx`
- `app/client/src/pages/Editor/PropertyPane/PropertyPaneView.tsx`

The Appsmith repository has an Apache-2.0 LICENSE; the ADS package manifest declares ISC and has no separate license file. The vendored ADS NOTICE records both, and a copy of the repository license is included alongside it. Keep attribution and license material with redistributed adaptations. The catalog provides browsing, group selection, search, and pagination. The item detail page reads Java metadata and preview images in Appsmith's TemplateView frame and links dashboard items to the read-only viewer. The supplied backend still needs verified publication and visibility routes before those controls can be enabled. Its download endpoint authorizes the requested item; a catalog card or `publishedAt` value alone does not establish visibility to every user.
