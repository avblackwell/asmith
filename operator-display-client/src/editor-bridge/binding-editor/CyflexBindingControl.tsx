import React, { useEffect, useRef, useState } from "react";
import { Button, Input, Text } from "@appsmith/ads";
import { nanoid } from "nanoid";
import type {
  DashboardBinding,
  DashboardDocument,
  DashboardVariable,
  VariableSelector,
} from "../../document";
import type { WidgetBindingDraft } from "./model";
import { VariableDiscoveryChooser } from "./VariableDiscoveryChooser";
import "./cyflexBindingControl.css";

/**
 * The control follows Appsmith's property-local binding affordance: a compact
 * Connect data action beside the property, with editing disclosed in place.
 * Cyflex bindings are typed document metadata rather than Appsmith JS strings.
 */
export interface CyflexBindingControlProps {
  document: DashboardDocument;
  target: { widgetId: string; propertyPath: string };
  kind: "latest" | "history";
  binding?: DashboardBinding;
  onSave(draft: WidgetBindingDraft): void;
  onRemove(bindingId: string): void;
  disabled?: boolean;
  error?: string | null;
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

const NEW_VARIABLE = "";
const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;
const UINT64_MAX = BigInt("18446744073709551615");

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function integerField(value: string, label: string, min: number, max: number): number {
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
    selectorValue: variable?.selector.kind === "cyflexId"
      ? variable.selector.id
      : variable?.selector.name ?? "",
    valueType: variable?.valueType ?? "number",
    unitCode: binding ? String(binding.unitCode) : "",
    template: presentation?.kind === "latest" ? presentation.template : "{value}",
    decimalPlaces: presentation?.kind === "latest" &&
      presentation.decimalPlaces !== undefined
      ? String(presentation.decimalPlaces)
      : "",
    maxPoints: presentation?.kind === "history"
      ? String(presentation.maxPoints)
      : "180",
    windowSeconds: presentation?.kind === "history"
      ? String(presentation.windowSeconds)
      : "180",
  };
}

