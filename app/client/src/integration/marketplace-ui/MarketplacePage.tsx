import React, { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Button, SearchInput, Tag, Text } from "@appsmith/ads";
import { MarketplaceHttpError } from "../marketplace";
import type {
  MarketplaceClient,
  MarketplaceGroup,
  MarketplaceItem,
  MarketplacePage as Page,
  MarketplaceTag,
  MarketplaceUser,
} from "../marketplace";
import { catalogHref, detailHref, itemQuery } from "./catalogModel";
import type { CatalogFacet } from "./catalogModel";
import "./marketplacePage.css";

export type MarketplacePageClient = Pick<
  MarketplaceClient,
  "getCurrentUser" | "listItems" | "listGroups" | "listItemTags" | "getItem"
>;

export interface MarketplacePageProps {
  marketplace: MarketplacePageClient;
  initialFacet?: CatalogFacet;
  itemId?: number | null;
}

function messageFor(error: unknown, action: string): string {
  if (error instanceof MarketplaceHttpError) {
    if (error.status === 401)
      return "Your session has expired. Sign in and try again.";

    if (error.status === 403)
      return "You do not have access to this marketplace item.";

    return `${action} failed (HTTP ${error.status}).`;
  }

  if (error instanceof Error && error.message) {
    return `${action} failed: ${error.message.slice(0, 200)}`;
  }

  return `${action} failed. Please try again.`;
}

