import React, { useEffect, useState } from "react";
import { Button } from "@appsmith/ads";
import type { DashboardDocument } from "../../document";
import { MarketplaceClient, marketplaceErrorMessage } from "../../api/marketplace";
import { PublishedDashboardRepository } from "../../api/publishedDashboard";
import type { MarketplaceItem } from "../../api/types";
import { canvasPayloadForDocument } from "../../editor-bridge/canvasPayload";
import type { CanvasPayload } from "../../editor-bridge/canvasPayload";
import { createReadOnlyCompatStore } from "../../editor-bridge/compat-store";
import type { ReadOnlyCompatStore } from "../../editor-bridge/compat-store";
import { TransientWidgetOverlay } from "../../editor-bridge/live-bindings";
import { NativeReadOnlyCanvas } from "../../editor-bridge/read-only/NativeReadOnlyCanvas";
import "./publishedViewerPage.css";

interface ViewerReady {
  status: "ready";
  document: DashboardDocument;
  metadata: MarketplaceItem;
  payload: CanvasPayload;
  store: ReadOnlyCompatStore;
  overlay: TransientWidgetOverlay;
}

type ViewerState =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | ViewerReady;

/** One marketplace dashboard, using the same read-only widget boundary as Workbench. */
export function PublishedViewerPage({ itemId }: { itemId: number }): React.ReactElement {
  const [state, setState] = useState<ViewerState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const repository = new PublishedDashboardRepository(new MarketplaceClient());

    setState({ status: "loading" });

    void repository.load(itemId, controller.signal)
      .then(async ({ document, metadata }) => {
        if (document.theme.kind !== "inline") {
          throw new TypeError("Dashboard theme could not be resolved");
        }

        const payload = await canvasPayloadForDocument(document);

        if (controller.signal.aborted) return;

        setState({
          status: "ready",
          document,
          metadata,
          payload,
          store: createReadOnlyCompatStore(payload),
          overlay: new TransientWidgetOverlay(),
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "failed",
          message: marketplaceErrorMessage(error, "Opening dashboard"),
        });
      });

    return () => controller.abort();
  }, [itemId, attempt]);

  const title = state.status === "ready"
    ? state.document.name
    : "Dashboard viewer";

  return (
    <div className="published-viewer">
      <header className="published-viewer__header">
        <div className="published-viewer__identity">
          <span aria-hidden="true" className="published-viewer__mark">▤</span>
          <div>
            <h1>{title}</h1>
            <p>{state.status === "ready"
              ? `Marketplace dashboard #${state.metadata.id}`
              : "Marketplace dashboard"}</p>
          </div>
        </div>
        <a href="/workspace">Back to dashboards</a>
      </header>

      {state.status === "loading" && (
        <main className="published-viewer__message" role="status">
          Opening marketplace dashboard…
        </main>
      )}
      {state.status === "failed" && (
        <main className="published-viewer__message" role="alert">
          <h2>Dashboard unavailable</h2>
          <p>{state.message}</p>
          <Button kind="secondary" onClick={() => setAttempt((value) => value + 1)} size="sm">
            Retry
          </Button>
        </main>
      )}
      {state.status === "ready" && state.document.theme.kind === "inline" && (
        <main className="published-viewer__main">
          <section
            aria-label="Dashboard viewer"
            className="published-viewer__workspace"
            style={{ backgroundColor: state.document.theme.properties.colors.backgroundColor }}
          >
            <div
              className="published-viewer__canvas"
              style={{
                width: state.payload.dsl.rightColumn || 1242,
                backgroundColor: state.document.theme.properties.colors.backgroundColor,
              }}
            >
              <NativeReadOnlyCanvas
                interactiveSelection={false}
                overlay={state.overlay}
                rootWidgetId={state.payload.pageWidgetId}
                store={state.store}
                theme={{
                  primaryColor: state.document.theme.properties.colors.primaryColor,
                  backgroundColor: state.document.theme.properties.colors.backgroundColor,
                  fontFamily: state.document.theme.properties.fontFamily.appFont,
                  appBorderRadius: state.document.theme.properties.borderRadius.appBorderRadius,
                  appBoxShadow: state.document.theme.properties.boxShadow.appBoxShadow,
                }}
              />
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
