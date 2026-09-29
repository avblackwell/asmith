import { parseDashboardDocument } from "../document";
import type {
  AppsmithWidgetDsl,
  DashboardBinding,
  DashboardDocument,
  DashboardVariable,
} from "../document";

export interface WidgetBindingDraft {
  id: string;
  variable: DashboardVariable;
  unitCode: number;
  target: { widgetId: string; propertyPath: string };
  presentation: DashboardBinding["presentation"];
}

function cloneDocument(input: DashboardDocument): DashboardDocument {
  return JSON.parse(JSON.stringify(input)) as DashboardDocument;
}

function findWidget(
  widget: AppsmithWidgetDsl,
  widgetId: string,
): AppsmithWidgetDsl | undefined {
  if (widget.widgetId === widgetId) return widget;

  for (const child of widget.children ?? []) {
    const found = findWidget(child, widgetId);

    if (found) return found;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertGuidedTarget(
  document: DashboardDocument,
  draft: WidgetBindingDraft,
): void {
  const widget = findWidget(document.layout.dsl, draft.target.widgetId);

  if (!widget) throw new TypeError("Binding target widget does not exist");

  if (widget.type === "TEXT_WIDGET") {
    if (
      draft.target.propertyPath !== "text" ||
      draft.presentation.kind !== "latest"
    ) {
      throw new TypeError("Text widgets support only a latest text binding");
    }

    return;
  }

  if (widget.type === "CHART_WIDGET") {
    const match = /^chartData\.([A-Za-z_$][\w$]*)\.data$/.exec(
      draft.target.propertyPath,
    );
    const chartData = widget.chartData;
    const series = match && isRecord(chartData) ? chartData[match[1]] : null;

    if (
      draft.presentation.kind !== "history" ||
      !match ||
      !isRecord(series) ||
      !Array.isArray(series.data)
    ) {
      throw new TypeError(
        "Chart widgets support only history for an existing data series",
      );
    }

    return;
  }

  throw new TypeError("Only Text and Chart widgets support live bindings");
}

/** Apply one guided binding and validate the complete dashboard atomically. */
export function saveWidgetBinding(
  input: DashboardDocument,
  draft: WidgetBindingDraft,
): DashboardDocument {
  const document = cloneDocument(input);
  const nextDraft = JSON.parse(JSON.stringify(draft)) as WidgetBindingDraft;

  assertGuidedTarget(document, nextDraft);

  const variableIndex = document.variables.findIndex(
    (variable) => variable.key === nextDraft.variable.key,
  );

  if (variableIndex === -1) {
    document.variables.push(nextDraft.variable);
  } else {
    document.variables[variableIndex] = nextDraft.variable;
  }

  const bindingBase = {
    id: nextDraft.id,
    variableKey: nextDraft.variable.key,
    unitCode: nextDraft.unitCode,
    target: nextDraft.target,
  };
  const binding: DashboardBinding =
    nextDraft.presentation.kind === "latest"
      ? { ...bindingBase, presentation: nextDraft.presentation }
      : { ...bindingBase, presentation: nextDraft.presentation };
  const bindingIndex = document.bindings.findIndex(
    (existing) => existing.id === nextDraft.id,
  );

  if (bindingIndex === -1) {
    document.bindings.push(binding);
  } else {
    document.bindings[bindingIndex] = binding;
  }

  return parseDashboardDocument(document);
}

/** Remove one binding, retaining declarations that other bindings may use. */
export function removeWidgetBinding(
  input: DashboardDocument,
  bindingId: string,
): DashboardDocument {
  return removeWidgetBindings(input, [bindingId]);
}

/** Remove several stale targets together so validation sees the repaired set. */
export function removeWidgetBindings(
  input: DashboardDocument,
  bindingIds: string[],
): DashboardDocument {
  const document = cloneDocument(input);
  const ids = new Set(bindingIds);

  document.bindings = document.bindings.filter(
    (binding) => !ids.has(binding.id),
  );

  return parseDashboardDocument(document);
}
