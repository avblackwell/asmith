import React, { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type {
  MarketplaceItem,
  MarketplacePage,
  MarketplaceQuery,
} from "../marketplace";
import "./marketplaceAssetPanel.css";

type AssetKind = "component" | "theme";
type AssetLoader = (
  query: MarketplaceQuery,
  signal: AbortSignal,
) => Promise<MarketplacePage<MarketplaceItem>>;

export interface MarketplaceAssetPanelProps {
  loadComponents: AssetLoader;
  loadThemes: AssetLoader;
  listSourceGroups(): { widgetId: string; name: string }[];
  installComponent(itemId: number): Promise<string>;
  applyTheme(itemId: number): Promise<string>;
  publishNewComponent(
    widgetId: string,
    description: string,
    thumbnail: File,
  ): Promise<string>;
  replaceComponent(itemId: number, widgetId: string): Promise<string>;
  publishNewTheme(description: string, thumbnail: File): Promise<string>;
  replaceTheme(itemId: number): Promise<string>;
}

const PAGE_SIZE = 12;

function errorText(error: unknown): string {
  if (error instanceof Error && error.message)
    return error.message.slice(0, 240);

  return String(error).slice(0, 240);
}

/** All marketplace writes are attached to explicit publish or replace clicks. */
export function MarketplaceAssetPanel({
  applyTheme,
  installComponent,
  listSourceGroups,
  loadComponents,
  loadThemes,
  publishNewComponent,
  publishNewTheme,
  replaceComponent,
  replaceTheme,
}: MarketplaceAssetPanelProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AssetKind>("component");
  const [page, setPage] = useState<MarketplacePage<MarketplaceItem> | null>(
    null,
  );
  const [cursor, setCursor] = useState<number | undefined>();
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [actionError, setActionError] = useState(false);
  const [sourceWidgetId, setSourceWidgetId] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnail, setThumbnail] = useState<File | null>(null);

  useEffect(
    function loadAssetsWhenOpened() {
      if (!open) return;

      const controller = new AbortController();
      const load = kind === "component" ? loadComponents : loadThemes;

      setLoading(true);
      setLoadError(null);
      setPage(null);
      void load(
        { cursor, limit: PAGE_SIZE, search: searchTerm || undefined },
        controller.signal,
      )
        .then((result) => {
          if (!controller.signal.aborted) setPage(result);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) setLoadError(errorText(error));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });

      return () => controller.abort();
    },
    [cursor, kind, loadComponents, loadThemes, open, refreshKey, searchTerm],
  );

  const sourceGroups = open && kind === "component" ? listSourceGroups() : [];
  const chosenGroup = sourceGroups.some(
    (group) => group.widgetId === sourceWidgetId,
  )
    ? sourceWidgetId
    : "";
  const previousCursor = page?.meta.previousCursor;
  const nextCursor = page?.meta.nextCursor;

  function changeKind(nextKind: AssetKind): void {
    if (kind === nextKind) return;

    setKind(nextKind);
    setCursor(undefined);
    setSearchInput("");
    setSearchTerm("");
    setPage(null);
    setStatus("");
  }

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setCursor(undefined);
    setSearchTerm(searchInput.trim());
    setRefreshKey((value) => value + 1);
  }

  async function perform(
    action: () => Promise<string>,
    refresh = false,
  ): Promise<void> {
    if (busy) return;

    setBusy(true);
    setStatus("");

    try {
      setStatus(await action());
      setActionError(false);

      if (refresh) setRefreshKey((value) => value + 1);
    } catch (error) {
      setStatus(`Asset action failed: ${errorText(error)}`);
      setActionError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Marketplace assets" className="marketplace-assets">
      <button
        aria-expanded={open}
        className="marketplace-assets__toggle"
        data-testid="t--asset-toggle"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {open ? "Close marketplace assets" : "Open marketplace assets"}
      </button>
      {open && (
        <div className="marketplace-assets__body">
          <p>Install into this local draft or upload a new asset.</p>
          <div
            aria-label="Asset type"
            className="marketplace-assets__tabs"
            role="group"
          >
            <button
              aria-pressed={kind === "component"}
              data-testid="t--asset-tab-component"
              disabled={busy}
              onClick={() => changeKind("component")}
              type="button"
            >
              Components
            </button>
            <button
              aria-pressed={kind === "theme"}
              data-testid="t--asset-tab-theme"
              disabled={busy}
              onClick={() => changeKind("theme")}
              type="button"
            >
              Themes
            </button>
          </div>
          <form className="marketplace-assets__search" onSubmit={submitSearch}>
            <label htmlFor="marketplace-asset-search">Search {kind}s</label>
            <div>
              <input
                id="marketplace-asset-search"
                onChange={(event) => setSearchInput(event.target.value)}
                type="search"
                value={searchInput}
              />
              <button disabled={busy || loading} type="submit">
                Search
              </button>
            </div>
          </form>
          {kind === "component" && (
            <label className="marketplace-assets__source">
              Dashboard widget group to upload or replace
              <select
                aria-label="Dashboard source widget group"
                disabled={busy || sourceGroups.length === 0}
                onChange={(event) => setSourceWidgetId(event.target.value)}
                value={chosenGroup}
              >
                <option value="">Select a group</option>
                {sourceGroups.map((group) => (
                  <option key={group.widgetId} value={group.widgetId}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div
            aria-busy={loading}
            aria-label={`${kind} marketplace items`}
            className="marketplace-assets__list"
          >
            {loading && <p role="status">Loading {kind}s…</p>}
            {!loading && loadError && (
              <p role="alert">
                Could not load {kind}s: {loadError}{" "}
                <button
                  onClick={() => setRefreshKey((value) => value + 1)}
                  type="button"
                >
                  Retry
                </button>
              </p>
            )}
            {!loading && !loadError && page?.data.length === 0 && (
              <p role="status">No {kind}s found.</p>
            )}
            {!loading && !loadError && page && page.data.length > 0 && (
              <ul>
                {page.data.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <small>
                        Item #{item.id} · {item.publisherUsername}
                      </small>
                    </div>
                    <div className="marketplace-assets__row-actions">
                      <button
                        aria-label={`${kind === "component" ? "Install component" : "Apply theme"} ${item.name}`}
                        data-testid={`t--asset-${kind === "component" ? "install" : "apply"}-${item.id}`}
                        disabled={busy}
                        onClick={() =>
                          void perform(async () =>
                            kind === "component"
                              ? await installComponent(item.id)
                              : await applyTheme(item.id),
                          )
                        }
                        type="button"
                      >
                        {kind === "component" ? "Install" : "Apply"}
                      </button>
                      <button
                        aria-label={`Replace ${kind} item ${item.name}`}
                        data-testid={`t--asset-replace-${item.id}`}
                        disabled={
                          busy || (kind === "component" && !chosenGroup)
                        }
                        onClick={() =>
                          void perform(
                            async () =>
                              kind === "component"
                                ? await replaceComponent(item.id, chosenGroup)
                                : await replaceTheme(item.id),
                            true,
                          )
                        }
                        type="button"
                      >
                        Replace #{item.id}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {!loading &&
              !loadError &&
              page &&
              (typeof previousCursor === "number" ||
                typeof nextCursor === "number") && (
                <nav
                  aria-label={`${kind} pages`}
                  className="marketplace-assets__pages"
                >
                  <button
                    disabled={busy || typeof previousCursor !== "number"}
                    onClick={() => setCursor(previousCursor ?? undefined)}
                    type="button"
                  >
                    Previous
                  </button>
                  <span>
                    Page {page.meta.currentPage} of {page.meta.totalPages}
                  </span>
                  <button
                    disabled={busy || typeof nextCursor !== "number"}
                    onClick={() => setCursor(nextCursor ?? undefined)}
                    type="button"
                  >
                    Next
                  </button>
                </nav>
              )}
          </div>
          <div className="marketplace-assets__publish">
            <strong>Upload new {kind}</strong>
            <label>
              Description
              <input
                aria-label="New asset description"
                onChange={(event) => setDescription(event.target.value)}
                value={description}
              />
            </label>
            <label>
              Thumbnail
              <input
                accept="image/*"
                aria-label="New asset thumbnail"
                onChange={(event) =>
                  setThumbnail(event.target.files?.[0] ?? null)
                }
                type="file"
              />
            </label>
            <button
              data-testid="t--asset-publish-new"
              disabled={
                busy ||
                !thumbnail ||
                thumbnail.size === 0 ||
                (kind === "component" && !chosenGroup)
              }
              onClick={() => {
                if (!thumbnail) return;

                void perform(
                  async () =>
                    kind === "component"
                      ? await publishNewComponent(
                          chosenGroup,
                          description,
                          thumbnail,
                        )
                      : await publishNewTheme(description, thumbnail),
                  true,
                );
              }}
              type="button"
            >
              Upload new {kind}
            </button>
          </div>
          {status && <p role={actionError ? "alert" : "status"}>{status}</p>}
        </div>
      )}
    </section>
  );
}
