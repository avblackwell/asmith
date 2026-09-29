# Dashboard document V1

`DashboardDocument` is the client-owned JSON package for marketplace dashboard content and browser-local drafts. `parseDashboardDocument` validates imports before they reach the renderer. `serializeDashboardDocument` validates before file export or marketplace upload. `importDashboardDocumentFile` reads a browser `Blob` or `File`.

`dashboard.schema.v1.json` describes the portable envelope and field shapes. The TypeScript parser additionally checks cross-references, duplicate IDs, widget bounds, target property types, exact uint64 limits, and known runtime secret keys.

Integration dashboards do not store Appsmith query actions, JS objects, or installed JS libraries. The parser rejects configured widget event handlers, including nested trigger paths, so a button action cannot be silently saved or published without an executor. Ordinary display bindings remain available. The format does not prove that an arbitrary imported expression refers only to built-in values; authors should create documents through the integration editor.

The `layout.dsl` field keeps Appsmith's fixed-layout widget tree. `compatibility.widgetDslVersion` records the root `CANVAS_WIDGET` version separately from the package's `schemaVersion`; loading a different DSL version will require a client migration or compatibility check. Widget-specific property migrations remain future work.

Widget bounds accept finite numbers because Appsmith's native container blueprint can produce fractional inner-canvas widths. Bounds must still be nonnegative and nonempty.

`variables` declare logical names or decimal uint64 Cyflex IDs. `bindings` select a signed 32-bit unit code and a widget property. The selected authorized cell resolves logical names when Run starts. History bindings describe bounded chart data; samples belong in transient run state and are not written into this package. The example's logical name and unit code are illustrative, pending a development cell's variable metadata.

The integration editor's **Live data binding** panel writes these fields without Appsmith expressions. Select a Text widget for a latest-value template or a Chart series for bounded numeric history, then create or reuse a variable. Authors can type a logical selector or, in the marketplace workspace, browse an authorized test cell's `/cyflex/variables` metadata to fill the exact label. The chosen cell is used only for discovery and is not saved in the dashboard. Authors still enter the signed unit code and value type; cell-specific metadata and unit compatibility remain to be verified against a deployment. Binding changes are local edits until the draft is saved or a snapshot is explicitly published.

`componentDependencies` pin the origin of copied group widgets already present in the DSL. An embedded copy can render without marketplace access. Marketplace-backed copies carry an item ID and content digest, allowing a future importer to detect changed source content. This is not linked component update propagation.

The inline theme stores the selected Appsmith theme properties; a marketplace theme can be referenced by ID and revision. The renderer adapter still needs to construct the complete `AppTheme` object from these values. Live values, run UUIDs, credentials, and connection addresses are outside this schema. The validator rejects known runtime credential keys, but it cannot recognize secrets hidden in arbitrary widget text.

Run the focused tests from `app/client` with `node_modules/.bin/jest --config src/integration/document/jest.node.config.cjs --runInBand`. The dedicated Node environment avoids loading the app's browser test setup for this pure JSON module.
