import moment from "moment";
import punycode from "punycode";
import { merge } from "lodash";

// Literal names from Appsmith JSONFormWidget/constants.ts and schemaParser.ts.
export const ROOT_SCHEMA_KEY = "__root_schema__";
export const ARRAY_ITEM_KEY = "__array_item__";
export const MAX_ALLOWED_FIELDS = 50;

export const JSON_FORM_DEFAULTS = {
  flexVerticalAlignment: "start",
  responsiveBehavior: "fill",
  minWidth: 450,
  useSourceData: false,
  animateLoading: true,
  backgroundColor: "#fff",
  columns: 25,
  disabledWhenInvalid: true,
  fixedFooter: true,
  rows: 41,
  schema: {},
  scrollContents: true,
  showReset: true,
  title: "Form",
  version: 1,
  borderWidth: "1",
  borderColor: "#E0DEDE",
  widgetName: "JSONForm",
  autoGenerateForm: true,
  fieldLimitExceeded: false,
  sourceData: "",
  isVisible: true,
  submitButtonLabel: "Submit",
  resetButtonLabel: "Reset",
  submitButtonStyles: { buttonVariant: "PRIMARY" },
  resetButtonStyles: { buttonVariant: "SECONDARY" },
} as const;

export type JsonFormFieldType =
  | "Array" | "Checkbox" | "Currency Input" | "Datepicker" | "Email Input"
  | "Multiselect" | "Multiline Text Input" | "Number Input" | "Object"
  | "Password Input" | "Phone Number Input" | "Radio Group" | "Select"
  | "Switch" | "Text Input";

export interface JsonFormSchemaItem {
  accessor: string;
  children: JsonFormSchema;
  dataType: string;
  defaultValue?: unknown;
  fieldType: JsonFormFieldType;
  identifier: string;
  isCustomField: boolean;
  isDisabled: boolean;
  isRequired: boolean;
  isVisible: boolean;
  label: string;
  originalIdentifier: string;
  position: number;
  sourceData?: unknown;
  [property: string]: unknown;
}

