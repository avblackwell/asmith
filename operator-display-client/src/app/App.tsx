import React, { useEffect } from "react";
import { Button, Text } from "@appsmith/ads";
import { ThemeProvider } from "styled-components";
import { AdminPage } from "../features/admin/AdminPage";
import { MarketplaceCatalog } from "../features/marketplace/MarketplaceCatalog";
import { MarketplaceItemDetail } from "../features/marketplace/MarketplaceItemDetail";
import { PublishedViewerPage } from "../features/viewer/PublishedViewerPage";
import { WorkspacePage } from "../features/workspace";
import { createLocalDraft } from "../features/workspace/workspaceSlice";
import { WorkbenchPage } from "../features/workbench/WorkbenchPage";
import { loadSession, useAppDispatch, useAppSelector } from "../state/store";

const CustomWidgetBuilder = React.lazy(async () => ({
  default: (await import("../editor-bridge/native-widgets/custom-widget/AppsmithCustomWidgetBuilderBridge"))
    .AppsmithCustomWidgetBuilderBridge,
}));

/** Appsmith's Admin Settings sidebar reads this stock theme width. */
const appsmithShellTheme = { sidebarWidth: "256px" };

export function App(): React.ReactElement {
  if (/^\/workbench\/builder\/?$/.test(window.location.pathname)) {
    return <ThemeProvider theme={appsmithShellTheme}>
      <React.Suspense fallback={<main role="status">Loading Custom Widget Builder…</main>}>
        <CustomWidgetBuilder />
      </React.Suspense>
    </ThemeProvider>;
  }
  return <AuthenticatedApp />;
}

function AuthenticatedApp(): React.ReactElement {
  const dispatch = useAppDispatch();
  const session = useAppSelector((state) => state.session);

  useEffect(() => {
    const request = dispatch(loadSession());

    return () => request.abort();
  }, [dispatch]);

  const pathname = window.location.pathname;
  const isAdmin = /^\/(?:admin|operations)(?:\/|$)/.test(pathname);
  const isMarketplace = pathname === "/" || /^\/marketplace\/?$/.test(pathname);
  const detailMatch = /^\/marketplace\/items\/([1-9]\d*)\/?$/.exec(pathname);
  const detailId = detailMatch ? Number(detailMatch[1]) : null;
  const isDetail = detailId !== null && Number.isSafeInteger(detailId);
  const viewerMatch = /^\/viewer\/items\/([1-9]\d*)\/?$/.exec(pathname);
  const viewerId = viewerMatch ? Number(viewerMatch[1]) : null;
  const isViewer = viewerId !== null && Number.isSafeInteger(viewerId);
  const isWorkspace = /^\/workspace\/?$/.test(pathname);
  const isWorkbench = /^\/workbench\/?$/.test(pathname);

  let content: React.ReactNode;

  if (!isAdmin && !isMarketplace && !isDetail && !isViewer && !isWorkspace && !isWorkbench) {
    content = (
      <main className="app-status" role="alert">
        <h1>Page not found</h1>
        <a href="/marketplace">Open marketplace</a>
      </main>
    );
  } else if (session.status === "failed") {
    content = (
      <main className="app-status" role="alert">
        <Text kind="heading-l" renderAs="h1">
          Operator Display could not load
        </Text>
        <p>{session.error}</p>
        <Button kind="secondary" onClick={() => void dispatch(loadSession())}>
          Retry
        </Button>
      </main>
    );
  } else if (session.status !== "succeeded" || !session.user) {
    content = (
      <main className="app-status" role="status">
        Loading your account…
      </main>
    );
  } else {
    const accountId = session.user.id;

    content = isAdmin ? (
      <AdminPage user={session.user} />
    ) : isWorkbench ? (
      <WorkbenchPage />
    ) : isWorkspace ? (
      <WorkspacePage
        onCreateDraft={async () => {
          const result = await dispatch(createLocalDraft({ accountId }));

          if (createLocalDraft.fulfilled.match(result)) {
            window.location.assign(`/workbench?draftId=${encodeURIComponent(result.payload)}`);
          }
        }}
        onOpenDraft={(draft) => {
          window.location.assign(`/workbench?draftId=${encodeURIComponent(draft.documentId)}`);
        }}
        onOpenItem={(item) => {
          window.location.assign(`/viewer/items/${item.id}`);
        }}
      />
    ) : isViewer ? (
      <PublishedViewerPage itemId={viewerId} />
    ) : isDetail ? (
      <MarketplaceItemDetail itemId={detailId} />
    ) : (
      <MarketplaceCatalog />
    );
  }

  return (
    <ThemeProvider theme={appsmithShellTheme}>{content}</ThemeProvider>
  );
}
