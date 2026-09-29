import { DASHBOARD_DOCUMENT_SCHEMA_VERSION } from "./types";
import type { AppsmithWidgetDsl, DashboardDocument } from "./types";

export class DashboardDocumentValidationError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = "DashboardDocumentValidationError";
  }
}

const UINT64_MAX = BigInt("18446744073709551615");
const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;
const PROPERTY_PATH = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
const FORBIDDEN_RUNTIME_KEYS = new Set([
  "sessionuuid",
  "sessionid",
  "accesstoken",
  "refreshtoken",
  "natscredentials",
  "natsurl",
  "cyflexcontrolurl",
  "authorization",
]);

function fail(path: string, message: string): never {
  throw new DashboardDocumentValidationError(path, message);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail(path, "expected an object");
  }

  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) return fail(path, "expected an array");

  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fail(path, "expected a nonempty string");
  }

  return value;
}

function integer(value: unknown, path: string, min: number, max: number) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    return fail(path, `expected an integer from ${min} to ${max}`);
  }

  return value;
}

function finiteNumber(value: unknown, path: string, min: number) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > Number.MAX_SAFE_INTEGER
  ) {
    return fail(
      path,
      `expected a finite number from ${min} to ${Number.MAX_SAFE_INTEGER}`,
    );
  }

  return value;
}

function keys(
  value: Record<string, unknown>,
  path: string,
  allowed: readonly string[],
) {
  for (const [key] of Object.entries(value)) {
    if (!allowed.includes(key)) fail(`${path}.${key}`, "unknown field");
  }
}

function literal(value: unknown, path: string, expected: string | number) {
  if (value !== expected) fail(path, `expected ${JSON.stringify(expected)}`);
}

function stringMap(value: unknown, path: string): Record<string, unknown> {
  const map = record(value, path);

  for (const [key, entry] of Object.entries(map)) {
    string(entry, `${path}.${key}`);
  }

  return map;
}

function jsonCompatible(
  value: unknown,
  path: string,
  ancestors: WeakSet<object> = new WeakSet(),
): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }

  if (typeof value !== "object") fail(path, "must be JSON compatible");

  if (ancestors.has(value)) fail(path, "cyclic value cannot be exported");

  ancestors.add(value);

  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      jsonCompatible(entry, `${path}[${index}]`, ancestors),
    );
  } else {
    const object = record(value, path);

    if (
      Object.getPrototypeOf(object) !== Object.prototype &&
      Object.getPrototypeOf(object) !== null
    ) {
      fail(path, "expected a plain JSON object");
    }

    for (const [key, entry] of Object.entries(object)) {
      if (FORBIDDEN_RUNTIME_KEYS.has(key.toLowerCase())) {
        fail(
          `${path}.${key}`,
          "run session and connection data must stay outside documents",
        );
      }

      jsonCompatible(entry, `${path}.${key}`, ancestors);
    }
  }

  ancestors.delete(value);
}

/**
 * Appsmith widget events call its action executor, which integration pages do
 * not start. Check the trigger metadata and the event properties themselves:
 * imported JSON can omit the metadata that the Appsmith editor normally adds.
 */
