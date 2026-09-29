import React from "react";
import ReactDOM from "react-dom";
import { IndexedDbDraftStore } from "integration/drafts";
import { MarketplaceClient } from "integration/marketplace";
import { startStandalone } from "integration/standalone";
import type { MarketplaceEditorContext } from "integration/standalone";
import { DashboardWorkspaceService } from "integration/workspace";
import { DashboardCatalog } from "integration/workspace-ui";
import type { BrowserRunEnvironment } from "integration/workspace-ui/RunPanel";

const deploymentId = `${window.location.origin}/operator_display`;

declare global {
  interface Window {
    /** Set by the deployment bootstrap when browser-scoped NATS access exists. */
    operatorDisplayRunEnvironment?: BrowserRunEnvironment;
  }
}

function itemIdFromUrl(): number | null {
  const raw = new URLSearchParams(window.location.search).get("itemId");

  if (raw === null) return null;

  const id = Number(raw);

  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(id)) {
    throw new TypeError("Dashboard item ID must be a positive integer");
  }

  return id;
}

function draftIdFromUrl(): string | null {
  const raw = new URLSearchParams(window.location.search).get("draftId");

  if (raw === null) return null;

  if (!raw.trim() || raw.length > 200 || /[\u0000-\u001f\u007f]/.test(raw)) {
    throw new TypeError("Dashboard draft ID is invalid");
  }

  return raw;
}

function showError(root: HTMLElement, error: unknown) {
  ReactDOM.render(
    <section role="alert" style={{ padding: 24 }}>
      <h1>Dashboard workspace could not load</h1>
      <p>{String(error)}</p>
      <a href="/workspace">Back to dashboard catalog</a>
    </section>,
    root,
  );
}

/** Runs only on /workspace; its service calls go to the Java marketplace. */
export async function startWorkspace(
  root: HTMLElement,
  runEnvironment: BrowserRunEnvironment | null = window.operatorDisplayRunEnvironment ??
    null,
) {
  window.addEventListener("popstate", () => window.location.reload(), {
    once: true,
  });
  const marketplace = new MarketplaceClient();
  const workspace = new DashboardWorkspaceService({
    deploymentId,
    marketplace,
    drafts: new IndexedDbDraftStore(),
  });

  try {
    const itemId = itemIdFromUrl();
    const draftId = draftIdFromUrl();

    if (itemId !== null && draftId !== null) {
      throw new TypeError("Choose one dashboard item or local draft");
    }

    async function showEditor(
      context: MarketplaceEditorContext,
      nextUrl?: string,
    ): Promise<void> {
      if (nextUrl) window.history.pushState({}, "", nextUrl);

      ReactDOM.unmountComponentAtNode(root);

      try {
        await startStandalone(root, context);
      } catch (error) {
        showError(root, error);
      }
    }

    if (itemId !== null) {
      ReactDOM.render(<p style={{ padding: 24 }}>Opening dashboard…</p>, root);
      const opened = await workspace.openDashboard(itemId);
      const context: MarketplaceEditorContext = {
        document: opened.document,
        localDraft: opened.localDraft,
        accountId: String(opened.user.id),
        deploymentId,
        itemId,
        workspace,
        marketplace,
        runEnvironment,
      };

      await showEditor(context);

      return;
    }

    if (draftId !== null) {
      ReactDOM.render(
        <p style={{ padding: 24 }}>Opening local draft…</p>,
        root,
      );
      const opened = await workspace.openLocalDashboard(draftId);
      const context: MarketplaceEditorContext = {
        document: opened.document,
        localDraft: opened.localDraft,
        accountId: String(opened.user.id),
        deploymentId,
        itemId: null,
        workspace,
        marketplace,
        runEnvironment,
      };

      await showEditor(context);

      return;
    }

    ReactDOM.render(
      <DashboardCatalog
        onOpen={async (opened) => {
          const selectedId = opened.marketplace.metadata.id;
          const context: MarketplaceEditorContext = {
            document: opened.document,
            localDraft: opened.localDraft,
            accountId: String(opened.user.id),
            deploymentId,
            itemId: selectedId,
            workspace,
            marketplace,
            runEnvironment,
          };

          await showEditor(context, `/workspace?itemId=${selectedId}`);
        }}
        onOpenLocal={async (opened) => {
          const context: MarketplaceEditorContext = {
            document: opened.document,
            localDraft: opened.localDraft,
            accountId: String(opened.user.id),
            deploymentId,
            itemId: null,
            workspace,
            marketplace,
            runEnvironment,
          };

          await showEditor(
            context,
            `/workspace?draftId=${encodeURIComponent(opened.document.documentId)}`,
          );
        }}
        workspace={workspace}
      />,
      root,
    );
  } catch (error) {
    showError(root, error);
  }
}
