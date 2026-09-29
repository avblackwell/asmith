/** Saved-property mapping follows Appsmith's Select and MultiSelectV2 derived.js. */
export interface FormOption {
  label: string;
  value: string | number | boolean;
}

const DEFAULT_SOURCE_DATA = [
  { name: "Blue", code: "BLUE" },
  { name: "Green", code: "GREEN" },
  { name: "Red", code: "RED" },
];

function asRows(sourceData: unknown): Record<string, unknown>[] | null {
  const value = sourceData === undefined ? DEFAULT_SOURCE_DATA : sourceData;
  let parsed = value;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { return null; }
  }
  if (!Array.isArray(parsed)) return null;
  return parsed.filter((row): row is Record<string, unknown> =>
    typeof row === "object" && row !== null && !Array.isArray(row));
}

function optionValues(
  rows: Record<string, unknown>[],
  selector: unknown,
  fallbackKey: string,
  selectSourceArraySemantics: boolean,
): unknown[] {
  const property = selector === undefined ? fallbackKey : selector;
  if (typeof property === "string") return rows.map((row) => row[property]);
  if (!Array.isArray(property)) return [];
  if (!selectSourceArraySemantics || !rows.length) return property;
  // SelectWidget/derived.js expands a repeated key array; MultiSelectV2
  // deliberately uses array entries directly.
  const repeated = property.every((item) => item === property[0]);
  if (repeated && typeof property[0] === "string" &&
    Object.hasOwn(rows[0], property[0])) {
    return rows.map((row) => row[property[0] as string]);
  }
  return property;
}

export function optionsFromSourceData(
  sourceData: unknown,
  optionLabel: unknown,
  optionValue: unknown,
  multiSelect = false,
): FormOption[] | null {
  const rows = asRows(sourceData);
  if (!rows) return null;
  const labels = optionValues(rows, optionLabel, "name", !multiSelect);
  const values = optionValues(rows, optionValue, "code", !multiSelect);
  return rows.map((_row, index) => ({
    label: labels[index] == null ? "" : String(labels[index]),
    value: typeof values[index] === "string" ||
      typeof values[index] === "number" ||
      typeof values[index] === "boolean"
      ? values[index] as string | number | boolean : "",
  }));
}

export function radioOptions(value: unknown): FormOption[] | null {
  const rows = value === undefined
    ? [{ label: "Yes", value: "Y" }, { label: "No", value: "N" }]
    : asRows(value);
  if (!rows) return null;
  return rows.map((row) => ({
    label: row.label == null ? "" : String(row.label),
    value: typeof row.value === "string" || typeof row.value === "number" ||
      typeof row.value === "boolean" ? row.value : "",
  }));
}

export function selectedValue(value: unknown): string | number | boolean | null {
  const unwrapped = typeof value === "object" && value !== null &&
    !Array.isArray(value) && "value" in value
    ? (value as { value: unknown }).value : value;
  return typeof unwrapped === "string" || typeof unwrapped === "number" ||
    typeof unwrapped === "boolean" ? unwrapped : null;
}

export function selectedValues(value: unknown): (string | number | boolean)[] {
  if (!Array.isArray(value)) return [];
  return value.map(selectedValue).filter((item): item is string | number | boolean =>
    item !== null);
}
