import React, { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button, SearchInput, Text } from "@appsmith/ads";
import type { MarketplaceItem } from "../../api/types";
import { TemplateCatalogShell } from "../../layouts/templates/TemplateCatalogShell";
import { useAppDispatch, useAppSelector } from "../../state/store";
import {
  loadGroups,
  loadItems,
  refreshCatalog,
  selectGroup,
  setCursor,
  setSearch,
} from "./catalogSlice";
import "./marketplaceCatalog.css";

function groupIdFromLocation(): number | null {
  const value = new URLSearchParams(window.location.search).get("groupId");

  if (!value || !/^[1-9]\d*$/.test(value)) return null;

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) ? parsed : null;
}

function ItemCard({
  groupId,
  item,
}: {
  groupId: number | null;
  item: MarketplaceItem;
}): React.ReactElement {
  const query = groupId === null ? "" : `?groupId=${groupId}`;

  return (
    <li className="marketplace-catalog__card">
      <a aria-label={`View ${item.name}`} href={`/marketplace/items/${item.id}${query}`}>
        <article>
          <div className="marketplace-catalog__image">
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
          <div className="marketplace-catalog__card-copy">
            <Text className="marketplace-catalog__card-title" kind="heading-m" renderAs="h3">
              {item.name}
            </Text>
            <Text className="marketplace-catalog__card-type" kind="heading-s" renderAs="p">
              {item.type}
            </Text>
            <Text className="marketplace-catalog__card-description" kind="body-m" renderAs="p">
              {item.description || "No description provided."}
            </Text>
          </div>
          <div className="marketplace-catalog__card-footer">
            <span>{item.publisherUsername || "Unknown publisher"}</span>
            <span>{item.downloadCount ?? 0} downloads</span>
          </div>
        </article>
      </a>
    </li>
  );
}

