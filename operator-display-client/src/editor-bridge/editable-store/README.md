# Local fixed-layout editor state

`createEditableWorkbenchStore(document, options)` creates one Redux Toolkit store and one `redux-saga` task per workbench mount. Dispose it when replacing or unmounting the document. The published viewer keeps its separate read-only store.

The flow follows Appsmith's editor action boundaries without importing its backend sagas:

1. A palette, property, move, resize, delete, or rename command dispatches an intent action.
2. An editor saga applies a validated, pure DSL transform and dispatches the committed document update. Selection remains separate from document history.
3. Undo and redo replay bounded local snapshots. Save requests run a saga that calls the account-scoped `IndexedDbDraftStore` with an expected revision. A conflict keeps unsaved edits for export or recovery.
4. The workbench migrates and flattens the current document into the display compatibility store. No Appsmith `/api`, root store, saga registry, or evaluation worker is loaded.

Fixed auto height uses three dedicated commands: `updateEditorWidgetHeightMode`,
`updateEditorWidgetHeightLimits`, and `measureEditorWidgetHeight`. New Text and
Container widgets receive Appsmith's AUTO_HEIGHT feature defaults. Imported
widgets without `dynamicHeight` continue to behave as Fixed. A ResizeObserver
measurement is padded in pixels, clamped to row limits, then passed through
Appsmith's copied dependency tree and vertical reflow functions under
`appsmith-auto-height/`. The local document adapter processes nested canvases
from child to parent, updates Container height with its two-row extension, and
recomputes root content height. Measurements and page-load checks for explicit
AUTO Containers update the document without an undo entry; mode and limit edits
each create one. Drag-time measurements queue within the editor store and flush
when the drag ends.

Copy and cut use Appsmith's asynchronous clipboard pattern. A Fixed widget
clipboard is stored in IndexedDB under the current deployment and account,
then read on each paste so another draft or a recreated store can use it.
The selected widget IDs feed `resolveFixedPasteTarget` for Appsmith's
selected-widget, Container, and next-row placement rules. Saving the clipboard
precedes a cut's document update, so a failed write cannot delete the source.
`clipboardScope` in the store options supplies ownership for an unsaved
dashboard; a saved draft derives it from `draftScope`. Without either scope,
the clipboard is temporary within that store.

Behavioral source references in the checked-out Appsmith client: `sagas/WidgetAdditionSagas.ts`, `sagas/WidgetOperationSagas.tsx`, `sagas/CanvasSagas/DraggingCanvasSagas.ts`, `sagas/WidgetSelectionSagas.ts`, `ce/reducers/entityReducers/canvasWidgetsReducer.ts`, `ce/sagas/PageSagas.tsx`, and `sagas/ReplaySaga.ts`. This store uses authored nested DSL as its editing snapshot; Appsmith's full normalized editor tree, generated property controls, and JavaScript evaluator remain later extraction work.

The supported templates are Text, Chart, Container, Image, Divider, and Progress. Container includes a structural child canvas. The editor preserves Cyflex bindings as independent runtime overlays; editing a display property changes its saved fallback. Literal property edits clear stale Appsmith dynamic path metadata, while supported simple widget references declare it. Renaming a widget referenced by a saved expression is rejected until reference rewriting is available. Main and nested fixed canvases use a 9000-row root height cap, matching Appsmith's `WidgetHeightLimits.MAX_HEIGHT_IN_ROWS`.

Run `node src/editor-bridge/editable-store/contract.test.cjs` to check layout edits, undo/redo, bound metadata, conflict handling, and absence of transport calls. Run `node src/editor-bridge/editable-store/clipboard.contract.test.cjs` for cross-draft paste, store recreation, ownership isolation, binding preservation, and failed-cut behavior. The full browser flow in `scripts/verify-browser.cjs` checks palette drag, pointer controls, draft save/reload, and viewer isolation.

Run `node src/editor-bridge/editable-store/auto-height.contract.test.cjs` for
new/legacy defaults, reflow, nested Container propagation, limits, undo, and
save/reload. Run `node src/editor-bridge/editable-store/appsmith-auto-height/source-parity.contract.test.cjs`
for Appsmith tree generation and multi-ancestor shrink behavior.
