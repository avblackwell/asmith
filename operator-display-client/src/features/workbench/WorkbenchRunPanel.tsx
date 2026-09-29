import React, { useEffect, useRef, useState } from "react";
import { Button, Text } from "@appsmith/ads";
import type { DashboardDocument } from "../../document";
import type { MarketplaceTestCell } from "../../api/types";
import type { TransientWidgetOverlay } from "../../editor-bridge/live-bindings";
import {
  CyflexProxyClient,
  createBrowserRun,
  resolveSelectedCellVariables,
} from "../../cyflex";

type Run = ReturnType<typeof createBrowserRun>;
type RunOptions = Parameters<typeof createBrowserRun>[0];
type RunStatus = Run["status"];

/** Supplied by deployment before this frontend starts; never saved in a dashboard. */
export interface BrowserRunEnvironment {
  connectionForCell(
    cell: MarketplaceTestCell,
    signal?: AbortSignal,
  ): Promise<{
    natsConnection: RunOptions["natsConnection"];
    timestampToMs: RunOptions["timestampToMs"];
  } | null>;
}

declare global {
  interface Window {
    operatorDisplayRunEnvironment?: BrowserRunEnvironment;
  }
}

export interface WorkbenchRunPanelProps {
  document: DashboardDocument;
  overlay: TransientWidgetOverlay;
  visible: boolean;
  onActiveChange(active: boolean): void;
  onClearSamples(): void;
  environment?: BrowserRunEnvironment | null;
}

const PAGE_SIZE = 24;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240);
}

