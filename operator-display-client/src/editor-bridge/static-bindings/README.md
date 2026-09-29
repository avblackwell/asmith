# Restricted saved widget references

`resolveStaticReferences` is product-owned read-only code. It follows the
behavior of Appsmith's binding parser and DataTreeEvaluator for the limited
`{{WidgetName.propertyPath}}` case: a sole expression can return a typed JSON
value, while mixed text interpolates primitive values. Source references are
`app/client/src/utils/DynamicBindingUtils.ts` and
`app/client/src/workers/common/DataTreeEvaluator/index.ts`.

It resolves only declared `dynamicBindingPathList` entries for
`TEXT_WIDGET.text`, `CHART_WIDGET.chartData.*`, and string-valued
`IMAGE_WIDGET.image`/`defaultImage`, and finite numeric
`PROGRESS_WIDGET.progress`. It reads own JSON properties,
rejects prototype segments, stops cycles, and leaves unknown or unsupported
expressions visibly unresolved. It never runs JavaScript, calls a backend, or
changes the saved DSL. It does not provide Appsmith's evaluator worker,
actions, JS objects, query results, `appsmith` context, or arbitrary template
syntax. Run `node src/editor-bridge/static-bindings/contract.test.cjs` to
check typed chart results, text interpolation, missing references, cycles,
and unsafe paths.

`diagnoseStaticReferenceErrors` derives conservative per-widget badge counts
from the same declared, pure reference grammar. Appsmith's
`layoutSystems/common/widgetName/utils.ts:getErrorCount` sums the lengths of
the widget evaluator's error arrays across property paths; our independent
client has no Appsmith evaluator worker, so it counts only missing widgets,
missing own-property paths, and static reference cycles that can be proven
from the saved DSL. Unsupported JavaScript expressions, Appsmith context,
known built-in names, and external Cyflex variable names passed through
`externalEntityNames` are left unclassified. It does not claim an error for
type mismatches, JavaScript primitive/array accessors, or a property that
merely depends on a failing property.
Run `node src/editor-bridge/static-bindings/diagnostics.contract.test.cjs`.
