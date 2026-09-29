import moment from "moment";
import type { CountryCode } from "libphonenumber-js";
import { AsYouType, parseIncompletePhoneNumber } from "libphonenumber-js";
import { CurrencyTypeOptions } from "./Currency";
import { ISDCodeOptions } from "./ISDCodes_v2";

export type SpecialInputType = "DATE_PICKER_WIDGET2" | "PHONE_INPUT_WIDGET" | "CURRENCY_INPUT_WIDGET";

// Literal Fixed defaults from DatePickerWidget2 and the BaseInputWidget subclasses.
const BASE_INPUT_DEFAULTS = {
  label: "Label", labelAlignment: "LEFT", labelTextSize: "0.875rem",
  labelWidth: 5, columns: 20, defaultText: "", iconAlign: "left",
  autoFocus: false, labelStyle: "", resetOnSubmit: true,
  isRequired: false, isDisabled: false, animateLoading: true,
  responsiveBehavior: "fill", minWidth: 450,
} as const;

export function specialInputDefaults(type: SpecialInputType): Record<string, unknown> {
  switch (type) {
    case "DATE_PICKER_WIDGET2": return {
      isDisabled: false, datePickerType: "DATE_PICKER", rows: 7,
      label: "Label", labelPosition: "Top", labelAlignment: "LEFT",
      labelWidth: 5, labelTextSize: "0.875rem",
      dateFormat: "YYYY-MM-DD HH:mm", columns: 20, widgetName: "DatePicker",
      defaultDate: moment().toISOString(),
      minDate: "1920-12-31T18:30:00.000Z",
      maxDate: "2121-12-31T18:29:00.000Z", version: 2,
      isRequired: false, closeOnSelection: true, shortcuts: false,
      firstDayOfWeek: 0, timePrecision: "minute", animateLoading: true,
      responsiveBehavior: "fill", minWidth: 450,
    };
    case "PHONE_INPUT_WIDGET": return {
      ...BASE_INPUT_DEFAULTS, widgetName: "PhoneInput", version: 1,
      rows: 7, labelPosition: "Top", defaultDialCode: "+1",
      allowDialCodeChange: false, allowFormatting: true,
    };
    case "CURRENCY_INPUT_WIDGET": return {
      ...BASE_INPUT_DEFAULTS, widgetName: "CurrencyInput", version: 1,
      rows: 7, labelPosition: "Top", allowCurrencyChange: false,
      defaultCurrencyCode: "INR", decimals: 0, showStepArrows: false,
    };
  }
}

export const SPECIAL_INPUT_DEFAULT_PROPERTIES: Record<SpecialInputType, Record<string, string>> = {
  DATE_PICKER_WIDGET2: { value: "defaultDate" },
  PHONE_INPUT_WIDGET: { text: "defaultText", dialCode: "defaultDialCode" },
  CURRENCY_INPUT_WIDGET: { text: "defaultText", currencyCode: "defaultCurrencyCode" },
};

export const DATE_FORMAT_OPTIONS = [
  "YYYY-MM-DDTHH:mm:ss.sssZ", "LLL", "LL", "YYYY-MM-DD HH:mm",
  "YYYY-MM-DDTHH:mm:ss", "YYYY-MM-DD hh:mm:ss A", "DD/MM/YYYY HH:mm",
  "D MMMM, YYYY", "H:mm A D MMMM, YYYY", "YYYY-MM-DD",
  "MM-DD-YYYY", "DD-MM-YYYY", "MM/DD/YYYY", "DD/MM/YYYY",
  "DD/MM/YY", "MM/DD/YY",
] as const;

export function selectedDialCode(value: unknown): string {
  const candidate = typeof value === "string" ? value : "";
  return ISDCodeOptions.some((option) => option.dial_code === candidate) ? candidate : "+1";
}

export function countryCodeForDialCode(dialCode: string): CountryCode | undefined {
  return ISDCodeOptions.find((item) => item.dial_code === dialCode)?.code as CountryCode | undefined;
}

export function phoneDisplayText(value: string, dialCode: string, allowFormatting: boolean): string {
  if (!value) return value;
  if (allowFormatting) return new AsYouType(countryCodeForDialCode(dialCode)).input(value);
  return parseIncompletePhoneNumber(value);
}

export function nextPhoneText(value: string, oldText: string, dialCode: string, allowFormatting: boolean) {
  const text = value && value.length > oldText.length
    ? phoneDisplayText(value, dialCode, allowFormatting) : value;
  return { text, value: parseIncompletePhoneNumber(text), isDirty: true };
}

