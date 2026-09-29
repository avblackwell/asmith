import React, { useMemo, useState } from "react";
import { Tag } from "@appsmith/ads";
import { ThemeEditor } from "./ThemeEditor";
import { ThemeSelector } from "./ThemeSelector";
import type { ThemePropertyPaneProps } from "./types";
import "@blueprintjs/core/lib/css/blueprint.css";
import "./themeEditor.css";

/** Adapted from Appsmith pages/Editor/ThemePropertyPane/index.tsx. */
export function ThemePropertyPane({ currentTheme, featuredThemes, savedThemes, savedThemesLoading, savedThemesError, onChange, onSelectPreset, onSelectSavedTheme, onSaveTheme, onDeleteSavedTheme, onResetWidgetStyles }: ThemePropertyPaneProps): React.ReactElement {
  const [themingMode, setThemingMode] = useState<"edit" | "selection">("edit");
  const currentThemeDefinition = useMemo(() => [...savedThemes, ...featuredThemes]
    .find((theme) => theme.name === currentTheme?.name),
  [savedThemes, featuredThemes, currentTheme?.name]);
  const selectedPreset = useMemo(() => currentThemeDefinition
    ?? featuredThemes.find((theme) => theme.name === currentTheme?.basePresetName)
    ?? featuredThemes[0],
  [currentThemeDefinition, featuredThemes, currentTheme?.basePresetName]);
  const appliedDisplayName = currentTheme?.displayName ?? currentThemeDefinition?.displayName
    ?? (currentTheme?.name.startsWith("saved:") ? "Custom theme" : currentTheme?.name ?? "");

  if (savedThemesLoading && currentTheme?.name.startsWith("saved:") && !currentTheme.basePresetName) {
    return <div className="od-theme-pane" role="status">Loading saved theme…</div>;
  }

  if (!selectedPreset) {
    return <div className="od-theme-pane" role="status">No featured themes available.</div>;
  }

  return <div className="od-theme-pane">
    <p className="od-theme-pane__title">Theme settings <Tag isClosable={false} size="md">Beta</Tag></p>
    <div className="od-theme-pane__body">
      {!currentTheme ? <>
        <p className="od-theme-pane__marketplace-notice">Choose a featured theme to customize this marketplace theme reference.</p>
        <ThemeSelector
          featuredThemes={featuredThemes}
          onDeleteSavedTheme={onDeleteSavedTheme}
          onSelectPreset={onSelectPreset}
          onSelectSavedTheme={onSelectSavedTheme}
          savedThemes={savedThemes}
          savedThemesError={savedThemesError}
        />
      </> : themingMode === "selection" ? <ThemeSelector
        currentDisplayName={appliedDisplayName}
        currentName={currentTheme.name}
        currentProperties={currentTheme.properties}
        featuredThemes={featuredThemes}
        onBack={() => setThemingMode("edit")}
        onDeleteSavedTheme={onDeleteSavedTheme}
        onSelectPreset={onSelectPreset}
        onSelectSavedTheme={onSelectSavedTheme}
        savedThemes={savedThemes}
        savedThemesError={savedThemesError}
      /> : <ThemeEditor
        appliedDisplayName={appliedDisplayName}
        appliedName={currentTheme.name}
        onChange={onChange}
        onChooseTheme={() => setThemingMode("selection")}
        onSaveTheme={onSaveTheme}
        onResetWidgetStyles={onResetWidgetStyles}
        properties={currentTheme.properties}
        theme={selectedPreset}
      />}
    </div>
  </div>;
}
