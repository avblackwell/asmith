import React, { useEffect, useState } from "react";
import { Icon, Input, Text } from "@appsmith/ads";
import type { DashboardDocument } from "../../document";
import "./workbenchAppSettings.css";

type SettingsTab = "general" | "theme";

/** Appsmith AppSettings' two-column SectionHeader / SectionContent arrangement. */
export function WorkbenchAppSettings({
  document,
  onRename,
  themePane,
}: {
  document: DashboardDocument;
  onRename(name: string): void;
  themePane: React.ReactNode;
}): React.ReactElement {
  const [selectedTab, setSelectedTab] = useState<SettingsTab>("general");
  const [nameDraft, setNameDraft] = useState(document.name);
  useEffect(() => setNameDraft(document.name), [document.name]);

  return (
    <div className="od-app-settings" translate="no">
      <div className="od-app-settings__header">
        <Text kind="heading-xs">App Settings</Text>
      </div>
      <div className="od-app-settings__body">
        <nav aria-label="App settings" className="od-app-settings__sections">
          <button
            aria-current={selectedTab === "general" ? "page" : undefined}
            className="od-app-settings__section"
            onClick={() => setSelectedTab("general")}
            type="button"
          >
            <Icon name="settings-v3" size="md" />
            <span>
              <strong>General</strong>
              <small>Dashboard details</small>
            </span>
          </button>
          <button
            aria-current={selectedTab === "theme" ? "page" : undefined}
            className="od-app-settings__section"
            onClick={() => setSelectedTab("theme")}
            type="button"
          >
            <Icon name="pencil-line" size="md" />
            <span>
              <strong>Theme</strong>
              <small>Customize appearance</small>
            </span>
          </button>
        </nav>
        <section aria-label={selectedTab === "theme" ? "Theme settings" : "General settings"}
          className="od-app-settings__content">
          {selectedTab === "theme" ? themePane : (
            <div className="od-app-settings__general">
              <Text kind="heading-xs" renderAs="h2">General settings</Text>
              <Input
                label="Dashboard name"
                onBlur={() => {
                  const name = nameDraft.trim();
                  if (name && name !== document.name) onRename(name);
                  else if (!name) setNameDraft(document.name);
                }}
                onChange={setNameDraft}
                value={nameDraft}
              />
              <dl>
                <dt>Document ID</dt><dd>{document.documentId}</dd>
                <dt>Layout</dt><dd>{document.compatibility.layoutSystem}</dd>
              </dl>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