/** One Run lease for this workbench. Switching sidebar panes keeps it mounted. */
export function WorkbenchRunPanel({
  document,
  overlay,
  visible,
  onActiveChange,
  onClearSamples,
  environment = window.operatorDisplayRunEnvironment ?? null,
}: WorkbenchRunPanelProps): React.ReactElement {
  const client = useRef(new CyflexProxyClient()).current;
  const [cells, setCells] = useState<Awaited<ReturnType<typeof client.listTestCells>> | null>(null);
  const [cursor, setCursor] = useState<number | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loadingCells, setLoadingCells] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [status, setStatus] = useState<RunStatus>("idle");
  const mounted = useRef(true);
  const activeRun = useRef<Run | null>(null);
  const launch = useRef<AbortController | null>(null);
  const callbacks = useRef({ onActiveChange, onClearSamples, overlay });
  callbacks.current = { onActiveChange, onClearSamples, overlay };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      launch.current?.abort();
      launch.current = null;
      const run = activeRun.current;
      activeRun.current = null;
      if (run) void run.stop().catch(() => undefined);
      callbacks.current.overlay.clear();
      callbacks.current.onActiveChange(false);
    };
  }, []);

  useEffect(() => {
    if (!environment || !visible) return;
    const controller = new AbortController();
    setLoadingCells(true);
    setListError(null);
    void client.listTestCells({ cursor, limit: PAGE_SIZE }, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setCells(page);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setListError(`Could not load test cells: ${errorText(error)}`);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCells(false);
      });
    return () => controller.abort();
  }, [client, cursor, environment, refreshKey, visible]);

  async function stopRun(): Promise<void> {
    launch.current?.abort();
    launch.current = null;
    const run = activeRun.current;
    activeRun.current = null;
    setPreparing(false);
    setStatus("idle");
    callbacks.current.overlay.clear();
    callbacks.current.onActiveChange(false);
    if (!run) return;
    try {
      await run.stop();
    } catch (error) {
      if (mounted.current) setRunError(`Could not stop Run: ${errorText(error)}`);
    }
  }

  async function startRun(): Promise<void> {
    const selectedCell = cells?.data.find((cell) => cell.id === selectedId);
    if (!environment || !selectedCell || preparing || activeRun.current || launch.current) return;

    const controller = new AbortController();
    launch.current = controller;
    setRunError(null);
    setPreparing(true);
    callbacks.current.onClearSamples();
    callbacks.current.overlay.clear();
    callbacks.current.onActiveChange(true);
    let run: Run | null = null;

    try {
      if (document.bindings.length === 0) {
        throw new Error("Add a live data binding before starting Run");
      }
      const resolved = await resolveSelectedCellVariables(
        client, selectedCell.id, document, controller.signal,
      );
      if (controller.signal.aborted) return;
      const connection = await environment.connectionForCell(resolved.cell, controller.signal);
      if (controller.signal.aborted) return;
      if (!connection) throw new Error("Run is not configured for this test cell");

      run = createBrowserRun({
        client,
        softwareId: resolved.cell.id,
        natsConnection: connection.natsConnection,
        timestampToMs: connection.timestampToMs,
        onUpdates: (updates) => {
          if (activeRun.current === run) callbacks.current.overlay.apply(updates);
        },
        onError: (error) => {
          if (mounted.current && activeRun.current === run) setRunError(errorText(error));
        },
        onStatusChange: (nextStatus) => {
          if (!mounted.current || activeRun.current !== run) return;
          setStatus(nextStatus);
          if (nextStatus === "idle") {
            activeRun.current = null;
            callbacks.current.overlay.clear();
            callbacks.current.onActiveChange(false);
          }
        },
      });
      activeRun.current = run;
      await run.start({
        document,
        cellId: String(resolved.cell.id),
        subject: resolved.subject,
        resolvedVariables: resolved.resolvedVariables,
      });
    } catch (error) {
      if (!controller.signal.aborted && mounted.current) {
        setRunError(`Could not start Run: ${errorText(error)}`);
      }
      if (run && activeRun.current === run) {
        activeRun.current = null;
        try { await run.stop(); } catch { /* Keep the startup error. */ }
      }
      callbacks.current.overlay.clear();
      callbacks.current.onActiveChange(false);
      if (mounted.current) setStatus("idle");
    } finally {
      if (launch.current === controller) launch.current = null;
      if (mounted.current) setPreparing(false);
    }
  }

  const selectedCell = cells?.data.find((cell) => cell.id === selectedId);
  const hasPrevious = typeof cells?.meta.previousCursor === "number";
  const hasNext = typeof cells?.meta.nextCursor === "number";
  const active = preparing || status !== "idle" || activeRun.current !== null;

  return (
    <section aria-label="Dashboard Run" className="od-workbench__run">
      <Text kind="heading-xs" renderAs="h3">Run dashboard</Text>
      {!environment ? (
        <p role="status">Run awaits a browser NATS connection from this deployment.</p>
      ) : (
        <>
          <label htmlFor="od-workbench-run-cell">Test cell</label>
          <select
            aria-label="Test cell"
            disabled={loadingCells || active || !cells?.data.length}
            id="od-workbench-run-cell"
            onChange={(event) => setSelectedId(Number(event.target.value) || null)}
            value={selectedId ?? ""}
          >
            <option value="">Select a test cell</option>
            {cells?.data.map((cell) => (
              <option key={cell.id} value={cell.id}>
                {cell.name}{cell.site?.name ? ` · ${cell.site.name}` : ""}
              </option>
            ))}
          </select>
          {loadingCells && <p role="status">Loading authorized test cells…</p>}
          {listError && <p role="alert">{listError}</p>}
          {!loadingCells && !listError && cells?.data.length === 0 && (
            <p role="status">No test cells are available for this account.</p>
          )}
          {listError && (
            <Button kind="tertiary" onClick={() => setRefreshKey((value) => value + 1)} size="sm">
              Retry test cells
            </Button>
          )}
          {(hasPrevious || hasNext) && (
            <nav aria-label="Test cell pages" className="od-workbench__run-pages">
              <Button isDisabled={!hasPrevious || active || loadingCells} kind="tertiary" onClick={() => {
                setSelectedId(null);
                setCursor(cells?.meta.previousCursor ?? undefined);
              }} size="sm">Previous</Button>
              <span>Page {cells?.meta.currentPage} of {cells?.meta.totalPages}</span>
              <Button isDisabled={!hasNext || active || loadingCells} kind="tertiary" onClick={() => {
                setSelectedId(null);
                setCursor(cells?.meta.nextCursor ?? undefined);
              }} size="sm">Next</Button>
            </nav>
          )}
          <div className="od-workbench__run-actions">
            <Button isDisabled={!selectedCell || active || loadingCells} onClick={() => void startRun()} size="sm">
              {preparing ? "Starting…" : "Start Run"}
            </Button>
            <Button isDisabled={!active} kind="secondary" onClick={() => void stopRun()} size="sm">Stop Run</Button>
          </div>
          <p aria-live="polite" role="status">Status: {preparing && status === "idle" ? "preparing" : status}</p>
          {runError && <p role="alert">{runError}</p>}
        </>
      )}
    </section>
  );
}
