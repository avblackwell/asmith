// Appsmith TableWidgetV2/widget/derived.js and TableWidget/widget/derived.js
// are the source for this read-only projection. Widget meta and JS evaluation
// remain outside this module; every returned object is transient.

export type TableRow = Record<string, unknown>;
export type TableKind = "TABLE_WIDGET_V2" | "TABLE_WIDGET";
export type TableMode = "editor" | "viewer";

export interface TableWidgetLike {
  widgetId: string;
  widgetName?: string;
  type: string;
  [property: string]: unknown;
}

export interface TableColumn {
  id: string;
  alias: string;
  originalId: string;
  label: string;
  columnType: string;
  width: number;
  hidden: boolean;
  isDerived: boolean;
  enableSort: boolean;
  alignment: "LEFT" | "CENTER" | "RIGHT";
  computedValues?: unknown[];
  displayText?: unknown;
  selectOptions?: unknown;
  isCellVisible?: boolean | boolean[];
  buttonColor?: unknown;
  menuColor?: unknown;
  borderRadius?: unknown;
  boxShadow?: unknown;
  buttonVariant?: unknown;
  buttonLabelColor?: unknown;
  menuVariant?: unknown;
  buttonLabel?: unknown;
  menuButtonLabel?: unknown;
}

export interface TableSort {
  column: string;
  order: "asc" | "desc";
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function recordProperty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function finitePositive(value: unknown): number | undefined {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function staticArray(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value.includes("{{")) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

// The live Appsmith evaluator resolves bound tableData before its derived
// properties run. A standalone read-only canvas can consume only literals or
// data already resolved by its caller; it never evaluates a binding string.
export function normalizeStaticTableData(tableData: unknown): TableRow[] {
  return (staticArray(tableData) ?? []).filter(isRecord).map((row) => ({ ...row }));
}

export function getAllTableColumnKeys(rows: TableRow[]): string[] {
  const keys = new Set<string>();
  rows.forEach((row) => Object.keys(row).forEach((key) => {
    if (key !== "__originalIndex__" && key !== "__primaryKey__") keys.add(key);
  }));
  return [...keys];
}

// Appsmith TableWidgetV2/widget/utilities.ts getColumnType scans at most five
// rows to find the first non-null value. Its date inference uses Moment's
// configured format list, which this read-only branch does not load.
export function inferStaticColumnType(rows: TableRow[], key: string): string {
  for (let index = 0; index < Math.min(rows.length, 5); index++) {
    const value = rows[index][key];
    if (value == null) continue;
    if (typeof value === "number") return "number";
    if (typeof value === "boolean") return "checkbox";
    if (typeof value === "string" && /<[^>]*>/.test(value)) return "html";
    return "text";
  }
  return "text";
}

function orderedColumnIds(kind: TableKind, available: string[], order: unknown): string[] {
  if (!Array.isArray(order) || order.length === 0) return available;
  const known = [...new Set(order.filter((id): id is string => typeof id === "string"))]
    .filter((id) => available.includes(id));
  // TableWidgetV2/derived.js getOrderedTableColumns keeps only ordered IDs.
  // TableWidget/derived.js getTableColumns appends all remaining IDs.
  return kind === "TABLE_WIDGET" ? [...known, ...available.filter((id) => !known.includes(id))] : known;
}

export function getTableColumns(
  widget: TableWidgetLike,
  rows: TableRow[],
  width: number,
  mode: TableMode,
): TableColumn[] {
  const kind: TableKind = widget.type === "TABLE_WIDGET" ? "TABLE_WIDGET" : "TABLE_WIDGET_V2";
  const primary = recordProperty(widget.primaryColumns);
  const allKeys = getAllTableColumnKeys(rows);
  const configured = Object.entries(primary).filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]));
  const hasData = rows.length > 0;
  const projected = new Map<string, Record<string, unknown>>();

  // TableWidgetV2/widget/index.tsx createTablePrimaryColumns reuses existing
  // originalId/alias and discovers every key in the data. The legacy widget
  // removes stale non-derived columns when its table data changes.
  allKeys.forEach((key) => {
    const existing = configured.find(([id, props]) =>
      props.originalId === key || props.alias === key || id === key);
    if (existing) projected.set(existing[0], existing[1] as Record<string, unknown>);
    else projected.set(key, { id: key, alias: key, originalId: key, label: key,
      columnType: kind === "TABLE_WIDGET_V2" ? inferStaticColumnType(rows, key) : "text", isVisible: true });
  });
  configured.forEach(([id, value]) => {
    if ((!hasData || value.isDerived === true) && !projected.has(id)) projected.set(id, value as Record<string, unknown>);
  });

  const widthMap = recordProperty(kind === "TABLE_WIDGET" ? widget.columnSizeMap : widget.columnWidthMap);
  const ordered = orderedColumnIds(kind, [...projected.keys()], widget.columnOrder);
  const columns = ordered.map((id): TableColumn => {
    const source = projected.get(id) ?? {};
    const alias = typeof source.alias === "string" ? source.alias : id;
    const originalId = typeof source.originalId === "string" ? source.originalId : alias;
    const visibility = source.isCellVisible;
    const hidden = source.isVisible === false || visibility === false ||
      (Array.isArray(visibility) && visibility.length > 0 && visibility.every((item) => item === false));
    return {
      id,
      alias,
      originalId,
      label: typeof source.label === "string" ? source.label : id,
      columnType: typeof source.columnType === "string" ? source.columnType : "text",
      width: Math.max(60, finitePositive(widthMap[id]) ?? 150),
      hidden,
      isDerived: source.isDerived === true,
      enableSort: source.enableSort !== false,
      alignment: source.horizontalAlignment === "RIGHT" || source.horizontalAlignment === "CENTER"
        ? source.horizontalAlignment : "LEFT",
      computedValues: staticArray(source.computedValue),
      displayText: source.displayText,
      selectOptions: source.selectOptions,
      isCellVisible: Array.isArray(visibility) || typeof visibility === "boolean" ? visibility : undefined,
      buttonColor: source.buttonColor,
      menuColor: source.menuColor,
      borderRadius: source.borderRadius,
      boxShadow: source.boxShadow,
      buttonVariant: source.buttonVariant,
      buttonLabelColor: source.buttonLabelColor,
      menuVariant: source.menuVariant,
      buttonLabel: source.buttonLabel,
      menuButtonLabel: source.menuButtonLabel,
    };
  });

  const visible = columns.filter((column) => !column.hidden);
  const hidden = columns.filter((column) => column.hidden);
  // getColumnsPureFn.tsx stretches or shrinks the last visible column to fill
  // the table and places hidden columns at the end only on the editor canvas.
  const total = visible.reduce((sum, column) => sum + column.width, 0);
  const last = visible[visible.length - 1];
  if (last && Number.isFinite(width) && width > 0) {
    if (total < width) last.width += width - total;
    else if (total > width && total - width < last.width && last.width > 60)
      last.width = Math.max(60, last.width - (total - width));
  }
  return mode === "editor" ? [...visible, ...hidden] : visible;
}

