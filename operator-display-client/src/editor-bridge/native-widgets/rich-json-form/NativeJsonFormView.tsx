import React, { useEffect, useMemo, useRef } from "react";
// RHF 7.28.0 omits `types` from package exports under moduleResolution: Bundler.
// Its own declarations are still present at dist/index.d.ts.
import type * as RHF from "../../../../node_modules/react-hook-form/dist/index";
// @ts-expect-error RHF 7.28.0 package exports omit the declaration condition.
import { Controller as RuntimeController, useForm as runtimeUseForm, useWatch as runtimeUseWatch } from "react-hook-form";
import { DateInput } from "@blueprintjs/datetime";
import moment from "moment";
import type { AppsmithWidgetDsl } from "../../../document";
import {
  ARRAY_ITEM_KEY, MAX_ALLOWED_FIELDS, ROOT_SCHEMA_KEY, countJsonFormFields,
  fieldStateFromSchema, formDataFromSchema, formDefaultsFromSchema, generateJsonFormSchema,
  jsonFormValid, parseJsonFormSourceData,
  type JsonFormSchema, type JsonFormSchemaItem,
} from "./jsonFormModel";
import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/datetime/lib/css/blueprint-datetime.css";
import "./jsonForm.css";

export interface NativeJsonFormViewProps {
  widget: AppsmithWidgetDsl;
  meta?: Record<string, unknown>;
  editor?: boolean;
  themePrimaryColor?: string;
  themeBorderRadius?: string;
  onMetaChange?: (patch: Record<string, unknown>) => void;
  onSubmit?: (formData: Record<string, unknown>) => void;
}

type Values = Record<string, unknown>;
type UseFormReturn<T extends RHF.FieldValues> = RHF.UseFormReturn<T>;
const Controller = RuntimeController as typeof RHF.Controller;
const useForm = runtimeUseForm as typeof RHF.useForm;
const useWatch = runtimeUseWatch as typeof RHF.useWatch;

