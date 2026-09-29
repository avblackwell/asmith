import type { AppsmithWidgetDsl } from "../document";

const DYNAMIC_PATH_LISTS = [
  "dynamicBindingPathList",
  "dynamicTriggerPathList",
  "dynamicPropertyPathList",
] as const;
const PATH_SEGMENT = /^(?:[A-Za-z_$][\w$]*|\d+)$/;
const UNSAFE_PATH_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);
const IDENTIFIER_START = /[A-Za-z_$]/;
const IDENTIFIER_CONTINUE = /[\w$]/;

export class ComponentInsertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComponentInsertionError";
  }
}

export interface InsertCopiedComponentOptions {
  targetParentId: string;
  /** Reserve action and JS object names that are outside the widget tree. */
  reservedNames?: readonly string[];
}

export interface InsertCopiedComponentResult {
  targetTree: AppsmithWidgetDsl;
  copiedSubtree: AppsmithWidgetDsl;
  widgetIdMap: Record<string, string>;
  widgetNameMap: Record<string, string>;
  /** Dynamic paths left untouched because their shape could not be rewritten safely. */
  unresolvedDynamicPaths: string[];
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneValue) as T;

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]),
    ) as T;
  }

  return value;
}

function collectWidgets(
  root: AppsmithWidgetDsl,
  label: string,
): AppsmithWidgetDsl[] {
  const widgets: AppsmithWidgetDsl[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();

  function visit(widget: AppsmithWidgetDsl, parentId?: string): void {
    if (
      typeof widget.widgetId !== "string" ||
      !widget.widgetId ||
      typeof widget.widgetName !== "string" ||
      !widget.widgetName
    ) {
      throw new ComponentInsertionError(
        `${label} has a widget without an ID or name`,
      );
    }

    if (ids.has(widget.widgetId) || names.has(widget.widgetName)) {
      throw new ComponentInsertionError(
        `${label} has duplicate widget IDs or names`,
      );
    }

    if (parentId !== undefined && widget.parentId !== parentId) {
      throw new ComponentInsertionError(
        `${label} widget ${widget.widgetId} has an inconsistent parentId`,
      );
    }

    ids.add(widget.widgetId);
    names.add(widget.widgetName);
    widgets.push(widget);

    if (widget.children !== undefined) {
      if (!Array.isArray(widget.children)) {
        throw new ComponentInsertionError(
          `${label} widget ${widget.widgetId} has invalid children`,
        );
      }

      widget.children.forEach((child) => visit(child, widget.widgetId));
    }
  }

  visit(root);

  return widgets;
}

function nextAvailable(base: string, reserved: Set<string>): string {
  let candidate = base;
  let suffix = 1;

  while (reserved.has(candidate)) {
    candidate = `${base}${suffix}`;
    suffix += 1;
  }

  reserved.add(candidate);

  return candidate;
}

function remapEmbeddedValue(
  value: unknown,
  idMap: Map<string, string>,
  nameMap: Map<string, string>,
  parentKey = "",
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => remapEmbeddedValue(entry, idMap, nameMap));
  }

  if (value === null || typeof value !== "object") return value;

  const output: Record<string, unknown> = Object.create(null);

  for (const [key, entry] of Object.entries(value)) {
    const nextKey = parentKey === "template" ? nameMap.get(key) ?? key : key;

    if (
      typeof entry === "string" &&
      (key === "widgetId" || key === "parentId")
    ) {
      output[nextKey] = idMap.get(entry) ?? entry;
    } else if (typeof entry === "string" && key === "widgetName") {
      output[nextKey] = nameMap.get(entry) ?? entry;
    } else {
      output[nextKey] = remapEmbeddedValue(entry, idMap, nameMap, key);
    }
  }

  return output;
}

function rewriteTemplatePath(
  path: string,
  nameMap: Map<string, string>,
): string {
  const segments = path.split(".");

  for (let index = 1; index < segments.length; index += 1) {
    if (segments[index - 1] === "template") {
      segments[index] = nameMap.get(segments[index]) ?? segments[index];
    }
  }

  return segments.join(".");
}

function propertyAtPath(
  widget: AppsmithWidgetDsl,
  path: string,
): { holder: Record<string, unknown>; key: string } | null {
  const segments = path.split(".");

  if (
    !segments.every(
      (segment) =>
        PATH_SEGMENT.test(segment) && !UNSAFE_PATH_SEGMENTS.has(segment),
    )
  ) {
    return null;
  }

  let current: unknown = widget;

  for (let index = 0; index < segments.length - 1; index += 1) {
    if (current === null || typeof current !== "object") return null;

    current = (current as Record<string, unknown>)[segments[index]];
  }

  if (current === null || typeof current !== "object") return null;

  const holder = current as Record<string, unknown>;
  const key = segments[segments.length - 1];

  return Object.prototype.hasOwnProperty.call(holder, key)
    ? { holder, key }
    : null;
}

