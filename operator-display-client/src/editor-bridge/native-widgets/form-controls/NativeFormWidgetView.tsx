import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { AppsmithWidgetDsl } from "../../../document";
import {
  optionsFromSourceData, radioOptions, selectedValue, selectedValues,
  type FormOption,
} from "./formModel";
import { isValidNumericKeyboardEvent, roundAndClampNumericStep,
  sanitizeNumericInput } from "./numericInput";
import "./formControls.css";

/** Audited against Appsmith's Blueprint control DOM and widget meta contract. */
export const FORM_WIDGET_TYPES = [
  "CHECKBOX_WIDGET", "SWITCH_WIDGET", "INPUT_WIDGET_V2", "RADIO_GROUP_WIDGET",
] as const;
/** Render experiments remain unavailable through isFormWidget until parity work. */
export const PROVISIONAL_FORM_WIDGET_TYPES = [
  "SELECT_WIDGET", "MULTI_SELECT_WIDGET_V2",
] as const;
export type FormWidgetType = typeof FORM_WIDGET_TYPES[number] |
  typeof PROVISIONAL_FORM_WIDGET_TYPES[number];

export function isFormWidget(type: string): type is typeof FORM_WIDGET_TYPES[number] {
  return (FORM_WIDGET_TYPES as readonly string[]).includes(type);
}

export interface NativeFormWidgetViewProps {
  widget: AppsmithWidgetDsl;
  themePrimaryColor?: string;
  themeBorderRadius?: string;
  /** Appsmith's editor drag wrapper receives the gesture in edit mode. */
  editor?: boolean;
  /** Transient Redux meta value, supplied by the canvas owner. */
  value?: unknown;
  /** Dispatches a transient meta update; never writes the authored DSL. */
  onValueChange?: (value: boolean | string | number) => void;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value) : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function labelPosition(value: unknown, fallback: "Top" | "Left" | "Right") {
  return value === "Top" || value === "Left" || value === "Right"
    ? value : fallback;
}

function labelStyle(widget: AppsmithWidgetDsl): CSSProperties {
  const fontStyle = text(widget.labelStyle);
  return {
    color: text(widget.labelTextColor) || undefined,
    fontSize: text(widget.labelTextSize, "0.875rem"),
    fontWeight: fontStyle.includes("BOLD") ? 700 : undefined,
    fontStyle: fontStyle.includes("ITALIC") ? "italic" : undefined,
    textAlign: widget.labelAlignment === "RIGHT" || widget.alignWidget === "RIGHT"
      ? "right" : "left",
  };
}

/** Fixed layout: labelComponentWidth = labelWidth * parentColumnSpace. */
function fixedLabelWidth(widget: AppsmithWidgetDsl): CSSProperties {
  const widgetColumns = Number(widget.rightColumn) - Number(widget.leftColumn);
  const labelColumns = Number(widget.labelWidth ?? 5);
  if (widgetColumns <= 0 || labelColumns <= 0) return {};
  return { width: `${100 * labelColumns / widgetColumns}%`,
    maxWidth: "70%", flexShrink: 0 };
}

function controlStyle(widget: AppsmithWidgetDsl, props: NativeFormWidgetViewProps): CSSProperties {
  const radius = text(widget.borderRadius) && !text(widget.borderRadius).includes("{{")
    ? text(widget.borderRadius) : props.themeBorderRadius || "0px";
  return {
    borderRadius: radius,
    boxShadow: text(widget.boxShadow) && !text(widget.boxShadow).includes("{{")
      ? text(widget.boxShadow) : "none",
    "--od-form-checkbox-radius": radius === "0.375rem" ? "0.25rem" : radius,
    "--od-form-accent": text(widget.accentColor) && !text(widget.accentColor).includes("{{")
      ? text(widget.accentColor) : props.themePrimaryColor || "#03b365",
  } as CSSProperties;
}

function FieldLabel({ widget, label, htmlFor, required }: {
  widget: AppsmithWidgetDsl;
  label: string;
  htmlFor?: string;
  required?: boolean;
}): React.ReactElement | null {
  if (!label) return null;
  return <label
    className="od-native-form__label"
    htmlFor={htmlFor}
    style={labelStyle(widget)}
    title={text(widget.labelTooltip || widget.tooltip)}
  >{label}{required && <span className="od-native-form__required"> *</span>}</label>;
}