function isObject(value: unknown): value is Values {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function styleValue(value: unknown): string | undefined {
  const result = text(value).trim();
  return result && !result.includes("{{") ? result : undefined;
}

function fieldBoxStyle(item: JsonFormSchemaItem): React.CSSProperties {
  return {
    borderRadius: styleValue(item.borderRadius),
    boxShadow: styleValue(item.boxShadow),
    backgroundColor: styleValue(item.backgroundColor),
  };
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function optionsFor(item: JsonFormSchemaItem): Array<{ label: string; value: string }> {
  const list = Array.isArray(item.options) ? item.options : [];
  return list.flatMap((option) => {
    if (typeof option === "string" || typeof option === "number")
      return [{ label: String(option), value: String(option) }];
    if (isObject(option) && (typeof option.value === "string" || typeof option.value === "number"))
      return [{ label: text(option.label, String(option.value)), value: String(option.value) }];
    return [];
  });
}

function fieldControl(item: JsonFormSchemaItem, path: string, methods: UseFormReturn<Values>,
  disabled: boolean): React.ReactNode {
  const options = optionsFor(item);
  const common = { className: "bp3-input od-json-form__input", disabled,
    "aria-label": item.label || item.accessor,
    style: { borderRadius: styleValue(item.borderRadius),
      boxShadow: styleValue(item.boxShadow) } };
  return <Controller name={path} control={methods.control} render={({ field }) => {
    const value = field.value;
    switch (item.fieldType) {
      case "Switch":
      case "Checkbox":
        return <label className={`bp3-control ${item.fieldType === "Switch" ? "bp3-switch" : "bp3-checkbox"}`}>
          <input aria-label={item.label || item.accessor} checked={value === true}
            disabled={disabled} onBlur={field.onBlur}
            onChange={(event) => field.onChange(event.currentTarget.checked)} type="checkbox" />
          <span className="bp3-control-indicator" />
        </label>;
      case "Multiline Text Input":
        return <textarea {...common} onBlur={field.onBlur}
          onChange={(event) => field.onChange(event.currentTarget.value)}
          placeholder={text(item.placeholderText)} rows={3} value={text(value)} />;
      case "Radio Group":
        return <div className="od-json-form__radio-group">{options.map((option) =>
          <label className="bp3-control bp3-radio" key={option.value}>
            <input checked={String(value ?? "") === option.value} disabled={disabled}
              name={path} onChange={() => field.onChange(option.value)} type="radio" />
            <span className="bp3-control-indicator" />{option.label}
          </label>)}</div>;
      case "Select":
        return <select {...common} onBlur={field.onBlur}
          onChange={(event) => field.onChange(event.currentTarget.value)}
          value={text(value)}>
          <option value="">{text(item.placeholderText, "Select option")}</option>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>;
      case "Multiselect": {
        const selected = Array.isArray(value) ? value.map(String) : [];
        return <select {...common} multiple onBlur={field.onBlur}
          onChange={(event) => field.onChange(Array.from(event.currentTarget.selectedOptions,
            (option) => option.value))} value={selected}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>;
      }
      case "Datepicker": {
        const date = value ? new Date(String(value)) : null;
        const dateValue = date && !Number.isNaN(date.getTime()) ? date : null;
        const format = text(item.dateFormat, "YYYY-MM-DD HH:mm");
        return <DateInput canClearSelection disabled={disabled}
          formatDate={(next) => moment(next).format(format)}
          onChange={(next) => field.onChange(next ?
            bool(item.convertToISO) ? next.toISOString() : moment(next).format(format) : "")}
          parseDate={(next) => moment(next, format, true).toDate()}
          placeholder={format} value={dateValue} />;
      }
      case "Number Input":
      case "Currency Input":
        return <input {...common} inputMode="decimal" onBlur={field.onBlur}
          onChange={(event) => {
            const raw = event.currentTarget.value;
            field.onChange(raw === "" ? null : Number(raw));
          }} placeholder={text(item.placeholderText)} type="number"
          value={value === null || value === undefined ? "" : String(value)} />;
      default:
        return <input {...common} onBlur={field.onBlur}
          onChange={(event) => field.onChange(event.currentTarget.value)}
          placeholder={text(item.placeholderText)}
          type={item.fieldType === "Password Input" ? "password" :
            item.fieldType === "Email Input" ? "email" : "text"} value={text(value)} />;
    }
  }} />;
}

function JsonFormField({ item, path, methods, editor }: {
  item: JsonFormSchemaItem;
  path: string;
  methods: UseFormReturn<Values>;
  editor: boolean;
}): React.ReactElement | null {
  if (!bool(item.isVisible, true)) return null;
  const disabled = editor || bool(item.isDisabled);
  if (item.fieldType === "Object") {
    const children = Object.values(item.children).sort((a, b) => a.position - b.position);
    return <div className="od-json-form__object" data-field-type="Object"
      style={fieldBoxStyle(item)}>
      {path && <div className="od-json-form__object-label">{item.label}</div>}
      {children.map((child) => <JsonFormField editor={editor} item={child}
        key={`${child.identifier}-${child.fieldType}`}
        methods={methods} path={path ? `${path}.${child.identifier}` : child.identifier} />)}
    </div>;
  }
  if (item.fieldType === "Array") {
    return <JsonFormArrayField editor={editor} item={item} methods={methods} path={path} />;
  }
  return <div className="od-json-form__field" data-field-type={item.fieldType}
    style={{ accentColor: styleValue(item.accentColor),
      "--od-json-form-field-accent": styleValue(item.accentColor),
      "--od-json-form-field-radius": styleValue(item.borderRadius) } as React.CSSProperties}
    data-testid={`jsonformfield-${path.replace(/[.\[\]]/g, "-")}`}>
    <label className="od-json-form__field-label" htmlFor={`od-json-form-${path}`}
      style={{ color: text(item.labelTextColor) || undefined,
        fontSize: text(item.labelTextSize, "0.875rem"),
        fontWeight: text(item.labelStyle).includes("BOLD") ? 700 : undefined }}>
      {item.label}{bool(item.isRequired) && <span className="od-json-form__required"> *</span>}
      {text(item.tooltip) && <span className="od-json-form__tooltip" title={text(item.tooltip)}>ⓘ</span>}
    </label>
    {fieldControl(item, path, methods, disabled)}
  </div>;
}

function JsonFormArrayField({ item, path, methods, editor }: {
  item: JsonFormSchemaItem;
  path: string;
  methods: UseFormReturn<Values>;
  editor: boolean;
}): React.ReactElement {
  const child = item.children[ARRAY_ITEM_KEY];
  const current = useWatch({ control: methods.control, name: path });
  const entries = Array.isArray(current) ? current : [];
  const disabled = editor || bool(item.isDisabled);
  const setEntries = (next: unknown[]) => methods.setValue(path, next, { shouldDirty: true, shouldValidate: true });
  return <div className="od-json-form__array" data-field-type="Array"
    style={fieldBoxStyle(item)}>
    <div className="od-json-form__object-label">{item.label}</div>
    {child && entries.map((_, index) => <div className="od-json-form__array-item" key={index}
      style={{ borderRadius: styleValue(item.cellBorderRadius),
        boxShadow: styleValue(item.cellBoxShadow) }}>
      <JsonFormField editor={editor} item={child} methods={methods} path={`${path}.${index}`} />
      <button className="od-json-form__array-action od-json-form__array-delete"
        disabled={disabled} onClick={() => setEntries(entries.filter((__, i) => i !== index))}
        type="button">Remove</button>
    </div>)}
    {child && <button className="od-json-form__array-action" disabled={disabled}
      onClick={() => setEntries([...entries, formDefaultsFromSchema(child, child.sourceData)])}
      type="button">Add new</button>}
  </div>;
}

function valuesFromFormData(item: JsonFormSchemaItem, data: unknown): unknown {
  if (item.fieldType === "Object") {
    const result: Values = {};
    for (const child of Object.values(item.children))
      result[child.identifier] = valuesFromFormData(child,
        isObject(data) ? data[child.accessor] : undefined);
    return result;
  }
  if (item.fieldType === "Array") {
    const child = item.children[ARRAY_ITEM_KEY];
    return child && Array.isArray(data) ? data.map((entry) => valuesFromFormData(child, entry)) : [];
  }
  return data;
}

function JsonFormWithSchema({ props, sourceData, schema, fieldLimitExceeded }: {
  props: NativeJsonFormViewProps;
  sourceData: Values;
  schema: JsonFormSchema;
  fieldLimitExceeded: boolean;
}): React.ReactElement {
  const { widget, meta = {}, editor = false } = props;
  const root = schema[ROOT_SCHEMA_KEY];
  const defaults = useMemo(() => root ? formDefaultsFromSchema(root, sourceData) as Values : {},
    [root, sourceData]);
  const initial = useRef<Values | null>(null);
  if (!initial.current) initial.current = isObject(meta.formData) && Object.keys(meta.formData).length > 0 && root
    ? valuesFromFormData(root, meta.formData) as Values : defaults;
  const methods = useForm<Values>({ defaultValues: initial.current as RHF.DefaultValues<Values> });
  const values = useWatch({ control: methods.control });
  const valid = root ? jsonFormValid(root, values) : true;
  const lastMeta = useRef("");
  useEffect(() => {
    if (!root || editor) return;
    const id = window.setTimeout(() => {
      const formData = formDataFromSchema(root, values, sourceData,
        bool(widget.useSourceData)) as Values;
      const fieldState = fieldStateFromSchema(root, values);
      const serialized = JSON.stringify({ formData, fieldState, isValid: valid });
      if (lastMeta.current === serialized) return;
      lastMeta.current = serialized;
      props.onMetaChange?.({ formData, fieldState, isValid: valid });
    }, 200); // Form.tsx DEBOUNCE_TIMEOUT
    return () => window.clearTimeout(id);
  }, [values, valid, root, sourceData, widget.useSourceData, editor]);
  useEffect(() => {
    methods.reset(defaults);
  }, [defaults]);
  const backgroundColor = text(widget.backgroundColor, "#fff");
  const authoredRadius = text(widget.borderRadius);
  const submitStyles = isObject(widget.submitButtonStyles) ? widget.submitButtonStyles : {};
  const resetStyles = isObject(widget.resetButtonStyles) ? widget.resetButtonStyles : {};
  const accent = text(widget.submitButtonStyles && isObject(widget.submitButtonStyles)
    ? widget.submitButtonStyles.buttonColor : undefined);
  const autoHeight = widget.isFlexChild !== true &&
    (widget.dynamicHeight === "AUTO_HEIGHT" || widget.dynamicHeight === "AUTO_HEIGHT_WITH_LIMITS");
  return <div className="od-json-form" data-testid="native-json-form"
    data-auto-height={autoHeight ? "true" : undefined}
    style={{ backgroundColor, borderColor: text(widget.borderColor, "#E0DEDE"),
      borderWidth: Number(widget.borderWidth ?? 1),
      borderRadius: authoredRadius && !authoredRadius.includes("{{") ? authoredRadius :
        props.themeBorderRadius || "0px",
      boxShadow: styleValue(widget.boxShadow),
      borderStyle: "solid", "--od-json-form-accent": accent && !accent.includes("{{") ?
        accent : props.themePrimaryColor || "#03b365" } as React.CSSProperties}>
    <form className="od-json-form__form" onSubmit={(event) => {
      event.preventDefault();
      if (editor || (bool(widget.disabledWhenInvalid, true) && !valid) || !root) return;
      const formData = formDataFromSchema(root, methods.getValues(), sourceData,
        bool(widget.useSourceData)) as Values;
      props.onMetaChange?.({ formData,
        fieldState: fieldStateFromSchema(root, methods.getValues()), isValid: valid });
      props.onSubmit?.(formData);
    }} style={{ overflowY: bool(widget.scrollContents, true) ? "auto" : "hidden" }}>
      <div className="od-json-form__body">
        <div className="od-json-form__title">{text(widget.title, "Form")}</div>
        {fieldLimitExceeded ? <div className={`od-json-form__message${autoHeight ?
          " od-json-form__message--auto-height" : ""}`}>Source data exceeds {
          Number(widget.maxAllowedFields) || MAX_ALLOWED_FIELDS} fields.</div>
          : root ? <JsonFormField editor={editor} item={root} methods={methods} path="" />
            : editor ? <div className="od-json-form__message">Connect data</div> : null}
      </div>
      {!fieldLimitExceeded && <div className="od-json-form__footer"
        style={{ position: bool(widget.fixedFooter, true) ? "sticky" : "static", backgroundColor }}>
        {bool(widget.showReset, true) && <button className="bp3-button od-json-form__reset"
          data-testid="t--jsonform-reset-btn" disabled={editor}
          style={{ borderColor: styleValue(resetStyles.buttonColor),
            borderRadius: styleValue(resetStyles.borderRadius),
            boxShadow: styleValue(resetStyles.boxShadow),
            color: styleValue(resetStyles.buttonColor) }}
          onClick={() => { methods.reset(defaults); props.onMetaChange?.({
            formData: root ? formDataFromSchema(root, defaults, sourceData,
              bool(widget.useSourceData)) : {},
            fieldState: root ? fieldStateFromSchema(root, defaults) : {}, isValid: true }); }}
          type="button">{text(widget.resetButtonLabel, "Reset")}</button>}
        <button className="bp3-button bp3-intent-primary od-json-form__submit"
          data-testid="t--jsonform-submit-btn"
          disabled={editor || (bool(widget.disabledWhenInvalid, true) && !valid)}
          style={{ backgroundColor: styleValue(submitStyles.buttonColor) || props.themePrimaryColor,
            borderRadius: styleValue(submitStyles.borderRadius),
            boxShadow: styleValue(submitStyles.boxShadow) }}
          type="submit">{text(widget.submitButtonLabel, "Submit")}</button>
      </div>}
    </form>
  </div>;
}

export function NativeJsonFormView(props: NativeJsonFormViewProps): React.ReactElement {
  const sourceData = useMemo(() => parseJsonFormSourceData(props.widget.sourceData),
    [props.widget.sourceData]);
  const authoredSchema = isObject(props.widget.schema) ?
    props.widget.schema as unknown as JsonFormSchema : {};
  const generated = useMemo(() => sourceData && bool(props.widget.autoGenerateForm, true)
    ? generateJsonFormSchema(sourceData, authoredSchema) : authoredSchema,
    [sourceData, authoredSchema, props.widget.autoGenerateForm]);
  const count = sourceData ? countJsonFormFields(sourceData) : 0;
  const limit = Number(props.widget.maxAllowedFields) || MAX_ALLOWED_FIELDS;
  return <JsonFormWithSchema fieldLimitExceeded={count > limit}
    key={props.widget.widgetId} props={props} schema={generated}
    sourceData={sourceData || {}} />;
}
