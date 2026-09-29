import type { AppsmithWidgetDsl } from "../../../document";

export const CHOICE_WIDGET_TYPES = [
  "SELECT_WIDGET",
  "MULTI_SELECT_WIDGET_V2",
  "CHECKBOX_GROUP_WIDGET",
  "SWITCH_GROUP_WIDGET",
] as const;

export type ChoiceWidgetType = typeof CHOICE_WIDGET_TYPES[number];

export function isChoiceWidget(type: string): type is ChoiceWidgetType {
  return (CHOICE_WIDGET_TYPES as readonly string[]).includes(type);
}

export interface ChoiceOption {
  label: string;
  value: string | number | boolean;
}

export interface ChoiceMeta {
  value?: unknown;
  label?: unknown;
  selectedOptions?: unknown;
  selectedValues?: unknown;
  selectedValuesArray?: unknown;
  filterText?: unknown;
  isDirty?: unknown;
}

const COLORS = [
  { name: "Blue", code: "BLUE" },
  { name: "Green", code: "GREEN" },
  { name: "Red", code: "RED" },
];
const GROUP_OPTIONS = [
  { label: "Blue", value: "BLUE" },
  { label: "Green", value: "GREEN" },
  { label: "Red", value: "RED" },
];

/** Appsmith Fixed getDefaults, excluding the editor-assigned widgetName and geometry. */
export const CHOICE_DEFAULTS: Record<ChoiceWidgetType, Record<string, unknown>> = {
  SELECT_WIDGET: {
    placeholderText: "Select option", labelText: "Label", labelPosition: "Top",
    labelAlignment: "LEFT", labelWidth: 5, sourceData: JSON.stringify(COLORS, null, 2),
    optionLabel: "name", optionValue: "code", serverSideFiltering: false,
    defaultOptionValue: "GREEN", version: 1, isFilterable: true,
    isRequired: false, isDisabled: false, animateLoading: true,
    labelTextSize: "0.875rem", responsiveBehavior: "fill",
    dynamicPropertyPathList: [{ key: "sourceData" }],
  },
  MULTI_SELECT_WIDGET_V2: {
    animateLoading: true, labelText: "Label", labelPosition: "Top",
    labelAlignment: "LEFT", labelWidth: 5, labelTextSize: "0.875rem",
    sourceData: COLORS, optionLabel: "name", optionValue: "code",
    isFilterable: true, serverSideFiltering: false,
    defaultOptionValue: ["GREEN", "RED"], version: 1,
    isRequired: false, isDisabled: false, placeholderText: "Select option(s)",
    responsiveBehavior: "fill",
  },
  CHECKBOX_GROUP_WIDGET: {
    animateLoading: true, labelTextSize: "0.875rem", options: GROUP_OPTIONS,
    defaultSelectedValues: ["BLUE"], isDisabled: false, isInline: true,
    isRequired: false, isVisible: true, labelText: "Label",
    labelPosition: "Top", labelAlignment: "LEFT", labelWidth: 5,
    version: 2, flexVerticalAlignment: "start",
  },
  SWITCH_GROUP_WIDGET: {
    options: GROUP_OPTIONS, defaultSelectedValues: ["BLUE"], isDisabled: false,
    isRequired: false, isInline: true, isVisible: true, animateLoading: true,
    alignment: "LEFT", labelText: "Label", labelPosition: "Top",
    labelAlignment: "LEFT", labelWidth: 5, version: 1,
    labelTextSize: "0.875rem", flexVerticalAlignment: "start",
  },
};

/** Original Fixed row/column defaults from each Appsmith widget class. */
export const CHOICE_DIMENSIONS: Record<ChoiceWidgetType, { rows: number; columns: number }> = {
  SELECT_WIDGET: { rows: 7, columns: 20 },
  MULTI_SELECT_WIDGET_V2: { rows: 7, columns: 20 },
  CHECKBOX_GROUP_WIDGET: { rows: 6, columns: 23 },
  SWITCH_GROUP_WIDGET: { rows: 6, columns: 26 },
};

export const CHOICE_DEFAULT_PROPERTY_MAP: Record<ChoiceWidgetType, Record<string, string>> = {
  SELECT_WIDGET: { value: "defaultOptionValue", label: "defaultOptionValue", filterText: "" },
  MULTI_SELECT_WIDGET_V2: { selectedOptions: "defaultOptionValue" },
  CHECKBOX_GROUP_WIDGET: { selectedValues: "defaultSelectedValues" },
  SWITCH_GROUP_WIDGET: { selectedValuesArray: "defaultSelectedValues" },
};

function primitive(value: unknown): ChoiceOption["value"] | null {
  return typeof value === "string" || typeof value === "number" ||
    typeof value === "boolean" ? value : null;
}

function optionValue(value: unknown): ChoiceOption["value"] | null {
  if (value !== null && typeof value === "object" && "value" in value) {
    return primitive((value as { value?: unknown }).value);
  }
  return primitive(value);
}

