/** @jest-environment node */

import {
  DashboardDocumentValidationError,
  exampleDashboardDocument,
  serializeDashboardDocument,
} from "../document";
import type { MarketplaceClient, MarketplaceItem } from "../marketplace";
import {
  DashboardMarketplaceRepository,
  MarketplaceItemTypeError,
} from "./DashboardMarketplaceRepository";

const dashboardItem: MarketplaceItem = {
  id: 7,
  name: "Published name",
  description: "Published description",
  typeId: 2,
  type: "dashboard",
  tags: [],
  publisherId: 4,
  publisherUsername: "editor@example.com",
  createdAt: 1000,
  updatedAt: 1000,
  publishedAt: null,
  downloadCount: 0,
  rating: null,
  ratingCount: 0,
  thumbnailUrl: "",
  previewImages: [],
};

describe("DashboardMarketplaceRepository", () => {
  const downloadItem = jest.fn();
  const createItem = jest.fn();
  const getItem = jest.fn();
  const updateItem = jest.fn();
  const marketplace = {
    downloadItem,
    createItem,
    getItem,
    updateItem,
  } as unknown as MarketplaceClient;
  const repository = new DashboardMarketplaceRepository(marketplace);

  beforeEach(() => {
    downloadItem.mockReset();
    createItem.mockReset();
    getItem.mockReset();
    updateItem.mockReset();
  });

  it("downloads and validates a dashboard document", async () => {
    downloadItem.mockResolvedValue({
      metadata: dashboardItem,
      content: new Blob([serializeDashboardDocument(exampleDashboardDocument)]),
    });

    await expect(repository.downloadDashboard(7)).resolves.toEqual({
      document: exampleDashboardDocument,
      metadata: dashboardItem,
    });
    expect(downloadItem).toHaveBeenCalledWith(7, undefined);
  });

  it("rejects content that violates the dashboard package contract", async () => {
    downloadItem.mockResolvedValue({
      metadata: dashboardItem,
      content: new Blob([JSON.stringify({ assetKind: "component" })]),
    });

    await expect(repository.downloadDashboard(7)).rejects.toBeInstanceOf(
      DashboardDocumentValidationError,
    );
  });

  it("publishes a new item with serialized content and a required thumbnail", async () => {
    const thumbnail = new Blob(["image"], { type: "image/png" });

    createItem.mockResolvedValue(dashboardItem);
    await expect(
      repository.publishNewDashboard({
        document: exampleDashboardDocument,
        description: "Published description",
        thumbnail,
      }),
    ).resolves.toEqual(dashboardItem);

    const [created, signal] = createItem.mock.calls[0];

    expect(signal).toBeUndefined();
    expect(created.name).toBe(exampleDashboardDocument.name);
    expect(created.description).toBe("Published description");
    expect(created.type).toBe("dashboard");
    expect(created.thumbnail).toBe(thumbnail);
    expect(created.content.type).toBe("application/json");
    expect(JSON.parse(await created.content.text())).toEqual(
      exampleDashboardDocument,
    );
  });

  it("replaces an existing dashboard using its typeId and existing metadata", async () => {
    getItem.mockResolvedValue(dashboardItem);
    updateItem.mockResolvedValue(undefined);

    await repository.replacePublishedDashboard(7, {
      document: exampleDashboardDocument,
    });

    expect(getItem).toHaveBeenCalledWith(7, undefined);
    expect(updateItem).toHaveBeenCalledTimes(1);
    const [id, replacement] = updateItem.mock.calls[0];

    expect(id).toBe(7);
    expect(replacement.name).toBe(dashboardItem.name);
    expect(replacement.description).toBe(dashboardItem.description);
    expect(replacement.typeId).toBe(dashboardItem.typeId);
    expect(replacement.thumbnail).toBeUndefined();
    expect(JSON.parse(await replacement.content.text())).toEqual(
      exampleDashboardDocument,
    );
  });

  it("does not overwrite another item type or publish an invalid document", async () => {
    getItem.mockResolvedValue({ ...dashboardItem, type: "component" });

    await expect(
      repository.replacePublishedDashboard(7, {
        document: exampleDashboardDocument,
      }),
    ).rejects.toBeInstanceOf(MarketplaceItemTypeError);
    expect(updateItem).not.toHaveBeenCalled();

    await expect(
      repository.publishNewDashboard({
        document: { assetKind: "component" },
        description: "invalid",
        thumbnail: new Blob(["image"]),
      }),
    ).rejects.toBeInstanceOf(DashboardDocumentValidationError);
    expect(createItem).not.toHaveBeenCalled();
  });
});
