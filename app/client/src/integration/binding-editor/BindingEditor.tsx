import React, { useState } from "react";
import { useSelector } from "react-redux";
import type { DefaultRootState } from "react-redux";
import { getSelectedWidgets } from "selectors/ui";
import type {
  DashboardBinding,
  DashboardDocument,
  DashboardVariable,
  VariableSelector,
} from "../document";
import type { WidgetBindingDraft } from "./model";
import type { MarketplaceClient } from "../marketplace";
import { VariableDiscoveryChooser } from "./VariableDiscoveryChooser";
import "./bindingEditor.css";

interface BindingEditorProps {
  documentEpoch: number;
  getDocument(): DashboardDocument;
  onSave(draft: WidgetBindingDraft): void;
  onRemove(bindingId: string): void;
  onRemoveMany(bindingIds: string[]): void;
  disabled?: boolean;
  marketplace?: MarketplaceClient;
}

interface BindingFormProps {
  binding: DashboardBinding | undefined;
  document: DashboardDocument;
  disabled: boolean;
  onRemove(bindingId: string): void;
  onSave(draft: WidgetBindingDraft): void;
  onSaved(): void;
  marketplace?: MarketplaceClient;
  target: { widgetId: string; propertyPath: string };
  widgetType: "TEXT_WIDGET" | "CHART_WIDGET";
}

interface FormFields {
  variableChoice: string;
  label: string;
  selectorKind: VariableSelector["kind"];
  selectorValue: string;
  valueType: DashboardVariable["valueType"];
  unitCode: string;
  template: string;
  decimalPlaces: string;
  maxPoints: string;
  windowSeconds: string;
}

