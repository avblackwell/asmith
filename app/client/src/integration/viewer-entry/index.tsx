import React from "react";
import ReactDOM from "react-dom";
import { MarketplaceClient } from "integration/marketplace";
import { DashboardMarketplaceRepository } from "integration/publishing";
import { renderPublishedViewer } from "integration/standalone";
import {
  applyThemeAsset,
  ThemeMarketplaceRepository,
} from "integration/theme-assets";
import type { BrowserRunEnvironment } from "integration/workspace-ui/RunPanel";

function itemIdFromUrl(): number {
  const raw = new URLSearchParams(window.location.search).get("itemId");
  const id = Number(raw);

  if (!raw || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(id)) {
    throw new TypeError("Dashboard item ID must be a positive integer");
  }

  return id;
}

function showError(root: HTMLElement, error: unknown): void {
  ReactDOM.render(
    <section role="alert" style={{ padding: 24 }}>
      <h1>Marketplace dashboard could not load</h1>
      <p>{String(error)}</p>
      <a href="/workspace">Back to dashboard catalog</a>
    </section>,
    root,
  );
}

/** Reads marketplace bytes only; local drafts are never opened on /view. */
export async function startViewer(
  root: HTMLElement,
  runEnvironment: BrowserRunEnvironment | null = window.operatorDisplayRunEnvironment ??
    null,
): Promise<void> {
  window.addEventListener("popstate", () => window.location.reload(), {
    once: true,
  });

  try {
    const itemId = itemIdFromUrl();
    const marketplace = new MarketplaceClient();
    const dashboards = new DashboardMarketplaceRepository(marketplace);

    ReactDOM.render(
      <p style={{ padding: 24 }}>Opening marketplace dashboard…</p>,
      root,
    );

    const downloaded = await dashboards.downloadDashboard(itemId);
    let document = downloaded.document;

    if (document.theme.kind === "marketplace") {
      const themeId = Number(document.theme.itemId);

      if (!Number.isSafeInteger(themeId) || themeId <= 0) {
        throw new TypeError("Referenced theme item ID is invalid");
      }

      // Marketplace items are mutable; this resolves the current theme bytes.
      const theme = await new ThemeMarketplaceRepository(
        marketplace,
      ).downloadTheme(themeId);

      document = applyThemeAsset(document, theme.asset);
    }

    ReactDOM.unmountComponentAtNode(root);
    await renderPublishedViewer(root, {
      document,
      itemId,
      marketplace,
      runEnvironment,
    });
  } catch (error) {
    showError(root, error);
  }
}
