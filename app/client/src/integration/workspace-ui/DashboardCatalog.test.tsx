import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import type { ReactTestInstance, ReactTestRenderer } from "react-test-renderer";
import {
  createBlankDashboardDocument,
  exampleDashboardDocument,
} from "../document";
import type { DraftRecord } from "../drafts";
import { MarketplaceHttpError } from "../marketplace";
import type {
  MarketplaceItem,
  MarketplacePage,
  MarketplaceUser,
} from "../marketplace";
import type { LocalDashboardResult, OpenDashboardResult } from "../workspace";
import { DashboardCatalog } from "./DashboardCatalog";
import type { DashboardCatalogWorkspace } from "./DashboardCatalog";

const user: MarketplaceUser = {
  id: 11,
  username: "operator@example.com",
  isSystemAdmin: false,
  groupMemberships: [],
};
const openedUser: MarketplaceUser = {
  ...user,
  id: 22,
  username: "other@example.com",
};

const item: MarketplaceItem = {
  id: 7,
  name: "Engine overview",
  description: "Engine metrics and status",
  typeId: 2,
  type: "dashboard",
  tags: [],
  publisherId: 3,
  publisherUsername: "publisher",
  createdAt: 0,
  updatedAt: 0,
  publishedAt: null,
  downloadCount: 0,
  rating: null,
  ratingCount: 0,
  thumbnailUrl: "",
  previewImages: [],
};

function page(
  items: MarketplaceItem[],
  previousCursor: number | null = null,
  nextCursor: number | null = null,
): MarketplacePage<MarketplaceItem> {
  return {
    data: items,
    meta: {
      cursor: 0,
      previousCursor,
      nextCursor,
      pageSize: 12,
      currentPage: previousCursor === null ? 1 : 2,
      totalPages: nextCursor === null && previousCursor === null ? 1 : 2,
      totalItems: items.length,
      sorts: null,
      filters: null,
    },
  };
}

function makeWorkspace() {
  const authenticate = jest.fn().mockResolvedValue(user);
  const listDashboardItems = jest.fn().mockResolvedValue(page([item]));
  const opened: OpenDashboardResult = {
    source: "local",
    document: exampleDashboardDocument,
    marketplace: { document: exampleDashboardDocument, metadata: item },
    localDraft: null,
    user: openedUser,
  };
  const openDashboard = jest.fn().mockResolvedValue(opened);
  const document = createBlankDashboardDocument("draft-1");
  const localDraft: DraftRecord = {
    key: JSON.stringify(["deployment-a", String(user.id), document.documentId]),
    deploymentId: "deployment-a",
    accountId: String(user.id),
    documentId: document.documentId,
    revision: 1,
    savedAt: "2026-09-28T00:00:00.000Z",
    document,
    history: [],
  };
  const local: LocalDashboardResult = { user, document, localDraft };
  const listLocalDashboards = jest
    .fn()
    .mockResolvedValue({ drafts: [], errors: [] });
  const createNewDashboard = jest.fn().mockResolvedValue(local);
  const openLocalDashboard = jest.fn().mockResolvedValue(local);
  const workspace: DashboardCatalogWorkspace = {
    authenticate,
    listDashboardItems,
    openDashboard,
    listLocalDashboards,
    createNewDashboard,
    openLocalDashboard,
  };

  return {
    workspace,
    authenticate,
    listDashboardItems,
    openDashboard,
    listLocalDashboards,
    createNewDashboard,
    openLocalDashboard,
    opened,
    local,
  };
}

async function renderCatalog(
  workspace: DashboardCatalogWorkspace,
  onOpen = jest.fn(),
  onOpenLocal = jest.fn(),
): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | undefined;

  await act(async () => {
    renderer = TestRenderer.create(
      <DashboardCatalog
        onOpen={onOpen}
        onOpenLocal={onOpenLocal}
        workspace={workspace}
      />,
    );
  });

  if (!renderer) throw new Error("The catalog did not render");

  return renderer;
}

function button(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  const found = renderer.root
    .findAll((node) => node.type === "button")
    .find((candidate) => {
      return (
        candidate.props["aria-label"] === label ||
        candidate.props.children === label
      );
    });

  if (!found) throw new Error(`Missing button: ${label}`);

  return found;
}

