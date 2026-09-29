# Fixed List V2 source slice

This package materializes Appsmith's Fixed `LIST_WIDGET_V2` template, extracts
its non-evaluator layout rules, and ports its visual shell. The Fixed workbench
now supports adding, moving, resizing, styling, and editing literal JSON
`listData` on a List. It renders visible rows through a runtime-only static
projection. The Appsmith meta-widget editor and evaluator remain outside this
boundary.

## Checked-in Appsmith source

| Source | Ported behavior |
| --- | --- |
| `app/client/src/widgets/ListWidgetV2/widget/defaultProps.ts` | Default data, bindings, primary-key expression, `List > Canvas > Container > Canvas > Image + two Text` blueprint, locked template container, and Fixed dynamic-height operation. |
| `app/client/src/widgets/ListWidgetV2/testData.ts` | Materialized Fixed geometry: outer detached canvas uses pixel dimensions; the first item container is 12 rows by 64 columns; image and text positions match the fixture. |
| `app/client/src/widgets/ListWidgetV2/widget/index.tsx` | Averaged item-spacing and page-size formulas, pagination condition, empty/too-small ordering, loading branch, and nested-List limit. |
| `app/client/src/widgets/ListWidgetV2/widget/helper.ts` | Maximum three List levels on add, paste, or drop. |
| `app/client/src/widgets/ListWidgetV2/component/index.tsx`, `Loader.tsx`, and `app/client/src/widgets/WidgetUtils.ts` | List container, empty state, scrolling wrapper, and loading card structure and CSS. |
| `app/client/src/widgets/ListWidgetV2/component/ListPagination.tsx` | 28px client-side page controls at the bottom of the List; the local view implements its presentation without `rc-pagination` or action execution. |
| `app/client/src/widgets/ListWidgetV2/widget/propertyConfig.ts` | Data, General, Color, and Border/shadow sections for properties supported by the static List. Its action, selection, and server pagination controls remain unavailable. |
| `app/client/src/constants/WidgetConstants.tsx` | 4px widget padding and 10px row size. |

`createListV2Blueprint` takes a caller-allocated ID and name for each of the
six descendants. The caller must also ensure they are unique across the whole
document. It writes `mainCanvasId`, `mainContainerId`, and the `primaryKeys`
expression in the same transaction as the subtree. Appsmith's source omits a
`version` in List default props; the local document requires one, so this
builder assigns version 1. The CE `getAssetUrl` is the identity function, so
the source's default image resolves to
`https://assets.appsmith.com/widgets/default.png`. A caller can supply an
airgapped URL through `defaultImageUrl`.

The checked-in flattened fixture leaves the inner template canvas's right and
bottom bounds `null`; Appsmith calculates that frame while rendering the
container. The local document validator requires finite bounds, so the
blueprint stores the container's 12-by-64 grid as the inner canvas bounds.
The local Fixed renderer computes the actual inner canvas frame from its
container when this subtree is integrated.

The blueprint intentionally preserves `{{currentItem.*}}` expressions. These
are template bindings, not values to display verbatim. The workbench projects
only literal `listData` through `materializeStaticListV2Rows`; row clones are
never appended to the document. `NativeListV2View` receives those projected
rows and a local client-side paginator. The view accepts evaluated `listData`,
measured `templateHeight`, `componentHeight`, and `pageSize` for Appsmith's
loading, empty, and too-small states. `listV2PageSize` computes the source
formula. The page number is transient React state; page changes do not edit
the DSL.

## Still dependent on Appsmith runtime

- `MetaWidgetGenerator.ts` clones the template per visible row, assigns stable
  row keys, updates IDs/positions, builds row caches, and handles nested Lists.
- The evaluator resolves `listData`, `primaryKeys`, `currentItem`,
  `currentIndex`, `currentView`, and `level_*` bindings. This package performs
  no JavaScript expression evaluation or substitution.
- `ListWidget` maintains selected/triggered row meta state, page numbers,
  default selection, and server pagination action triggers.
- Infinite scrolling uses TanStack's virtualizer. `NativeListV2View` ports the
  scroll wrapper CSS but does not virtualize rows.
- Appsmith's `ListPagination.tsx` uses `rc-pagination`, widget icons, and the
  action executor. The supplied `pagination` node is a presentation slot, not
  a replacement action contract.
- Editor template-row focus and nested-canvas drag/drop need the same meta
  widget and selection wiring. The local editor locks that template subtree
  and rejects drops into it. The List widget itself remains editable.

Run `node src/editor-bridge/native-widgets/list-v2/list-v2.contract.test.cjs`
from `operator-display-client` for the blueprint, layout-model, and shell
contract.

Run `node src/editor-bridge/editable-store/list-v2.contract.test.cjs` for the
palette, saved template boundary, literal data, and Fixed pixel geometry.
