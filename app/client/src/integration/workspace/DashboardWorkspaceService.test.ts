/** @jest-environment node */

import { exampleDashboardDocument } from "../document";
import type { DashboardDocument } from "../document";
import type { DraftRecord, IndexedDbDraftStore } from "../drafts";
import type { MarketplaceClient, MarketplaceItem } from "../marketplace";
import type { DashboardMarketplaceRepository } from "../publishing";
import { DashboardWorkspaceService } from "./DashboardWorkspaceService";

const marketplaceItem = {
  id: 7,
  name: "Engine overview",
  description: "Published",
  typeId: 2,
  type: "dashboard",
} as MarketplaceItem;

const user = (id: number) => ({
  id,
  username: `user-${id}@example.com`,
  isSystemAdmin: false,
  groupMemberships: [],
});

function draft(accountId: string, document: DashboardDocument): DraftRecord {
  return {
    key: JSON.stringify(["deployment-a", accountId, document.documentId]),
    deploymentId: "deployment-a",
    accountId,
    documentId: document.documentId,
    revision: 3,
    savedAt: "2026-09-28T00:00:00.000Z",
    document,
    history: [],
  };
}

describe("DashboardWorkspaceService", () => {
  const getCurrentUser = jest.fn();
  const listItems = jest.fn();
  const marketplace = {
    getCurrentUser,
    listItems,
  } as unknown as MarketplaceClient;
  const load = jest.fn();
  const list = jest.fn();
  const save = jest.fn();
  const drafts = { load, list, save } as unknown as IndexedDbDraftStore;
  const downloadDashboard = jest.fn();
  const publishNewDashboard = jest.fn();
  const replacePublishedDashboard = jest.fn();
  const publishing = {
    downloadDashboard,
    publishNewDashboard,
    replacePublishedDashboard,
  } as unknown as DashboardMarketplaceRepository;
  const workspace = new DashboardWorkspaceService({
    deploymentId: "deployment-a",
    marketplace,
    drafts,
    publishing,
  });

  beforeEach(() => {
    getCurrentUser.mockReset();
    listItems.mockReset();
    load.mockReset();
    list.mockReset();
    save.mockReset();
    downloadDashboard.mockReset();
    publishNewDashboard.mockReset();
    replacePublishedDashboard.mockReset();
  });

  it("requires a configured stable deployment ID", () => {
    expect(
      () =>
        new DashboardWorkspaceService({
          deploymentId: "   ",
          marketplace,
          drafts,
          publishing,
        }),
    ).toThrow("A stable deploymentId is required");
  });

  it("lists dashboard items using the backend type filter", async () => {
    const page = { data: [marketplaceItem], meta: { totalItems: 1 } };

    listItems.mockResolvedValue(page);
    await expect(
      workspace.listDashboardItems({
        search: "engine",
        filters: [
          { field: "type", value: "component" },
          { field: "tags", value: "4" },
        ],
      }),
    ).resolves.toBe(page);
    expect(listItems).toHaveBeenCalledWith(
      {
        search: "engine",
        filters: [
          { field: "tags", value: "4" },
          { field: "type", value: "dashboard" },
        ],
      },
      undefined,
    );
  });

  it("prefers the current account's local copy after validating download", async () => {
    const localDocument = {
      ...exampleDashboardDocument,
      name: "Unsaved local edits",
    };
    const local = draft("11", localDocument);
    const shared = {
      document: exampleDashboardDocument,
      metadata: marketplaceItem,
    };

    getCurrentUser.mockResolvedValue(user(11));
    downloadDashboard.mockResolvedValue(shared);
    load.mockResolvedValueOnce(local).mockResolvedValueOnce(null);

    const openedLocal = await workspace.openDashboard(7);

    expect(openedLocal).toEqual({
      user: user(11),
      source: "local",
      document: localDocument,
      marketplace: shared,
      localDraft: local,
    });
    expect(load).toHaveBeenCalledWith({
      deploymentId: "deployment-a",
      accountId: "11",
      documentId: exampleDashboardDocument.documentId,
    });

    const openedShared = await workspace.openDashboard(7);

    expect(openedShared.source).toBe("marketplace");
    expect(openedShared.document).toBe(exampleDashboardDocument);
    expect(openedShared.localDraft).toBeNull();
    expect(publishNewDashboard).not.toHaveBeenCalled();
    expect(replacePublishedDashboard).not.toHaveBeenCalled();
  });

  it("creates a validated blank dashboard as a private first revision", async () => {
    getCurrentUser.mockResolvedValue(user(11));
    save.mockImplementation(async (scope, document) =>
      Promise.resolve({ ...draft(scope.accountId, document), revision: 1 }),
    );

    const created = await workspace.createNewDashboard();

    expect(created.user).toEqual(user(11));
    expect(created.localDraft.revision).toBe(1);
    expect(created.document.documentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(created.document.name).toBe("Untitled dashboard");
    expect(created.document.layout.dsl.children).toHaveLength(1);
    expect(created.document.layout.dsl.children?.[0].type).toBe("TEXT_WIDGET");
    expect(created.document.variables).toEqual([]);
    expect(created.document.bindings).toEqual([]);
    expect(save).toHaveBeenCalledWith(
      {
        deploymentId: "deployment-a",
        accountId: "11",
        documentId: created.document.documentId,
      },
      created.document,
      null,
    );
    expect(downloadDashboard).not.toHaveBeenCalled();
    expect(publishNewDashboard).not.toHaveBeenCalled();
  });

  it("lists and reopens only the current account's local drafts", async () => {
    const local = draft("11", exampleDashboardDocument);

    list.mockResolvedValue({ drafts: [local], errors: [] });
    getCurrentUser.mockResolvedValue(user(11));
    load.mockResolvedValueOnce(local).mockResolvedValueOnce(null);

    await expect(workspace.listLocalDashboards(user(11))).resolves.toEqual({
      drafts: [local],
      errors: [],
    });
    expect(list).toHaveBeenCalledWith("deployment-a", "11");
    await expect(
      workspace.openLocalDashboard(exampleDashboardDocument.documentId),
    ).resolves.toEqual({
      user: user(11),
      document: exampleDashboardDocument,
      localDraft: local,
    });
    expect(load).toHaveBeenCalledWith({
      deploymentId: "deployment-a",
      accountId: "11",
      documentId: exampleDashboardDocument.documentId,
    });
    await expect(workspace.openLocalDashboard("missing")).rejects.toThrow(
      "Local dashboard draft was not found",
    );
    expect(downloadDashboard).not.toHaveBeenCalled();
  });

  it("scopes local saves to the active account and forwards expected revision", async () => {
    getCurrentUser
      .mockResolvedValueOnce(user(11))
      .mockResolvedValueOnce(user(22));
    save.mockImplementation(async (scope, document) =>
      Promise.resolve(draft(scope.accountId, document)),
    );

    await workspace.saveLocally(exampleDashboardDocument, null);
    await workspace.saveLocally(exampleDashboardDocument, 3);

    expect(save.mock.calls[0]).toEqual([
      {
        deploymentId: "deployment-a",
        accountId: "11",
        documentId: exampleDashboardDocument.documentId,
      },
      exampleDashboardDocument,
      null,
    ]);
    expect(save.mock.calls[1]).toEqual([
      {
        deploymentId: "deployment-a",
        accountId: "22",
        documentId: exampleDashboardDocument.documentId,
      },
      exampleDashboardDocument,
      3,
    ]);
    expect(publishNewDashboard).not.toHaveBeenCalled();
    expect(replacePublishedDashboard).not.toHaveBeenCalled();
  });

  it("keeps create and replacement publication as separate explicit calls", async () => {
    const thumbnail = new Blob(["image"], { type: "image/png" });
    const publication = {
      document: exampleDashboardDocument,
      description: "Published",
      thumbnail,
    };
    const replacement = { document: exampleDashboardDocument };

    publishNewDashboard.mockResolvedValue(marketplaceItem);
    replacePublishedDashboard.mockResolvedValue(undefined);

    await expect(workspace.publishNewDashboard(publication)).resolves.toBe(
      marketplaceItem,
    );
    await workspace.replacePublishedDashboard(7, replacement);

    expect(publishNewDashboard).toHaveBeenCalledWith(publication, undefined);
    expect(replacePublishedDashboard).toHaveBeenCalledWith(
      7,
      replacement,
      undefined,
    );
    expect(save).not.toHaveBeenCalled();
  });
});
