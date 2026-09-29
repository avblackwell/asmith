import type { DashboardDocument } from "../../document";
import {
  LiveBindingProjector,
  isSupportedDisplayTarget,
  TransientWidgetOverlay,
} from "../../editor-bridge/live-bindings";
import type { ResolvedVariable } from "../../editor-bridge/live-bindings";

const PREVIEW_CELL_ID = "local-sample-preview";

function previewVariables(document: DashboardDocument): ResolvedVariable[] {
  const used = new Set(document.variables.flatMap((variable) =>
    variable.selector.kind === "cyflexId" ? [variable.selector.id] : [],
  ));
  let nextId = 1n;

  return document.variables.map((variable) => {
    if (variable.selector.kind === "cyflexId") {
      return { key: variable.key, id: variable.selector.id };
    }

    while (used.has(String(nextId))) nextId++;
    const id = String(nextId++);

    used.add(id);
    return { key: variable.key, id };
  });
}

function sampleValue(
  type: "number" | "string" | "boolean",
  second: boolean,
): number | string | boolean {
  if (type === "number") return second ? 942.1 : 915.4;
  if (type === "boolean") return second;
  return second ? "Sample value" : "Sample";
}

/** Show local sample values through the same projector that Run will feed. */
export function applyPreviewSamples(
  document: DashboardDocument,
  overlay: TransientWidgetOverlay,
  now = Date.now(),
): void {
  const widgetTypes = new Map<string, string>();
  const visit = (widget: DashboardDocument["layout"]["dsl"]) => {
    widgetTypes.set(widget.widgetId, widget.type);
    widget.children?.forEach(visit);
  };

  visit(document.layout.dsl);

  for (const binding of document.bindings) {
    if (!isSupportedDisplayTarget(
      widgetTypes.get(binding.target.widgetId) ?? "",
      binding.target.propertyPath,
    )) {
      throw new TypeError(
        `Sample preview does not support ${binding.target.propertyPath} on ${binding.target.widgetId}`,
      );
    }
  }

  const variables = previewVariables(document);
  const byKey = new Map(document.variables.map((variable) => [
    variable.key,
    variable,
  ]));
  const resolved = new Map(variables.map((variable) => [
    variable.key,
    variable.id,
  ]));
  const projector = new LiveBindingProjector(
    document,
    PREVIEW_CELL_ID,
    variables,
  );
  const seen = new Set<string>();

  overlay.clear();

  for (const binding of document.bindings) {
    const key = JSON.stringify([binding.variableKey, binding.unitCode]);

    if (seen.has(key)) continue;
    seen.add(key);

    const variable = byKey.get(binding.variableKey);
    const variableId = resolved.get(binding.variableKey);

    if (!variable || !variableId) continue;

    for (const second of [false, true]) {
      overlay.apply(projector.accept({
        cellId: PREVIEW_CELL_ID,
        variableId,
        unitCode: binding.unitCode,
        timestampMs: now - (second ? 0 : 1000),
        value: sampleValue(variable.valueType, second),
      }));
    }
  }
}
