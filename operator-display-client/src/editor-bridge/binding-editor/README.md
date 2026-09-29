# Binding editor: native Appsmith precedent and Cyflex adapter

The earlier `app/client/src/integration/binding-editor/` was added for this project. It is **not** an original Appsmith binding editor. `model.ts` began as that project's Cyflex document operation and is kept for the dashboard package contract; it is not a native Appsmith binding implementation.

## Original Appsmith flow

- `app/client/src/widgets/TextWidget/widget/index.tsx` declares Text `text` as a bindable `INPUT_TEXT` property. `app/client/src/components/propertyControls/InputTextControl.tsx` renders `LazyCodeEditor` in `TEXT_WITH_BINDING` mode, so the binding is entered at the property itself.
- `app/client/src/widgets/ChartWidget/widget/propertyConfig.ts` declares nested Chart series `data` as bindable. `app/client/src/components/propertyControls/ChartDataControl.tsx` renders each series' data editor in `JSON_WITH_BINDING` mode.
- `app/client/src/pages/Editor/PropertyPane/PropertyControl.tsx` places the JS toggle beside convertible property labels. `app/client/src/utils/PropertyControlFactory.tsx` switches those controls to `CODE_EDITOR`; `app/client/src/sagas/WidgetOperationSagas.tsx` records dynamic paths on the widget DSL and saves the layout.
- `app/client/src/components/editorComponents/CodeEditor/hintHelpers.ts` calls `CodemirrorTernService`. Autocomplete and evaluated-value display depend on Appsmith's evaluator data tree, worker, selectors, action state, and `{{...}}` expression semantics.
- `app/client/src/components/propertyControls/OneClickBindingControl.tsx` and `app/client/src/sagas/OneClickBindingSaga.ts` work with Appsmith queries and datasources; the saga calls `ActionAPI.createAction`. They are not a Cyflex variable picker.

## Adaptation in this client

The property-local control follows the original placement: Text `text` and each Chart series `data` expose their connection next to the static property editor. It authors `DashboardDocument.variables[]` and `bindings[]`, the local package used by Cyflex resolution and the transient runtime overlay. It does not write Appsmith `{{...}}` expressions or claim to evaluate them. Redux actions and sagas commit one validated, undoable document change; local draft save stores the declaration, while sample values remain transient.

`model.ts` validates each operation against the entire document and only accepts Text latest or existing Chart series history targets. `contract.test.cjs` covers the document and projector contract.
