import React, { useEffect, useRef, useState } from "react";
import { Button, Icon } from "@appsmith/ads";
import { ThemeCard } from "./ThemeCard";
import { SettingSection } from "./SettingSection";
import { ThemeFontControl } from "./controls/ThemeFontControl";
import { ThemeColorControl } from "./controls/ThemeColorControl";
import { ThemeBorderRadiusControl } from "./controls/ThemeBorderRadiusControl";
import { ThemeShadowControl } from "./controls/ThemeShadowControl";
import { themeControlLabel } from "./themeConstants";
import { SaveThemeModal } from "./SaveThemeModal";
import type { ThemePreset, ThemeProperties } from "./types";

interface ThemeEditorProps {
  theme: ThemePreset;
  appliedName: string;
  appliedDisplayName: string;
  properties: ThemeProperties;
  onChange: (properties: ThemeProperties) => void;
  onChooseTheme: () => void;
  onSaveTheme: (displayName: string) => Promise<void>;
  onResetWidgetStyles: () => void;
}

/** Appsmith Fixed ThemeEditor.tsx with document callbacks in place of Appsmith actions. */
export function ThemeEditor({ theme, appliedName, appliedDisplayName, properties, onChange, onChooseTheme, onSaveTheme, onResetWidgetStyles }: ThemeEditorProps): React.ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  return <>
    <header className="od-theme-editor__header">
      <div className="od-theme-editor__property-heading">
        <p>Theme properties</p>
        <div className="od-theme-editor__action-menu" ref={menuRef}>
          <Button
            aria-expanded={menuOpen}
            aria-label="Theme actions"
            isIconButton
            kind="tertiary"
            onClick={() => setMenuOpen((open) => !open)}
            size="md"
            startIcon="context-menu"
          />
          {menuOpen && <div className="od-theme-editor__action-menu-content t--save-theme-menu" role="menu">
            <button
              onClick={() => { setMenuOpen(false); setSaveOpen(true); }}
              role="menuitem"
              type="button"
            >Save theme</button>
            <button
              onClick={() => { onResetWidgetStyles(); setMenuOpen(false); }}
              role="menuitem"
              type="button"
            ><Icon name="arrow-go-back" size="md" />Reset widget styles</button>
          </div>}
        </div>
      </div>
      <ThemeCard displayName={appliedDisplayName} name={appliedName} properties={properties}>
        <aside className="od-theme-editor__change-overlay">
          <Button className="t--change-theme-btn" onClick={onChooseTheme} size="md">Change theme</Button>
        </aside>
      </ThemeCard>
    </header>
    <SaveThemeModal
      isOpen={saveOpen}
      onClose={() => setSaveOpen(false)}
      onSave={onSaveTheme}
      suggestedName={appliedDisplayName}
    />
    <main className="od-theme-editor__sections">
      <SettingSection className="od-theme-editor__first-section" isDefaultOpen title="Font">
        {Object.keys(theme.config.fontFamily).map((sectionName) => <section className="od-theme-editor__control-group" key={sectionName}>
          <p className="od-theme-editor__subtext">{themeControlLabel(sectionName)}</p>
          <ThemeFontControl
            onSelect={(value) => onChange({
              ...properties,
              fontFamily: { ...properties.fontFamily, [sectionName]: value || properties.fontFamily[sectionName] },
            })}
            options={theme.config.fontFamily[sectionName]}
            selectedOption={properties.fontFamily[sectionName] ?? ""}
          />
        </section>)}
      </SettingSection>
      <SettingSection className="od-theme-editor__border-section" isDefaultOpen title="Color">
        <section className="od-theme-editor__control-group"><ThemeColorControl onChange={onChange} properties={properties} /></section>
      </SettingSection>
      <SettingSection className="od-theme-editor__border-section" isDefaultOpen title="Border">
        {Object.keys(theme.config.borderRadius).map((sectionName) => <section className="od-theme-editor__control-group" key={sectionName}>
          <p className="od-theme-editor__subtext">{themeControlLabel(sectionName)}</p>
          <ThemeBorderRadiusControl
            onChange={(value) => onChange({ ...properties, borderRadius: { ...properties.borderRadius, [sectionName]: value } })}
            options={theme.config.borderRadius[sectionName]}
            selectedOption={properties.borderRadius[sectionName]}
          />
        </section>)}
      </SettingSection>
      <SettingSection className="od-theme-editor__border-section" isDefaultOpen title="Shadow">
        {Object.keys(theme.config.boxShadow).map((sectionName) => <section className="od-theme-editor__control-group" key={sectionName}>
          <p className="od-theme-editor__subtext">{themeControlLabel(sectionName)}</p>
          <ThemeShadowControl
            onChange={(value) => onChange({ ...properties, boxShadow: { ...properties.boxShadow, [sectionName]: value } })}
            options={theme.config.boxShadow[sectionName]}
            selectedOption={properties.boxShadow[sectionName]}
          />
        </section>)}
      </SettingSection>
    </main>
  </>;
}