function sourceRows(value: unknown): Record<string, unknown>[] | null {
  let rows = value;
  if (typeof rows === "string") {
    try { rows = JSON.parse(rows); } catch { return null; }
  }
  if (!Array.isArray(rows) || rows.some((row) =>
    row === null || typeof row !== "object" || Array.isArray(row))) return null;
  return rows as Record<string, unknown>[];
}

function selectArray(values: unknown[], source: Record<string, unknown>[]): unknown[] {
  // SelectWidget/derived.js treats an evaluated array of repeated key names
  // differently from MultiSelectWidgetV2/derived.js.
  if (!source.length || !values.length) return values;
  if (values.every((item) => item === values[0]) &&
    typeof values[0] === "string" && values[0] in source[0]) {
    return source.map((row) => row[values[0] as string]);
  }
  return values;
}

function optionColumn(rows: Record<string, unknown>[], key: unknown, multi: boolean): unknown[] {
  if (typeof key === "string") return rows.map((row) => row[key]);
  if (Array.isArray(key)) return multi ? key : selectArray(key, rows);
  return [];
}

/** Port of Select/MultiSelectV2 derived.js getOptions with local JSON parsing. */
export function sourceOptions(widget: AppsmithWidgetDsl, multi = false): ChoiceOption[] | null {
  const rows = sourceRows(widget.sourceData ?? CHOICE_DEFAULTS.SELECT_WIDGET.sourceData);
  if (!rows) return null;
  const labels = optionColumn(rows, widget.optionLabel ?? "name", multi);
  const values = optionColumn(rows, widget.optionValue ?? "code", multi);
  return rows.map((_row, index) => ({
    label: labels[index] == null ? "" : String(labels[index]),
    value: primitive(values[index]) ?? "",
  }));
}

export function groupOptions(value: unknown): ChoiceOption[] | null {
  const rows = sourceRows(value ?? GROUP_OPTIONS);
  if (!rows) return null;
  return rows.map((row) => ({
    label: row.label == null ? String(row.value ?? "") : String(row.label),
    value: primitive(row.value) ?? "",
  }));
}

export function defaultGroupValues(value: unknown, checkbox = false): ChoiceOption["value"][] {
  let values = value;
  if (checkbox && typeof values === "string") {
    const authoredText = values;
    try { values = JSON.parse(values); } catch {
      values = authoredText ? authoredText.split(",").map((v: string) => v.trim()) : [];
    }
  }
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(optionValue).filter((v): v is ChoiceOption["value"] => v !== null))];
}

/** Appsmith Select derived value/label and Group selected value fallbacks. */
export function selectedChoice(widget: AppsmithWidgetDsl, meta: ChoiceMeta = {}): {
  value: ChoiceOption["value"] | "";
  label: string;
  values: ChoiceOption["value"][];
  labels: string[];
  options: ChoiceOption[] | null;
} {
  const type = widget.type;
  const options = type === "SELECT_WIDGET" || type === "MULTI_SELECT_WIDGET_V2"
    ? sourceOptions(widget, type === "MULTI_SELECT_WIDGET_V2") : groupOptions(widget.options);
  const available = options ?? [];
  if (type === "SELECT_WIDGET") {
    const authoredValue = meta.value === undefined ? widget.defaultOptionValue : meta.value;
    let value = optionValue(authoredValue) ?? "";
    if (!available.some((item) => item.value === value) &&
      (!widget.serverSideFiltering || (!meta.isDirty &&
        (authoredValue === null || typeof authoredValue !== "object" || Array.isArray(authoredValue))))) value = "";
    const selected = available.find((item) => item.value === value);
    const metaLabel = meta.label === undefined ? widget.defaultOptionValue : meta.label;
    const label = selected?.label ?? (widget.serverSideFiltering && metaLabel != null ?
      String((metaLabel as { label?: unknown })?.label ?? metaLabel) : "");
    return { value, label, values: value === "" ? [] : [value], labels: label ? [label] : [], options };
  }
  const metaProperty = type === "MULTI_SELECT_WIDGET_V2" ? "selectedOptions"
    : type === "SWITCH_GROUP_WIDGET" ? "selectedValuesArray" : "selectedValues";
  const fallback = type === "MULTI_SELECT_WIDGET_V2" ? widget.defaultOptionValue
    : widget.defaultSelectedValues;
  let values = defaultGroupValues(meta[metaProperty] === undefined ? fallback : meta[metaProperty],
    type === "CHECKBOX_GROUP_WIDGET");
  // MultiSelectV2 derived.js preserves values absent from a filtered server
  // result after interaction; otherwise it removes absent defaults.
  if (type === "MULTI_SELECT_WIDGET_V2") {
    if (!meta.isDirty) values = values.filter((item) => available.some((option) => option.value === item));
  } else {
    values = values.filter((item) => available.some((option) => option.value === item));
  }
  const selectedOptions = meta[metaProperty] === undefined ? fallback : meta[metaProperty];
  const labels = values.map((value) => available.find((item) => item.value === value)?.label ??
    (Array.isArray(selectedOptions) ? selectedOptions.find((item) => optionValue(item) === value)?.label : undefined) ??
    String(value));
  return { value: "", label: "", values, labels, options };
}
