import React, { useEffect, useRef, useState } from "react";
import { Input } from "@appsmith/ads";
import type { PropertyControl } from "./config";
import type { TabEditRequest } from "../editable-store";
import type { JsonValue } from "../../document/types";
import { TabsControl } from "./tabs/TabsControl";
import { LocationSearchControl } from "../native-widgets/map-embed/LocationSearchControl";
import "./propertyControls.css";

type PropertyValue = string | number | boolean;
let nextControlId = 0;

function useControlId(): string {
  const id = useRef<string>();
  if (!id.current) id.current = `od-property-control-${++nextControlId}`;
  return id.current;
}

interface PropertyControlRendererProps {
  control: PropertyControl;
  value: unknown;
  onChange: (value: JsonValue) => void;
  onError: (message: string | null) => void;
  widgetId?: string;
  onTabEdit?: (request: TabEditRequest) => void;
}

function displayValue(value: unknown, fallback: PropertyValue | undefined): string {
  const resolved = value ?? fallback;
  return typeof resolved === "string" || typeof resolved === "number"
    ? String(resolved)
    : "";
}

function parseValue(control: PropertyControl, draft: string): PropertyValue | string {
  if (control.valueType !== "number") return draft;
  const number = draft.trim() ? Number(draft) : Number.NaN;
  const bounds = control.validation ?? {};
  if (!Number.isFinite(number) ||
    (bounds.integer && !Number.isInteger(number)) ||
    (bounds.min !== undefined && number < bounds.min) ||
    (bounds.max !== undefined && number > bounds.max)) {
    const range = bounds.min !== undefined && bounds.max !== undefined
      ? `between ${bounds.min} and ${bounds.max}`
      : bounds.min !== undefined ? `at least ${bounds.min}` : "a finite number";
    throw new Error(`${control.label} must be ${range}${bounds.integer ? " (whole number)" : ""}.`);
  }
  return number;
}

function TextControl({ control, value, onChange, onError }: PropertyControlRendererProps): React.ReactElement {
  const committed = displayValue(value, control.defaultValue);
  const [draft, setDraft] = useState(committed);
  useEffect(() => setDraft(committed), [committed]);

  const commit = () => {
    if (draft === committed) return;
    try {
      const parsed = parseValue(control, draft);
      onError(null);
      onChange(parsed);
    } catch (error) {
      onError(error instanceof Error ? error.message : `Invalid ${control.label}.`);
      setDraft(committed);
    }
  };

  return (
    <Input
      label={control.label}
      onBlur={commit}
      onChange={setDraft}
      placeholder={control.placeholderText}
      renderAs={control.controlType === "INPUT_TEXT_AREA" ? "textarea" : "input"}
      type={control.valueType === "number" ? "number" : undefined}
      value={draft}
    />
  );
}

function JsonArrayControl({ control, value, onChange, onError }: PropertyControlRendererProps): React.ReactElement {
  const committed = Array.isArray(value) ? JSON.stringify(value, null, 2)
    : typeof value === "string" ? value : "[]";
  const [draft, setDraft] = useState(committed);
  useEffect(() => setDraft(committed), [committed]);

  const commit = () => {
    if (draft === committed) return;
    try {
      const parsed: unknown = JSON.parse(draft);
      if (!Array.isArray(parsed)) throw new Error("Items must be a JSON array.");
      onError(null);
      onChange(parsed as JsonValue);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Items must be a JSON array.");
    }
  };

  return (
    <Input
      label={control.label}
      onBlur={commit}
      onChange={setDraft}
      placeholder={control.placeholderText}
      renderAs="textarea"
      value={draft}
    />
  );
}

function SwitchControl({ control, value, onChange, onError }: PropertyControlRendererProps): React.ReactElement {
  const checked = typeof value === "boolean" ? value : control.defaultValue === true;
  return (
    <label className="od-property-control__switch-row">
      <span>{control.label}</span>
      <input
        checked={checked}
        className="od-property-control__switch-input"
        onChange={(event) => { onError(null); onChange(event.target.checked); }}
        role="switch"
        type="checkbox"
      />
      <span aria-hidden="true" className="od-property-control__switch-track" />
    </label>
  );
}

