// The canvas imports this view by direct path dynamically to preserve its lazy chunk.
export { NativeRichTextEditorView } from "./NativeRichTextEditorView";
export type { NativeRichTextEditorViewProps } from "./NativeRichTextEditorView";
export { NativeJsonFormView } from "./NativeJsonFormView";
export type { NativeJsonFormViewProps } from "./NativeJsonFormView";
export { RICH_TEXT_DEFAULTS, RICH_TEXT_DEFAULT_PROPERTIES,
  richTextEditorValue, richTextIsValid } from "./richTextModel";
export { JSON_FORM_DEFAULTS, ROOT_SCHEMA_KEY, ARRAY_ITEM_KEY, MAX_ALLOWED_FIELDS,
  parseJsonFormSourceData, generateJsonFormSchema, countJsonFormFields,
  jsonFormFieldTypeFor, sanitizeJsonFormKey, normalizeArrayValue,
  formDefaultsFromSchema, formDataFromSchema, jsonFormValid, fieldStateFromSchema } from "./jsonFormModel";
export type { JsonFormSchema, JsonFormSchemaItem, JsonFormFieldType } from "./jsonFormModel";
export { RICH_JSON_PROPERTY_CONTROLS } from "./propertyConfig";
export function isRichJsonWidget(type: string): type is "RICH_TEXT_EDITOR_WIDGET" | "JSON_FORM_WIDGET" {
  return type === "RICH_TEXT_EDITOR_WIDGET" || type === "JSON_FORM_WIDGET";
}
