import React, { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { DraftRecord } from "../drafts";
import { MarketplaceHttpError } from "../marketplace";
import type {
  MarketplaceItem,
  MarketplacePage,
  MarketplaceUser,
} from "../marketplace";
import type {
  DashboardWorkspaceService,
  LocalDashboardResult,
  OpenDashboardResult,
} from "../workspace";
import "./dashboardCatalog.css";

export type DashboardCatalogWorkspace = Pick<
  DashboardWorkspaceService,
  | "authenticate"
  | "listDashboardItems"
  | "openDashboard"
  | "listLocalDashboards"
  | "createNewDashboard"
  | "openLocalDashboard"
>;

export interface DashboardCatalogProps {
  workspace: DashboardCatalogWorkspace;
  onOpen: (
    result: OpenDashboardResult,
    user: MarketplaceUser,
  ) => void | Promise<void>;
  onOpenLocal: (result: LocalDashboardResult) => void | Promise<void>;
}

interface OpenedItem {
  id: number;
  name: string;
  source: OpenDashboardResult["source"];
}

const PAGE_SIZE = 12;

function errorMessage(error: unknown, action: string): string {
  if (error instanceof MarketplaceHttpError) {
    if (error.status === 401) {
      return "Your marketplace session has expired. Sign in and try again.";
    }

    if (error.status === 403) {
      return "Your account cannot access these dashboards.";
    }

    return `${action} failed (HTTP ${error.status}).`;
  }

  if (error instanceof Error && error.message) {
    return `${action} failed: ${error.message.slice(0, 240)}`;
  }

  return `${action} failed. Please try again.`;
}

function sourceLabel(source: OpenDashboardResult["source"]): string {
  return source === "local" ? "Local draft" : "Marketplace";
}

/**
 * The catalog shows shared items and account-owned local drafts. The workspace
 * service selects a local revision for shared items after downloading them.
 */
export function DashboardCatalog({
  onOpen,
  onOpenLocal,
  workspace,
}: DashboardCatalogProps): React.ReactElement {
  const [user, setUser] = useState<MarketplaceUser | null>(null);
  const [page, setPage] = useState<MarketplacePage<MarketplaceItem> | null>(
    null,
  );
  const [localDrafts, setLocalDrafts] = useState<DraftRecord[]>([]);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [damagedDrafts, setDamagedDrafts] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [cursor, setCursor] = useState<number | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [openingDraftId, setOpeningDraftId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [openedItem, setOpenedItem] = useState<OpenedItem | null>(null);
  const openController = useRef<AbortController | null>(null);

  useEffect(
    function loadCatalogEffect() {
      const controller = new AbortController();
      let active = true;

      setLoading(true);
      setListError(null);
      setUser(null);
      setPage(null);
      setLocalDrafts([]);
      setDraftError(null);
      setDamagedDrafts(0);

      async function loadCatalog(): Promise<void> {
        try {
          const nextUser = await workspace.authenticate(controller.signal);

          if (!active) return;

          setUser(nextUser);
          const [itemsResult, draftsResult] = await Promise.allSettled([
            workspace.listDashboardItems(
              { cursor, limit: PAGE_SIZE, search: searchTerm || undefined },
              controller.signal,
            ),
            workspace.listLocalDashboards(nextUser),
          ]);

          if (!active) return;

          if (itemsResult.status === "fulfilled") {
            setPage(itemsResult.value);
          } else {
            setListError(
              errorMessage(itemsResult.reason, "Loading dashboards"),
            );
          }

          if (draftsResult.status === "fulfilled") {
            setLocalDrafts(
              [...draftsResult.value.drafts].sort((a, b) =>
                b.savedAt.localeCompare(a.savedAt),
              ),
            );
            setDamagedDrafts(draftsResult.value.errors.length);
          } else {
            setDraftError(
              errorMessage(draftsResult.reason, "Loading local drafts"),
            );
          }
        } catch (error) {
          if (active) setListError(errorMessage(error, "Loading dashboards"));
        } finally {
          if (active) setLoading(false);
        }
      }

      void loadCatalog();

      return () => {
        active = false;
        controller.abort();
      };
    },
    [workspace, searchTerm, cursor, refreshKey],
  );

  useEffect(function abortOpenOnUnmount() {
    return () => {
      openController.current?.abort();
    };
  }, []);

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setCursor(undefined);
    setSearchTerm(searchInput.trim());
    setRefreshKey((value) => value + 1);
  }

  async function openItem(item: MarketplaceItem): Promise<void> {
    if (!user || openController.current) return;

    const controller = new AbortController();

    openController.current = controller;
    setOpeningId(item.id);
    setOpenError(null);

    try {
      const result = await workspace.openDashboard(item.id, controller.signal);

      if (controller.signal.aborted) return;

      setOpenedItem({ id: item.id, name: item.name, source: result.source });
      await onOpen(result, result.user);
    } catch (error) {
      if (!controller.signal.aborted) {
        setOpenError(errorMessage(error, `Opening ${item.name}`));
      }
    } finally {
      if (!controller.signal.aborted) setOpeningId(null);

      if (openController.current === controller) openController.current = null;
    }
  }

  async function createDashboard(): Promise<void> {
    if (!user || openController.current) return;

    const controller = new AbortController();

    openController.current = controller;
    setCreating(true);
    setOpenError(null);

    try {
      const result = await workspace.createNewDashboard(controller.signal);

      if (!controller.signal.aborted) await onOpenLocal(result);
    } catch (error) {
      if (!controller.signal.aborted) {
        setOpenError(errorMessage(error, "Creating dashboard"));
      }
    } finally {
      if (!controller.signal.aborted) setCreating(false);

      if (openController.current === controller) openController.current = null;
    }
  }

  async function openLocalDraft(draft: DraftRecord): Promise<void> {
    if (!user || openController.current) return;

    const controller = new AbortController();

    openController.current = controller;
    setOpeningDraftId(draft.documentId);
    setOpenError(null);

    try {
      const result = await workspace.openLocalDashboard(
        draft.documentId,
        controller.signal,
      );

      if (!controller.signal.aborted) await onOpenLocal(result);
    } catch (error) {
      if (!controller.signal.aborted) {
        setOpenError(errorMessage(error, `Opening ${draft.document.name}`));
      }
    } finally {
      if (!controller.signal.aborted) setOpeningDraftId(null);

      if (openController.current === controller) openController.current = null;
    }
  }

  const previousCursor = page?.meta.previousCursor;
  const nextCursor = page?.meta.nextCursor;
  const hasPrevious = typeof previousCursor === "number";
  const hasNext = typeof nextCursor === "number";
  const busy =
    loading || openingId !== null || openingDraftId !== null || creating;

  return (
    <main
      aria-labelledby="dashboard-catalog-title"
      className="dashboard-catalog"
    >
      <header className="dashboard-catalog__header">
        <div>
          <h1 id="dashboard-catalog-title">Dashboards</h1>
          <p>Open a marketplace dashboard or continue your local draft.</p>
        </div>
        <div className="dashboard-catalog__header-actions">
          <a
            className="dashboard-catalog__marketplace-link"
            href="/marketplace"
          >
            Browse marketplace
          </a>
          <button
            data-testid="t--new-dashboard"
            disabled={!user || busy}
            onClick={() => void createDashboard()}
            type="button"
          >
            {creating ? "Creating…" : "New dashboard"}
          </button>
          {user && (
            <p className="dashboard-catalog__account">
              Signed in as <strong>{user.username}</strong>
            </p>
          )}
        </div>
      </header>

      {user && (
        <section
          aria-label="Your local drafts"
          className="dashboard-catalog__drafts"
        >
          <h2>Your local drafts</h2>
          <p>
            These open as independent local copies. To replace a marketplace
            item, open its marketplace listing below.
          </p>
          {draftError && <p role="alert">{draftError}</p>}
          {damagedDrafts > 0 && (
            <p role="alert">
              {damagedDrafts} stored draft(s) could not be read.
            </p>
          )}
          {!loading && !draftError && localDrafts.length === 0 && (
            <p>No local drafts yet. Create a dashboard to start.</p>
          )}
          {localDrafts.length > 0 && (
            <ul>
              {localDrafts.map((draft) => (
                <li key={draft.documentId}>
                  <div>
                    <strong>{draft.document.name}</strong>
                    <small>Revision {draft.revision}</small>
                  </div>
                  <button
                    aria-label={`Open local draft ${draft.document.name}`}
                    data-testid={`t--open-local-draft-${draft.documentId}`}
                    disabled={busy}
                    onClick={() => void openLocalDraft(draft)}
                    type="button"
                  >
                    {openingDraftId === draft.documentId
                      ? "Opening…"
                      : "Open local draft"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <form className="dashboard-catalog__search" onSubmit={submitSearch}>
        <label htmlFor="dashboard-catalog-search">Search dashboards</label>
        <div className="dashboard-catalog__search-controls">
          <input
            id="dashboard-catalog-search"
            onChange={(event) => setSearchInput(event.target.value)}
            type="search"
            value={searchInput}
          />
          <button disabled={busy} type="submit">
            Search
          </button>
          <button
            disabled={busy}
            onClick={() => setRefreshKey((value) => value + 1)}
            type="button"
          >
            Refresh
          </button>
        </div>
      </form>

      {openedItem && (
        <p className="dashboard-catalog__opened" role="status">
          Opened <strong>{openedItem.name}</strong> from{" "}
          <strong>{sourceLabel(openedItem.source)}</strong>.
        </p>
      )}
      {openError && (
        <p className="dashboard-catalog__error" role="alert">
          {openError}
        </p>
      )}

      <section
        aria-busy={loading}
        aria-label="Dashboard items"
        className="dashboard-catalog__results"
      >
        {loading && <p role="status">Loading dashboards…</p>}
        {!loading && listError && (
          <div className="dashboard-catalog__error" role="alert">
            <p>{listError}</p>
            <button onClick={() => setRefreshKey((value) => value + 1)}>
              Retry
            </button>
          </div>
        )}
        {!loading && !listError && page?.data.length === 0 && (
          <p className="dashboard-catalog__empty" role="status">
            {searchTerm
              ? `No dashboards match “${searchTerm}”.`
              : "No dashboards are available for this account."}
          </p>
        )}
        {!loading && !listError && page && page.data.length > 0 && (
          <>
            <ul className="dashboard-catalog__items">
              {page.data.map((item) => (
                <li className="dashboard-catalog__item" key={item.id}>
                  <div>
                    <p className="dashboard-catalog__eyebrow">
                      Marketplace listing
                    </p>
                    <h2>{item.name}</h2>
                    {item.description && <p>{item.description}</p>}
                    <p className="dashboard-catalog__publisher">
                      Uploaded by {item.publisherUsername}
                    </p>
                    {openedItem?.id === item.id && (
                      <p className="dashboard-catalog__source">
                        Opened from {sourceLabel(openedItem.source)}
                      </p>
                    )}
                  </div>
                  <div className="dashboard-catalog__item-actions">
                    <a
                      aria-label={`View dashboard ${item.name}`}
                      href={`/view?itemId=${item.id}`}
                    >
                      View dashboard
                    </a>
                    <button
                      aria-label={`Open dashboard ${item.name}`}
                      disabled={busy}
                      onClick={() => void openItem(item)}
                      type="button"
                    >
                      {openingId === item.id ? "Opening…" : "Open dashboard"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {(hasPrevious || hasNext) && (
              <nav
                aria-label="Dashboard pages"
                className="dashboard-catalog__pages"
              >
                <button
                  disabled={busy || !hasPrevious}
                  onClick={() => setCursor(previousCursor ?? undefined)}
                  type="button"
                >
                  Previous
                </button>
                <span>
                  Page {page.meta.currentPage} of {page.meta.totalPages}
                </span>
                <button
                  disabled={busy || !hasNext}
                  onClick={() => setCursor(nextCursor ?? undefined)}
                  type="button"
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
      </section>
    </main>
  );
}
