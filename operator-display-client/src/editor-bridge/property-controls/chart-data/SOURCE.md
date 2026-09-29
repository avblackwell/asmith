# Chart series property control

Adapted from Appsmith's `app/client/src/components/propertyControls/ChartDataControl.tsx` and the `CHART_DATA` entry in `app/client/src/widgets/ChartWidget/widget/propertyConfig.ts`.

The authored shape remains a map keyed by stable series IDs. Each series has `seriesName`, `data`, and an optional `color`. Add, delete, name, color, and data edits each send one complete immutable map to the local editor action, matching Appsmith's atomic property update pattern. A final series cannot be deleted through the control, following the source control.

Appsmith's code editor stores series data as JSON or binding text and its evaluation worker produces point arrays. This local control accepts static JSON arrays, validates each point, and saves arrays directly. It never evaluates JavaScript. A legacy static JSON string is read for compatibility, but an unresolved binding is presented as unavailable. The color field stays visible for all chart types because this standalone control does not depend on Appsmith's chart type selector.
