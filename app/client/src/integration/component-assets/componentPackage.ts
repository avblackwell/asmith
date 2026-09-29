import { parseDashboardDocument, type AppsmithWidgetDsl } from "../document";
import {
  COMPONENT_PACKAGE_SCHEMA_VERSION,
  type ComponentPackage,
} from "./types";

const PACKAGE_KEYS = [
  "assetKind",
  "schemaVersion",
  "componentId",
  "name",
  "compatibility",
  "subtree",
  "variables",
  "bindings",
];
const GROUP_TYPES = new Set(["CONTAINER_WIDGET", "STATBOX_WIDGET"]);

export class ComponentPackageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComponentPackageValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonemptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ComponentPackageValidationError(`${label} must be nonempty`);
  }

  return value;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function widgetsIn(root: AppsmithWidgetDsl): Set<string> {
  const ids = new Set<string>();

  function visit(widget: AppsmithWidgetDsl): void {
    ids.add(widget.widgetId);

    if (Array.isArray(widget.children)) widget.children.forEach(visit);
  }

  visit(root);

  return ids;
}

function widgetNamesIn(root: AppsmithWidgetDsl): Set<string> {
  const names = new Set<string>();

  function visit(widget: AppsmithWidgetDsl): void {
    names.add(widget.widgetName);

    if (Array.isArray(widget.children)) widget.children.forEach(visit);
  }

  visit(root);

  return names;
}

function freeSentinel(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 1;

  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }

  return candidate;
}

/**
 * The dashboard validator already knows the widget DSL, variable selectors,
 * binding targets and forbidden connection data. A temporary canvas lets it
 * validate the same contract for a portable group package.
 */
export function parseComponentPackage(input: unknown): ComponentPackage {
  if (!isRecord(input)) {
    throw new ComponentPackageValidationError(
      "Component package must be an object",
    );
  }

  for (const [key] of Object.entries(input)) {
    if (!PACKAGE_KEYS.includes(key)) {
      throw new ComponentPackageValidationError(
        `Unknown component field ${key}`,
      );
    }
  }

  if (input.assetKind !== "component") {
    throw new ComponentPackageValidationError("Expected a component asset");
  }

  if (input.schemaVersion !== COMPONENT_PACKAGE_SCHEMA_VERSION) {
    throw new ComponentPackageValidationError(
      "Unsupported component schema version",
    );
  }

  const componentId = nonemptyString(input.componentId, "componentId");
  const name = nonemptyString(input.name, "name");

  if (!isRecord(input.compatibility) || !isRecord(input.subtree)) {
    throw new ComponentPackageValidationError(
      "Missing component compatibility or subtree",
    );
  }

  if (!GROUP_TYPES.has(String(input.subtree.type))) {
    throw new ComponentPackageValidationError(
      "Component root must be a container or statbox group",
    );
  }

  if (input.subtree.parentId !== undefined) {
    throw new ComponentPackageValidationError(
      "Component root must not contain a parentId",
    );
  }

  // Clone before adding a synthetic parent. This also ensures callers receive
  // a separate, JSON-compatible package and are never mutated during install.
  const candidate = clone(input) as unknown as ComponentPackage;
  const validationRoot = clone(candidate.subtree);
  const validationRootId = freeSentinel(
    "__component_validation_canvas__",
    widgetsIn(candidate.subtree),
  );
  const validationRootName = freeSentinel(
    "__ComponentValidationCanvas__",
    widgetNamesIn(candidate.subtree),
  );

  validationRoot.parentId = validationRootId;
  const wrapper = {
    assetKind: "dashboard",
    schemaVersion: 1,
    documentId: componentId,
    name,
    compatibility: candidate.compatibility,
    layout: {
      dsl: {
        widgetId: validationRootId,
        widgetName: validationRootName,
        type: "CANVAS_WIDGET",
        version: candidate.compatibility.widgetDslVersion,
        topRow: 0,
        bottomRow: Math.max(1, validationRoot.bottomRow + 1),
        leftColumn: 0,
        rightColumn: Math.max(1, validationRoot.rightColumn + 1),
        children: [validationRoot],
      },
    },
    variables: candidate.variables,
    bindings: candidate.bindings,
    theme: {
      kind: "inline",
      name: "Component validation",
      properties: {
        colors: { primaryColor: "#000000", backgroundColor: "#ffffff" },
        borderRadius: { appBorderRadius: "0" },
        boxShadow: { appBoxShadow: "none" },
        fontFamily: { appFont: "Arial" },
      },
    },
    componentDependencies: [],
  };

  parseDashboardDocument(wrapper);

  if (
    !Array.isArray(candidate.bindings) ||
    !Array.isArray(candidate.variables)
  ) {
    throw new ComponentPackageValidationError(
      "Expected variable and binding arrays",
    );
  }

  const ids = widgetsIn(candidate.subtree);

  for (const binding of candidate.bindings) {
    if (!ids.has(binding.target.widgetId)) {
      throw new ComponentPackageValidationError(
        `Binding ${binding.id} points outside the component`,
      );
    }
  }

  return candidate;
}

export function serializeComponentPackage(input: unknown): string {
  return JSON.stringify(parseComponentPackage(input), null, 2);
}

/** Capture one group, including its own live bindings, from a valid dashboard. */
export function createComponentFromDashboard(
  input: unknown,
  rootWidgetId: string,
  options: { componentId: string; name: string },
): ComponentPackage {
  const dashboard = parseDashboardDocument(input);
  let selected: AppsmithWidgetDsl | undefined;

  function find(widget: AppsmithWidgetDsl): void {
    if (widget.widgetId === rootWidgetId) selected = widget;

    widget.children?.forEach(find);
  }

  find(dashboard.layout.dsl);

  if (!selected || !GROUP_TYPES.has(selected.type)) {
    throw new ComponentPackageValidationError(
      "Select a container or statbox group from the dashboard",
    );
  }

  const subtree = clone(selected);

  delete subtree.parentId;
  const ids = widgetsIn(subtree);
  const bindings = dashboard.bindings.filter((binding) =>
    ids.has(binding.target.widgetId),
  );
  const variableKeys = new Set(bindings.map((binding) => binding.variableKey));

  return parseComponentPackage({
    assetKind: "component",
    schemaVersion: COMPONENT_PACKAGE_SCHEMA_VERSION,
    componentId: options.componentId,
    name: options.name,
    compatibility: clone(dashboard.compatibility),
    subtree,
    variables: dashboard.variables.filter((variable) =>
      variableKeys.has(variable.key),
    ),
    bindings,
  });
}
