import React from "react";
import type { ReactNode } from "react";
import "./applicationsShell.css";

/**
 * Applications page composition adapted from Appsmith's
 * ce/pages/Applications/index.tsx and pages/Applications/CommonElements.tsx.
 * Apache-2.0; see the repository LICENSE. The rail and main panel take
 * product data instead of Appsmith workspace and application Redux state.
 */
export function ApplicationsShell({
  children,
  sidebar,
}: {
  children: ReactNode;
  sidebar: ReactNode;
}): React.ReactElement {
  return (
    <div className="applications-shell">
      <header className="applications-shell__header">
        <a className="applications-shell__brand" href="/workspace">
          <span aria-hidden="true" className="applications-shell__brand-mark">
            ▦
          </span>
          Operator Display
        </a>
        <nav aria-label="Main navigation" className="applications-shell__nav">
          <a aria-current="page" href="/workspace">
            Dashboards
          </a>
          <a href="/marketplace">Marketplace</a>
          <a href="/admin">Administration</a>
        </nav>
      </header>
      <div className="applications-shell__page">
        <aside aria-label="Dashboard views" className="applications-shell__sidebar">
          {sidebar}
        </aside>
        <main aria-label="Dashboard workspace" className="applications-shell__main">
          {children}
        </main>
      </div>
    </div>
  );
}
