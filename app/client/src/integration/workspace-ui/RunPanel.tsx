import React, { useEffect, useRef, useState } from "react";
import type { DashboardDocument } from "../document";
import type {
  MarketplaceClient,
  MarketplacePage,
  MarketplaceTestCell,
} from "../marketplace";
import type { TransientWidgetUpdate } from "../runtime";
import { createMarketplaceBrowserRun } from "../cyflex/browser";
import type {
  BrowserCyflexRun,
  BrowserCyflexRunOptions,
  MarketplaceBrowserRunOptions,
} from "../cyflex/browser";
import { resolveSelectedCellVariables } from "../cyflex/resolution";
import type { RunSessionStatus } from "../cyflex/session";
import "./runPanel.css";

type RunController = Pick<BrowserCyflexRun, "start" | "stop" | "status">;

export interface BrowserRunEnvironment {
  /** Deployment-owned broker settings for this authorized cell. */
  connectionForCell(
    cell: MarketplaceTestCell,
    signal?: AbortSignal,
  ): Promise<{
    natsConnection: MarketplaceBrowserRunOptions["natsConnection"];
    timestampToMs: BrowserCyflexRunOptions["timestampToMs"];
  } | null>;
}

export interface RunPanelProps {
  marketplace: MarketplaceClient;
  getDocument(): DashboardDocument;
  environment: BrowserRunEnvironment | null;
  onUpdates(updates: TransientWidgetUpdate[]): void;
  onClear(): void;
  /** Injectable so local UI tests do not need a NATS deployment. */
  createRun?: (options: MarketplaceBrowserRunOptions) => RunController;
}

const PAGE_SIZE = 24;

function describeError(error: unknown): string {
  if (error instanceof Error && error.message)
    return error.message.slice(0, 240);

  return String(error).slice(0, 240);
}

