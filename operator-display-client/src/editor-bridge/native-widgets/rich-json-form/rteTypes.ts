/** Appsmith's components/constants.ts label positions and RTE text size. */
export type LabelPosition = "Auto" | "Top" | "Left" | "Right";
export type TextSize = string;

/** Appsmith's isMacOs only changes the spellcheck help text. */
export function isMacOs(): boolean {
  return typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
}