export function CyflexBindingControl({
  binding,
  disabled = false,
  document,
  error,
  kind,
  onRemove,
  onSave,
  target,
}: CyflexBindingControlProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [fields, setFields] = useState(() => initialFields(document, binding));
  const [localError, setLocalError] = useState("");
  const newVariableKey = useRef(`variable-${nanoid()}`);
  const newBindingId = useRef(`binding-${nanoid()}`);
  const variable = document.variables.find((candidate) =>
    candidate.key === binding?.variableKey);
  const savedBindingState = JSON.stringify([binding, variable]);
  const reusableVariables = document.variables.filter((candidate) =>
    kind === "latest" || candidate.valueType === "number");
  const targetLabel = kind === "history" ? "Chart series data" : "Text value";

  // Undo, redo and committed edits can change a binding while this control stays mounted.
  useEffect(() => {
    setFields(initialFields(document, binding));
    setLocalError("");
  }, [kind, savedBindingState, target.propertyPath, target.widgetId]);

  useEffect(() => {
    newVariableKey.current = `variable-${nanoid()}`;
    newBindingId.current = `binding-${nanoid()}`;
    setOpen(false);
    setShowDiscovery(false);
  }, [target.propertyPath, target.widgetId]);

  function update(changes: Partial<FormFields>) {
    setFields((current) => ({ ...current, ...changes }));
    setLocalError("");
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
    const selected = document.variables.find((candidate) => candidate.key === key);
    if (!selected) return;
    update({
      variableChoice: selected.key,
      label: selected.label,
      selectorKind: selected.selector.kind,
      selectorValue: selected.selector.kind === "cyflexId"
        ? selected.selector.id
        : selected.selector.name,
      valueType: selected.valueType,
    });
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (!fields.label.trim()) throw new Error("Enter a display label");
      if (!fields.selectorValue.trim()) {
        throw new Error(fields.selectorKind === "logicalName"
          ? "Enter the exact Cyflex variable label"
          : "Enter a Cyflex variable ID");
      }
      if (fields.selectorKind === "cyflexId" &&
        (!/^(0|[1-9]\d*)$/.test(fields.selectorValue) ||
          BigInt(fields.selectorValue) > UINT64_MAX)) {
        throw new Error("Cyflex variable ID must be a decimal uint64 value");
      }
      const declaration: DashboardVariable = {
        key: fields.variableChoice || newVariableKey.current,
        label: fields.label.trim(),
        selector: fields.selectorKind === "cyflexId"
          ? { kind: "cyflexId", id: fields.selectorValue }
          : { kind: "logicalName", name: fields.selectorValue },
        valueType: kind === "history" ? "number" : fields.valueType,
      };
      const unitCode = integerField(
        fields.unitCode,
        "Signed unit code",
        INT32_MIN,
        INT32_MAX,
      );
      let presentation: DashboardBinding["presentation"];
      if (kind === "history") {
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
          throw new Error("Text template needs exactly one {value} placeholder");
        }
        presentation = {
          kind: "latest",
          template: fields.template,
          ...(fields.decimalPlaces.trim() && fields.valueType === "number"
            ? { decimalPlaces: integerField(fields.decimalPlaces, "Decimal places", 0, 12) }
            : {}),
        };
      }

      onSave({
        id: binding?.id ?? newBindingId.current,
        variable: declaration,
        unitCode,
        target,
        presentation,
      });
      setLocalError("");
    } catch (cause) {
      setLocalError(describeError(cause));
    }
  }

  return (
    <section
      aria-label={`${targetLabel} live data binding`}
      className="od-cyflex-binding"
      data-testid="t--binding-control"
    >
      <div className="od-cyflex-binding__summary">
        <div className="od-cyflex-binding__summary-copy">
          <Text kind="body-s">Live data</Text>
          <span className="od-cyflex-binding__summary-detail" data-testid="t--binding-summary">
            {binding
              ? `${variable?.label ?? binding.variableKey} · ${binding.presentation.kind}`
              : `Connect Cyflex data to ${targetLabel.toLowerCase()}`}
          </span>
        </div>
        <Button
          aria-expanded={open}
          data-testid="t--binding-connect"
          isDisabled={disabled}
          kind="tertiary"
          onClick={() => setOpen((current) => !current)}
          size="sm"
          startIcon={binding ? "edit-line" : "link"}
        >
          {open ? "Close" : binding ? "Edit" : "Connect data"}
        </Button>
      </div>
      {open && (
        <form className="od-cyflex-binding__form" onSubmit={save}>
          <p className="od-cyflex-binding__target">{target.propertyPath}</p>
          <label>
            Variable
            <select
              data-testid="t--binding-variable-choice"
              disabled={disabled}
              onChange={(event) => chooseVariable(event.target.value)}
              value={fields.variableChoice}
            >
              <option value={NEW_VARIABLE}>New variable</option>
              {reusableVariables.map((candidate) => (
                <option key={candidate.key} value={candidate.key}>{candidate.label}</option>
              ))}
            </select>
          </label>
          {fields.variableChoice !== NEW_VARIABLE && (
            <p className="od-cyflex-binding__hint">
              Editing this variable affects every widget that uses it.
            </p>
          )}
          <Input
            data-testid="t--binding-variable-label"
            isDisabled={disabled}
            isRequired
            label="Display label"
            onChange={(value) => update({ label: value })}
            value={fields.label}
          />
          <label>
            Match variable by
            <select
              data-testid="t--binding-selector-kind"
              disabled={disabled}
              onChange={(event) => {
                const selectorKind = event.target.value;
                if (selectorKind === "logicalName" || selectorKind === "cyflexId") {
                  update({ selectorKind, selectorValue: "" });
                }
              }}
              value={fields.selectorKind}
            >
              <option value="logicalName">Cyflex variable label</option>
              <option value="cyflexId">Cyflex variable ID</option>
            </select>
          </label>
          <Input
            data-testid="t--binding-selector-value"
            isDisabled={disabled}
            isRequired
            label={fields.selectorKind === "logicalName"
              ? "Exact Cyflex variable label"
              : "Cyflex variable ID (decimal)"}
            onChange={(value) => update({ selectorValue: value })}
            value={fields.selectorValue}
          />
          <p className="od-cyflex-binding__hint">
            {fields.selectorKind === "logicalName"
              ? "Match the selected cell's Cyflex variable label exactly."
              : "Use the decimal uint64 ID reported by Cyflex."}
          </p>
          <Button
            aria-expanded={showDiscovery}
            data-testid="t--binding-browse-variables"
            isDisabled={disabled}
            kind="tertiary"
            onClick={() => setShowDiscovery((current) => !current)}
            size="sm"
            type="button"
          >
            {showDiscovery ? "Hide variable browser" : "Browse variables"}
          </Button>
          {showDiscovery && (
            <VariableDiscoveryChooser
              disabled={disabled}
              onChoose={(label) => {
                update({ label, selectorKind: "logicalName", selectorValue: label });
                setShowDiscovery(false);
              }}
              onClose={() => setShowDiscovery(false)}
            />
          )}
          {kind === "latest" && (
            <label>
              Value type
              <select
                data-testid="t--binding-value-type"
                disabled={disabled}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "number" || value === "string" || value === "boolean") {
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
          <Input
            data-testid="t--binding-unit-code"
            isDisabled={disabled}
            isRequired
            label="Signed unit code"
            onChange={(value) => update({ unitCode: value })}
            placeholder="e.g. 16"
            value={fields.unitCode}
          />
          {kind === "history" ? (
            <>
              <Input
                data-testid="t--binding-max-points"
                isDisabled={disabled}
                isRequired
                label="Maximum points"
                onChange={(value) => update({ maxPoints: value })}
                value={fields.maxPoints}
              />
              <Input
                data-testid="t--binding-window-seconds"
                isDisabled={disabled}
                isRequired
                label="History window (seconds)"
                onChange={(value) => update({ windowSeconds: value })}
                value={fields.windowSeconds}
              />
            </>
          ) : (
            <>
              <Input
                data-testid="t--binding-template"
                isDisabled={disabled}
                isRequired
                label="Text template"
                onChange={(value) => update({ template: value })}
                value={fields.template}
              />
              <p className="od-cyflex-binding__hint">
                Use one {"{value}"} placeholder, such as {"{value} rpm"}.
              </p>
              {fields.valueType === "number" && (
                <Input
                  data-testid="t--binding-decimal-places"
                  isDisabled={disabled}
                  label="Decimal places (optional)"
                  onChange={(value) => update({ decimalPlaces: value })}
                  value={fields.decimalPlaces}
                />
              )}
            </>
          )}
          <div className="od-cyflex-binding__actions">
            <Button data-testid="t--binding-save" isDisabled={disabled} size="sm" type="submit">
              {binding ? "Update binding" : "Add binding"}
            </Button>
            {binding && (
              <Button
                data-testid="t--binding-remove"
                isDisabled={disabled}
                kind="tertiary"
                onClick={() => onRemove(binding.id)}
                size="sm"
                type="button"
              >
                Remove
              </Button>
            )}
          </div>
          {localError && <p className="od-cyflex-binding__error" role="alert">{localError}</p>}
          {error && <p className="od-cyflex-binding__error" role="alert">{error}</p>}
        </form>
      )}
    </section>
  );
}
