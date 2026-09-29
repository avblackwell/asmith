# Rich Text Editor and JSON Form Fixed widget port

## Appsmith source read before edits

- `app/client/src/widgets/RichTextEditorWidget/widget/index.tsx`: Fixed defaults (24 columns, 20 rows), property pane, default/meta/derived mappings, markdown conversion, TinyMCE lazy boundary and `onTextChange` dispatch.
- `app/client/src/widgets/RichTextEditorWidget/component/index.tsx`: TinyMCE 7.9.3 plugin set, toolbar, iframe content style, serialization sync, collapsed-caret font handling, Appsmith `tox` CSS, disabled and dynamic-height behavior. `AppsmithRichTextEditor.tsx` is copied from this file; only its imports for the local label, type names, OS check and copied WDS CSS were adapted. The React lazy boundary is kept by `NativeRichTextEditorView`.
- `app/client/src/widgets/components/LabelWithTooltip.tsx`, `app/client/src/components/constants.ts`, `app/client/src/widgets/WidgetUtils.ts`, `app/client/src/WidgetProvider/constants.ts`, and `app/client/src/theme/wds.css`: label layout, position values, compact threshold, and iframe theme variables. `RteLabelWithTooltip.tsx` keeps the layout/label contract but does not include Appsmith's design-system tooltip implementation.
- `app/client/src/widgets/JSONFormWidget/widget/index.tsx`, `widget/propertyConfig.ts`, `widget/helper.ts`, `schemaParser.ts`, `constants.ts`, `helper.ts`: defaults (25 columns, 41 rows), `AUTO_HEIGHT` default, source schema generation, source/data accessor conversion, 50-field limit, field state, meta behavior and property definitions.
- `app/client/src/widgets/JSONFormWidget/component/{index,Form,Field,FieldLabel,useFixedFooter,styleConstants}.tsx`, `fields/{FieldRenderer,ObjectField,ArrayField,InputField,SelectField,MultiSelectField,DateField,CurrencyInputField,PhoneInputField,CheckboxField,SwitchField,RadioGroupField}.tsx`: field rendering, React Hook Form state and reset, fixed footer geometry, nested fields and field defaults.
- `app/client/src/widgets/WidgetUtils.ts` `sanitizeKey` and `app/client/src/WidgetProvider/constants.ts` `dateFormatOptions`: Unicode key sanitization and Datepicker field inference.

## Integration contract

- `isRichJsonWidget(type)` handles `RICH_TEXT_EDITOR_WIDGET` and `JSON_FORM_WIDGET`. Render `NativeRichTextEditorView` or `NativeJsonFormView` from the read-only canvas with the widget DSL, transient widget meta, `editor={mode === "editor"}`, theme color/radius/shadow, and an `onMetaChange` batch callback in viewer mode.
- Add widget defaults with `RICH_TEXT_DEFAULTS` and `JSON_FORM_DEFAULTS`. Fixed dimensions are 24×20 and 25×41 respectively. Rich Text uses `FIXED` height by default; JSON Form uses `AUTO_HEIGHT`. Both use Fixed horizontal positioning. Thumbnails in this directory are copied from each Appsmith widget folder.
- Register `RICH_JSON_PROPERTY_CONTROLS[type]` for content/style. `sourceData` is edited as JSON text in the local pane; the renderer accepts an object or JSON object text. The current pane cannot display an object value in that control or edit Appsmith's `FIELD_CONFIGURATION` panel.
- Rich Text defaults map `text` to `defaultText`. On an authored default edit, reset `text` and `isDirty` in the compat store. JSON Form starts with meta `{ formData: {}, fieldState: {} }`; its renderer emits `formData`, `fieldState`, and `isValid` after a 200 ms debounce, matching Form.tsx.
- Pass an optional `onSubmit(formData)` from the product action layer when one is available. The source's `onSubmit`, `onTextChange`, and per-field action strings are not executed by this isolated module.

## Preserved behavior and limits

Rich Text uses Appsmith's actual TinyMCE component and matching package versions (`tinymce` 7.9.3, `@tinymce/tinymce-react` 6.3.0, `showdown` 1.9.1). Markdown default text is converted to HTML before editing. Only a focused editor change emits transient `{ text, isDirty: true }`. The local label uses the same `label-container` class, compact/side layout, max 70% side width and style properties; it lacks Appsmith's ellipsis tooltip and help icon package.

JSON Form uses Appsmith's React Hook Form 7.28.0, source field type names, root/array schema keys, source type inference, punycode key sanitization, schema preservation for unchanged fields, 50-field default limit, nested object/array data conversion, required validation, reset and footer dimensions. It renders the source field categories, but field controls are bounded adapters: the full Appsmith `SelectComponent`, `MultiSelectComponent`, currency/phone dropdowns, array accordion, field-specific validation/regex controls, and the full `FIELD_CONFIGURATION` editor have not been copied. Datepicker uses Blueprint DateInput. The JSON Form widget itself is functional for basic typed source data and for preconfigured schemas; its complete per-field editing, evaluation bindings and action dispatch remain open.

Appsmith source generated field defaults as evaluator bindings into `sourceData`. This port resolves static source data directly. JavaScript `{{ }}` bindings rely on the surrounding product binding evaluator and are not evaluated inside this module. The `sourceData` one-click datasource binding control and `Connect data` overlay action have no product backend contract yet.

## Verification

- `node src/editor-bridge/native-widgets/rich-json-form/rich-json-form.contract.test.cjs`: defaults, markdown, schema inference, Unicode sanitization, nested defaults, config preservation, validation and accessor conversion.
- `node src/editor-bridge/native-widgets/rich-json-form/rich-json-form.browser.test.cjs`: TinyMCE toolbar and actual iframe editing/meta, JSON Form nested source rendering, required validation, debounce, submission callback and reset.
- `node node_modules/typescript/bin/tsc --noEmit --pretty false` and `node scripts/check-boundary.cjs` passed during the port.