function rewriteCodeReferences(
  code: string,
  nameMap: Map<string, string>,
): string | null {
  let output = "";

  for (let index = 0; index < code.length; ) {
    const character = code[index];

    if (character === "'" || character === '"') {
      const quote = character;
      const start = index;
      let closed = false;

      index += 1;

      while (index < code.length) {
        if (code[index] === "\\") {
          index += 2;
        } else if (code[index] === quote) {
          index += 1;
          closed = true;
          break;
        } else {
          index += 1;
        }
      }

      if (!closed) return null;

      output += code.slice(start, index);
      continue;
    }

    // Regex literals and template strings need a full JS parser to distinguish
    // references from text. Preserve such expressions for caller review.
    if (character === "/" || character === "`") return null;

    if (IDENTIFIER_START.test(character)) {
      const start = index;

      index += 1;

      while (index < code.length && IDENTIFIER_CONTINUE.test(code[index])) {
        index += 1;
      }

      const identifier = code.slice(start, index);
      const previous = code[start - 1];
      const isRootReference =
        previous === undefined ||
        (!IDENTIFIER_CONTINUE.test(previous) && previous !== ".");
      const isMemberAccess =
        code[index] === "." || code.slice(index, index + 2) === "?.";

      output +=
        isRootReference && isMemberAccess
          ? nameMap.get(identifier) ?? identifier
          : identifier;
      continue;
    }

    output += character;
    index += 1;
  }

  return output;
}

function rewriteBinding(
  value: string,
  nameMap: Map<string, string>,
): { value: string; unresolved: boolean } {
  let unresolved = false;
  const rewritten = value.replace(
    /\{\{([\s\S]*?)\}\}/g,
    (whole, code: string) => {
      const result = rewriteCodeReferences(code, nameMap);

      if (result === null) {
        unresolved = true;

        return whole;
      }

      return `{{${result}}}`;
    },
  );

  return { value: rewritten, unresolved };
}

function rewriteDynamicPaths(
  root: AppsmithWidgetDsl,
  nameMap: Map<string, string>,
): string[] {
  const unresolved: string[] = [];

  function visit(widget: AppsmithWidgetDsl): void {
    for (const listName of DYNAMIC_PATH_LISTS) {
      const list = widget[listName];

      if (list === undefined) continue;

      if (!Array.isArray(list)) {
        unresolved.push(`${widget.widgetId}:${listName}`);
        continue;
      }

      for (const rawEntry of list) {
        if (
          rawEntry === null ||
          typeof rawEntry !== "object" ||
          Array.isArray(rawEntry) ||
          typeof (rawEntry as Record<string, unknown>).key !== "string"
        ) {
          unresolved.push(`${widget.widgetId}:${listName}`);
          continue;
        }

        const entry = rawEntry as Record<string, unknown>;
        const path = rewriteTemplatePath(entry.key as string, nameMap);

        entry.key = path;
        const property = propertyAtPath(widget, path);

        if (!property || typeof property.holder[property.key] !== "string") {
          unresolved.push(`${widget.widgetId}:${path}`);
          continue;
        }

        const rewritten = rewriteBinding(
          property.holder[property.key] as string,
          nameMap,
        );

        property.holder[property.key] = rewritten.value;

        if (rewritten.unresolved) unresolved.push(`${widget.widgetId}:${path}`);
      }
    }

    widget.children?.forEach(visit);
  }

  visit(root);

  return unresolved;
}

/**
 * Copy a nested widget DSL subtree into a target tree without changing either
 * input. IDs are deterministic and unique within the returned tree. The caller
 * still owns layout positioning, widget blueprints, and persistence.
 */
export function insertCopiedComponent(
  sourceSubtree: AppsmithWidgetDsl,
  targetTree: AppsmithWidgetDsl,
  options: InsertCopiedComponentOptions,
): InsertCopiedComponentResult {
  const sourceWidgets = collectWidgets(sourceSubtree, "source");
  const targetWidgets = collectWidgets(targetTree, "target");
  const parent = targetWidgets.find(
    (widget) => widget.widgetId === options.targetParentId,
  );

  if (!parent) {
    throw new ComponentInsertionError(
      `Target parent ${options.targetParentId} does not exist`,
    );
  }

  const reservedIds = new Set([
    ...sourceWidgets.map((widget) => widget.widgetId),
    ...targetWidgets.map((widget) => widget.widgetId),
  ]);
  const sourceNames = sourceWidgets.map((widget) => widget.widgetName);
  const targetNames = new Set([
    ...targetWidgets.map((widget) => widget.widgetName),
    ...(options.reservedNames ?? []),
  ]);
  const reservedNames = new Set([...sourceNames, ...targetNames]);
  const idMap = new Map<string, string>();
  const nameMap = new Map<string, string>();

  for (const widget of sourceWidgets) {
    idMap.set(
      widget.widgetId,
      nextAvailable(`${widget.widgetId}-copy`, reservedIds),
    );

    if (targetNames.has(widget.widgetName)) {
      const nextName = nextAvailable(`${widget.widgetName}Copy`, reservedNames);

      nameMap.set(widget.widgetName, nextName);
      targetNames.add(nextName);
    } else {
      nameMap.set(widget.widgetName, widget.widgetName);
      targetNames.add(widget.widgetName);
    }
  }

  const copiedSubtree = remapEmbeddedValue(
    sourceSubtree,
    idMap,
    nameMap,
  ) as AppsmithWidgetDsl;

  copiedSubtree.parentId = options.targetParentId;
  const unresolvedDynamicPaths = rewriteDynamicPaths(copiedSubtree, nameMap);
  const updatedTarget = cloneValue(targetTree);
  const updatedParent = collectWidgets(updatedTarget, "target").find(
    (widget) => widget.widgetId === options.targetParentId,
  );

  if (!updatedParent) {
    throw new ComponentInsertionError("Target parent disappeared during copy");
  }

  updatedParent.children = [...(updatedParent.children ?? []), copiedSubtree];

  return {
    targetTree: updatedTarget,
    copiedSubtree,
    widgetIdMap: Object.fromEntries(idMap),
    widgetNameMap: Object.fromEntries(nameMap),
    unresolvedDynamicPaths,
  };
}