export function MarketplaceCatalog(): React.ReactElement {
  const dispatch = useAppDispatch();
  const session = useAppSelector((state) => state.session);
  const catalog = useAppSelector((state) => state.marketplace);
  const [searchDraft, setSearchDraft] = useState(catalog.search);

  useEffect(() => {
    dispatch(selectGroup(groupIdFromLocation()));

    const onPopState = () => dispatch(selectGroup(groupIdFromLocation()));

    window.addEventListener("popstate", onPopState);

    return () => window.removeEventListener("popstate", onPopState);
  }, [dispatch]);

  useEffect(() => {
    if (session.status !== "succeeded") return;

    const request = dispatch(loadGroups({}));

    return () => request.abort();
  }, [dispatch, session.status]);

  useEffect(() => {
    if (session.status !== "succeeded") return;

    const request = dispatch(
      loadItems({
        groupId: catalog.selectedGroupId,
        search: catalog.search,
        cursor: catalog.cursor,
      }),
    );

    return () => request.abort();
  }, [
    dispatch,
    session.status,
    catalog.selectedGroupId,
    catalog.search,
    catalog.cursor,
    catalog.refreshVersion,
  ]);

  function chooseGroup(groupId: number | null) {
    const nextUrl = new URL(window.location.href);

    if (groupId === null) nextUrl.searchParams.delete("groupId");
    else nextUrl.searchParams.set("groupId", String(groupId));

    window.history.pushState({}, "", nextUrl);
    dispatch(selectGroup(groupId));
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch(setSearch(searchDraft.trim()));
  }

  const selectedGroup = catalog.groups.find(
    (group) => group.id === catalog.selectedGroupId,
  );
  const heading =
    catalog.selectedGroupId === null
      ? "All assets"
      : selectedGroup?.name || `Group #${catalog.selectedGroupId}`;
  const page = catalog.page;

  return (
    <TemplateCatalogShell
      sidebar={
        <div className="marketplace-catalog__filters">
          <Text kind="heading-s" renderAs="h2">
            Groups
          </Text>
          <div role="group" aria-label="Group filters">
            <button
              aria-pressed={catalog.selectedGroupId === null}
              className="marketplace-catalog__filter"
              onClick={() => chooseGroup(null)}
              type="button"
            >
              All groups
            </button>
            {catalog.groups.map((group) => (
              <button
                aria-pressed={catalog.selectedGroupId === group.id}
                className="marketplace-catalog__filter"
                key={group.id}
                onClick={() => chooseGroup(group.id)}
                type="button"
              >
                <span>{group.name}</span>
                <span className="marketplace-catalog__group-count">
                  {group.memberCount}
                </span>
              </button>
            ))}
          </div>
          {catalog.groupsStatus === "loading" && catalog.groups.length === 0 && (
            <p role="status">Loading groups…</p>
          )}
          {catalog.groupsError && (
            <div className="marketplace-catalog__sidebar-error" role="alert">
              <p>{catalog.groupsError}</p>
              <Button kind="secondary" onClick={() => void dispatch(loadGroups({}))} size="sm">
                Retry
              </Button>
            </div>
          )}
          {catalog.groupsNextCursor !== null && (
            <Button
              isDisabled={catalog.groupsStatus === "loading"}
              kind="tertiary"
              onClick={() =>
                void dispatch(loadGroups({ cursor: catalog.groupsNextCursor ?? undefined }))
              }
              size="sm"
            >
              More groups
            </Button>
          )}
        </div>
      }
    >
      <div className="marketplace-catalog__heading">
        <div>
          <Text kind="heading-xl" renderAs="h1">
            Marketplace
          </Text>
          <p>Find dashboards, components, and themes for your workbench.</p>
        </div>
        <span className="marketplace-catalog__account">
          {session.user?.username}
        </span>
      </div>
      <form className="marketplace-catalog__search" onSubmit={search}>
        <SearchInput
          onChange={setSearchDraft}
          placeholder="Search marketplace"
          value={searchDraft}
        />
        <Button kind="primary" size="sm" type="submit">
          Search
        </Button>
        <Button
          kind="secondary"
          onClick={() => dispatch(refreshCatalog())}
          size="sm"
          type="button"
        >
          Refresh
        </Button>
      </form>
      <div className="marketplace-catalog__results-heading">
        <Text kind="heading-m" renderAs="h2">
          {heading}
        </Text>
        {page && <span>{page.meta.totalItems} items</span>}
      </div>
      <div aria-busy={catalog.itemsStatus === "loading"}>
        {catalog.itemsStatus === "loading" && (
          <p role="status">Loading items…</p>
        )}
        {catalog.itemsError && (
          <div className="marketplace-catalog__error" role="alert">
            <p>{catalog.itemsError}</p>
            <Button kind="secondary" onClick={() => dispatch(refreshCatalog())} size="sm">
              Retry
            </Button>
          </div>
        )}
        {catalog.itemsStatus === "succeeded" && page?.data.length === 0 && (
          <p className="marketplace-catalog__empty">
            No items found for this search and group.
          </p>
        )}
        {catalog.itemsStatus === "succeeded" && page && page.data.length > 0 && (
          <>
            <ul className="marketplace-catalog__grid">
              {page.data.map((item) => (
                <ItemCard
                  groupId={catalog.selectedGroupId}
                  item={item}
                  key={item.id}
                />
              ))}
            </ul>
            {(page.meta.previousCursor !== null || page.meta.nextCursor !== null) && (
              <nav aria-label="Marketplace pages" className="marketplace-catalog__pages">
                <Button
                  isDisabled={page.meta.previousCursor === null}
                  kind="secondary"
                  onClick={() => dispatch(setCursor(page.meta.previousCursor ?? undefined))}
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
                  onClick={() => dispatch(setCursor(page.meta.nextCursor ?? undefined))}
                  size="sm"
                >
                  Next
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </TemplateCatalogShell>
  );
}
