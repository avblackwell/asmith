import type { InlineDashboardTheme } from "../../document";
import type { ThemePreset } from "../../editor-bridge/appsmith-theme/presets";
import type { SavedTheme } from "./IndexedDbSavedThemeStore";

export type ThemeProperties = InlineDashboardTheme["properties"];
export type { ThemePreset };

/** The Appsmith Fixed theme pane with document-owned state and callbacks. */
export interface ThemePropertyPaneProps {
  currentTheme: InlineDashboardTheme | null;
  featuredThemes: readonly ThemePreset[];
  savedThemes: readonly SavedTheme[];
  savedThemesLoading?: boolean;
  savedThemesError?: string | null;
  onChange: (properties: ThemeProperties) => void;
  onSelectPreset: (theme: ThemePreset) => void;
  onSelectSavedTheme: (theme: SavedTheme) => void;
  onSaveTheme: (displayName: string) => Promise<void>;
  onDeleteSavedTheme: (theme: SavedTheme) => Promise<void>;
  onResetWidgetStyles: () => void;
}
