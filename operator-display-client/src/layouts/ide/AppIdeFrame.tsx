import React from "react";
import type { ReactNode } from "react";
import "./appIdeFrame.css";

/**
 * The four named areas from Appsmith AppIDE StaticLayout.tsx. The route owner
 * supplies product controls; no Appsmith router or backend state is mounted.
 */
export function AppIdeFrame({
  header,
  sidebar,
  explorer,
  canvas,
  properties,
  footer,
  previewMode = false,
  settingsMode = false,
}: {
  header: ReactNode;
  sidebar: ReactNode;
  explorer: ReactNode;
  canvas: ReactNode;
  properties: ReactNode;
  footer: ReactNode;
  previewMode?: boolean;
  settingsMode?: boolean;
}): React.ReactElement {
  return (
    <div className={`od-ide${previewMode ? " od-ide--preview" : ""}${settingsMode ? " od-ide--settings" : ""}`}>
      <header className="od-ide__header">{header}</header>
      <div className="od-ide__grid">
        <div className="od-ide__sidebar">{sidebar}</div>
        <div className="od-ide__explorer">{explorer}</div>
        <main className="od-ide__canvas" id="app-body">{canvas}</main>
        <aside aria-label="Widget properties" className="od-ide__properties">
          {properties}
        </aside>
      </div>
      <footer className="od-ide__footer">{footer}</footer>
    </div>
  );
}
