import React, { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Button, SearchInput, Text } from "@appsmith/ads";
import type { MarketplaceItem } from "../../api/types";
import { ApplicationsShell } from "../../layouts/applications/ApplicationsShell";
import { useAppDispatch, useAppSelector } from "../../state/store";
import type { LocalDraftSummary } from "./localDraftMetadata";
import {
  chooseWorkspaceView,
  loadDashboardItems,
  loadLocalDrafts,
  refreshWorkspace,
  setWorkspaceCursor,
  setWorkspaceSearch,
} from "./workspaceSlice";
import "./workspacePage.css";

export interface WorkspacePageProps {
  /** Connected when the extracted editor bridge can open a Java item. */
  onOpenItem?: (item: MarketplaceItem) => void | Promise<void>;
  /** Connected when the extracted editor bridge can open an IndexedDB draft. */
  onOpenDraft?: (draft: LocalDraftSummary) => void | Promise<void>;
  /** Creates a local draft and opens its workbench route. */
  onCreateDraft?: () => void | Promise<void>;
}

const CARD_COLORS = [
  "#f9e8d8",
  "#e5edf9",
  "#e5f2e9",
  "#f4e5ef",
  "#ece9fa",
  "#f5efdb",
];

function cardColor(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return CARD_COLORS[hash % CARD_COLORS.length];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function DashboardCard({
  name,
  footer,
  id,
  onOpen,
}: {
  name: string;
  footer: string;
  id: string;
  onOpen?: () => void | Promise<void>;
}): React.ReactElement {
  const visual = (
    <>
      <span aria-hidden="true" className="workspace-page__card-icon">
        ▤
      </span>
      <Text kind="heading-s" renderAs="span">
        {name}
      </Text>
    </>
  );

  return (
    <li className="workspace-page__card" key={id}>
      {onOpen ? (
        <button
          aria-label={`Open ${name}`}
          className="workspace-page__card-surface workspace-page__card-surface--interactive"
          onClick={() => void onOpen()}
          style={{ backgroundColor: cardColor(id) }}
          type="button"
        >
          {visual}
        </button>
      ) : (
        <div
          className="workspace-page__card-surface"
          style={{ backgroundColor: cardColor(id) }}
        >
          {visual}
        </div>
      )}
      <span className="workspace-page__card-footer">{footer}</span>
    </li>
  );
}

/**
 * Appsmith Applications rail/section/card layout with Java dashboard items and
 * account-scoped draft metadata. The editor actions remain optional until its
 * separate runtime has been extracted and mounted by the route owner.
 */
export function WorkspacePage({
  onCreateDraft,
  onOpenDraft,
  onOpenItem,
}: WorkspacePageProps = {}): React.ReactElement {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.session.user);
  const workspace = useAppSelector((state) => state.workspace);
  const [searchDraft, setSearchDraft] = useState(workspace.search);
  const [createCallbackError, setCreateCallbackError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const request = dispatch(loadLocalDrafts({ accountId: user.id }));

    return () => request.abort();
  }, [dispatch, user?.id, workspace.refreshVersion]);

  useEffect(() => {
    if (!user || workspace.view !== "all") return;

    const request = dispatch(
      loadDashboardItems({
        cursor: workspace.cursor,
        search: workspace.search,
      }),
    );

    return () => request.abort();
  }, [
    dispatch,
    user?.id,
    workspace.view,
    workspace.cursor,
    workspace.search,
    workspace.refreshVersion,
  ]);

  const matchingDrafts = useMemo(() => {
    const term = workspace.search.trim().toLocaleLowerCase();

    return term
      ? workspace.drafts.filter((draft) =>
          draft.name.toLocaleLowerCase().includes(term),
        )
      : workspace.drafts;
  }, [workspace.drafts, workspace.search]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch(setWorkspaceSearch(searchDraft.trim()));
  }

  async function createDraft() {
    if (!onCreateDraft) return;

    setCreateCallbackError(null);

    try {
      await onCreateDraft();
    } catch (error) {
      setCreateCallbackError(
        error instanceof Error ? error.message : "Opening the new dashboard failed.",
      );
    }
  }

  const page = workspace.page;

  return (
    <ApplicationsShell
      sidebar={
        <div className="workspace-page__rail">
          <Text kind="heading-xs" renderAs="h2">
            Library
          </Text>
          <nav aria-label="Dashboard library">
            <button
              aria-current={workspace.view === "all" ? "page" : undefined}
              className="workspace-page__rail-item"
              onClick={() => dispatch(chooseWorkspaceView("all"))}
              type="button"
            >
              <span aria-hidden="true">▦</span>
              All dashboards
            </button>
            <button
              aria-current={workspace.view === "local" ? "page" : undefined}
              className="workspace-page__rail-item"
              onClick={() => dispatch(chooseWorkspaceView("local"))}
              type="button"
            >
              <span aria-hidden="true">▤</span>
              Local drafts
            </button>
          </nav>
        </div>
      }
    >
      <div className="workspace-page__heading">
        <div>
          <Text kind="heading-l" renderAs="h1">
            {workspace.view === "local" ? "Local drafts" : "Dashboards"}
          </Text>
          <p>
            {workspace.view === "local"
              ? "Your drafts saved in this browser."
              : "Your drafts and dashboard items from the marketplace."}
          </p>
        </div>
        <div className="workspace-page__heading-actions">
          <Button
            kind="secondary"
            onClick={() => window.location.assign("/workbench")}
          >
            Preview workbench
          </Button>
          {onCreateDraft && (
            <Button
              isDisabled={workspace.createStatus === "loading"}
              kind="primary"
              onClick={() => void createDraft()}
            >
              {workspace.createStatus === "loading" ? "Creating…" : "New dashboard"}
            </Button>
          )}
          <span className="workspace-page__account">{user?.username}</span>
        </div>
      </div>

      {(workspace.createError || createCallbackError) && (
        <div className="workspace-page__message" role="alert">
          <p>{workspace.createError || createCallbackError}</p>
        </div>
      )}

      <form className="workspace-page__search" onSubmit={submitSearch}>
        <SearchInput
          onChange={setSearchDraft}
          placeholder="Search dashboards"
          value={searchDraft}
        />
        <Button kind="primary" size="sm" type="submit">
          Search
        </Button>
        <Button
          kind="secondary"
          onClick={() => dispatch(refreshWorkspace())}
          size="sm"
          type="button"
        >
          Refresh
        </Button>
      </form>

      <section aria-labelledby="workspace-drafts-title" className="workspace-page__section">
        <div className="workspace-page__section-heading">
          <Text kind="heading-s" renderAs="h2" id="workspace-drafts-title">
            Local drafts
          </Text>
          <span>{matchingDrafts.length}</span>
        </div>
        {workspace.draftsStatus === "loading" && (
          <p role="status">Loading local drafts…</p>
        )}
        {workspace.draftsError && (
          <div className="workspace-page__message" role="alert">
            <p>{workspace.draftsError}</p>
            {user && (
              <Button
                kind="secondary"
                onClick={() => void dispatch(loadLocalDrafts({ accountId: user.id }))}
                size="sm"
              >
                Retry
              </Button>
            )}
          </div>
        )}
        {workspace.damagedDraftCount > 0 && (
          <p className="workspace-page__warning" role="alert">
            {workspace.damagedDraftCount} stored draft
            {workspace.damagedDraftCount === 1 ? "" : "s"} could not be read.
          </p>
        )}
        {workspace.draftsStatus === "succeeded" &&
          matchingDrafts.length === 0 && (
            <p className="workspace-page__empty">
              {workspace.search
                ? "No local drafts match this search."
                : "No local drafts yet."}
            </p>
          )}
        {matchingDrafts.length > 0 && (
          <ul className="workspace-page__cards">
            {matchingDrafts.map((draft) => (
              <DashboardCard
                footer={`Saved ${formatDate(draft.savedAt)} · revision ${draft.revision}`}
                id={draft.documentId}
                key={draft.documentId}
                name={draft.name}
                onOpen={onOpenDraft ? () => onOpenDraft(draft) : undefined}
              />
            ))}
          </ul>
        )}
      </section>

      {workspace.view === "all" && (
        <section
          aria-busy={workspace.itemsStatus === "loading"}
          aria-labelledby="workspace-marketplace-title"
          className="workspace-page__section"
        >
          <div className="workspace-page__section-heading">
            <Text kind="heading-s" renderAs="h2" id="workspace-marketplace-title">
              Marketplace dashboards
            </Text>
            {page && <span>{page.meta.totalItems}</span>}
          </div>
          {workspace.itemsStatus === "loading" && (
            <p role="status">Loading dashboards…</p>
          )}
          {workspace.itemsError && (
            <div className="workspace-page__message" role="alert">
              <p>{workspace.itemsError}</p>
              <Button
                kind="secondary"
                onClick={() => dispatch(refreshWorkspace())}
                size="sm"
              >
                Retry
              </Button>
            </div>
          )}
          {workspace.itemsStatus === "succeeded" && page?.data.length === 0 && (
            <p className="workspace-page__empty">
              No marketplace dashboards match this search.
            </p>
          )}
          {workspace.itemsStatus === "succeeded" && page && page.data.length > 0 && (
            <>
              <ul className="workspace-page__cards">
                {page.data.map((item) => (
                  <DashboardCard
                    footer={item.publisherUsername || "Marketplace"}
                    id={`marketplace-${item.id}`}
                    key={item.id}
                    name={item.name}
                    onOpen={onOpenItem ? () => onOpenItem(item) : undefined}
                  />
                ))}
              </ul>
              {(page.meta.previousCursor !== null ||
                page.meta.nextCursor !== null) && (
                <nav aria-label="Dashboard pages" className="workspace-page__pages">
                  <Button
                    isDisabled={page.meta.previousCursor === null}
                    kind="secondary"
                    onClick={() =>
                      dispatch(setWorkspaceCursor(page.meta.previousCursor ?? undefined))
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
                      dispatch(setWorkspaceCursor(page.meta.nextCursor ?? undefined))
                    }
                    size="sm"
                  >
                    Next
                  </Button>
                </nav>
              )}
            </>
          )}
        </section>
      )}
    </ApplicationsShell>
  );
}
