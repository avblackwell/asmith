import type { AppsmithWidgetDsl, JsonValue } from "../../../document/types";
import { listV2DataIsEmpty, listV2PageStartIndex } from "./listV2Model";

/**
 * A deliberately small, synchronous counterpart of Appsmith's
 * ListWidgetV2/MetaWidgetGenerator. It handles literal listData and the
 * blueprint's currentItem/currentIndex property bindings. It never executes
 * JavaScript or writes generated widgets into the saved document.
 */

const MAX_ROWS_PER_PAGE = 500;
const MAX_BINDING_LENGTH = 32_768;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const FORBIDDEN_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const BINDING = /\{\{([\s\S]*?)\}\}/g;

export interface ListV2RuntimeWidget {
  /** An ephemeral clone for rendering only; never append this to a document. */
  dsl: AppsmithWidgetDsl;
  templateWidgetId: string;
}

export interface ListV2UnresolvedBinding {
  templateWidgetId: string;
  propertyPath: string;
  expression: string;
}

export interface StaticListV2Row {
  /** Unique in a page, and stable across page and reorder for unique keys. */
  key: string;
  /** Appsmith's primary key before disambiguating duplicate values. */
  primaryKey: string;
  keySource: "literal" | "blueprint-id" | "value";
  currentIndex: number;
  viewIndex: number;
  currentItem: JsonValue;
  /** The cloned item container and its cloned descendants. Runtime only. */
  runtimeWidget: ListV2RuntimeWidget;
  unresolvedBindings: ListV2UnresolvedBinding[];
}

export interface StaticListV2Page {
  status: "ready";
  pageNo: number;
  pageSize: number;
  totalItems: number;
  pageCount: number;
  /** Matches ListWidget's lodash-isEmpty gate on the whole literal listData. */
  empty: boolean;
  rows: StaticListV2Row[];
}

export interface UnsupportedStaticListV2Page {
  status: "unsupported";
  reason:
    | "widget-type"
    | "dynamic-list-data"
    | "unsupported-pagination"
    | "unsupported-primary-keys"
    | "invalid-page"
    | "invalid-template"
    | "nested-list";
  rows: [];
}

export type StaticListV2Materialization =
  | StaticListV2Page
  | UnsupportedStaticListV2Page;

export interface StaticListV2PageOptions {
  pageNo: number;
  /** Supply ListWidget.getPageSize's evaluated value, not stale DSL pageSize. */
  pageSize: number;
}

function unsupported(
  reason: UnsupportedStaticListV2Page["reason"],
): UnsupportedStaticListV2Page {
  return { status: "unsupported", reason, rows: [] };
}

function isJsonValue(value: unknown, seen = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, seen))
    : Object.values(value).every((item) => isJsonValue(item, seen));
  seen.delete(value);
  return valid;
}

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function safePath(source: unknown, segments: readonly string[]):
  { ok: true; value: JsonValue } | { ok: false } {
  let value = source;
  for (const segment of segments) {
    if (!IDENTIFIER.test(segment) || FORBIDDEN_SEGMENTS.has(segment) ||
      value === null || typeof value !== "object" ||
      !Object.prototype.hasOwnProperty.call(value, segment)) return { ok: false };
    value = (value as Record<string, unknown>)[segment];
  }
  return isJsonValue(value) ? { ok: true, value } : { ok: false };
}

function resolveExpression(
  expression: string,
  currentItem: JsonValue,
  currentIndex: number,
): { ok: true; value: JsonValue } | { ok: false } {
  const segments = expression.trim().split(".");
  if (segments[0] === "currentIndex" && segments.length === 1) {
    return { ok: true, value: currentIndex };
  }
  if (segments[0] !== "currentItem") return { ok: false };
  return segments.length === 1
    ? { ok: true, value: currentItem }
    : safePath(currentItem, segments.slice(1));
}

