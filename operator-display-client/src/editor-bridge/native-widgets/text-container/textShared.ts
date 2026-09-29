/**
 * Read-only Text widget constants and helpers extracted from Appsmith's
 * TextWidget/component and WidgetUtils. Appsmith is licensed under Apache-2.0.
 */
export enum OverflowTypes {
  SCROLL = "SCROLL",
  TRUNCATE = "TRUNCATE",
  NONE = "NONE",
}

const OLD_FONT_SIZES: Record<string, string> = {
  PARAGRAPH2: "0.75rem",
  PARAGRAPH: "0.875rem",
  HEADING3: "1rem",
  HEADING2: "1.125rem",
  HEADING1: "1.5rem",
};

export function fontSizeUtility(fontSize: string | undefined): string | undefined {
  return fontSize ? OLD_FONT_SIZES[fontSize] ?? fontSize : undefined;
}

const SAFE_SCHEME_PATTERN = /^(?:https?|mailto|tel|ftp|file|sms):/i;

export function addHttpIfMissing(url: string): string {
  if (!url || SAFE_SCHEME_PATTERN.test(url)) return url;
  return `http://${url}`;
}
