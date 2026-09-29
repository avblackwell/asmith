# Property control schema

`index.ts` adapts the static part of Appsmith's property pane configuration for the six widget types currently supported by the local editor. Labels, sections, order, options, control types, and conditional visibility follow these Apache-2.0 Appsmith sources:

- `app/client/src/widgets/TextWidget/widget/index.tsx`
- `app/client/src/widgets/ChartWidget/widget/propertyConfig.ts`
- `app/client/src/widgets/ContainerWidget/widget/index.tsx`
- `app/client/src/widgets/ImageWidget/widget/index.tsx`
- `app/client/src/widgets/DividerWidget/widget/index.tsx`
- `app/client/src/widgets/ProgressWidget/widget/index.tsx`
- `app/client/src/constants/ThemeConstants.tsx` (radius and shadow values)

The schema is product-owned data with no import from Appsmith's root Redux store, evaluator, widget factory, actions, or backend. `getPropertySections(type, tab, widget)` filters static `hidden` dependencies for the selected widget. The local property pane can render the listed controls and dispatch changes through the isolated editor store.

The local `CHART_DATA` adapter edits static series and validates JSON points before saving them as arrays for the basic chart renderer. The subset leaves out controls that require infrastructure not yet in this frontend: Appsmith's JS expression switch and code editor, custom chart configuration, event/action selectors, dynamic-height injection, and `animateLoading` (no request-driven loading lifecycle). Chart type offers the five basic chart types supported by the local renderer. Image zoom, rotation, and download controls use the local image view's interaction adapter. Appsmith's `isBindProperty`/`isJSConvertible` flags are retained only for future compatibility; the local editor does not expose a general JS evaluator.

Source `borderWidth` is validated as a number by Appsmith even though older DSLs may contain a numeric string. The control reports `valueType: "number"`; the caller can normalize the displayed legacy value. Divider `capSide` options are numbers `-1`, `0`, and `1`. Chart `labelOrientation` values are lowercase.