function resolveTemplate(
  source: string,
  currentItem: JsonValue,
  currentIndex: number,
): { ok: true; value: JsonValue } | { ok: false } {
  if (source.length > MAX_BINDING_LENGTH) return { ok: false };
  const matches = [...source.matchAll(BINDING)];
  if (!matches.length) return { ok: false };
  if (matches.length === 1 && matches[0][0] === source.trim()) {
    return resolveExpression(matches[0][1], currentItem, currentIndex);
  }
  let result = "";
  let cursor = 0;
  for (const match of matches) {
    const value = resolveExpression(match[1], currentItem, currentIndex);
    if (!value.ok || (value.value !== null && typeof value.value === "object")) {
      return { ok: false };
    }
    const start = match.index ?? 0;
    result += source.slice(cursor, start) + String(value.value ?? "");
    cursor = start + match[0].length;
  }
  result += source.slice(cursor);
  return result.includes("{{") || result.includes("}}")
    ? { ok: false }
    : { ok: true, value: result };
}

function declaredBindings(widget: AppsmithWidgetDsl): string[] {
  const entries = widget.dynamicBindingPathList;
  return Array.isArray(entries) ? entries.flatMap((entry) =>
    entry !== null && typeof entry === "object" && !Array.isArray(entry) &&
    typeof entry.key === "string" ? [entry.key] : [],
  ) : [];
}

function setOwnPath(widget: AppsmithWidgetDsl, path: string, value: JsonValue): boolean {
  const segments = path.split(".");
  if (!segments.length || segments.some((segment) =>
    !IDENTIFIER.test(segment) || FORBIDDEN_SEGMENTS.has(segment))) return false;
  let parent: Record<string, unknown> = widget;
  for (const segment of segments.slice(0, -1)) {
    const child = parent[segment];
    if (child === null || typeof child !== "object" || Array.isArray(child) ||
      !Object.prototype.hasOwnProperty.call(parent, segment)) return false;
    parent = child as Record<string, unknown>;
  }
  const finalSegment = segments[segments.length - 1];
  if (!Object.prototype.hasOwnProperty.call(parent, finalSegment)) return false;
  parent[finalSegment] = cloneJson(value);
  return true;
}

function deleteOwnPath(widget: AppsmithWidgetDsl, path: string): void {
  const segments = path.split(".");
  if (!segments.length || segments.some((segment) =>
    !IDENTIFIER.test(segment) || FORBIDDEN_SEGMENTS.has(segment))) return;
  let parent: Record<string, unknown> = widget;
  for (const segment of segments.slice(0, -1)) {
    if (!Object.prototype.hasOwnProperty.call(parent, segment) ||
        parent[segment] === null || typeof parent[segment] !== "object" ||
        Array.isArray(parent[segment])) return;
    parent = parent[segment] as Record<string, unknown>;
  }
  if (Object.prototype.hasOwnProperty.call(parent, segments[segments.length - 1])) {
    delete parent[segments[segments.length - 1]];
  }
}

function blueprintPrimaryKeys(widget: AppsmithWidgetDsl, data: readonly JsonValue[]):
  { keys: (string | null)[]; source: StaticListV2Row["keySource"] } | null {
  const primaryKeys = widget.primaryKeys;
  if (Array.isArray(primaryKeys)) {
    return {
      keys: data.map((_item, index) => {
        const key = primaryKeys[index];
        return typeof key === "string" || (typeof key === "number" && Number.isFinite(key))
          ? String(key) : null;
      }),
      source: "literal",
    };
  }
  if (primaryKeys === undefined || primaryKeys === null) {
    return { keys: data.map(() => null), source: "value" };
  }
  // Exact Appsmith ListWidgetV2/widget/defaultProps.ts blueprint expression.
  // Recognizing this expression does not enable arbitrary JavaScript evaluation.
  const source = `{{${widget.widgetName}.listData.map((currentItem, currentIndex) => currentItem["id"] )}}`;
  if (primaryKeys !== source) return null;
  return {
    keys: data.map((item) => {
      const id = safePath(item, ["id"]);
      return id.ok && (typeof id.value === "string" || typeof id.value === "number")
        ? String(id.value) : null;
    }),
    source: "blueprint-id",
  };
}

