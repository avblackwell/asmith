/**
 * The non-localized path of Blueprint NumericInput's numericInputUtils.
 * Source: app/client/node_modules/@blueprintjs/core/lib/esm/components/forms/numericInputUtils.js
 * Appsmith Input V2 leaves shouldUseLocale unset, so NumericInput receives no locale.
 */
export function isValidNumericKeyboardEvent(event: {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): boolean {
  if (event.key == null || event.ctrlKey || event.altKey || event.metaKey ||
    event.key.length !== 1) return true;
  return /^[Ee0-9+\-.]$/.test(event.key);
}

export function sanitizeNumericInput(value: string): string {
  return value.replace(/[\uFF10-\uFF19]/g,
    (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .split("").filter((char) => /^[Ee0-9+\-.]$/.test(char)).join("");
}

/** Appsmith passes stepSize=1 and no major/minor step sizes to NumericInput. */
export function roundAndClampNumericStep(value: string, delta: number,
  min?: number, max?: number): string {
  const current = value === "" ? 0 : Number(value);
  if (!Number.isFinite(current)) return "";
  const next = Math.round(current + delta);
  return String(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next)));
}
