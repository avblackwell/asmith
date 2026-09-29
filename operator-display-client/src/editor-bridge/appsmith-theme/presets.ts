import type { InlineDashboardTheme } from "../../document";
import systemThemes from "./systemThemes.json";

/**
 * Appsmith's active Fixed-layout themes. The values in systemThemes.json are
 * copied from app/server/appsmith-server/src/main/resources/system-themes.json;
 * the deprecated ninth entry and server-owned stylesheets are omitted.
 */
export interface ThemePreset {
  id: string;
  name: string;
  displayName: string;
  isSystemTheme?: boolean;
  config: {
    order: number;
    isDeprecated?: boolean;
    colors: Record<string, string>;
    borderRadius: Record<string, Record<string, string>>;
    boxShadow: Record<string, Record<string, string>>;
    fontFamily: Record<string, string[]>;
  };
  properties: InlineDashboardTheme["properties"];
}

export const FEATURED_FIXED_THEMES: readonly ThemePreset[] = systemThemes;

export function fixedThemePreset(name: string): ThemePreset | undefined {
  return FEATURED_FIXED_THEMES.find((theme) => theme.name === name);
}