function findItemContainer(widget: AppsmithWidgetDsl): AppsmithWidgetDsl | null {
  const mainCanvas = widget.children?.find((child) =>
    child.widgetId === widget.mainCanvasId && child.type === "CANVAS_WIDGET",
  );
  return mainCanvas?.children?.find((child) =>
    child.widgetId === widget.mainContainerId && child.type === "CONTAINER_WIDGET",
  ) ?? null;
}

function containsNestedList(widget: AppsmithWidgetDsl): boolean {
  return (widget.children ?? []).some((child) =>
    child.type === "LIST_WIDGET_V2" || containsNestedList(child),
  );
}

function applyRowBindings(
  widget: AppsmithWidgetDsl,
  currentItem: JsonValue,
  currentIndex: number,
  unresolvedBindings: ListV2UnresolvedBinding[],
): void {
  for (const path of declaredBindings(widget)) {
    const raw = safePath(widget, path.split("."));
    if (!raw.ok || typeof raw.value !== "string" || !raw.value.includes("{{")) continue;
    const resolved = resolveTemplate(raw.value, currentItem, currentIndex);
    if (!resolved.ok || !setOwnPath(widget, path, resolved.value)) {
      unresolvedBindings.push({
        templateWidgetId: widget.widgetId,
        propertyPath: path,
        expression: raw.value,
      });
    }
  }
  for (const child of widget.children ?? []) {
    applyRowBindings(child, currentItem, currentIndex, unresolvedBindings);
  }
}

function stripActionBindings(widget: AppsmithWidgetDsl): void {
  const triggers = widget.dynamicTriggerPathList;
  if (Array.isArray(triggers)) {
    for (const trigger of triggers) {
      if (trigger !== null && typeof trigger === "object" && !Array.isArray(trigger) &&
          typeof trigger.key === "string") deleteOwnPath(widget, trigger.key);
    }
  }
  // Some authored event strings can exist without a trigger-path annotation.
  for (const key of Object.keys(widget)) {
    if (/^on[A-Z]/.test(key) && typeof widget[key] === "string") delete widget[key];
  }
  widget.dynamicTriggerPathList = [];
  for (const child of widget.children ?? []) stripActionBindings(child);
}

function cloneRuntimeSubtree(
  template: AppsmithWidgetDsl,
  listId: string,
  rowKey: string,
  currentItem: JsonValue,
  currentIndex: number,
  unresolvedBindings: ListV2UnresolvedBinding[],
): AppsmithWidgetDsl {
  const clone = cloneJson(template as JsonValue) as AppsmithWidgetDsl;
  // Resolve while IDs still match the saved template for diagnostics.
  applyRowBindings(clone, currentItem, currentIndex, unresolvedBindings);
  stripActionBindings(clone);
  const rename = (widget: AppsmithWidgetDsl, parentId?: string): void => {
    const templateId = widget.widgetId;
    widget.widgetId = `__list_runtime__${encodeURIComponent(listId)}__${encodeURIComponent(rowKey)}__${encodeURIComponent(templateId)}`;
    widget.widgetName = `${widget.widgetName}_${currentIndex}`;
    widget.parentId = parentId;
    widget.isTemplate = false;
    widget.referencedWidgetId = templateId;
    widget.currentIndex = currentIndex;
    for (const child of widget.children ?? []) rename(child, widget.widgetId);
  };
  rename(clone, template.parentId);
  return clone;
}

/**
 * Materialize only the visible page of a literal List V2. The returned row
 * clones are runtime projections: use them for rendering, never persistence.
 * Appsmith's meta-widget cache, selection, action evaluation, and virtualizer
 * are outside this static boundary.
 */