function rejectWidgetEvents(
  widget: Record<string, unknown>,
  path: string,
): void {
  function isConfiguredEvent(value: unknown): boolean {
    if (typeof value === "string") return value.trim().length > 0;

    if (typeof value === "boolean") return value;

    if (Array.isArray(value)) return value.length > 0;

    if (value !== null && typeof value === "object") {
      return Object.entries(value).length > 0;
    }

    return false;
  }

  function visit(value: unknown, valuePath: string): void {
    if (value === null || typeof value !== "object") return;

    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${valuePath}[${index}]`));

      return;
    }

    for (const [key, entry] of Object.entries(value)) {
      if (key === "children" && value === widget) continue;

      const entryPath = `${valuePath}.${key}`;

      if (key === "dynamicTriggerPathList") {
        if (!Array.isArray(entry)) fail(entryPath, "expected an array");

        if (entry.length > 0) {
          fail(
            entryPath,
            "Appsmith event handlers are unavailable in integration dashboards",
          );
        }

        continue;
      }

      if (/^on[A-Z]/.test(key) && isConfiguredEvent(entry)) {
        fail(
          entryPath,
          "Appsmith event handlers are unavailable in integration dashboards",
        );
      }

      visit(entry, entryPath);
    }
  }

  visit(widget, path);
}

function widgetTree(root: unknown): Map<string, AppsmithWidgetDsl> {
  const widgets = new Map<string, AppsmithWidgetDsl>();
  const names = new Set<string>();

  function visit(value: unknown, path: string, parentId?: string) {
    const widget = record(value, path);
    const id = string(widget.widgetId, `${path}.widgetId`);
    const name = string(widget.widgetName, `${path}.widgetName`);

    string(widget.type, `${path}.type`);
    integer(widget.version, `${path}.version`, 1, Number.MAX_SAFE_INTEGER);
    const top = finiteNumber(widget.topRow, `${path}.topRow`, 0);
    const bottom = finiteNumber(widget.bottomRow, `${path}.bottomRow`, 1);
    const left = finiteNumber(widget.leftColumn, `${path}.leftColumn`, 0);
    const right = finiteNumber(widget.rightColumn, `${path}.rightColumn`, 1);

    if (bottom <= top || right <= left) fail(path, "widget has empty bounds");

    if (widgets.has(id)) fail(`${path}.widgetId`, "duplicate widget ID");

    if (names.has(name)) fail(`${path}.widgetName`, "duplicate widget name");

    if (parentId === undefined) {
      literal(widget.type, `${path}.type`, "CANVAS_WIDGET");

      if (widget.parentId !== undefined) {
        fail(`${path}.parentId`, "root widget cannot have a parent");
      }
    } else if (widget.parentId !== parentId) {
      fail(`${path}.parentId`, `expected parent widget ${parentId}`);
    }

    rejectWidgetEvents(widget, path);

    widgets.set(id, widget as unknown as AppsmithWidgetDsl);
    names.add(name);

    if (widget.children !== undefined) {
      array(widget.children, `${path}.children`).forEach((child, index) =>
        visit(child, `${path}.children[${index}]`, id),
      );
    }
  }

  visit(root, "$.layout.dsl");

  return widgets;
}

function atPropertyPath(widget: AppsmithWidgetDsl, propertyPath: string) {
  return propertyPath.split(".").reduce<unknown>((value, segment) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }

    return (value as Record<string, unknown>)[segment];
  }, widget);
}

/**
 * Validate the package before loading, saving, uploading, or importing it.
 * This validates the envelope and binding references; individual widget
 * properties are still interpreted by Appsmith's widget definitions.
 */
export function parseDashboardDocument(input: unknown): DashboardDocument {
  jsonCompatible(input, "$");
  const document = record(input, "$");

  keys(document, "$", [
    "assetKind",
    "schemaVersion",
    "documentId",
    "name",
    "compatibility",
    "layout",
    "variables",
    "bindings",
    "theme",
    "componentDependencies",
  ]);
  literal(document.assetKind, "$.assetKind", "dashboard");
  literal(
    document.schemaVersion,
    "$.schemaVersion",
    DASHBOARD_DOCUMENT_SCHEMA_VERSION,
  );
  string(document.documentId, "$.documentId");
  string(document.name, "$.name");

  const compatibility = record(document.compatibility, "$.compatibility");

  keys(compatibility, "$.compatibility", [
    "renderer",
    "layoutSystem",
    "widgetDslVersion",
  ]);
  literal(compatibility.renderer, "$.compatibility.renderer", "appsmith");
  literal(compatibility.layoutSystem, "$.compatibility.layoutSystem", "FIXED");
  integer(
    compatibility.widgetDslVersion,
    "$.compatibility.widgetDslVersion",
    1,
    Number.MAX_SAFE_INTEGER,
  );

  const layout = record(document.layout, "$.layout");

  keys(layout, "$.layout", ["dsl"]);
  const widgets = widgetTree(layout.dsl);

  if (
    compatibility.widgetDslVersion !== (layout.dsl as AppsmithWidgetDsl).version
  ) {
    fail(
      "$.compatibility.widgetDslVersion",
      "must match the root widget version",
    );
  }

  const variableTypes = new Map<string, string>();

  array(document.variables, "$.variables").forEach((value, index) => {
    const path = `$.variables[${index}]`;
    const variable = record(value, path);

    keys(variable, path, ["key", "label", "selector", "valueType"]);
    const key = string(variable.key, `${path}.key`);

    if (variableTypes.has(key)) fail(`${path}.key`, "duplicate variable key");

    string(variable.label, `${path}.label`);

    if (!["number", "string", "boolean"].includes(String(variable.valueType))) {
      fail(`${path}.valueType`, "unsupported value type");
    }

    variableTypes.set(key, variable.valueType as string);

    const selector = record(variable.selector, `${path}.selector`);

    if (selector.kind === "logicalName") {
      keys(selector, `${path}.selector`, ["kind", "name"]);
      string(selector.name, `${path}.selector.name`);
    } else if (selector.kind === "cyflexId") {
      keys(selector, `${path}.selector`, ["kind", "id"]);
      const id = string(selector.id, `${path}.selector.id`);

      if (!/^(0|[1-9]\d*)$/.test(id) || BigInt(id) > UINT64_MAX) {
        fail(`${path}.selector.id`, "expected a decimal uint64 string");
      }
    } else {
      fail(`${path}.selector.kind`, "unsupported selector kind");
    }
  });

  const bindingIds = new Set<string>();
  const boundTargets = new Set<string>();

  array(document.bindings, "$.bindings").forEach((value, index) => {
    const path = `$.bindings[${index}]`;
    const binding = record(value, path);

    keys(binding, path, [
      "id",
      "variableKey",
      "unitCode",
      "target",
      "presentation",
    ]);
    const id = string(binding.id, `${path}.id`);

    if (bindingIds.has(id)) fail(`${path}.id`, "duplicate binding ID");

    bindingIds.add(id);
    const variableKey = string(binding.variableKey, `${path}.variableKey`);

    if (!variableTypes.has(variableKey)) {
      fail(`${path}.variableKey`, "variable is not declared");
    }

    integer(binding.unitCode, `${path}.unitCode`, INT32_MIN, INT32_MAX);

    const target = record(binding.target, `${path}.target`);

    keys(target, `${path}.target`, ["widgetId", "propertyPath"]);
    const widgetId = string(target.widgetId, `${path}.target.widgetId`);
    const widget = widgets.get(widgetId);

    if (!widget) fail(`${path}.target.widgetId`, "widget does not exist");

    const propertyPath = string(
      target.propertyPath,
      `${path}.target.propertyPath`,
    );

    if (!PROPERTY_PATH.test(propertyPath)) {
      fail(
        `${path}.target.propertyPath`,
        "expected a dot-separated property path",
      );
    }

    const targetKey = `${widgetId}:${propertyPath}`;

    if (boundTargets.has(targetKey)) {
      fail(`${path}.target`, "another binding already writes this property");
    }

    boundTargets.add(targetKey);
    const targetValue = atPropertyPath(widget, propertyPath);

    if (targetValue === undefined) {
      fail(
        `${path}.target.propertyPath`,
        "property does not exist on the widget",
      );
    }

    const presentation = record(binding.presentation, `${path}.presentation`);

    if (presentation.kind === "latest") {
      keys(presentation, `${path}.presentation`, [
        "kind",
        "template",
        "decimalPlaces",
      ]);
      const template = string(
        presentation.template,
        `${path}.presentation.template`,
      );

      if (
        template.split("{value}").length !== 2 ||
        typeof targetValue !== "string"
      ) {
        fail(
          `${path}.presentation`,
          "latest binding needs one {value} and a string property",
        );
      }

      if (presentation.decimalPlaces !== undefined) {
        if (variableTypes.get(variableKey) !== "number") {
          fail(
            `${path}.presentation.decimalPlaces`,
            "requires a numeric variable",
          );
        }

        integer(
          presentation.decimalPlaces,
          `${path}.presentation.decimalPlaces`,
          0,
          12,
        );
      }
    } else if (presentation.kind === "history") {
      keys(presentation, `${path}.presentation`, [
        "kind",
        "maxPoints",
        "windowSeconds",
      ]);
      integer(
        presentation.maxPoints,
        `${path}.presentation.maxPoints`,
        1,
        10000,
      );
      integer(
        presentation.windowSeconds,
        `${path}.presentation.windowSeconds`,
        1,
        86400,
      );

      if (variableTypes.get(variableKey) !== "number") {
        fail(
          `${path}.presentation`,
          "history binding requires a numeric variable",
        );
      }

      if (widget.type !== "CHART_WIDGET" || !Array.isArray(targetValue)) {
        fail(
          `${path}.presentation`,
          "history binding needs a chart data array",
        );
      }
    } else {
      fail(`${path}.presentation.kind`, "unsupported presentation kind");
    }
  });

  const theme = record(document.theme, "$.theme");

  if (theme.kind === "inline") {
    keys(theme, "$.theme", ["kind", "name", "properties"]);
    string(theme.name, "$.theme.name");
    const properties = record(theme.properties, "$.theme.properties");

    keys(properties, "$.theme.properties", [
      "colors",
      "borderRadius",
      "boxShadow",
      "fontFamily",
    ]);
    const colors = stringMap(properties.colors, "$.theme.properties.colors");

    string(colors.primaryColor, "$.theme.properties.colors.primaryColor");
    string(colors.backgroundColor, "$.theme.properties.colors.backgroundColor");

    for (const [group, property] of [
      ["borderRadius", "appBorderRadius"],
      ["boxShadow", "appBoxShadow"],
      ["fontFamily", "appFont"],
    ]) {
      const value = stringMap(properties[group], `$.theme.properties.${group}`);

      string(value[property], `$.theme.properties.${group}.${property}`);
    }
  } else if (theme.kind === "marketplace") {
    keys(theme, "$.theme", ["kind", "itemId", "revision"]);
    string(theme.itemId, "$.theme.itemId");
    string(theme.revision, "$.theme.revision");
  } else {
    fail("$.theme.kind", "unsupported theme kind");
  }

  const componentKeys = new Set<string>();

  array(document.componentDependencies, "$.componentDependencies").forEach(
    (value, index) => {
      const path = `$.componentDependencies[${index}]`;
      const component = record(value, path);

      keys(component, path, ["key", "revision", "rootWidgetId", "source"]);
      const key = string(component.key, `${path}.key`);

      if (componentKeys.has(key))
        fail(`${path}.key`, "duplicate component key");

      componentKeys.add(key);
      string(component.revision, `${path}.revision`);
      const rootWidgetId = string(
        component.rootWidgetId,
        `${path}.rootWidgetId`,
      );
      const widget = widgets.get(rootWidgetId);

      if (
        !widget ||
        !["CONTAINER_WIDGET", "STATBOX_WIDGET"].includes(widget.type)
      ) {
        fail(
          `${path}.rootWidgetId`,
          "component must refer to a group widget in the layout",
        );
      }

      const source = record(component.source, `${path}.source`);

      if (source.kind === "embedded") {
        keys(source, `${path}.source`, ["kind"]);
      } else if (source.kind === "marketplace") {
        keys(source, `${path}.source`, ["kind", "itemId", "contentSha256"]);
        string(source.itemId, `${path}.source.itemId`);

        if (!/^[a-f0-9]{64}$/.test(String(source.contentSha256))) {
          fail(
            `${path}.source.contentSha256`,
            "expected a lowercase SHA-256 digest",
          );
        }
      } else {
        fail(`${path}.source.kind`, "unsupported component source kind");
      }
    },
  );

  return input as DashboardDocument;
}

export function serializeDashboardDocument(input: unknown): string {
  return JSON.stringify(parseDashboardDocument(input), null, 2);
}

export function importDashboardDocumentJson(json: string): DashboardDocument {
  return parseDashboardDocument(JSON.parse(json));
}

export async function importDashboardDocumentFile(
  file: Blob,
): Promise<DashboardDocument> {
  return importDashboardDocumentJson(await file.text());
}
