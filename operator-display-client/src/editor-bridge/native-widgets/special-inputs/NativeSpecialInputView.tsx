import React, { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { ControlGroup, InputGroup, NumericInput, Popover } from "@blueprintjs/core";
import { DateInput } from "@blueprintjs/datetime";
import type { TimePrecision } from "@blueprintjs/datetime";
import moment from "moment";
import type { AppsmithWidgetDsl } from "../../../document";
import { CurrencyTypeOptions } from "./Currency";
import { ISDCodeOptions } from "./ISDCodes_v2";
import {
  countryCodeForDialCode, currencyOption, currencySeparators,
  dateInitialMonth, dateValueInRange,
  formatCurrencyNumber, nextCurrencyText, nextPhoneText, parseLocaleCurrency,
  phoneDisplayText, selectedDialCode,
  type SpecialInputType,
} from "./specialInputsModel";
import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/datetime/lib/css/blueprint-datetime.css";
import "./twemoji.css";
import "./specialInputs.css";

export interface NativeSpecialInputViewProps {
  widget: AppsmithWidgetDsl;
  themePrimaryColor?: string;
  themeBorderRadius?: string;
  editor?: boolean;
  meta?: Record<string, unknown>;
  onMetaChange?: (patch: Record<string, unknown>) => void;
}

export function isSpecialInputWidget(type: string): type is SpecialInputType {
  return type === "DATE_PICKER_WIDGET2" || type === "PHONE_INPUT_WIDGET" ||
    type === "CURRENCY_INPUT_WIDGET";
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function accent(props: NativeSpecialInputViewProps): string {
  const specified = text(props.widget.accentColor);
  return specified && !specified.includes("{{") ? specified : props.themePrimaryColor || "#03b365";
}

function borderRadius(props: NativeSpecialInputViewProps): string {
  const specified = text(props.widget.borderRadius);
  return specified && !specified.includes("{{") ? specified : props.themeBorderRadius || "0px";
}

function dateInBounds(value: unknown): Date | undefined {
  const valueText = text(value);
  const date = valueText ? new Date(valueText) : undefined;
  return date && !Number.isNaN(date.getTime()) ? date : undefined;
}

function labelStyle(widget: AppsmithWidgetDsl): CSSProperties {
  const emphasis = text(widget.labelStyle);
  return {
    color: text(widget.labelTextColor) || undefined,
    fontSize: text(widget.labelTextSize, "0.875rem"),
    fontWeight: emphasis.includes("BOLD") ? 700 : undefined,
    fontStyle: emphasis.includes("ITALIC") ? "italic" : undefined,
    textAlign: widget.labelAlignment === "RIGHT" ? "right" : "left",
  };
}

function FieldShell(props: NativeSpecialInputViewProps & {
  children: React.ReactNode;
  date?: boolean;
  invalid?: boolean;
}): React.ReactElement {
  const { widget } = props;
  const position = text(widget.labelPosition, "Top");
  const columns = Number(widget.rightColumn) - Number(widget.leftColumn);
  const labelColumns = Number(widget.labelWidth ?? 5);
  const labelWidth = columns > 0 && labelColumns > 0
    ? `${Math.min(70, 100 * labelColumns / columns)}%` : "33%";
  const label = text(widget.label);
  return <ControlGroup
    className="od-special-input"
    data-label-position={position.toLowerCase()}
    data-special-input={widget.type.toLowerCase()}
    data-testid="native-special-input"
    data-invalid={String(!!props.invalid)}
    data-date={String(!!props.date)}
    fill
    onClick={props.date ? (event) => event.stopPropagation() : undefined}
    style={{ "--od-special-accent": accent(props),
      "--od-special-radius": borderRadius(props),
      "--od-special-shadow": text(widget.boxShadow, "none"),
      "--od-special-label-width": labelWidth } as CSSProperties}
  >
    {label && <label
      className="od-special-input__label"
      htmlFor={`od-special-${widget.widgetId}`}
      style={labelStyle(widget)}
      title={text(widget.labelTooltip || widget.tooltip)}
    >{label}{bool(widget.isRequired) && <span className="od-special-input__required"> *</span>}</label>}
    <div className="od-special-input__field">{props.children}</div>
  </ControlGroup>;
}

function SearchableCodePicker({ kind, value, disabled, onSelect }: {
  kind: "phone" | "currency";
  value: string;
  disabled: boolean;
  onSelect: (value: string) => void;
}): React.ReactElement {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const options = useMemo(() => {
    if (kind === "phone") {
      return ISDCodeOptions.map((option) => ({
        value: option.dial_code, label: `${option.name} (${option.dial_code})`,
        search: `${option.name} ${option.dial_code}`,
      }));
    }
    return CurrencyTypeOptions.map((option) => ({
      value: option.currency,
      label: `${option.currency} - ${option.currency_name}`,
      search: `${option.currency} ${option.currency_name} ${option.label}`,
    }));
  }, [kind]);
  const selectedCurrency = kind === "currency" ? currencyOption(value) : undefined;
  const selectedCountry = kind === "phone"
    ? ISDCodeOptions.find((option) => option.dial_code === value) : undefined;
  const flag = selectedCountry?.code && typeof String.fromCodePoint !== "undefined"
    ? selectedCountry.code.toUpperCase().replace(/./g, (char) =>
      String.fromCodePoint(char.charCodeAt(0) + 127397)) : "";
  const trigger = <button
    className={kind === "phone"
      ? "od-special-input__code t--input-country-code-change isd-change-dropdown-trigger"
      : "od-special-input__code t--input-currency-change currency-change-dropdown-trigger"}
    data-tabbable={false}
    disabled={disabled}
    tabIndex={0}
    type="button"
  >{kind === "phone" ? <><span className="od-special-input__flag">{flag}</span>
      <span>{value}</span></> : <span>{selectedCurrency?.symbol_native}</span>}
    <span className="od-special-input__chevron" aria-hidden="true">⌄</span>
  </button>;
  if (disabled) return trigger;
  const visible = options.filter((option) =>
    option.search.toLowerCase().includes(query.trim().toLowerCase()));
  return <Popover
    content={<div className="od-special-input__code-menu">
      <InputGroup
        aria-label={kind === "phone" ? "Search by ISD code or country" : "Search by currency or country"}
        autoFocus
        leftIcon="search"
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
        placeholder={kind === "phone" ? "Search by ISD code or country" : "Search by currency or country"}
        value={query}
      />
      <div className="od-special-input__code-options">
        {visible.map((option, index) => <button
          className="od-special-input__code-option"
          key={`${option.value}-${index}`}
          onClick={() => {
            setIsOpen(false);
            setQuery("");
            onSelect(option.value);
          }}
          type="button"
        >{option.label}</button>)}
      </div>
    </div>}
    isOpen={isOpen}
    minimal
    onInteraction={(state) => setIsOpen(state)}
    position="bottom-left"
    portalContainer={document.getElementById("art-board") || undefined}
  >{trigger}</Popover>;
}

function DatePickerView(props: NativeSpecialInputViewProps): React.ReactElement {
  const { widget, meta } = props;
  const authored = text(widget.defaultDate);
  const selected = text(meta?.value, text(widget.value, authored));
  const valid = dateValueInRange(selected, text(widget.minDate), text(widget.maxDate));
  const selectedDate = valid ? dateInBounds(selected) : undefined;
  const value = selectedDate || null;
  const minDate = dateInBounds(widget.minDate);
  const maxDate = dateInBounds(widget.maxDate);
  const dateFormat = text(widget.dateFormat, "YYYY-MM-DD HH:mm");
  const firstDayOfWeek = Number(widget.firstDayOfWeek ?? 0);
  const timePrecision = text(widget.timePrecision, "minute");
  const precision = timePrecision === "None" ? undefined : timePrecision as TimePrecision;
  return <FieldShell {...props} date invalid={!valid || (bool(widget.isRequired) && !selected)}>
    <DateInput
      className="od-special-input__date-control"
      closeOnSelection={bool(widget.closeOnSelection, true)}
      dayPickerProps={{ firstDayOfWeek }}
      disabled={bool(widget.isDisabled)}
      formatDate={(date: Date) => moment(date).format(dateFormat)}
      initialMonth={dateInitialMonth(selected, text(widget.minDate), text(widget.maxDate))}
      inputProps={{ id: `od-special-${widget.widgetId}`, onFocus: () => {
        if (!props.editor) props.onMetaChange?.({ isFocused: true });
      }, onBlur: () => {
        if (!props.editor) props.onMetaChange?.({ isFocused: false });
      } }}
      maxDate={maxDate}
      minDate={minDate}
      onChange={(date: Date | null, isUserChange: boolean) => {
        if (!props.editor && isUserChange)
          props.onMetaChange?.({ value: date ? date.toISOString() : "", isDirty: true });
      }}
      parseDate={(dateString: string) => dateString
        ? (moment(dateString, dateFormat).isValid()
          ? moment(dateString, dateFormat).toDate() : moment().toDate()) : null}
      placeholder="Select Date"
      popoverProps={{ portalContainer: document.getElementById("art-board") || undefined,
        usePortal: !props.editor, canEscapeKeyClose: true,
        portalClassName: `datepickerwidget-popup-${widget.widgetId}` }}
      shortcuts={bool(widget.shortcuts)}
      showActionsBar
      timePrecision={precision}
      value={value}
    />
  </FieldShell>;
}

function PhoneInputView(props: NativeSpecialInputViewProps): React.ReactElement {
  const { widget, meta } = props;
  const dialCode = selectedDialCode(meta?.dialCode ?? widget.dialCode ?? widget.defaultDialCode);
  const value = text(meta?.text, text(widget.text,
    phoneDisplayText(text(widget.defaultText), dialCode, bool(widget.allowFormatting, true))));
  const invalid = bool(meta?.isDirty) && bool(widget.isRequired) && !value;
  return <FieldShell {...props} invalid={invalid}>
    <div className="od-special-input__input-wrap">
      <SearchableCodePicker
        disabled={bool(widget.isDisabled) || !bool(widget.allowDialCodeChange) || !!props.editor}
        kind="phone"
        onSelect={(code) => {
          const countryCode = countryCodeForDialCode(code);
          props.onMetaChange?.({ dialCode: code, countryCode,
            text: phoneDisplayText(text(meta?.value, value), code, bool(widget.allowFormatting, true)) });
        }}
        value={dialCode}
      />
      <InputGroup
        autoFocus={bool(widget.autoFocus)}
        disabled={bool(widget.isDisabled)}
        id={`od-special-${widget.widgetId}`}
        onBlur={() => { if (!props.editor) props.onMetaChange?.({ isFocused: false }); }}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          if (!props.editor) props.onMetaChange?.(nextPhoneText(event.target.value, value,
            dialCode, bool(widget.allowFormatting, true)));
        }}
        onFocus={() => { if (!props.editor) props.onMetaChange?.({ isFocused: true }); }}
        placeholder={text(widget.placeholderText)}
        type="tel"
        value={value}
      />
    </div>
  </FieldShell>;
}

