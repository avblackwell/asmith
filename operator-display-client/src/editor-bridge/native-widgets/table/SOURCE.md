# Table renderers: Appsmith source map

This folder ports the **read-only display path** for `TABLE_WIDGET_V2` and the legacy `TABLE_WIDGET`. The source was inspected before implementation.

| Local behavior | Appsmith source |
| --- | --- |
| TableV2 defaults, empty `tableData`, visibility toggles and `primaryColumns` | `app/client/src/widgets/TableWidgetV2/widget/index.tsx`, `getDefaults` |
| Legacy sample data, `columnSizeMap`, `columnOrder` and hidden palette card | `app/client/src/widgets/TableWidget/widget/index.tsx`, `getDefaults` and `getConfig` |
| V2 discovered keys, derived columns and existing column reuse | `TableWidgetV2/widget/index.tsx`, `createTablePrimaryColumns`; `widget/utilities.ts`, `getAllTableColumnKeys` and `getDefaultColumnProperties` |
| V2 first non-null column type inference (number, boolean, HTML, text) | `TableWidgetV2/widget/utilities.ts`, `getColumnType` |
| V2 ordered columns and literal `computedValue` row values | `TableWidgetV2/widget/derived.js`, `getOrderedTableColumns` and `getFilteredTableData` |
| Legacy order appends unspecified columns | `TableWidget/widget/derived.js`, `getTableColumns` |
| Column width 150px, minimum 60px, last visible column fill/shrink, hidden columns on editor canvas | `TableWidgetV2/widget/reactTableUtils/getColumnsPureFn.tsx` |
| Compact row/header sizes, fixed header, odd/even rows and border styles | `TableWidgetV2/component/Constants.ts`, `TableStyledWrappers.tsx`, `Table.tsx`, `StaticTable/StaticTableBodyComponent.tsx` |
| Client search, type-aware numeric/date/text sort, and page slicing | `TableWidgetV2/widget/derived.js`, `getFilteredTableData`; `component/Table.tsx` |
| Empty TableV2 editor overlay | `TableWidgetV2/widget/index.tsx`, `getWidgetView`; `component/Table.tsx` |

The integration API is `NativeTableView({ widget, width, height, mode })`; `mode` is `"editor"` or `"viewer"`. The widget can be passed from the compat renderer without changing the authored DSL. Search text, sort order and page number live in component state. `tableData` and column `computedValue` accept literal arrays, JSON array strings or already resolved values. Dynamic `{{...}}` expressions are **never evaluated here**.

This branch does not connect Appsmith command handlers, row selection/editing, filters, download, server pagination callbacks, infinite scrolling, query results, or dynamic column properties. Their visible controls are disabled where a click would otherwise imply an action. Appsmith's full `react-table`/Blueprint/SimpleBar component tree and all cell types are outside this read-only port. The local view renders text, number, select label, safe HTML, image, checkbox/switch, URL text and disabled action cell content; advanced formatting and Moment-based date inference are not yet reproduced.
