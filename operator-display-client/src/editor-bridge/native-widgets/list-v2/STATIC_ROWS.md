# List V2 literal-row projection

`materializeStaticListV2Rows(listDsl, { pageNo, pageSize })` returns a `ready`
page with visible rows, or an `unsupported` reason. Supply the **evaluated**
`pageSize` from `listV2PageSize`; Appsmith recalculates it from the available
height and does not treat the initial DSL property as final. Each row has its
Appsmith primary key, global `currentIndex`, page-relative `viewIndex`, and a
cloned item-container subtree at `row.runtimeWidget.dsl`.

The clone is a runtime projection. The saved List DSL keeps one item template,
and the caller must not append projected rows to `document.layout.dsl`. To
render, pass the row clone to the existing Fixed widget renderer inside the
`NativeListV2View.materializedRows` slot. The caller owns the page number and
pagination controls; this module has no Redux or backend side effects.

Source mapping:

- `MetaWidgetGenerator.generate` and `getSlicedByCurrentView` select visible
  rows; `getStartIndex` produces global indices on client-side pages.
- `MetaWidgetGenerator.generatePrimaryKeys` and
  `ListWidget.generatePrimaryKeys` use literal primary keys or a value-derived
  fallback. This package recognizes the exact `currentItem["id"]` expression
  emitted by Appsmith's List blueprint, without running arbitrary JS. The
  fallback uses canonical JSON as a stable local key; Appsmith hashes it with
  `object-hash` for its meta-widget cache. Duplicate key occurrences receive a
  suffix in the local runtime projection.
- `MetaWidgetGenerator.addDynamicPathsProperties` and
  `addCurrentItemProperty` scope template bindings to a row. This package
  resolves only safe own-property paths from `currentItem` and `currentIndex`.
  Unsupported expressions stay unresolved and appear in
  `row.unresolvedBindings`.
- Event/trigger properties are removed from the runtime clone as a defensive
  boundary when this projector is called directly. Integration dashboard
  validation rejects configured Appsmith event handlers in the authored
  template, so neither saved templates nor static rows can run those actions.
- `MetaWidgetGenerator.updateContainerPosition` places visible containers at
  page-relative rows with `(itemSpacing - 8) / 10` spacing.
- `ListWidget.getWidgetView` supplies the empty state. `NativeListV2View`
  renders that shell; use this page's `empty` value with its `listData` prop.

The Fixed workbench uses this projection for literal `listData`, displays the
generated rows in `NativeListV2View`, and keeps page number in the mounted
widget view. The saved DSL retains exactly one template subtree. Its children
are locked in the local editor: clicking a projected row selects the List,
and palette drops into the List are disabled. List `Items` accepts a JSON
array, while `onItemClick`, `onPageChange`, server-side pagination, and
arbitrary JS bindings are not exposed.

This projection does not implement Appsmith's meta-widget cache, editor's
editable first template row, infinite scroll, virtualization, selected-item
meta state, actions, nested-list level data, arbitrary JS, or Cyflex row
expressions. `unsupported` is returned for dynamic list data, custom
primary-key expressions, nested lists, and those pagination modes. The local
pagination presentation uses source dimensions and client-side page changes;
it does not import `rc-pagination` or run Appsmith page actions.

Verify with `node src/editor-bridge/native-widgets/list-v2/static-rows.contract.test.cjs`
from `operator-display-client`.