export function materializeStaticListV2Rows(
  widget: AppsmithWidgetDsl,
  options: StaticListV2PageOptions,
): StaticListV2Materialization {
  if (widget.type !== "LIST_WIDGET_V2") return unsupported("widget-type");
  if (declaredBindings(widget).includes("listData") ||
      !Array.isArray(widget.listData) || !isJsonValue(widget.listData)) {
    return unsupported("dynamic-list-data");
  }
  if ((widget.serverSidePagination !== undefined && widget.serverSidePagination !== false) ||
      (widget.infiniteScroll !== undefined && widget.infiniteScroll !== false)) {
    return unsupported("unsupported-pagination");
  }
  const { pageNo, pageSize } = options;
  if (!Number.isSafeInteger(pageNo) || pageNo < 1 ||
      !Number.isSafeInteger(pageSize) || pageSize < 1 ||
      pageSize > MAX_ROWS_PER_PAGE) return unsupported("invalid-page");

  const data = widget.listData as JsonValue[];
  const keys = blueprintPrimaryKeys(widget, data);
  if (!keys) return unsupported("unsupported-primary-keys");
  const template = findItemContainer(widget);
  if (!template || !Number.isFinite(template.topRow) ||
      !Number.isFinite(template.bottomRow) ||
      template.bottomRow <= template.topRow) return unsupported("invalid-template");
  if (containsNestedList(template)) return unsupported("nested-list");
  if (widget.itemSpacing !== undefined &&
      (typeof widget.itemSpacing !== "number" || !Number.isFinite(widget.itemSpacing))) {
    return unsupported("invalid-template");
  }
  const spacing = typeof widget.itemSpacing === "number" && Number.isFinite(widget.itemSpacing)
    ? widget.itemSpacing : 0;
  const spacingRows = (spacing - 8) / 10;
  const rowHeight = template.bottomRow - template.topRow;
  const startIndex = listV2PageStartIndex(pageNo, pageSize);
  const seenKeys = new Map<string, number>();
  // Count duplicate keys before the visible page as well, so page changes do
  // not rename a later duplicate row.
  for (let index = 0; index < startIndex && index < data.length; index += 1) {
    const primaryKey = keys.keys[index] ?? `value:${canonicalJson(data[index])}`;
    seenKeys.set(primaryKey, (seenKeys.get(primaryKey) ?? 0) + 1);
  }
  const rows: StaticListV2Row[] = data.slice(startIndex, startIndex + pageSize)
    .map((item, viewIndex) => {
      const currentIndex = startIndex + viewIndex;
      const primaryKey = keys.keys[currentIndex] ?? `value:${canonicalJson(item)}`;
      const occurrence = seenKeys.get(primaryKey) ?? 0;
      seenKeys.set(primaryKey, occurrence + 1);
      const key = occurrence === 0 ? primaryKey : `${primaryKey}#${occurrence}`;
      const currentItem = cloneJson(item);
      const unresolvedBindings: ListV2UnresolvedBinding[] = [];
      const runtimeDsl = cloneRuntimeSubtree(
        template, widget.widgetId, key, currentItem, currentIndex, unresolvedBindings,
      );
      // MetaWidgetGenerator.updateContainerPosition uses the page-relative
      // viewIndex and includes Appsmith's (itemSpacing - 8) / 10 row offset.
      runtimeDsl.topRow = template.topRow + viewIndex * (rowHeight + spacingRows);
      runtimeDsl.bottomRow = runtimeDsl.topRow + rowHeight;
      return {
        key,
        primaryKey,
        keySource: keys.keys[currentIndex] === null ? "value" as const : keys.source,
        currentIndex,
        viewIndex,
        currentItem,
        runtimeWidget: { dsl: runtimeDsl, templateWidgetId: template.widgetId },
        unresolvedBindings,
      };
    });
  return {
    status: "ready",
    pageNo,
    pageSize,
    totalItems: data.length,
    pageCount: Math.ceil(data.length / pageSize),
    empty: listV2DataIsEmpty(data),
    rows,
  };
}
