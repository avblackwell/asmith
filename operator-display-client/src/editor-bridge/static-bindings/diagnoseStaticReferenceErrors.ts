import {
  declaredDynamicPaths,
  lookupOwnPath,
  parseStaticReferenceExpression,
  type StaticReferencePath,
} from "./resolveStaticReferences";

interface Widget extends Record<string, unknown> {
  widgetId: string;
  widgetName: string;
  type: string;
  dynamicBindingPathList?: unknown;
}

interface DiagnosticNode {
  widgetId: string;
  references: StaticReferencePath[];
  edges: Set<string>;
  directErrors: number;
}

export interface StaticReferenceDiagnosticOptions {
  /** Product variables and other external names cannot be judged as widgets. */
  externalEntityNames?: Iterable<string>;
}

const BINDING = /\{\{([\s\S]*?)\}\}/g;
const MAX_TEMPLATE_LENGTH = 32_768;
const MAX_DECLARED_PATHS = 10_000;
const BUILTIN_NAMES = new Set([
  "appsmith", "cyflex", "Cyflex", "Math", "JSON", "Date", "Number", "String",
  "Boolean", "Array", "Object", "RegExp", "Promise", "console", "window",
  "globalThis", "this",
  // ListWidgetV2 injects these bindings into its repeated item canvases.
  // The static checker has no item context, so it cannot prove them missing.
  "currentItem", "currentIndex", "currentView",
]);

function referenceTemplate(source: string): StaticReferencePath[] | null {
  if (source.length > MAX_TEMPLATE_LENGTH) return null;
  const matches = [...source.matchAll(BINDING)];
  if (!matches.length) return null;
  // An unsupported expression anywhere in the property makes the whole
  // template outside our evaluator's provable static-reference subset.
  const remainder = source.replace(BINDING, "");
  if (remainder.includes("{{") || remainder.includes("}}")) return null;
  const references = matches.map((match) => parseStaticReferenceExpression(match[1]));
  return references.every((reference) => reference !== null)
    ? references as StaticReferencePath[] : null;
}

function nodeKey(widgetId: string, path: string): string {
  return JSON.stringify([widgetId, path]);
}

function inspectReferencedPath(source: unknown,
  segments: readonly string[]): "found" | "missing" | "unsupported" {
  let value = source;
  for (const segment of segments) {
    // Appsmith's JavaScript evaluator can access methods and primitive
    // properties. We only prove absence on plain JSON object properties.
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return "unsupported";
    }
    if (!Object.prototype.hasOwnProperty.call(value, segment)) return "missing";
    value = (value as Record<string, unknown>)[segment];
  }
  return value === undefined ? "missing" : "found";
}

/**
 * Count only failures we can prove for declared `{{WidgetName.path}}` bindings.
 * Appsmith's widget-name `getErrorCount` sums evaluation-error array lengths
 * across property paths; these counts feed the same badge without claiming to
 * run its evaluator worker. Unknown JavaScript/Cyflex expressions stay silent.
 */
export function diagnoseStaticReferenceErrors(
  widgets: Record<string, Record<string, unknown>>,
  options: StaticReferenceDiagnosticOptions = {},
): Record<string, number> {
  const validWidgets = Object.values(widgets).filter((widget): widget is Widget =>
    typeof widget.widgetId === "string" &&
    typeof widget.widgetName === "string" &&
    typeof widget.type === "string",
  );
  const byName = new Map<string, Widget | null>();
  for (const widget of validWidgets) {
    byName.set(widget.widgetName,
      byName.has(widget.widgetName) ? null : widget);
  }
  const external = new Set([...BUILTIN_NAMES, ...(options.externalEntityNames ?? [])]);
  const nodes = new Map<string, DiagnosticNode>();
  let declaredCount = 0;

  for (const widget of validWidgets) {
    for (const path of declaredDynamicPaths(widget)) {
      if (++declaredCount > MAX_DECLARED_PATHS) return {};
      const raw = lookupOwnPath(widget, path.split("."));
      if (!raw.ok || typeof raw.value !== "string") continue;
      const references = referenceTemplate(raw.value);
      if (!references) continue;
      nodes.set(nodeKey(widget.widgetId, path), {
        widgetId: widget.widgetId,
        references,
        edges: new Set(),
        directErrors: 0,
      });
    }
  }

  for (const node of nodes.values()) {
    for (const reference of node.references) {
      const target = byName.get(reference.widgetName);
      if (target === undefined) {
        if (!external.has(reference.widgetName)) node.directErrors += 1;
        continue;
      }
      if (target === null) continue; // Ambiguous names cannot prove a failure.
      const status = inspectReferencedPath(target, reference.segments);
      if (status === "missing") {
        node.directErrors += 1;
        continue;
      }
      if (status !== "found") continue;
      const targetKey = nodeKey(target.widgetId, reference.path);
      if (nodes.has(targetKey)) node.edges.add(targetKey);
    }
  }

  // Iterative Kosaraju avoids recursion overflow on a large imported DSL.
  const visited = new Set<string>();
  const finishOrder: string[] = [];
  for (const start of nodes.keys()) {
    if (visited.has(start)) continue;
    visited.add(start);
    const stack: Array<{ key: string; remaining: string[] }> = [
      { key: start, remaining: [...(nodes.get(start)?.edges ?? [])] },
    ];
    while (stack.length) {
      const frame = stack.at(-1)!;
      const next = frame.remaining.pop();
      if (next !== undefined) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push({ key: next, remaining: [...(nodes.get(next)?.edges ?? [])] });
        }
      } else {
        finishOrder.push(frame.key);
        stack.pop();
      }
    }
  }

  const reverse = new Map([...nodes.keys()].map((key) => [key, [] as string[]]));
  for (const [source, node] of nodes) {
    for (const target of node.edges) reverse.get(target)?.push(source);
  }
  const assigned = new Set<string>();
  const cyclic = new Set<string>();
  for (let index = finishOrder.length - 1; index >= 0; index -= 1) {
    const start = finishOrder[index];
    if (assigned.has(start)) continue;
    const component: string[] = [];
    const stack = [start];
    assigned.add(start);
    while (stack.length) {
      const key = stack.pop()!;
      component.push(key);
      for (const predecessor of reverse.get(key) ?? []) {
        if (assigned.has(predecessor)) continue;
        assigned.add(predecessor);
        stack.push(predecessor);
      }
    }
    if (component.length > 1 || nodes.get(start)?.edges.has(start)) {
      for (const key of component) cyclic.add(key);
    }
  }

  const counts: Record<string, number> = {};
  for (const [key, node] of nodes) {
    const errors = node.directErrors + (cyclic.has(key) ? 1 : 0);
    if (errors) counts[node.widgetId] = (counts[node.widgetId] ?? 0) + errors;
  }
  return counts;
}
