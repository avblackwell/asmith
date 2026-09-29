/** @jest-environment node */

import type { MarketplaceClient, MarketplaceItem } from "../marketplace";
import {
  MarketplaceThemeTypeError,
  ThemeMarketplaceRepository,
} from "./ThemeMarketplaceRepository";
import { ThemeAssetValidationError } from "./ThemeAsset";

const themeItem: MarketplaceItem = {
  id: 43,
  name: "Published theme",
  description: "Shared theme",
  typeId: 3,
  type: "theme",
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

const asset = {
  assetKind: "theme",
  schemaVersion: 1,
  name: "Night shift",
  properties: {
    colors: { primaryColor: "#1731b0", backgroundColor: "#101820" },
    borderRadius: { appBorderRadius: "0.5rem" },
    boxShadow: { appBoxShadow: "none" },
    fontFamily: { appFont: "Inter" },
  },
};

describe("ThemeMarketplaceRepository", () => {
  const listItems = jest.fn();
  const downloadItem = jest.fn();
  const createItem = jest.fn();
  const getItem = jest.fn();
  const updateItem = jest.fn();
  const marketplace = {
    listItems,
    downloadItem,
    createItem,
    getItem,
    updateItem,
  } as unknown as MarketplaceClient;
  const repository = new ThemeMarketplaceRepository(marketplace);

  beforeEach(() => {
    listItems.mockReset();
    downloadItem.mockReset();
    createItem.mockReset();
    getItem.mockReset();
    updateItem.mockReset();
  });

  it("browses the theme type while preserving search and other filters", async () => {
    const page = { data: [themeItem], meta: {} };

    listItems.mockResolvedValue(page);

    await expect(
      repository.listThemes({
        search: "night",
        filters: [
          { field: "publisherId", value: "4" },
          { field: "type", value: "dashboard" },
        ],
      }),
    ).resolves.toBe(page);
    expect(listItems).toHaveBeenCalledWith(
      {
        search: "night",
        filters: [
          { field: "publisherId", value: "4" },
          { field: "type", value: "theme" },
        ],
      },
      undefined,
    );
  });

  it("downloads only a valid theme item and package", async () => {
    downloadItem.mockResolvedValue({
      metadata: themeItem,
      content: new Blob([JSON.stringify(asset)]),
    });

    await expect(repository.downloadTheme(43)).resolves.toEqual({
      asset,
      metadata: themeItem,
    });

    downloadItem.mockResolvedValue({
      metadata: { ...themeItem, type: "dashboard" },
      content: new Blob([JSON.stringify(asset)]),
    });

    await expect(repository.downloadTheme(43)).rejects.toBeInstanceOf(
      MarketplaceThemeTypeError,
    );

    downloadItem.mockResolvedValue({
      metadata: themeItem,
      content: new Blob(["not JSON"]),
    });

    await expect(repository.downloadTheme(43)).rejects.toBeInstanceOf(
      ThemeAssetValidationError,
    );
  });

  it("creates a new theme with a required thumbnail", async () => {
    const thumbnail = new Blob(["image"], { type: "image/png" });

    createItem.mockResolvedValue(themeItem);
    await expect(
      repository.publishNewTheme({
        asset,
        description: "Shared theme",
        thumbnail,
      }),
    ).resolves.toEqual(themeItem);

    const [created, signal] = createItem.mock.calls[0];

    expect(signal).toBeUndefined();
    expect(created.name).toBe(asset.name);
    expect(created.type).toBe("theme");
    expect(created.thumbnail).toBe(thumbnail);
    expect(created.content.type).toBe("application/json");
    expect(JSON.parse(await created.content.text())).toEqual(asset);
  });

  it("replaces a theme using the existing typeId and metadata", async () => {
    getItem.mockResolvedValue(themeItem);
    updateItem.mockResolvedValue(undefined);

    await repository.replacePublishedTheme(43, { asset });

    const [id, replacement, signal] = updateItem.mock.calls[0];

    expect(id).toBe(43);
    expect(signal).toBeUndefined();
    expect(replacement.name).toBe(themeItem.name);
    expect(replacement.description).toBe(themeItem.description);
    expect(replacement.typeId).toBe(themeItem.typeId);
    expect(replacement.thumbnail).toBeUndefined();
    expect(JSON.parse(await replacement.content.text())).toEqual(asset);
  });

  it("does not publish invalid content or overwrite another item type", async () => {
    await expect(
      repository.publishNewTheme({
        asset: { ...asset, assetKind: "dashboard" },
        description: "invalid",
        thumbnail: new Blob(["image"]),
      }),
    ).rejects.toBeInstanceOf(ThemeAssetValidationError);
    expect(createItem).not.toHaveBeenCalled();

    getItem.mockResolvedValue({ ...themeItem, type: "component" });

    await expect(
      repository.replacePublishedTheme(43, { asset }),
    ).rejects.toBeInstanceOf(MarketplaceThemeTypeError);
    expect(updateItem).not.toHaveBeenCalled();
  });
});