function FormShell({ widget, label, children, labelSide = "Top", required = false }: {
  widget: AppsmithWidgetDsl;
  label: string;
  children: React.ReactNode;
  labelSide?: "Top" | "Left" | "Right";
  required?: boolean;
}): React.ReactElement {
  const id = `od-form-control-${widget.widgetId}`;
  return <div
    className="od-native-form"
    data-label-position={labelSide.toLowerCase()}
    data-native-widget={widget.type.toLowerCase()}
    data-testid="native-form-widget"
  >
    <FieldLabel htmlFor={id} label={label} required={required} widget={widget} />
    <div className="od-native-form__control">{children}</div>
  </div>;
}

function InputView(props: NativeFormWidgetViewProps): React.ReactElement {
  const { widget } = props;
  const value = text(props.value, text(widget.inputText, text(widget.defaultText)));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textareaWrapperRef = useRef<HTMLDivElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const didPaste = useRef(false);
  const inputType = text(widget.inputType, "TEXT");
  const multiline = inputType === "MULTI_LINE_TEXT";
  const autoResize = multiline && widget.isFlexChild !== true &&
    (widget.dynamicHeight === "AUTO_HEIGHT" || widget.dynamicHeight === "AUTO_HEIGHT_WITH_LIMITS");
  const resizeTextarea = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (!autoResize) {
      textarea.style.removeProperty("height");
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  useLayoutEffect(resizeTextarea, [value, autoResize]);
  useEffect(() => {
    const wrapper = textareaWrapperRef.current;
    if (!wrapper || !autoResize || typeof ResizeObserver === "undefined") return;
    let width = wrapper.clientWidth;
    const observer = new ResizeObserver(() => {
      if (wrapper.clientWidth === width) return;
      width = wrapper.clientWidth;
      resizeTextarea();
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [autoResize]);
  const htmlType = inputType === "NUMBER" ? "text"
    : inputType === "EMAIL" ? "email"
      : inputType === "PASSWORD" && !showPassword ? "password" : "text";
  const id = `od-form-control-${widget.widgetId}`;
  const disabled = bool(widget.isDisabled);
  const position = labelPosition(widget.labelPosition, "Top");
  const onChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = inputType === "NUMBER" && didPaste.current
      ? sanitizeNumericInput(event.currentTarget.value)
      : event.currentTarget.value;
    didPaste.current = false;
    if (!props.editor) props.onValueChange?.(next);
  };
  const numberStep = (step: number) => {
    if (props.editor || disabled) return;
    const next = roundAndClampNumericStep(value, step,
      typeof widget.minNum === "number" ? widget.minNum : undefined,
      typeof widget.maxNum === "number" ? widget.maxNum : undefined);
    if (next !== value) props.onValueChange?.(next);
  };
  const atMax = value !== "" && typeof widget.maxNum === "number" &&
    Number(value) >= widget.maxNum;
  const atMin = value !== "" && typeof widget.minNum === "number" &&
    Number(value) <= widget.minNum;
  const common = {
    id,
    disabled,
    placeholder: text(widget.placeholderText),
    value,
    onChange,
  };
  // Appsmith's design-system Icon resolves these Blueprint eye glyphs at 20px.
  const passwordIcon = showPassword
    ? <svg aria-hidden="true" viewBox="0 0 20 20"><path fillRule="evenodd" d="M20 9.96v-.08a.794.794 0 0 0-.21-.43c-.55-.69-1.19-1.3-1.85-1.87l-3.93 2.62a3.966 3.966 0 0 1-3.96 3.77c-.47 0-.91-.1-1.33-.24l-2.24 1.49c.52.21 1.05.39 1.6.51 1.21.27 2.43.28 3.64.05 1.11-.21 2.17-.64 3.17-1.18 1.56-.84 2.99-2 4.23-3.3.23-.24.46-.49.67-.75a.87.87 0 0 0 .21-.43v-.16zm-.46-5.14c.27-.18.46-.47.46-.82 0-.55-.45-1-1-1-.21 0-.39.08-.54.18l-.01-.02L15 5.46c-.95-.53-1.95-.96-3.01-1.2a9.158 9.158 0 0 0-3.65-.04c-1.11.21-2.17.64-3.17 1.18-1.56.84-2.99 2-4.23 3.3-.23.24-.46.48-.67.75-.27.34-.27.76 0 1.1.64.79 1.39 1.5 2.16 2.15.26.21.52.41.79.61L.44 15.16l.01.02A1 1 0 0 0 0 16c0 .55.45 1 1 1 .21 0 .39-.08.54-.18l.01.02 18-12-.01-.02zm-8.67 3.4c-.25-.12-.53-.2-.83-.2-1.1 0-1.99.89-1.99 1.99 0 .03.02.06.02.09l-1.78 1.19c-.14-.4-.22-.83-.22-1.28 0-2.19 1.78-3.97 3.98-3.97 1.01 0 1.91.38 2.61 1l-1.79 1.18z" clipRule="evenodd" /></svg>
    : <svg aria-hidden="true" viewBox="0 0 20 20"><path fillRule="evenodd" d="M13.3 8.71c.18.18.43.29.71.29s.53-.11.71-.29l4.99-5a1.003 1.003 0 0 0-1.42-1.42L14 6.58l-2.29-2.29a.956.956 0 0 0-.7-.29 1.003 1.003 0 0 0-.71 1.71l3 3zM20 9.96v-.08a.823.823 0 0 0-.21-.44c-.44-.55-.94-1.05-1.46-1.52l-2.2 2.2c-.55.54-1.3.88-2.12.88-.05 0-.09-.01-.14-.01a3.978 3.978 0 0 1-3.86 3.02 4.007 4.007 0 0 1-1.66-7.65A2.97 2.97 0 0 1 8.02 5c0-.28.05-.54.12-.8-1.05.22-2.07.64-3.02 1.15-1.57.85-3 2.02-4.24 3.33-.23.25-.46.5-.67.76-.28.35-.28.77 0 1.12.64.8 1.4 1.52 2.17 2.17 1.66 1.41 3.56 2.58 5.66 3.06 1.21.27 2.43.29 3.65.05 1.11-.21 2.18-.65 3.18-1.19 1.57-.85 3-2.02 4.24-3.33.23-.24.46-.49.67-.76.11-.12.18-.27.21-.44V10c.01-.01.01-.03.01-.04zm-9.99 2.05c1.03 0 1.87-.79 1.98-1.8l-.09-.09-.01.01-2.1-2.11c-1 .11-1.77.95-1.77 1.98-.01 1.11.89 2.01 1.99 2.01z" clipRule="evenodd" /></svg>;
  const input = multiline
    ? <textarea {...common} className="od-native-form__input-textarea"
      ref={textareaRef}
      dir={bool(widget.rtl) ? "rtl" : "ltr"}
      maxLength={typeof widget.maxChars === "number" ? widget.maxChars : undefined}
      spellCheck={bool(widget.isSpellCheck)} />
    : <div className="bp3-input-group">
      <input {...common} autoComplete={inputType === "NUMBER" ||
        (widget.shouldAllowAutofill === false &&
        (inputType === "EMAIL" || inputType === "PASSWORD")) ? "off" : undefined}
        className="bp3-input" dir={bool(widget.rtl) ? "rtl" : "ltr"}
        inputMode={inputType === "NUMBER" ? "decimal" : undefined}
        maxLength={inputType === "TEXT" && typeof widget.maxChars === "number"
          ? widget.maxChars : undefined}
        onKeyDown={inputType === "NUMBER" ? (event) => {
          if (props.editor || disabled) return;
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            numberStep(event.key === "ArrowUp" ? 1 : -1);
          }
        } : undefined}
        onKeyPress={inputType === "NUMBER" ? (event) => {
          if (!isValidNumericKeyboardEvent(event)) event.preventDefault();
        } : undefined}
        onPaste={inputType === "NUMBER" ? () => { didPaste.current = true; }
          : undefined}
        spellCheck={bool(widget.isSpellCheck)} type={htmlType} />
      {inputType === "PASSWORD" && <span className="bp3-input-action">
        <button aria-label={showPassword ? "Hide password" : "Show password"}
          className="od-native-form__password-action" disabled={disabled}
          onClick={() => setShowPassword(!showPassword)} type="button">
          <span className={`bp3-icon bp3-icon-eye-${showPassword ? "off" : "on"} password-input`}>
            {passwordIcon}
          </span>
        </button>
      </span>}
    </div>;
  return <div className="bp3-control-group bp3-fill od-native-form od-native-form--input"
    data-label-position={position.toLowerCase()}
    data-multiline={multiline}
    data-auto-height={autoResize ? "true" : undefined}
    data-native-widget="input_widget_v2" data-testid="input-container"
    style={{ "--od-form-accent": controlStyle(widget, props)["--od-form-accent" as keyof CSSProperties] } as CSSProperties}>
    {(text(widget.label, "Label") || text(widget.tooltip)) && <div
      className="label-container" data-testid="label-container"
      style={position === "Left" ? fixedLabelWidth(widget) : undefined}>
      <label className="t--input-widget-label" htmlFor={id}
        style={labelStyle(widget)} title={text(widget.tooltip)}>
        {text(widget.label, "Label")}
      </label>
      {bool(widget.isRequired) && <span aria-label="(required)"
        className="od-native-form__required">*</span>}
    </div>}
    <div className={`text-input-wrapper${inputType === "NUMBER"
      ? " od-native-form__numeric" : ""}`}
      ref={textareaWrapperRef}
      style={controlStyle(widget, props)}>
      {inputType === "NUMBER" ? <div className="bp3-control-group bp3-numeric-input">
        {input}
        {bool(widget.showStepArrows) && <div className="bp3-button-group bp3-fixed bp3-vertical">
          <button aria-label="Increment" className="bp3-button" disabled={disabled || atMax}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") numberStep(1); }}
            onMouseDown={() => numberStep(1)} type="button">
            <span className="bp3-icon bp3-icon-chevron-up"><svg aria-hidden="true" viewBox="0 0 16 16"><path fillRule="evenodd" d="m12.71 9.29-4-4C8.53 5.11 8.28 5 8 5s-.53.11-.71.29l-4 4a1.003 1.003 0 0 0 1.42 1.42L8 7.41l3.29 3.29c.18.19.43.3.71.3a1.003 1.003 0 0 0 .71-1.71z" clipRule="evenodd" /></svg></span>
          </button>
          <button aria-label="Decrement" className="bp3-button" disabled={disabled || atMin}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") numberStep(-1); }}
            onMouseDown={() => numberStep(-1)} type="button">
            <span className="bp3-icon bp3-icon-chevron-down"><svg aria-hidden="true" viewBox="0 0 16 16"><path fillRule="evenodd" d="M12 5c-.28 0-.53.11-.71.29L8 8.59l-3.29-3.3a1.003 1.003 0 0 0-1.42 1.42l4 4c.18.18.43.29.71.29s.53-.11.71-.29l4-4A1.003 1.003 0 0 0 12 5z" clipRule="evenodd" /></svg></span>
          </button>
        </div>}
      </div> : input}
    </div>
  </div>;
}

function ValueSelectView(props: NativeFormWidgetViewProps & { multi: boolean }): React.ReactElement {
  const { widget, multi } = props;
  const options = useMemo(() => optionsFromSourceData(
    widget.sourceData, widget.optionLabel, widget.optionValue, multi,
  ), [widget.sourceData, widget.optionLabel, widget.optionValue, multi]);
  const initialSingle = selectedValue(widget.selectedOptionValue ?? widget.defaultOptionValue);
  const initialMulti = selectedValues(widget.selectedOptionValues ??
    widget.selectedOptions ?? widget.defaultOptionValue);
  const [singleValue, setSingleValue] = useState<string>(initialSingle === null ? "" : String(initialSingle));
  const [multiValues, setMultiValues] = useState<string[]>(initialMulti.map(String));
  useEffect(() => setSingleValue(initialSingle === null ? "" : String(initialSingle)),
    [initialSingle, widget.widgetId]);
  useEffect(() => setMultiValues(initialMulti.map(String)),
    [JSON.stringify(initialMulti), widget.widgetId]);
  const id = `od-form-control-${widget.widgetId}`;
  const disabled = bool(widget.isDisabled) || props.editor === true;
  const fallbackText = multi ? "Select option(s)" : "Select option";
  return <FormShell label={text(widget.labelText, "Label")}
    labelSide={labelPosition(widget.labelPosition, "Top")}
    required={bool(widget.isRequired)} widget={widget}>
    {options === null ? <div className="od-native-form__unresolved">Dynamic options unavailable in preview</div> :
      <select
        aria-label={text(widget.labelText, "Label")}
        className="od-native-form__field od-native-form__select"
        disabled={disabled}
        id={id}
        multiple={multi}
        onChange={(event) => {
          if (multi) setMultiValues(Array.from(event.currentTarget.selectedOptions,
            (option) => option.value));
          else setSingleValue(event.currentTarget.value);
        }}
        required={bool(widget.isRequired)}
        size={multi ? Math.min(Math.max(options.length, 2), 4) : undefined}
        style={controlStyle(widget, props)}
        value={multi ? multiValues : singleValue}
      >
        {!multi && <option value="">{text(widget.placeholderText, fallbackText)}</option>}
        {options.map((option: FormOption, index) => <option key={`${String(option.value)}-${index}`}
          value={String(option.value)}>{option.label}</option>)}
      </select>}
  </FormShell>;
}

function ToggleView(props: NativeFormWidgetViewProps & { isSwitch: boolean }): React.ReactElement {
  const { widget, isSwitch } = props;
  const initial = bool(isSwitch ? widget.isSwitchedOn ?? widget.defaultSwitchState
    : widget.isChecked ?? widget.defaultCheckedState, true);
  const checked = typeof props.value === "boolean" ? props.value : initial;
  const disabled = bool(widget.isDisabled);
  const position = labelPosition(widget.labelPosition, "Left");
  const label = text(widget.label, "Label");
  const alignRight = position === "Left";
  const isInvalid = !isSwitch && bool(widget.isRequired) && !checked;
  return <div className="od-native-form od-native-form--toggle"
    data-label-position={position.toLowerCase()}
    data-native-widget={widget.type.toLowerCase()} data-testid="native-form-widget"
    style={controlStyle(widget, props)}>
    <label className={`bp3-control ${isSwitch ? "bp3-switch" : "bp3-checkbox"}${alignRight ? " bp3-align-right" : ""}${disabled ? " bp3-disabled" : ""}${isInvalid ? " od-native-form__invalid" : ""}`}
      title={text(widget.labelTooltip)}>
      <input checked={checked} disabled={disabled}
        onChange={(event) => {
          if (!props.editor) props.onValueChange?.(event.currentTarget.checked);
        }}
        required={!isSwitch && bool(widget.isRequired)} role={isSwitch ? "switch" : undefined}
        type="checkbox" />
      <span className="bp3-control-indicator" />
      <span className={`label-container ${isSwitch ? "t--switch-widget-label" : "t--checkbox-widget-label"}`}
        style={labelStyle(widget)}>
        {label}
      </span>
    </label>
  </div>;
}

function RadioView(props: NativeFormWidgetViewProps): React.ReactElement {
  const { widget } = props;
  const options = radioOptions(widget.options);
  const current = selectedValue(props.value ?? widget.selectedOptionValue ??
    widget.defaultOptionValue);
  const disabled = bool(widget.isDisabled);
  const inline = bool(widget.isInline, true);
  const position = labelPosition(widget.labelPosition, "Top");
  return <div className="od-native-form od-native-form--radio"
    data-label-position={position.toLowerCase()}
    data-native-widget="radio_group_widget" data-testid="radiogroup-container"
    style={controlStyle(widget, props)}>
    {text(widget.label, "Label") && <div className="label-container"
      data-testid="label-container"
      style={position === "Left" ? fixedLabelWidth(widget) : undefined}>
      <label className="radiogroup-label" style={labelStyle(widget)}
        title={text(widget.labelTooltip)}>{text(widget.label, "Label")}</label>
    </div>}
    {options === null ? <div className="od-native-form__unresolved">Dynamic options unavailable in preview</div>
      : <div className="od-native-form__radio-options" data-inline={inline}
        data-align={text(widget.alignment, "LEFT").toLowerCase()}>
        {options.map((option, index) => <label
          className={`bp3-control bp3-radio${inline ? " bp3-inline" : ""}${text(widget.alignment) === "RIGHT" ? " bp3-align-right" : ""}${disabled ? " bp3-disabled" : ""}`}
          key={`${String(option.value)}-${index}`}>
          <input checked={current === option.value} disabled={disabled}
            name={`od-radio-${widget.widgetId}`}
            onChange={() => {
              if (!props.editor) {
                const numeric = typeof options[0]?.value === "number";
                props.onValueChange?.(numeric ? Number(option.value) : String(option.value));
              }
            }}
            required={bool(widget.isRequired)} type="radio" value={String(option.value)} />
          <span className="bp3-control-indicator" />
          {option.label}
        </label>)}
      </div>}
  </div>;
}

/** Integrated controls use caller-owned meta state; select experiments remain unexposed. */
export function NativeFormWidgetView(props: NativeFormWidgetViewProps): React.ReactElement | null {
  switch (props.widget.type) {
    case "INPUT_WIDGET_V2": return <InputView {...props} />;
    case "SELECT_WIDGET": return <ValueSelectView {...props} multi={false} />;
    case "MULTI_SELECT_WIDGET_V2": return <ValueSelectView {...props} multi />;
    case "CHECKBOX_WIDGET": return <ToggleView {...props} isSwitch={false} />;
    case "SWITCH_WIDGET": return <ToggleView {...props} isSwitch />;
    case "RADIO_GROUP_WIDGET": return <RadioView {...props} />;
    default: return null;
  }
}
