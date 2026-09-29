# Read-only basic ChartWidget extraction

Source: `app/client/src/widgets/ChartWidget` in this repository, under the
repository's Apache-2.0 license. The copied Appsmith files are
`component/EChartsConfigurationBuilder.ts`, `component/EChartsDatasetBuilder.ts`,
and the four `component/LayoutBuilders/ECharts*.ts` files. Their import paths
were changed to this folder. `types.ts`, `helpers.ts`, `basicChartOptions.ts`,
and `BasicChartWidget.tsx` isolate and adapt the small basic ECharts path.

The full `widget/index.tsx` static graph reaches 1,253 `app/client/src` files,
including 63 API modules through `BaseWidget -> store -> root sagas`. The full
`component/index.tsx` graph reaches 212 source files and one API module through
its Redux selectors. `EChartsConfigurationBuilder.ts` reaches nine source
files and no API modules. This adapter requires `echarts@6.1.0` and React from
the product package. It copies no chart assets. The
`CustomEChartIFrameComponent` and FusionCharts runtime remain outside this
extraction.

The adapter renders Appsmith's five basic types: area, pie, line, bar, and
column. It uses Appsmith's chart dataset, layout, and option builders, the SVG
ECharts renderer, and the same empty-data message. It accepts already resolved
DSL values only. Custom ECharts, FusionCharts, scatter, JavaScript `{{...}}`
evaluation, action dispatch on data-point click, Appsmith loading/syntax-error
state, and live Cyflex history projection are outside this component. The
read-only workbench must supply theme values and projected chart data when
those are available; it never sends Appsmith backend requests.

The runtime registers only the needed ECharts charts, components, and SVG
renderer through `echarts/core`. This reduced the built main JavaScript chunk
from about 1,906 kB to 1,376 kB (gzip: 623 kB to 449 kB). SVG font options
include an Arial/sans-serif fallback when the saved theme font is unavailable.