export function getTablePageSize(widget: TableWidgetLike, height: number, rowCount: number): number {
  // getWidgetView receives pageSize after Appsmith's derived-property pass.
  // In the standalone renderer a numeric, already evaluated value may be
  // supplied; defaultPageSize is present in defaults but unused by this path.
  const explicit = finitePositive(widget.pageSize);
  if (explicit) return Math.max(1, Math.floor(explicit));
  const kind: TableKind = widget.type === "TABLE_WIDGET" ? "TABLE_WIDGET" : "TABLE_WIDGET_V2";
  const compact = widget.compactMode;
  const rowHeight = compact === "TALL" ? 60 : compact === "SHORT" ? (kind === "TABLE_WIDGET" ? 20 : 30) : 40;
  const available = (Math.max(0, height) - 10 - 38 - 32) / rowHeight;
  if (kind === "TABLE_WIDGET") return Math.max(1, Math.ceil(available));
  return Math.max(1, available % 1 > 0.3 && rowCount > available ? Math.ceil(available) : Math.floor(available));
}

export function getTableCellValue(row: TableRow, column: TableColumn, rowIndex: number): unknown {
  if (column.computedValues && rowIndex < column.computedValues.length) return column.computedValues[rowIndex];
  if (column.isDerived) return "";
  return row[column.alias] ?? row[column.originalId] ?? row[column.id];
}

export function isTableCellVisible(column: TableColumn, rowIndex: number): boolean {
  return Array.isArray(column.isCellVisible) ? column.isCellVisible[rowIndex] !== false : column.isCellVisible !== false;
}

function displayValue(value: unknown, column: TableColumn, rowIndex: number): string {
  if (column.columnType === "url" && column.displayText) {
    const text = Array.isArray(column.displayText) ? column.displayText[rowIndex] : column.displayText;
    if (typeof text === "string") return text;
  }
  if (column.columnType === "select") {
    const options = staticArray(column.selectOptions);
    const selected = options?.find((option) => isRecord(option) && option.value === value);
    if (isRecord(selected) && selected.label != null) return String(selected.label);
  }
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function getTableDisplayText(row: TableRow, column: TableColumn, rowIndex: number): string {
  const value = getTableCellValue(row, column, rowIndex);
  if (column.columnType === "html") return displayValue(value, column, rowIndex).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return displayValue(value, column, rowIndex);
}

export function getClientTableRows(
  rows: TableRow[],
  columns: TableColumn[],
  searchText: string,
  sort: TableSort | undefined,
): Array<{ row: TableRow; originalIndex: number }> {
  const searchable = columns.filter((column) => !column.hidden && !column.id.startsWith("__"));
  const search = searchText.trim().toLocaleLowerCase();
  const filtered = rows.map((row, originalIndex) => ({ row, originalIndex }))
    .filter(({ row, originalIndex }) => !search || searchable.some((column) =>
      getTableDisplayText(row, column, originalIndex).toLocaleLowerCase().includes(search)));
  const sortColumn = columns.find((column) => column.id === sort?.column && column.enableSort);
  if (!sortColumn) return filtered;
  const direction = sort?.order === "desc" ? -1 : 1;
  return filtered.sort((a, b) => {
    const av = getTableCellValue(a.row, sortColumn, a.originalIndex);
    const bv = getTableCellValue(b.row, sortColumn, b.originalIndex);
    const aEmpty = av == null || av === "";
    const bEmpty = bv == null || bv === "";
    if (aEmpty || bEmpty) return aEmpty === bEmpty ? a.originalIndex - b.originalIndex : aEmpty ? 1 : -1;
    if (sortColumn.columnType === "number" || sortColumn.columnType === "currency") {
      const difference = Number(av) - Number(bv);
      if (Number.isFinite(difference) && difference !== 0) return direction * difference;
    } else if (sortColumn.columnType === "date") {
      const difference = Date.parse(String(av)) - Date.parse(String(bv));
      if (Number.isFinite(difference) && difference !== 0) return direction * difference;
    }
    const difference = getTableDisplayText(a.row, sortColumn, a.originalIndex).toLocaleLowerCase()
      .localeCompare(getTableDisplayText(b.row, sortColumn, b.originalIndex).toLocaleLowerCase());
    return direction * difference || a.originalIndex - b.originalIndex;
  });
}