export function MarketplaceShell({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  return (
    <div className="marketplace-page">
      <header className="marketplace-page__topbar">
        <a className="marketplace-page__brand" href="/marketplace">
          <span aria-hidden="true" className="marketplace-page__brand-mark">
            ▦
          </span>
          Operator Display
        </a>
        <nav aria-label="Main navigation" className="marketplace-page__nav">
          <a aria-current="page" href="/marketplace">
            Marketplace
          </a>
          <a href="/workspace">Dashboards & drafts</a>
          <a href="/admin">Administration</a>
        </nav>
      </header>
      {children}
    </div>
  );
}

function ItemImage({ item }: { item: MarketplaceItem }): React.ReactElement {
  return (
    <div className="marketplace-page__image">
      {item.thumbnailUrl ? (
        <img alt="" loading="lazy" src={item.thumbnailUrl} />
      ) : (
        <span aria-hidden="true">
          {item.type === "dashboard"
            ? "▤"
            : item.type === "component"
              ? "▣"
              : "◈"}
        </span>
      )}
    </div>
  );
}

function ItemCard({
  facet,
  item,
}: {
  facet: CatalogFacet;
  item: MarketplaceItem;
}): React.ReactElement {
  return (
    <li className="marketplace-page__card">
      <a href={detailHref(item.id, facet)}>
        <ItemImage item={item} />
        <div className="marketplace-page__card-body">
          <span className="marketplace-page__type">{item.type}</span>
          <Text kind="heading-s" renderAs="h3">
            {item.name}
          </Text>
          <p>{item.description || "No description provided."}</p>
          <div className="marketplace-page__card-meta">
            <span>By {item.publisherUsername}</span>
            <span>{item.downloadCount} downloads</span>
          </div>
        </div>
      </a>
    </li>
  );
}

function MarketplaceItemDetail({
  facet,
  itemId,
  marketplace,
}: {
  facet: CatalogFacet;
  itemId: number;
  marketplace: MarketplacePageClient;
}): React.ReactElement {
  const [item, setItem] = useState<MarketplaceItem | null>(null);
  const [currentUser, setCurrentUser] = useState<MarketplaceUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(
    function loadItemDetail() {
      const controller = new AbortController();

      setLoading(true);
      setError(null);
      setItem(null);
      setCurrentUser(null);
      void marketplace
        .getItem(itemId, controller.signal)
        .then(async (result) => {
          if (controller.signal.aborted) return;

          setItem(result);
          try {
            const user = await marketplace.getCurrentUser(controller.signal);

            if (!controller.signal.aborted) setCurrentUser(user);
          } catch {
            // Item details remain visible if the account summary is unavailable.
          }
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted)
            setError(messageFor(reason, "Loading item"));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });

      return () => controller.abort();
    },
    [itemId, marketplace, retry],
  );

  return (
    <MarketplaceShell>
      <main className="marketplace-page__detail">
        <a className="marketplace-page__back" href={catalogHref(facet)}>
          ← Back to marketplace
        </a>
        {loading && <p role="status">Loading item…</p>}
        {error && (
          <div className="marketplace-page__notice" role="alert">
            <p>{error}</p>
            <Button
              kind="secondary"
              onClick={() => setRetry((value) => value + 1)}
              size="sm"
            >
              Retry
            </Button>
          </div>
        )}
        {item && (
          <div className="marketplace-page__detail-grid">
            <div>
              <ItemImage item={item} />
              {item.previewImages.length > 0 && (
                <div
                  aria-label="Item previews"
                  className="marketplace-page__previews"
                >
                  {item.previewImages.map((url, index) => (
                    <img
                      alt={`${item.name} preview ${index + 1}`}
                      key={`${url}-${index}`}
                      src={url}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="marketplace-page__detail-copy">
              <span className="marketplace-page__type">{item.type}</span>
              <Text kind="heading-xl" renderAs="h1">
                {item.name}
              </Text>
              <p>{item.description || "No description provided."}</p>
              <p>
                Uploaded by <strong>{item.publisherUsername}</strong>
              </p>
              <p>
                {item.downloadCount} downloads
                {item.ratingCount > 0 && item.rating !== null
                  ? ` · ${item.rating.toFixed(1)} / 5 from ${item.ratingCount} ratings`
                  : ""}
              </p>
              {item.tags.length > 0 && (
                <div
                  aria-label="Item tags"
                  className="marketplace-page__detail-tags"
                >
                  {item.tags.map((tag) => (
                    <Tag isClosable={false} key={tag.id} size="sm">
                      {tag.name}
                    </Tag>
                  ))}
                </div>
              )}
              <div className="marketplace-page__detail-actions">
                {currentUser &&
                  (currentUser.isSystemAdmin ||
                    currentUser.id === item.publisherId ||
                    currentUser.groupMemberships.some(
                      (membership) => membership.role.toLowerCase() === "admin",
                    )) && (
                    <a
                      className="marketplace-page__link-button marketplace-page__link-button--secondary"
                      href={`/marketplace/items/${item.id}/manage`}
                    >
                      Manage item
                    </a>
                  )}
                {item.type === "dashboard" ? (
                  <>
                    <a
                      className="marketplace-page__link-button"
                      href={`/workspace?itemId=${item.id}`}
                    >
                      Open in workbench
                    </a>
                    <a
                      className="marketplace-page__link-button marketplace-page__link-button--secondary"
                      href={`/view?itemId=${item.id}`}
                    >
                      View dashboard
                    </a>
                  </>
                ) : (
                  <>
                    <a
                      className="marketplace-page__link-button"
                      href="/workspace"
                    >
                      Choose a dashboard
                    </a>
                    <p>
                      Open a dashboard, then use this {item.type} from the
                      workbench’s marketplace assets panel.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </MarketplaceShell>
  );
}

const TYPES = [
  { label: "All assets", value: "all" },
  { label: "Dashboards", value: "dashboard" },
  { label: "Components", value: "component" },
  { label: "Themes", value: "theme" },
] as const;

function MarketplaceCatalog({
  initialFacet,
  marketplace,
}: {
  initialFacet: CatalogFacet;
  marketplace: MarketplacePageClient;
}): React.ReactElement {
  const [facet, setFacet] = useState<CatalogFacet>(initialFacet);
  const [user, setUser] = useState<MarketplaceUser | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [groups, setGroups] = useState<MarketplaceGroup[]>([]);
  const [tags, setTags] = useState<MarketplaceTag[]>([]);
  const [groupsCursor, setGroupsCursor] = useState<number | null>(null);
  const [tagsCursor, setTagsCursor] = useState<number | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [facetsBusy, setFacetsBusy] = useState(false);
  const [page, setPage] = useState<Page<MarketplaceItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<number | undefined>();
  const [refresh, setRefresh] = useState(0);
  const moreController = useRef<AbortController | null>(null);

  useEffect(
    function loadMarketplaceSession() {
      const controller = new AbortController();

      setUser(null);
      setGroups([]);
      setTags([]);
      setSessionError(null);
      void marketplace
        .getCurrentUser(controller.signal)
        .then(async (currentUser) => {
          if (controller.signal.aborted) return;

          setUser(currentUser);
          const [groupResult, tagResult] = await Promise.allSettled([
            marketplace.listGroups({ limit: 100 }, controller.signal),
            marketplace.listItemTags({ limit: 100 }, controller.signal),
          ]);

          if (controller.signal.aborted) return;

          if (groupResult.status === "fulfilled") {
            setGroups(groupResult.value.data);
            setGroupsCursor(groupResult.value.meta.nextCursor);
            setGroupsError(null);
          } else {
            setGroupsError(messageFor(groupResult.reason, "Loading groups"));
          }

          if (tagResult.status === "fulfilled") {
            setTags(tagResult.value.data);
            setTagsCursor(tagResult.value.meta.nextCursor);
            setTagsError(null);
          } else {
            setTagsError(messageFor(tagResult.reason, "Loading tags"));
          }
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted)
            setSessionError(messageFor(reason, "Loading marketplace"));
        });

      return () => controller.abort();
    },
    [marketplace, refresh],
  );

  useEffect(
    function loadMarketplaceItems() {
      if (!user) return;

      const controller = new AbortController();

      setLoading(true);
      setListError(null);
      setPage(null);
      void marketplace
        .listItems(itemQuery(facet, search, cursor), controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) setPage(result);
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted)
            setListError(messageFor(reason, "Loading items"));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });

      return () => controller.abort();
    },
    [cursor, facet, marketplace, search, user],
  );

  useEffect(function abortMoreOnUnmount() {
    return () => moreController.current?.abort();
  }, []);

  function selectFacet(next: CatalogFacet): void {
    setFacet(next);
    setCursor(undefined);
    window.history.replaceState({}, "", catalogHref(next));
  }

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setCursor(undefined);
    setSearch(searchInput.trim());
  }

  async function loadMore(kind: "groups" | "tags"): Promise<void> {
    const nextCursor = kind === "groups" ? groupsCursor : tagsCursor;

    if (nextCursor === null || facetsBusy) return;

    const controller = new AbortController();

    moreController.current = controller;
    setFacetsBusy(true);

    try {
      if (kind === "groups") {
        const result = await marketplace.listGroups(
          { cursor: nextCursor, limit: 100 },
          controller.signal,
        );

        if (!controller.signal.aborted) {
          setGroups((current) => [
            ...current,
            ...result.data.filter(
              (group) => !current.some((entry) => entry.id === group.id),
            ),
          ]);
          setGroupsCursor(result.meta.nextCursor);
        }
      } else {
        const result = await marketplace.listItemTags(
          { cursor: nextCursor, limit: 100 },
          controller.signal,
        );

        if (!controller.signal.aborted) {
          setTags((current) => [
            ...current,
            ...result.data.filter(
              (tag) => !current.some((entry) => entry.id === tag.id),
            ),
          ]);
          setTagsCursor(result.meta.nextCursor);
        }
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        if (kind === "groups")
          setGroupsError(messageFor(reason, "Loading groups"));
        else setTagsError(messageFor(reason, "Loading tags"));
      }
    } finally {
      if (!controller.signal.aborted) setFacetsBusy(false);

      if (moreController.current === controller) moreController.current = null;
    }
  }

  const selectedType = facet.kind === "type" ? facet.value : "all";
  const selectedGroup =
    facet.kind === "group"
      ? groups.find((group) => group.id === facet.id)
      : null;
  const selectedTag =
    facet.kind === "tag" ? tags.find((tag) => tag.id === facet.id) : null;
  const filterLabel =
    facet.kind === "group"
      ? `Group: ${selectedGroup?.name ?? `#${facet.id}`}`
      : facet.kind === "tag"
        ? `Tag: ${selectedTag?.name ?? `#${facet.id}`}`
        : facet.kind === "type"
          ? `${facet.value[0].toUpperCase()}${facet.value.slice(1)}s`
          : "All assets";

  return (
    <MarketplaceShell>
      <main className="marketplace-page__main">
        <div className="marketplace-page__intro">
          <div>
            <Text kind="heading-xl" renderAs="h1">
              Marketplace
            </Text>
            <p>Find dashboards, components, and themes for your workbench.</p>
          </div>
          <a className="marketplace-page__link-button" href="/workspace">
            Dashboards & drafts
          </a>
        </div>
        {sessionError && (
          <div className="marketplace-page__notice" role="alert">
            <p>{sessionError}</p>
            <Button
              kind="secondary"
              onClick={() => setRefresh((value) => value + 1)}
              size="sm"
            >
              Retry
            </Button>
          </div>
        )}
        <div className="marketplace-page__layout">
          <aside
            aria-label="Marketplace filters"
            className="marketplace-page__sidebar"
          >
            <Text kind="heading-s" renderAs="h2">
              Browse
            </Text>
            <a className="marketplace-page__draft-link" href="/workspace">
              My local drafts →
            </a>
            <div className="marketplace-page__filter-section">
              <h3>Groups</h3>
              <button
                aria-pressed={facet.kind !== "group"}
                onClick={() => selectFacet({ kind: "all" })}
                type="button"
              >
                All groups
              </button>
              {groups.map((group) => (
                <button
                  aria-pressed={facet.kind === "group" && facet.id === group.id}
                  key={group.id}
                  onClick={() => selectFacet({ kind: "group", id: group.id })}
                  type="button"
                >
                  {group.name}
                </button>
              ))}
              {groupsError && (
                <p className="marketplace-page__filter-error" role="alert">
                  {groupsError}
                </p>
              )}
              {groupsCursor !== null && (
                <Button
                  isDisabled={facetsBusy}
                  kind="tertiary"
                  onClick={() => void loadMore("groups")}
                  size="sm"
                >
                  More groups
                </Button>
              )}
            </div>
            {(tags.length > 0 || tagsError || tagsCursor !== null) && (
              <div className="marketplace-page__filter-section">
                <h3>Tags</h3>
                {tags.map((tag) => (
                  <button
                    aria-pressed={facet.kind === "tag" && facet.id === tag.id}
                    key={tag.id}
                    onClick={() => selectFacet({ kind: "tag", id: tag.id })}
                    type="button"
                  >
                    {tag.name}
                  </button>
                ))}
                {tagsError && (
                  <p className="marketplace-page__filter-error" role="alert">
                    {tagsError}
                  </p>
                )}
                {tagsCursor !== null && (
                  <Button
                    isDisabled={facetsBusy}
                    kind="tertiary"
                    onClick={() => void loadMore("tags")}
                    size="sm"
                  >
                    More tags
                  </Button>
                )}
              </div>
            )}
          </aside>
          <section
            aria-label="Marketplace catalog"
            className="marketplace-page__content"
          >
            <form className="marketplace-page__search" onSubmit={submitSearch}>
              <SearchInput
                onChange={setSearchInput}
                placeholder="Search marketplace"
                value={searchInput}
              />
              <Button kind="primary" size="sm" type="submit">
                Search
              </Button>
              <Button
                kind="secondary"
                onClick={() => setRefresh((value) => value + 1)}
                size="sm"
                type="button"
              >
                Refresh
              </Button>
            </form>
            <div
              aria-label="Asset types"
              className="marketplace-page__types"
              role="group"
            >
              {TYPES.map((type) => (
                <button
                  aria-pressed={selectedType === type.value}
                  key={type.value}
                  onClick={() =>
                    selectFacet(
                      type.value === "all"
                        ? { kind: "all" }
                        : { kind: "type", value: type.value },
                    )
                  }
                  type="button"
                >
                  {type.label}
                </button>
              ))}
            </div>
            <div className="marketplace-page__result-heading">
              <div>
                <Text kind="heading-m" renderAs="h2">
                  {filterLabel}
                </Text>
                {facet.kind === "group" && (
                  <p>
                    Showing all asset types in this group. Choosing a type
                    clears the group filter.
                  </p>
                )}
                {facet.kind === "tag" && (
                  <p>
                    Showing all asset types with this tag. Choosing a type
                    clears the tag filter.
                  </p>
                )}
              </div>
              {page && <span>{page.meta.totalItems} items</span>}
            </div>
            <div aria-busy={loading} className="marketplace-page__results">
              {!user && !sessionError && (
                <p role="status">Loading marketplace…</p>
              )}
              {user && loading && <p role="status">Loading items…</p>}
              {listError && (
                <div className="marketplace-page__notice" role="alert">
                  <p>{listError}</p>
                  <Button
                    kind="secondary"
                    onClick={() => setRefresh((value) => value + 1)}
                    size="sm"
                  >
                    Retry
                  </Button>
                </div>
              )}
              {!loading && !listError && page?.data.length === 0 && (
                <p className="marketplace-page__empty">
                  No items found for this search and filter.
                </p>
              )}
              {!loading && !listError && page && page.data.length > 0 && (
                <>
                  <ul className="marketplace-page__cards">
                    {page.data.map((item) => (
                      <ItemCard facet={facet} item={item} key={item.id} />
                    ))}
                  </ul>
                  {(page.meta.previousCursor !== null ||
                    page.meta.nextCursor !== null) && (
                    <nav
                      aria-label="Marketplace pages"
                      className="marketplace-page__pages"
                    >
                      <Button
                        isDisabled={page.meta.previousCursor === null}
                        kind="secondary"
                        onClick={() =>
                          setCursor(page.meta.previousCursor ?? undefined)
                        }
                        size="sm"
                      >
                        Previous
                      </Button>
                      <span>
                        Page {page.meta.currentPage} of {page.meta.totalPages}
                      </span>
                      <Button
                        isDisabled={page.meta.nextCursor === null}
                        kind="secondary"
                        onClick={() =>
                          setCursor(page.meta.nextCursor ?? undefined)
                        }
                        size="sm"
                      >
                        Next
                      </Button>
                    </nav>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      </main>
    </MarketplaceShell>
  );
}

export function MarketplacePage({
  initialFacet = { kind: "all" },
  itemId = null,
  marketplace,
}: MarketplacePageProps): React.ReactElement {
  return itemId === null ? (
    <MarketplaceCatalog initialFacet={initialFacet} marketplace={marketplace} />
  ) : (
    <MarketplaceItemDetail
      facet={initialFacet}
      itemId={itemId}
      marketplace={marketplace}
    />
  );
}