function CurrencyInputView(props: NativeSpecialInputViewProps): React.ReactElement {
  const { widget, meta } = props;
  const code = text(meta?.currencyCode, text(widget.currencyCode,
    text(widget.defaultCurrencyCode, "INR")));
  const decimals = Math.min(6, Math.max(0, Number(widget.decimals ?? 0)));
  const defaultText = text(widget.defaultText);
  const initial = defaultText && Number.isFinite(Number(defaultText))
    ? Intl.NumberFormat(undefined, { style: "decimal", minimumFractionDigits: decimals,
      maximumFractionDigits: decimals }).format(Number(defaultText)) : defaultText;
  const value = text(meta?.text, text(widget.text, initial));
  const invalid = bool(meta?.isDirty) && (bool(widget.isRequired) && !value ||
    (!!value && parseLocaleCurrency(value) === undefined));
  const focused = bool(meta?.isFocused);
  const [localFocus, setLocalFocus] = useState(false);
  useEffect(() => { setLocalFocus(focused); }, [focused]);
  const setFocus = (next: boolean) => {
    if (props.editor) return;
    setLocalFocus(next);
    const textValue = next ? value.split(currencySeparators().thousand).join("")
      : value ? formatCurrencyNumber(decimals, value) : value;
    props.onMetaChange?.({ text: textValue, isFocused: next });
  };
  return <FieldShell {...props} invalid={invalid}>
    <div className="od-special-input__input-wrap">
      <SearchableCodePicker
        disabled={bool(widget.isDisabled) || !bool(widget.allowCurrencyChange) || !!props.editor}
        kind="currency"
        onSelect={(currencyCode) => {
          props.onMetaChange?.({ currencyCode,
            countryCode: currencyOption(currencyCode).code });
        }}
        value={code}
      />
      <NumericInput
        allowNumericCharactersOnly
        autoFocus={bool(widget.autoFocus)}
        buttonPosition={bool(widget.showStepArrows) ? "right" : "none"}
        disabled={bool(widget.isDisabled)}
        inputRef={(element) => {
          if (element) element.id = `od-special-${widget.widgetId}`;
        }}
        locale={(typeof navigator !== "undefined" && navigator.languages?.[0]) || "en-US"}
        majorStepSize={null}
        minorStepSize={null}
        onBlur={() => setFocus(false)}
        onFocus={() => setFocus(true)}
        onValueChange={(_valueAsNumber: number, valueAsString: string) => {
          if (!props.editor) props.onMetaChange?.(nextCurrencyText(valueAsString, decimals));
        }}
        placeholder={text(widget.placeholderText)}
        stepSize={1}
        value={value}
      />
    </div>
  </FieldShell>;
}

export function NativeSpecialInputView(props: NativeSpecialInputViewProps): React.ReactElement | null {
  switch (props.widget.type) {
    case "DATE_PICKER_WIDGET2": return <DatePickerView {...props} />;
    case "PHONE_INPUT_WIDGET": return <PhoneInputView {...props} />;
    case "CURRENCY_INPUT_WIDGET": return <CurrencyInputView {...props} />;
    default: return null;
  }
}
