import React from "react";
import type { ReactNode } from "react";
import "./templateCatalogShell.css";

/**
 * Page geometry adapted from Appsmith's Templates page:
 * app/client/src/pages/Templates/index.tsx and TemplateContent/StyledComponents.tsx.
 * Apache-2.0; see the repository LICENSE. Data and actions are supplied by
 * Operator Display instead of Appsmith template reducers and APIs.
 */
export function TemplateCatalogShell({
  children,
  sidebar,
}: {
  children: ReactNode;
  sidebar: ReactNode;
}): React.ReactElement {
  return (
    <div className="template-shell">
      <ProductPageHeader active="marketplace" />
      <div className="template-shell__page">
        <aside aria-label="Marketplace filters" className="template-shell__sidebar">
          {sidebar}
        </aside>
        <main aria-label="Marketplace catalog" className="template-shell__main">
          <div className="template-shell__panel">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function ProductPageHeader({
  active,
}: {
  active: "marketplace" | "workspace" | "admin";
}): React.ReactElement {
  return (
    <header className="template-shell__header">
      <a className="template-shell__brand" href="/marketplace">
        <span aria-hidden="true" className="template-shell__brand-mark">
          ▦
        </span>
        Operator Display
      </a>
      <nav aria-label="Main navigation" className="template-shell__nav">
        <a aria-current={active === "marketplace" ? "page" : undefined} href="/marketplace">
          Marketplace
        </a>
        <a aria-current={active === "workspace" ? "page" : undefined} href="/workspace">
          Dashboards &amp; drafts
        </a>
        <a aria-current={active === "admin" ? "page" : undefined} href="/admin">
          Administration
        </a>
      </nav>
    </header>
  );
}
