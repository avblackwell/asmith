interface Widget extends Record<string, unknown> {
  widgetId: string;
  widgetName: string;
  type: string;
  dynamicBindingPathList?: unknown;
}

export interface ResolvedStaticReference {
  widgetId: string;
  propertyPath: string;
  value: unknown;
}

const REFERENCE = /^([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))+$/;
const SEGMENT = /^[A-Za-z_$][\w$]*$/;
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
const BINDING = /\{\{([\s\S]*?)\}\}/g;
const MAX_TEMPLATE_LENGTH = 32_768;
const MAX_REFERENCE_STEPS = 10_000;

export interface StaticReferenceResult {
  ok: boolean;
  value?: unknown;
}

export interface StaticReferencePath {
  widgetName: string;
  path: string;
  segments: string[];
}

const unresolved: StaticReferenceResult = { ok: false };

function safeSegments(path: string): string[] | null {
  const segments = path.split(".");

  return segments.length > 0 && segments.every((segment) =>
    SEGMENT.test(segment) && !FORBIDDEN.has(segment),
  ) ? segments : null;
}

/** Own JSON properties only; shared by the resolver and narrow diagnostics. */
export function lookupOwnPath(source: unknown,
  segments: readonly string[]): StaticReferenceResult {
  let value = source;

  for (const segment of segments) {
    if (
      value === null ||
      typeof value !== "object" ||
      !Object.prototype.hasOwnProperty.call(value, segment)
    ) return unresolved;

    value = (value as Record<string, unknown>)[segment];
  }

  return value === undefined ? unresolved : { ok: true, value };
}

export function declaredDynamicPaths(widget: { dynamicBindingPathList?: unknown }): Set<string> {
  const list = widget.dynamicBindingPathList;

  return new Set(Array.isArray(list) ? list.flatMap((entry) =>
    entry && typeof entry === "object" && typeof entry.key === "string"
      ? [entry.key]
      : [],
  ) : []);
}

/** Recognizes exactly the restricted reference grammar used by this resolver. */
export function parseStaticReferenceExpression(source: string): StaticReferencePath | null {
  const expression = source.trim();

  if (!REFERENCE.test(expression)) return null;

  const [widgetName, ...segments] = expression.split(".");
  const path = segments.join(".");

  return FORBIDDEN.has(widgetName) || !safeSegments(path)
    ? null : { widgetName, path, segments };
}

/**
 * Resolve the small, read-only Appsmith reference form `{{WidgetName.path}}`.
 * This intentionally does not run Appsmith JavaScript. A sole expression can
 * return a JSON array/object; mixed text only interpolates primitive values.
 * Unknown, cyclic, or unsupported expressions remain unresolved for the UI.
 */
export function resolveStaticReferences(
  widgets: Record<string, Record<string, unknown>>,
): ResolvedStaticReference[] {
  const validWidgets = Object.values(widgets).filter((widget): widget is Widget =>
    typeof widget.widgetId === "string" &&
    typeof widget.widgetName === "string" &&
    typeof widget.type === "string",
  );
  const byName = new Map(validWidgets.map((widget) => [
    widget.widgetName,
    widget,
  ]));
  const declared = new Map(validWidgets.map((widget) => [
    widget.widgetId,
    declaredDynamicPaths(widget),
  ]));
  const memo = new Map<string, StaticReferenceResult>();
  const visiting = new Set<string>();
  let steps = 0;

  function evaluateExpression(source: string): StaticReferenceResult {
    const reference = parseStaticReferenceExpression(source);
    if (!reference) return unresolved;
    const widget = byName.get(reference.widgetName);
    return widget ? resolvePath(widget, reference.path) : unresolved;
  }

  function evaluateTemplate(source: string): StaticReferenceResult {
    if (source.length > MAX_TEMPLATE_LENGTH) return unresolved;

    const matches = [...source.matchAll(BINDING)];

    if (!matches.length) return unresolved;

    if (matches.length === 1 && matches[0][0] === source.trim()) {
      return evaluateExpression(matches[0][1]);
    }

    let cursor = 0;
    let result = "";

    for (const match of matches) {
      const start = match.index ?? 0;
      const evaluated = evaluateExpression(match[1]);

      if (
        !evaluated.ok ||
        (evaluated.value !== null &&
          typeof evaluated.value === "object")
      ) return unresolved;

      result += source.slice(cursor, start) + String(evaluated.value ?? "");
      cursor = start + match[0].length;
    }

    result += source.slice(cursor);

    return result.includes("{{") || result.includes("}}")
      ? unresolved
      : { ok: true, value: result };
  }

  function resolvePath(widget: Widget, path: string): StaticReferenceResult {
    const segments = safeSegments(path);

    if (!segments || steps++ > MAX_REFERENCE_STEPS) return unresolved;

    const key = JSON.stringify([widget.widgetId, path]);

    if (memo.has(key)) return memo.get(key) ?? unresolved;
    if (visiting.has(key)) return unresolved;

    const raw = lookupOwnPath(widget, segments);

    if (!raw.ok) return unresolved;

    const isDeclared = declared.get(widget.widgetId)?.has(path) ?? false;

    if (!isDeclared) {
      return typeof raw.value === "string" && raw.value.includes("{{")
        ? unresolved
        : raw;
    }

    visiting.add(key);
    const result = typeof raw.value === "string"
      ? evaluateTemplate(raw.value)
      : unresolved;
    visiting.delete(key);
    memo.set(key, result);

    return result;
  }

  const resolved: ResolvedStaticReference[] = [];

  for (const widget of validWidgets) {
    for (const path of declared.get(widget.widgetId) ?? []) {
      // The current read-only widget boundary exposes only these properties.
      if (
        !(widget.type === "TEXT_WIDGET" && path === "text") &&
        !(widget.type === "CHART_WIDGET" && path.startsWith("chartData.")) &&
        !(widget.type === "IMAGE_WIDGET" && (path === "image" || path === "defaultImage")) &&
        !(widget.type === "PROGRESS_WIDGET" && path === "progress")
      ) continue;

      const result = resolvePath(widget, path);

      if (result.ok &&
        (widget.type !== "IMAGE_WIDGET" || typeof result.value === "string") &&
        (widget.type !== "PROGRESS_WIDGET" ||
          (typeof result.value === "number" && Number.isFinite(result.value)))) {
        resolved.push({
          widgetId: widget.widgetId,
          propertyPath: path,
          value: result.value,
        });
      }
    }
  }

  return resolved;
}