/** A per-viewer Run control that starts no network work until opened. */
export function RunPanel({
  createRun = createMarketplaceBrowserRun,
  environment,
  getDocument,
  marketplace,
  onClear,
  onUpdates,
}: RunPanelProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [cells, setCells] =
    useState<MarketplacePage<MarketplaceTestCell> | null>(null);
  const [cursor, setCursor] = useState<number | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loadingCells, setLoadingCells] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [status, setStatus] = useState<RunSessionStatus>("idle");
  const mounted = useRef(true);
  const activeRun = useRef<RunController | null>(null);
  const launch = useRef<AbortController | null>(null);
  const onClearRef = useRef(onClear);
  const onUpdatesRef = useRef(onUpdates);

  onClearRef.current = onClear;
  onUpdatesRef.current = onUpdates;

  useEffect(function stopRunOnUnmount() {
    mounted.current = true;

    return () => {
      mounted.current = false;
      launch.current?.abort();
      launch.current = null;
      const run = activeRun.current;

      activeRun.current = null;

      if (run) void run.stop().catch(() => undefined);

      onClearRef.current();
    };
  }, []);

  useEffect(
    function loadAuthorizedCells() {
      if (!open || !environment) return;

      const controller = new AbortController();

      setCells(null);
      setLoadingCells(true);
      setListError(null);

      void marketplace
        .listTestCells({ cursor, limit: PAGE_SIZE }, controller.signal)
        .then((page) => {
          if (!controller.signal.aborted) setCells(page);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setListError(`Could not load test cells: ${describeError(error)}`);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingCells(false);
        });

      return () => controller.abort();
    },
    [cursor, environment, marketplace, open, refreshKey],
  );

  async function stopRun(): Promise<void> {
    launch.current?.abort();
    launch.current = null;
    const run = activeRun.current;

    activeRun.current = null;
    setPreparing(false);
    setStatus("idle");
    onClearRef.current();

    if (!run) return;

    try {
      await run.stop();
    } catch (error) {
      if (mounted.current)
        setRunError(`Could not stop Run: ${describeError(error)}`);
    }
  }

  async function startRun(): Promise<void> {
    const selectedCell = cells?.data.find((cell) => cell.id === selectedId);

    if (
      !environment ||
      !selectedCell ||
      preparing ||
      activeRun.current ||
      launch.current
    ) {
      return;
    }

    const controller = new AbortController();

    launch.current = controller;
    setRunError(null);
    setPreparing(true);
    onClearRef.current();
    let run: RunController | null = null;

    try {
      const document = getDocument();

      if (document.bindings.length === 0) {
        throw new Error("Add a live data binding before starting Run");
      }

      const resolved = await resolveSelectedCellVariables(
        marketplace,
        selectedCell.id,
        document,
        controller.signal,
      );

      if (controller.signal.aborted) return;

      const connection = await environment.connectionForCell(
        resolved.cell,
        controller.signal,
      );

      if (controller.signal.aborted) return;

      if (!connection) {
        throw new Error("Run is not configured for this test cell");
      }

      run = createRun({
        marketplace,
        softwareId: resolved.cell.id,
        natsConnection: connection.natsConnection,
        timestampToMs: connection.timestampToMs,
        onUpdates: (updates) => {
          if (activeRun.current === run) onUpdatesRef.current(updates);
        },
        onError: (error) => {
          if (mounted.current && activeRun.current === run) {
            setRunError(describeError(error));
          }
        },
        onStatusChange: (nextStatus) => {
          if (!mounted.current || activeRun.current !== run) return;

          setStatus(nextStatus);

          if (nextStatus === "idle") {
            activeRun.current = null;
            onClearRef.current();
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
        setRunError(`Could not start Run: ${describeError(error)}`);
      }

      if (run && activeRun.current === run) {
        activeRun.current = null;
        try {
          await run.stop();
        } catch {
          // Preserve the startup error; the viewer lease will expire.
        }
        onClearRef.current();

        if (mounted.current) setStatus("idle");
      }
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
    <section aria-label="Dashboard Run" className="dashboard-run">
      <button
        aria-expanded={open}
        className="dashboard-run__toggle"
        onClick={() => {
          if (open) void stopRun();

          setOpen(!open);
        }}
        type="button"
      >
        {open ? "Close Run controls" : "Open Run controls"}
      </button>
      {open && (
        <div className="dashboard-run__body">
          <h3>Run dashboard</h3>
          {!environment && (
            <p role="status">
              Run is unavailable until this deployment provides a browser
              connection.
            </p>
          )}
          {environment && (
            <>
              <label htmlFor="dashboard-run-cell">Test cell</label>
              <select
                aria-label="Test cell"
                disabled={loadingCells || active || !cells?.data.length}
                id="dashboard-run-cell"
                onChange={(event) =>
                  setSelectedId(Number(event.target.value) || null)
                }
                value={selectedId ?? ""}
              >
                <option value="">Select a test cell</option>
                {cells?.data.map((cell) => (
                  <option key={cell.id} value={cell.id}>
                    {cell.name}
                    {cell.site?.name ? ` · ${cell.site.name}` : ""}
                  </option>
                ))}
              </select>
              {loadingCells && (
                <p role="status">Loading authorized test cells…</p>
              )}
              {listError && <p role="alert">{listError}</p>}
              {!loadingCells && !listError && cells?.data.length === 0 && (
                <p role="status">
                  No test cells are available for this account.
                </p>
              )}
              {listError && (
                <button
                  onClick={() => setRefreshKey((value) => value + 1)}
                  type="button"
                >
                  Retry test cells
                </button>
              )}
              {(hasPrevious || hasNext) && (
                <nav
                  aria-label="Test cell pages"
                  className="dashboard-run__pages"
                >
                  <button
                    disabled={!hasPrevious || active || loadingCells}
                    onClick={() => {
                      setSelectedId(null);
                      setCursor(cells?.meta.previousCursor ?? undefined);
                    }}
                    type="button"
                  >
                    Previous cells
                  </button>
                  <span>
                    Page {cells?.meta.currentPage} of {cells?.meta.totalPages}
                  </span>
                  <button
                    disabled={!hasNext || active || loadingCells}
                    onClick={() => {
                      setSelectedId(null);
                      setCursor(cells?.meta.nextCursor ?? undefined);
                    }}
                    type="button"
                  >
                    Next cells
                  </button>
                </nav>
              )}
              <div className="dashboard-run__actions">
                <button
                  disabled={!selectedCell || active || loadingCells}
                  onClick={() => void startRun()}
                  type="button"
                >
                  {preparing ? "Starting…" : "Start Run"}
                </button>
                <button
                  disabled={!active}
                  onClick={() => void stopRun()}
                  type="button"
                >
                  Stop Run
                </button>
              </div>
              <p
                aria-live="polite"
                className="dashboard-run__status"
                role="status"
              >
                Status: {preparing && status === "idle" ? "preparing" : status}
              </p>
              {runError && <p role="alert">{runError}</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
