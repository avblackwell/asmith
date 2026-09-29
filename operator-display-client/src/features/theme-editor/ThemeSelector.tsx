import React from "react";
import { Icon } from "@appsmith/ads";
import { ThemeCard } from "./ThemeCard";
import { SettingSection } from "./SettingSection";
import type { ThemePreset, ThemeProperties } from "./types";
import type { SavedTheme } from "./IndexedDbSavedThemeStore";

interface ThemeSelectorProps {
  currentName?: string;
  currentDisplayName?: string;
  currentProperties?: ThemeProperties;
  featuredThemes: readonly ThemePreset[];
  savedThemes: readonly SavedTheme[];
  savedThemesError?: string | null;
  onBack?: () => void;
  onSelectPreset: (theme: ThemePreset) => void;
  onSelectSavedTheme: (theme: SavedTheme) => void;
  onDeleteSavedTheme: (theme: SavedTheme) => Promise<void>;
}

/** Appsmith Fixed ThemeSelector.tsx with the theme list supplied by the operator store. */
export function ThemeSelector({ currentName, currentDisplayName, currentProperties, featuredThemes, savedThemes, savedThemesError, onBack, onSelectPreset, onSelectSavedTheme, onDeleteSavedTheme }: ThemeSelectorProps): React.ReactElement {
  const userSavedThemes = savedThemes.filter((theme) => theme.isSystemTheme === false && !theme.config.isDeprecated);
  const systemThemes = featuredThemes
    .filter((theme) => theme.isSystemTheme !== false && !theme.config.isDeprecated)
    .slice()
    .sort((a, b) => a.config.order - b.config.order);

  return <div className="od-theme-selector">
    {currentProperties && currentName && currentDisplayName && <section className="od-theme-selector__sticky">
      {onBack && <button className="od-theme-selector__back t--theme-select-back-btn" onClick={onBack} type="button">
        <Icon name="back-control" size="md" />Back
      </button>}
      <SettingSection className="od-theme-selector__applied" isDefaultOpen={false} title="Applied theme">
        <ThemeCard displayName={currentDisplayName} name={currentName} properties={currentProperties} />
      </SettingSection>
    </section>}
    {savedThemesError && <p className="od-theme-selector__error" role="alert">{savedThemesError}</p>}
    {userSavedThemes.length > 0 && <section className="od-theme-selector__list" data-testid="t--saved-themes">
      <h3>Your themes</h3>
      {userSavedThemes.map((theme) => <ThemeCard
        displayName={theme.displayName}
        key={theme.id}
        name={theme.name}
        onDelete={() => onDeleteSavedTheme(theme)}
        onSelect={() => onSelectSavedTheme(theme)}
        properties={theme.properties}
        selectable
      />)}
    </section>}
    <section className="od-theme-selector__list" data-testid="t--featured-themes">
      <h3>Featured themes</h3>
      {systemThemes.map((theme) => <ThemeCard
        displayName={theme.displayName}
        key={theme.id}
        name={theme.name}
        onSelect={() => onSelectPreset(theme)}
        properties={theme.properties}
        selectable
      />)}
    </section>
  </div>;
}