export function currencyOption(code: unknown) {
  const value = typeof code === "string" ? code : "";
  return CurrencyTypeOptions.find((option) => option.currency === value) ??
    CurrencyTypeOptions.find((option) => option.currency === "INR")!;
}

export function currencyLocale(locale?: string) {
  return locale || (typeof navigator !== "undefined" && navigator.languages?.[0]) || "en-US";
}

export function currencySeparators(locale?: string) {
  const selected = currencyLocale(locale);
  return {
    decimal: Intl.NumberFormat(selected).format(1.1).replace(/\p{Number}/gu, ""),
    thousand: Intl.NumberFormat(selected).format(11111).replace(/\p{Number}/gu, ""),
  };
}

export function limitDecimalValue(decimals = 0, value = "", locale?: string): string {
  const { decimal, thousand } = currencySeparators(locale);
  const plain = value.split(thousand).join("");
  if (decimals === 0) return plain.split(decimal).shift() || "";
  if (decimals >= 1 && decimals <= 6) {
    const [whole, fraction] = plain.split(decimal);
    return fraction === undefined ? whole : whole + decimal + fraction.slice(0, decimals);
  }
  return plain;
}

export function parseLocaleCurrency(value = "", locale?: string): number | undefined {
  if (!value) return undefined;
  const { decimal, thousand } = currencySeparators(locale);
  const parsed = parseFloat(value.split(thousand).join("").replace(decimal, "."));
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function formatCurrencyNumber(decimals = 0, value: string, locale?: string): string {
  const selected = currencyLocale(locale);
  const hasDecimal = value.includes(currencySeparators(selected).decimal);
  const parsed = parseLocaleCurrency(value, selected);
  return Intl.NumberFormat(selected, {
    style: "decimal", minimumFractionDigits: hasDecimal ? decimals : 0,
    maximumFractionDigits: hasDecimal ? decimals : 0,
  }).format(parsed === undefined ? 0 : parsed);
}

export function nextCurrencyText(value: string, decimals: number, locale?: string) {
  const decimal = currencySeparators(locale).decimal;
  const text = value && value.includes(decimal) ? limitDecimalValue(decimals, value, locale) : value;
  return { text, isDirty: true };
}

export function dateValueInRange(value: string, minDate?: string, maxDate?: string): boolean {
  if (!value) return true;
  const current = moment(value);
  if (!current.isValid()) return false;
  if (minDate) {
    const min = moment(minDate);
    if (min.isValid() && !current.isSame(min, "day") && current.isBefore(min)) return false;
  }
  if (maxDate) {
    const max = moment(maxDate);
    if (max.isValid() && !current.isSame(max, "day") && current.isAfter(max)) return false;
  }
  return true;
}

// DatePickerWidget2/component getInitialMonth: keep its branch order and
// bound preference so the calendar opens on the same month as Appsmith.
export function dateInitialMonth(selectedDate?: string, minDate?: string, maxDate?: string): Date {
  const isValid = selectedDate ? dateValueInRange(selectedDate, minDate, maxDate) : true;
  if (!minDate && !maxDate && !selectedDate) return new Date();
  if (minDate && maxDate && selectedDate) {
    if (new Date(minDate) > new Date(selectedDate)) return new Date(minDate);
    if (new Date(minDate) < new Date(selectedDate))
      return isValid ? new Date(selectedDate) : new Date(minDate);
    return new Date();
  }
  if (minDate && maxDate && !selectedDate) {
    if (new Date(minDate) > new Date() || new Date(maxDate) < new Date())
      return new Date(minDate);
    return new Date();
  }
  if (minDate && selectedDate) {
    if (new Date(minDate) > new Date(selectedDate)) return new Date(minDate);
    if (new Date(minDate) < new Date(selectedDate)) return new Date(selectedDate);
    return new Date();
  }
  if (maxDate && selectedDate) {
    if (new Date(maxDate) > new Date(selectedDate)) return new Date(selectedDate);
    if (new Date(maxDate) < new Date(selectedDate)) return new Date(maxDate);
    return new Date();
  }
  if (selectedDate) return new Date(selectedDate);
  if (minDate) return new Date(minDate) > new Date() ? new Date(minDate) : new Date();
  if (maxDate) return new Date(maxDate) < new Date() ? new Date(maxDate) : new Date();
  return new Date();
}