function visibleText(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

describe("DashboardCatalog", () => {
  it("loads the signed-in account and passes the opened account and source to the editor", async () => {
    const {
      authenticate,
      listDashboardItems,
      openDashboard,
      opened,
      workspace,
    } = makeWorkspace();
    const onOpen = jest.fn();
    const renderer = await renderCatalog(workspace, onOpen);

    expect(visibleText(renderer)).toContain("Engine overview");
    expect(visibleText(renderer)).toContain("operator@example.com");
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(listDashboardItems).toHaveBeenCalledWith(
      { cursor: undefined, limit: 12, search: undefined },
      expect.any(AbortSignal),
    );
    const viewLink = renderer.root
      .findAll((node) => node.type === "a")
      .find(
        (node) => node.props["aria-label"] === "View dashboard Engine overview",
      );

    expect(viewLink?.props.href).toBe("/view?itemId=7");
    expect(openDashboard).not.toHaveBeenCalled();

    await act(async () => {
      button(renderer, "Open dashboard Engine overview").props.onClick();
    });

    expect(openDashboard).toHaveBeenCalledWith(7, expect.any(AbortSignal));
    expect(onOpen).toHaveBeenCalledWith(opened, openedUser);
    expect(visibleText(renderer)).toContain("Local draft");
  });

  it("creates a private draft and opens an existing local draft", async () => {
    const {
      createNewDashboard,
      listLocalDashboards,
      local,
      openLocalDashboard,
      workspace,
    } = makeWorkspace();
    const onOpenLocal = jest.fn();

    listLocalDashboards.mockResolvedValue({
      drafts: [local.localDraft],
      errors: [],
    });
    const renderer = await renderCatalog(workspace, jest.fn(), onOpenLocal);

    expect(listLocalDashboards).toHaveBeenCalledWith(user);
    expect(visibleText(renderer)).toContain("independent local copies");
    await act(async () => {
      button(renderer, "New dashboard").props.onClick();
    });
    expect(createNewDashboard).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(onOpenLocal).toHaveBeenCalledWith(local);

    await act(async () => {
      button(renderer, "Open local draft Untitled dashboard").props.onClick();
    });
    expect(openLocalDashboard).toHaveBeenCalledWith(
      "draft-1",
      expect.any(AbortSignal),
    );
    expect(onOpenLocal).toHaveBeenCalledTimes(2);
  });

  it("shows an empty result and submits a trimmed search query", async () => {
    const { listDashboardItems, workspace } = makeWorkspace();

    listDashboardItems.mockResolvedValue(page([]));
    const renderer = await renderCatalog(workspace);

    expect(visibleText(renderer)).toContain("No dashboards are available");
    await act(async () => {
      renderer.root
        .find((node) => node.type === "input")
        .props.onChange({
          target: { value: "  engine  " },
        });
    });
    await act(async () => {
      renderer.root
        .find((node) => node.type === "form")
        .props.onSubmit({
          preventDefault: jest.fn(),
        });
    });

    expect(visibleText(renderer)).toContain("No dashboards match “engine”");
    expect(listDashboardItems).toHaveBeenLastCalledWith(
      { cursor: undefined, limit: 12, search: "engine" },
      expect.any(AbortSignal),
    );
  });

  it("shows an authentication error and can retry", async () => {
    const { authenticate, workspace } = makeWorkspace();

    authenticate
      .mockRejectedValueOnce(
        new MarketplaceHttpError(401, "/system/userInfo", ""),
      )
      .mockResolvedValue(user);
    const renderer = await renderCatalog(workspace);

    expect(visibleText(renderer)).toContain("session has expired");
    await act(async () => {
      button(renderer, "Retry").props.onClick();
    });

    expect(visibleText(renderer)).toContain("Engine overview");
    expect(authenticate).toHaveBeenCalledTimes(2);
  });

  it("labels the marketplace copy when no local draft was selected", async () => {
    const { openDashboard, opened, workspace } = makeWorkspace();

    openDashboard.mockResolvedValue({ ...opened, source: "marketplace" });
    const renderer = await renderCatalog(workspace);

    await act(async () => {
      button(renderer, "Open dashboard Engine overview").props.onClick();
    });

    // react-test-renderer's findByProps is synchronous.
    // eslint-disable-next-line testing-library/await-async-queries
    const source = renderer.root.findByProps({
      className: "dashboard-catalog__source",
    });

    expect(source.props.children).toEqual(["Opened from ", "Marketplace"]);
  });

  it("uses backend cursors to move between pages", async () => {
    const { listDashboardItems, workspace } = makeWorkspace();
    const other = { ...item, id: 8, name: "Cooling overview" };

    listDashboardItems.mockImplementation(async ({ cursor }) =>
      cursor === 20 ? page([other], 0, null) : page([item], null, 20),
    );
    const renderer = await renderCatalog(workspace);

    expect(visibleText(renderer)).toContain("Engine overview");
    await act(async () => {
      button(renderer, "Next").props.onClick();
    });

    expect(visibleText(renderer)).toContain("Cooling overview");
    expect(listDashboardItems).toHaveBeenLastCalledWith(
      { cursor: 20, limit: 12, search: undefined },
      expect.any(AbortSignal),
    );
    await act(async () => {
      button(renderer, "Previous").props.onClick();
    });
    expect(visibleText(renderer)).toContain("Engine overview");
  });
});