// Document validation requires nonempty variable keys, so this cannot collide.
const NEW_VARIABLE = "";
const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;
const PROPERTY_SEGMENT = /^[A-Za-z_$][\w$]*$/;
const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function propertyValue(widget: unknown, propertyPath: string): unknown {
  let current = widget;

  for (const segment of propertyPath.split(".")) {
    if (
      !isRecord(current) ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function chartSeriesKeys(widget: unknown): string[] {
  if (!isRecord(widget) || !isRecord(widget.chartData)) return [];

  return Object.entries(widget.chartData)
    .filter(
      ([key, series]) =>
        PROPERTY_SEGMENT.test(key) &&
        !FORBIDDEN_SEGMENTS.has(key) &&
        isRecord(series) &&
        Array.isArray(series.data),
    )
    .map(([key]) => key);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function integerField(value: string, label: string, min: number, max: number) {
  const raw = value.trim();

  if (!/^-?(0|[1-9]\d*)$/.test(raw)) {
    throw new Error(`${label} must be a whole number`);
  }

  const number = Number(raw);

  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }

  return number;
}

function initialFields(
  document: DashboardDocument,
  binding: DashboardBinding | undefined,
): FormFields {
  const variable = document.variables.find(
    (candidate) => candidate.key === binding?.variableKey,
  );
  const presentation = binding?.presentation;

  return {
    variableChoice: variable?.key ?? NEW_VARIABLE,
    label: variable?.label ?? "",
    selectorKind: variable?.selector.kind ?? "logicalName",
    selectorValue:
      variable?.selector.kind === "cyflexId"
        ? variable.selector.id
        : variable?.selector.name ?? "",
    valueType: variable?.valueType ?? "number",
    unitCode: binding ? String(binding.unitCode) : "",
    template:
      presentation?.kind === "latest" ? presentation.template : "{value}",
    decimalPlaces:
      presentation?.kind === "latest" &&
      presentation.decimalPlaces !== undefined
        ? String(presentation.decimalPlaces)
        : "",
    maxPoints:
      presentation?.kind === "history" ? String(presentation.maxPoints) : "180",
    windowSeconds:
      presentation?.kind === "history"
        ? String(presentation.windowSeconds)
        : "180",
  };
}

function BindingForm({
  binding,
  disabled,
  document,
  marketplace,
  onRemove,
  onSave,
  onSaved,
  target,
  widgetType,
}: BindingFormProps) {
  const [fields, setFields] = useState(() => initialFields(document, binding));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const isChart = widgetType === "CHART_WIDGET";
  const reusableVariables = document.variables.filter(
    (variable) => !isChart || variable.valueType === "number",
  );

  function update(changes: Partial<FormFields>) {
    setFields((current) => ({ ...current, ...changes }));
    setError("");
    setMessage("");
  }

  function chooseVariable(key: string) {
    if (key === NEW_VARIABLE) {
      update({
        variableChoice: NEW_VARIABLE,
        label: "",
        selectorKind: "logicalName",
        selectorValue: "",
        valueType: "number",
      });

      return;
    }

    const variable = document.variables.find(
      (candidate) => candidate.key === key,
    );

    if (!variable) return;

    update({
      variableChoice: variable.key,
      label: variable.label,
      selectorKind: variable.selector.kind,
      selectorValue:
        variable.selector.kind === "cyflexId"
          ? variable.selector.id
          : variable.selector.name,
      valueType: variable.valueType,
    });
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      if (!fields.label.trim()) throw new Error("Enter a display label");

      if (!fields.selectorValue.trim()) {
        throw new Error(
          fields.selectorKind === "logicalName"
            ? "Enter the exact Cyflex variable label"
            : "Enter a Cyflex variable ID",
        );
      }

      const variable: DashboardVariable = {
        key:
          fields.variableChoice === NEW_VARIABLE
            ? `variable-${window.crypto.randomUUID()}`
            : fields.variableChoice,
        label: fields.label.trim(),
        selector:
          fields.selectorKind === "cyflexId"
            ? { kind: "cyflexId", id: fields.selectorValue.trim() }
            : { kind: "logicalName", name: fields.selectorValue },
        valueType: isChart ? "number" : fields.valueType,
      };
      const unitCode = integerField(
        fields.unitCode,
        "Signed unit code",
        INT32_MIN,
        INT32_MAX,
      );
      let presentation: DashboardBinding["presentation"];

      if (isChart) {
        presentation = {
          kind: "history",
          maxPoints: integerField(fields.maxPoints, "Maximum points", 1, 10000),
          windowSeconds: integerField(
            fields.windowSeconds,
            "History window in seconds",
            1,
            86400,
          ),
        };
      } else {
        if (fields.template.split("{value}").length !== 2) {
          throw new Error(
            "Text template needs exactly one {value} placeholder",
          );
        }

        presentation = {
          kind: "latest",
          template: fields.template,
          ...(fields.decimalPlaces.trim() && variable.valueType === "number"
            ? {
                decimalPlaces: integerField(
                  fields.decimalPlaces,
                  "Decimal places",
                  0,
                  12,
                ),
              }
            : {}),
        };
      }

      onSave({
        id: binding?.id ?? `binding-${window.crypto.randomUUID()}`,
        variable,
        unitCode,
        target,
        presentation,
      });
      setError("");
      setMessage("Binding updated. Save the local draft to keep it.");
      onSaved();
    } catch (cause) {
      setMessage("");
      setError(describeError(cause));
    }
  }

  function remove() {
    if (!binding) return;

    try {
      onRemove(binding.id);
      setError("");
      setMessage("Binding removed. Save the local draft to keep it.");
      onSaved();
    } catch (cause) {
      setMessage("");
      setError(describeError(cause));
    }
  }

  return (
    <form className="binding-editor__form" onSubmit={save}>
      <p className="binding-editor__target">
        {isChart ? "Chart history" : "Text value"} · {target.propertyPath}
      </p>
      <label>
        Variable
        <select
          data-testid="t--binding-variable-choice"
          disabled={disabled}
          onChange={(event) => chooseVariable(event.target.value)}
          value={fields.variableChoice}
        >
          <option value={NEW_VARIABLE}>New variable</option>
          {reusableVariables.map((variable) => (
            <option key={variable.key} value={variable.key}>
              {variable.label}
            </option>
          ))}
        </select>
      </label>
      {fields.variableChoice !== NEW_VARIABLE && (
        <p className="binding-editor__hint">
          Editing this variable affects every widget that uses it.
        </p>
      )}
      <label>
        Display label
        <input
          data-testid="t--binding-variable-label"
          disabled={disabled}
          onChange={(event) => update({ label: event.target.value })}
          required
          value={fields.label}
        />
      </label>
      <label>
        Match variable by
        <select
          data-testid="t--binding-selector-kind"
          disabled={disabled}
          onChange={(event) => {
            const kind = event.target.value;

            if (kind === "logicalName" || kind === "cyflexId") {
              update({ selectorKind: kind, selectorValue: "" });
            }
          }}
          value={fields.selectorKind}
        >
          <option value="logicalName">Cyflex variable label</option>
          <option value="cyflexId">Cyflex variable ID</option>
        </select>
      </label>
      <label>
        {fields.selectorKind === "logicalName"
          ? "Exact Cyflex variable label"
          : "Cyflex variable ID (decimal)"}
        <input
          data-testid="t--binding-selector-value"
          disabled={disabled}
          onChange={(event) => update({ selectorValue: event.target.value })}
          required
          value={fields.selectorValue}
        />
      </label>
      <p className="binding-editor__hint">
        {fields.selectorKind === "logicalName"
          ? "The label must match the selected cell's /cyflex/variables response exactly when Run starts."
          : "Use the decimal uint64 ID reported by the selected cell's /cyflex/variables response."}
      </p>
      {marketplace && (
        <>
          {!discoveryOpen && (
            <button
              className="binding-editor__browse-toggle"
              data-testid="t--binding-discovery-open"
              disabled={disabled}
              onClick={() => setDiscoveryOpen(true)}
              type="button"
            >
              Browse Cyflex variables
            </button>
          )}
          {discoveryOpen && (
            <VariableDiscoveryChooser
              disabled={disabled}
              marketplace={marketplace}
              onChoose={(label) => {
                update({
                  label,
                  selectorKind: "logicalName",
                  selectorValue: label,
                });
                setDiscoveryOpen(false);
              }}
              onClose={() => setDiscoveryOpen(false)}
            />
          )}
        </>
      )}
      {!isChart && (
        <label>
          Value type
          <select
            data-testid="t--binding-value-type"
            disabled={disabled}
            onChange={(event) => {
              const value = event.target.value;

              if (
                value === "number" ||
                value === "string" ||
                value === "boolean"
              ) {
                update({ valueType: value });
              }
            }}
            value={fields.valueType}
          >
            <option value="number">Number</option>
            <option value="string">Text</option>
            <option value="boolean">Boolean</option>
          </select>
        </label>
      )}
      <label>
        Signed unit code
        <input
          data-testid="t--binding-unit-code"
          disabled={disabled}
          inputMode="numeric"
          onChange={(event) => update({ unitCode: event.target.value })}
          placeholder="Required, e.g. 16"
          required
          value={fields.unitCode}
        />
      </label>
      {isChart ? (
        <>
          <label>
            Maximum points
            <input
              data-testid="t--binding-max-points"
              disabled={disabled}
              inputMode="numeric"
              onChange={(event) => update({ maxPoints: event.target.value })}
              required
              value={fields.maxPoints}
            />
          </label>
          <label>
            History window (seconds)
            <input
              data-testid="t--binding-window-seconds"
              disabled={disabled}
              inputMode="numeric"
              onChange={(event) =>
                update({ windowSeconds: event.target.value })
              }
              required
              value={fields.windowSeconds}
            />
          </label>
        </>
      ) : (
        <>
          <label>
            Text template
            <input
              data-testid="t--binding-template"
              disabled={disabled}
              onChange={(event) => update({ template: event.target.value })}
              required
              value={fields.template}
            />
          </label>
          <p className="binding-editor__hint">
            Use one {"{value}"} placeholder, such as {"{value} rpm"}.
          </p>
          {fields.valueType === "number" && (
            <label>
              Decimal places (optional)
              <input
                data-testid="t--binding-decimal-places"
                disabled={disabled}
                inputMode="numeric"
                onChange={(event) =>
                  update({ decimalPlaces: event.target.value })
                }
                value={fields.decimalPlaces}
              />
            </label>
          )}
        </>
      )}
      <div className="binding-editor__actions">
        <button data-testid="t--binding-save" disabled={disabled} type="submit">
          {binding ? "Update binding" : "Add binding"}
        </button>
        {binding && (
          <button
            data-testid="t--binding-remove"
            disabled={disabled}
            onClick={remove}
            type="button"
          >
            Remove binding
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </form>
  );
}

/** Edits package metadata for selected display widgets without network access. */
export function BindingEditor({
  disabled = false,
  documentEpoch,
  getDocument,
  marketplace,
  onRemove,
  onRemoveMany,
  onSave,
}: BindingEditorProps) {
  const selectedWidgetIds = useSelector(getSelectedWidgets);
  const widgets = useSelector(
    (state: DefaultRootState) => state.entities.canvasWidgets,
  );
  const [revision, setRevision] = useState(0);
  const [seriesChoice, setSeriesChoice] = useState("");
  const [repairError, setRepairError] = useState("");
  const [open, setOpen] = useState(true);
  const selectedWidgetId =
    selectedWidgetIds.length === 1 ? selectedWidgetIds[0] : null;
  const selectedWidget = selectedWidgetId
    ? widgets[selectedWidgetId]
    : undefined;
  const isText = selectedWidget?.type === "TEXT_WIDGET";
  const isChart = selectedWidget?.type === "CHART_WIDGET";
  const seriesKeys = isChart ? chartSeriesKeys(selectedWidget) : [];
  const activeSeries = seriesKeys.includes(seriesChoice)
    ? seriesChoice
    : seriesKeys[0] ?? "";
  const targetPath = isText
    ? "text"
    : isChart && activeSeries
      ? `chartData.${activeSeries}.data`
      : null;
  let document: DashboardDocument | null = null;
  let documentError = "";

  try {
    document = getDocument();
  } catch (cause) {
    documentError = describeError(cause);
  }

  const repairBindings = (document?.bindings ?? []).filter((binding) => {
    const widget = widgets[binding.target.widgetId];

    return (
      !widget ||
      propertyValue(widget, binding.target.propertyPath) === undefined
    );
  });
  const activeBinding = document?.bindings.find(
    (binding) =>
      binding.target.widgetId === selectedWidgetId &&
      binding.target.propertyPath === targetPath,
  );

  function changed() {
    setRevision((value) => value + 1);
    setRepairError("");
  }

  function removeRepair(bindingId: string) {
    try {
      onRemove(bindingId);
      changed();
    } catch (cause) {
      setRepairError(describeError(cause));
    }
  }

  function removeAllRepairs() {
    try {
      onRemoveMany(repairBindings.map((binding) => binding.id));
      changed();
    } catch (cause) {
      setRepairError(describeError(cause));
    }
  }

  return (
    <section aria-label="Live data bindings" className="binding-editor">
      <details
        onToggle={(event) => setOpen(event.currentTarget.open)}
        open={open}
      >
        <summary>Live data binding</summary>
        <div className="binding-editor__body">
          {selectedWidgetId && (
            <p className="binding-editor__target">
              Selected widget:{" "}
              <span data-testid="t--binding-selected-widget-id">
                {selectedWidgetId}
              </span>
            </p>
          )}
          {documentError && <p role="alert">{documentError}</p>}
          {repairBindings.length > 0 && (
            <div className="binding-editor__repair">
              <h3>Bindings to repair</h3>
              <p>
                These targets no longer exist on the canvas. Remove them to save
                the dashboard.
              </p>
              {repairBindings.map((binding) => (
                <div className="binding-editor__repair-row" key={binding.id}>
                  <span>
                    {binding.target.widgetId} · {binding.target.propertyPath}
                  </span>
                  {repairBindings.length === 1 && (
                    <button
                      data-testid={`t--binding-repair-remove-${binding.id}`}
                      disabled={disabled}
                      onClick={() => removeRepair(binding.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {repairBindings.length > 1 && (
                <button
                  data-testid="t--binding-repair-remove-all"
                  disabled={disabled}
                  onClick={removeAllRepairs}
                  type="button"
                >
                  Remove all invalid bindings
                </button>
              )}
              {repairError && <p role="alert">{repairError}</p>}
            </div>
          )}
          {!selectedWidgetId && <p>Select one Text or Chart widget to bind.</p>}
          {selectedWidgetId && !isText && !isChart && (
            <p>Select a Text or Chart widget to bind live data.</p>
          )}
          {isChart && (
            <label>
              Chart series
              <select
                data-testid="t--binding-series"
                disabled={disabled || seriesKeys.length === 0}
                onChange={(event) => setSeriesChoice(event.target.value)}
                value={activeSeries}
              >
                {seriesKeys.length === 0 && (
                  <option value="">No chart series available</option>
                )}
                {seriesKeys.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </label>
          )}
          {isChart && seriesKeys.length === 0 && (
            <p>This chart needs a data series before it can be bound.</p>
          )}
          {document &&
            selectedWidgetId &&
            targetPath &&
            (isText || isChart) && (
              <BindingForm
                binding={activeBinding}
                disabled={disabled}
                document={document}
                key={`${selectedWidgetId}:${targetPath}:${documentEpoch}:${revision}`}
                marketplace={marketplace}
                onRemove={onRemove}
                onSave={onSave}
                onSaved={changed}
                target={{
                  widgetId: selectedWidgetId,
                  propertyPath: targetPath,
                }}
                widgetType={isText ? "TEXT_WIDGET" : "CHART_WIDGET"}
              />
            )}
        </div>
      </details>
    </section>
  );
}