function ChoiceControl({ control, value, onChange, onError }: PropertyControlRendererProps): React.ReactElement {
  const id = useControlId();
  const options = control.options ?? [];
  const current = value ?? control.defaultValue ?? options[0]?.value ?? "";
  const segmented = control.controlType !== "DROP_DOWN";
  const multiSelect = control.controlType === "BUTTON_GROUP";
  const selectedValues = multiSelect && typeof current === "string"
    ? current.split(",").filter((entry) => entry && entry !== "NORMAL")
    : [];

  if (!segmented) return (
    <div className="od-property-control__choice">
      <label htmlFor={id}>{control.label}</label>
      <select
        id={id}
        onChange={(event) => {
          const selected = options.find((option) => String(option.value) === event.target.value);
          if (selected) { onError(null); onChange(selected.value); }
        }}
        value={String(current)}
      >
        {!options.some((option) => String(option.value) === String(current)) &&
          <option value={String(current)}>{String(current)}</option>}
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="od-property-control__choice">
      <span id={id}>{control.label}</span>
      <div aria-labelledby={id} className="od-property-control__segments" role={multiSelect ? "group" : "radiogroup"}>
        {options.map((option) => (
          <button
            aria-checked={multiSelect ? undefined : String(current) === String(option.value)}
            aria-pressed={multiSelect ? selectedValues.includes(String(option.value)) : undefined}
            key={String(option.value)}
            onClick={() => {
              onError(null);
              if (multiSelect) {
                const selected = String(option.value);
                onChange(selectedValues.includes(selected)
                  ? selectedValues.filter((entry) => entry !== selected).join(",")
                  : [...selectedValues, selected].join(","));
              } else onChange(option.value);
            }}
            role={multiSelect ? undefined : "radio"}
            title={option.subText || option.label}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorControl({ control, value, onChange, onError }: PropertyControlRendererProps): React.ReactElement {
  const id = useControlId();
  const committed = displayValue(value, control.defaultValue);
  const [draft, setDraft] = useState(committed);
  useEffect(() => setDraft(committed), [committed]);
  const swatchValue = /^#[0-9a-f]{6}$/i.test(draft) ? draft : "#ffffff";

  const commit = () => {
    if (draft === committed) return;
    if (draft && typeof CSS !== "undefined" && !CSS.supports("color", draft)) {
      onError(`${control.label} must be a valid CSS color.`);
      setDraft(committed);
      return;
    }
    onError(null);
    onChange(draft);
  };

  return (
    <div className="od-property-control__color">
      <label htmlFor={id}>{control.label}</label>
      <div className="od-property-control__color-inputs">
        <input
          aria-label={`${control.label} picker`}
          onChange={(event) => { onError(null); setDraft(event.target.value); onChange(event.target.value); }}
          style={{ backgroundColor: /^#[0-9a-f]{6}$/i.test(draft) ? draft : "transparent" }}
          type="color"
          value={swatchValue}
        />
        <input
          id={id}
          onBlur={commit}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
          type="text"
          value={draft}
        />
      </div>
    </div>
  );
}

/** Presentation adapter for the static subset of Appsmith property controls. */
export function PropertyControlRenderer(props: PropertyControlRendererProps): React.ReactElement {
  const { control } = props;
  let element: React.ReactElement;
  switch (control.controlType) {
    case "LOCATION_SEARCH":
      element = <LocationSearchControl value={props.value}
        onChange={props.onChange} onError={props.onError} />;
      break;
    case "JSON_ARRAY":
      element = <JsonArrayControl {...props} />;
      break;
    case "TABS_INPUT":
      element = props.widgetId && props.onTabEdit
        ? <TabsControl onError={props.onError} onTabEdit={props.onTabEdit}
            tabsObj={props.value} widgetId={props.widgetId} />
        : <span>Tab editing is unavailable.</span>;
      break;
    case "SWITCH":
      element = <SwitchControl {...props} />;
      break;
    case "DROP_DOWN":
    case "ICON_TABS":
    case "BUTTON_GROUP":
    case "BORDER_RADIUS_OPTIONS":
    case "BOX_SHADOW_OPTIONS":
      element = <ChoiceControl {...props} />;
      break;
    case "COLOR_PICKER":
      element = <ColorControl {...props} />;
      break;
    default:
      element = <TextControl {...props} />;
  }

  return (
    <div className="od-property-control" data-property-name={control.propertyName}>
      {element}
      {control.helpText && <p className="od-property-control__help">{control.helpText}</p>}
    </div>
  );
}
