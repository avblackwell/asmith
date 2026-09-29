/** Copied from app/client/src/constants/ThemeConstants.tsx (Apache-2.0). */
export const TAILWIND_COLORS: Record<string, Record<string, string>> = {
  gray: { 100: "#f4f4f5", 300: "#d4d4d8", 500: "#71717a", 700: "#3f3f46", 900: "#18181b" },
  red: { 100: "#fee2e2", 300: "#fca5a5", 500: "#ef4444", 700: "#b91c1c", 900: "#7f1d1d" },
  yellow: { 100: "#fef9c3", 300: "#fde047", 500: "#eab308", 700: "#a16207", 900: "#713f12" },
  green: { 100: "#dcfce7", 300: "#86efac", 500: "#22c55e", 700: "#15803d", 900: "#14532d" },
  blue: { 100: "#dbeafe", 300: "#93c5fd", 500: "#3b82f6", 700: "#1d4ed8", 900: "#1e3a8a" },
  purple: { 100: "#f3e8ff", 300: "#d8b4fe", 500: "#a855f7", 700: "#7e22ce", 900: "#581c87" },
  pink: { 100: "#fce7f3", 300: "#f9a8d4", 500: "#ec4899", 700: "#be185d", 900: "#831843" },
};

export const BOX_SHADOW_SIZE_MAPPINGS: Record<string, string> = {
  S: "Small",
  M: "Medium",
  L: "Large",
};

export function themeControlLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/** Appsmith WidgetUtils uses tinycolor then this exact brightness threshold. */
export function getComplementaryGrayscaleColor(color = "#fff"): "black" | "white" {
  let red = 255;
  let green = 255;
  let blue = 255;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color.trim());

  if (hex) {
    const digits = hex[1].length === 3
      ? hex[1].split("").map((digit) => digit + digit).join("")
      : hex[1];
    red = parseInt(digits.slice(0, 2), 16);
    green = parseInt(digits.slice(2, 4), 16);
    blue = parseInt(digits.slice(4, 6), 16);
  } else if (rgb) {
    red = Number(rgb[1]);
    green = Number(rgb[2]);
    blue = Number(rgb[3]);
  }

  return Math.round((red * 299 + green * 587 + blue * 114) / 1000) > 125
    ? "black" : "white";
}