export type JsonFormSchema = Record<string, JsonFormSchemaItem>;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Port of sourceDataValidationFn's JSON/string acceptance, restricted to its Object contract. */
export function parseJsonFormSourceData(value: unknown): Record<string, unknown> | undefined {
  if (isObject(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return isObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Appsmith's WidgetUtils.sanitizeKey, including its punycode ASCII step. */
export function sanitizeJsonFormKey(key: string, existingKeys: string[] = []): string {
  let sanitized = punycode.toASCII(key).replace(/[^\w]/gi, "_");
  if (!sanitized) sanitized = "_";
  if (/\d/.test(sanitized[0])) sanitized = `_${sanitized}`;
  if (!existingKeys.includes(sanitized)) return sanitized;
  const suffix = sanitized.match(/\d+$/);
  const prefix = suffix ? sanitized.slice(0, suffix.index) : sanitized;
  const max = existingKeys.reduce((last, candidate) => {
    const matched = candidate.match(/\d+$/);
    const base = matched ? candidate.slice(0, matched.index) : candidate;
    return base === prefix ? Math.max(last, matched ? Number(matched[0]) : 0) : last;
  }, 0);
  return `${prefix}${max + 1}`;
}

/** The two array branches of SchemaParser.normalizeArrayValue. */
export function normalizeArrayValue(items: unknown[]): unknown {
  if (isObject(items[0])) {
    return items.reduce<Record<string, unknown>>((result, item) => {
      if (isObject(item)) merge(result, item);
      return result;
    }, {});
  }
  return items[0];
}

const DATE_FORMATS = [
  "YYYY-MM-DDTHH:mm:ss.sssZ", "LLL", "LL", "YYYY-MM-DD HH:mm",
  "YYYY-MM-DDTHH:mm:ss", "YYYY-MM-DD hh:mm:ss A", "DD/MM/YYYY HH:mm",
  "D MMMM, YYYY", "H:mm A D MMMM, YYYY", "YYYY-MM-DD", "MM-DD-YYYY",
  "DD-MM-YYYY", "MM/DD/YYYY", "DD/MM/YYYY", "DD/MM/YY", "MM/DD/YY",
];

/** Appsmith SchemaParser.fieldTypeFor: arrays, typed primitives, email, then date. */
export function jsonFormFieldTypeFor(value: unknown): JsonFormFieldType {
  if (Array.isArray(value)) {
    const inner = value[0];
    if (Array.isArray(inner) || isObject(inner) || typeof inner === "function") return "Array";
    if (inner !== undefined) return "Multiselect";
    return "Array";
  }
  if (isObject(value)) return "Object";
  if (typeof value === "boolean") return "Switch";
  if (typeof value === "number" || typeof value === "bigint") return "Number Input";
  if (typeof value === "string") {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Email Input";
    if (DATE_FORMATS.some((format) => moment(value, format, true).isValid())) return "Datepicker";
  }
  return "Text Input";
}

function dataTypeFor(value: unknown): string {
  return value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
}

function defaultFieldOptions(fieldType: JsonFormFieldType): Record<string, unknown> {
  // Component defaults from JSONFormWidget/fields/{Input,Select,MultiSelect,Date,Array,Object}Field.
  if (fieldType === "Select" || fieldType === "Multiselect" || fieldType === "Radio Group")
    return { options: [{ label: "Blue", value: "BLUE" }, { label: "Green", value: "GREEN" },
      { label: "Red", value: "RED" }] };
  if (fieldType === "Datepicker")
    return { dateFormat: "YYYY-MM-DD HH:mm", convertToISO: false,
      minDate: "1920-12-31T18:30:00.000Z", maxDate: "2121-12-31T18:29:00.000Z" };
  if (fieldType === "Array") return { isCollapsible: true };
  return {};
}

function startCase(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function schemaForObject(value: Record<string, unknown>, previous: JsonFormSchema = {}): JsonFormSchema {
  const schema: JsonFormSchema = {};
  const reserved = [ARRAY_ITEM_KEY, ROOT_SCHEMA_KEY];
  for (const [position, [key, fieldValue]] of Object.entries(value).entries()) {
    const previousItem = Object.values(previous).find((item) =>
      item.originalIdentifier === key && !item.isCustomField);
    const identifier = previousItem?.identifier ?? sanitizeJsonFormKey(key, [...Object.keys(schema), ...reserved]);
    const fieldType = jsonFormFieldTypeFor(fieldValue);
    const sameType = previousItem && (previousItem.dataType === dataTypeFor(fieldValue) || fieldValue === null || fieldValue === undefined) &&
      !(Array.isArray(fieldValue) && Array.isArray(previousItem.sourceData) &&
        dataTypeFor(fieldValue[0]) !== dataTypeFor(previousItem.sourceData[0]));
    const old = sameType ? previousItem : undefined;
    const children = fieldType === "Object" && isObject(fieldValue)
      ? schemaForObject(fieldValue, old?.children)
      : fieldType === "Array" && Array.isArray(fieldValue)
        ? { [ARRAY_ITEM_KEY]: schemaForValue(ARRAY_ITEM_KEY, normalizeArrayValue(fieldValue), 0,
          old?.children?.[ARRAY_ITEM_KEY]) }
        : {};
    schema[identifier] = {
      accessor: key, dataType: dataTypeFor(fieldValue),
      fieldType: old?.fieldType || fieldType, identifier, isCustomField: false,
      isDisabled: false, isRequired: false, isVisible: true,
      label: startCase(key) || key, originalIdentifier: key, position,
      ...defaultFieldOptions(fieldType), ...(old || {}),
      children, sourceData: fieldValue,
    };
  }
  for (const item of Object.values(previous)) {
    if (item.isCustomField && !schema[item.identifier]) schema[item.identifier] = item;
  }
  return schema;
}

function schemaForValue(key: string, value: unknown, position: number,
  previous?: JsonFormSchemaItem): JsonFormSchemaItem {
  const fieldType = jsonFormFieldTypeFor(value);
  const children = fieldType === "Object" && isObject(value)
    ? schemaForObject(value, previous?.children)
    : fieldType === "Array" && Array.isArray(value)
      ? { [ARRAY_ITEM_KEY]: schemaForValue(ARRAY_ITEM_KEY, normalizeArrayValue(value), 0,
        previous?.children?.[ARRAY_ITEM_KEY]) }
      : {};
  return {
    accessor: key, dataType: dataTypeFor(value), fieldType,
    identifier: key, isCustomField: false, isDisabled: false, isRequired: false,
    isVisible: true, label: startCase(key), originalIdentifier: key,
    position, ...defaultFieldOptions(fieldType),
    ...(previous || {}), children, sourceData: value,
  };
}

/** Mirrors SchemaParser.parse's root shape while preserving unchanged field config. */
export function generateJsonFormSchema(sourceData: Record<string, unknown>,
  previous: JsonFormSchema = {}): JsonFormSchema {
  const root = previous[ROOT_SCHEMA_KEY];
  const rootItem = schemaForValue(ROOT_SCHEMA_KEY, sourceData, 0, root);
  rootItem.label = "";
  rootItem.accessor = ROOT_SCHEMA_KEY;
  rootItem.originalIdentifier = ROOT_SCHEMA_KEY;
  rootItem.children = schemaForObject(sourceData, root?.children);
  return { [ROOT_SCHEMA_KEY]: rootItem };
}

/** Appsmith helper.countFields: arrays of objects count merged keys times length. */
export function countJsonFormFields(value: unknown): number {
  if (Array.isArray(value)) {
    const normalized = normalizeArrayValue(value);
    return isObject(normalized) ? countJsonFormFields(normalized) * value.length : 0;
  }
  if (!isObject(value)) return 0;
  return Object.values(value).reduce<number>((count, next) => count + 1 + countJsonFormFields(next), 0);
}

/** Uses source values by default, as generated Appsmith bindings resolve to sourceData. */
export function formDefaultsFromSchema(item: JsonFormSchemaItem, source: unknown): unknown {
  if (item.fieldType === "Object") {
    const result: Record<string, unknown> = {};
    for (const child of Object.values(item.children)) {
      result[child.identifier] = formDefaultsFromSchema(child,
        isObject(source) ? source[child.originalIdentifier] : undefined);
    }
    return result;
  }
  if (item.fieldType === "Array") {
    if (!Array.isArray(source)) return [];
    const child = item.children[ARRAY_ITEM_KEY];
    return child ? source.map((entry) => formDefaultsFromSchema(child, entry)) : [];
  }
  if (typeof item.defaultValue === "string" && item.defaultValue.includes("{{")) return source;
  return item.defaultValue !== undefined ? item.defaultValue : source;
}

/** Source helper.convertSchemaItemToFormData's visible/accessor conversion. */
export function formDataFromSchema(item: JsonFormSchemaItem, value: unknown,
  source: unknown, useSourceData: boolean): unknown {
  if (item.fieldType === "Object") {
    const result: Record<string, unknown> = {};
    for (const child of Object.values(item.children)) {
      if (!child.isVisible && !useSourceData) continue;
      const sourceValue = isObject(source) ? source[child.originalIdentifier] : undefined;
      const childValue = !child.isVisible ? sourceValue : isObject(value) ? value[child.identifier] : undefined;
      result[child.accessor] = formDataFromSchema(child, childValue, sourceValue, useSourceData);
    }
    return result;
  }
  if (item.fieldType === "Array") {
    const child = item.children[ARRAY_ITEM_KEY];
    return child && Array.isArray(value) ? value.map((entry, index) =>
      formDataFromSchema(child, entry, Array.isArray(source) ? source[index] : undefined,
        useSourceData)) : [];
  }
  return value;
}

export function jsonFormValid(item: JsonFormSchemaItem, value: unknown): boolean {
  if (!item.isVisible) return true;
  if (item.fieldType === "Object") return Object.values(item.children).every((child) =>
    jsonFormValid(child, isObject(value) ? value[child.identifier] : undefined));
  if (item.fieldType === "Array") {
    if (item.isRequired && (!Array.isArray(value) || value.length === 0)) return false;
    const child = item.children[ARRAY_ITEM_KEY];
    return !child || !Array.isArray(value) || value.every((entry) => jsonFormValid(child, entry));
  }
  if (!item.isRequired) return true;
  if (item.fieldType === "Switch" || item.fieldType === "Checkbox") return value === true;
  if (item.fieldType === "Multiselect") return Array.isArray(value) && value.length > 0;
  return value !== undefined && value !== null && value !== "";
}

/** Appsmith's generateFieldState shape, using current local validation. */
export function fieldStateFromSchema(item: JsonFormSchemaItem, value: unknown): unknown {
  if (item.fieldType === "Object") {
    const state: Record<string, unknown> = {};
    for (const child of Object.values(item.children)) {
      state[child.accessor] = fieldStateFromSchema(child,
        isObject(value) ? value[child.identifier] : undefined);
    }
    return state;
  }
  if (item.fieldType === "Array") {
    const child = item.children[ARRAY_ITEM_KEY];
    return child && Array.isArray(value) ? value.map((entry) =>
      fieldStateFromSchema(child, entry)) : [];
  }
  return {
    isDisabled: item.isDisabled,
    isRequired: item.isRequired,
    isVisible: item.isVisible,
    isValid: jsonFormValid(item, value),
  };
}
