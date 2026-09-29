import type {
  MarketplaceClient,
  MarketplaceItem,
  MarketplacePage,
  MarketplaceQuery,
} from "../marketplace";
import {
  importThemeAssetJson,
  parseThemeAsset,
  serializeThemeAsset,
} from "./ThemeAsset";
import type { ThemeAsset } from "./ThemeAsset";

export class MarketplaceThemeTypeError extends Error {
  constructor(itemId: number, actualType: string) {
    super(`Marketplace item ${itemId} is ${actualType}, not a theme`);
    this.name = "MarketplaceThemeTypeError";
  }
}

export interface DownloadedTheme {
  asset: ThemeAsset;
  metadata: MarketplaceItem;
}

export interface NewThemePublication {
  asset: unknown;
  description: string;
  thumbnail: Blob;
  /** Defaults to the validated asset name. */
  name?: string;
}

export interface ThemeReplacement {
  asset: unknown;
  /** Omitted fields retain the existing marketplace metadata. */
  name?: string;
  description?: string;
}

/** Explicit browse, download, and publish boundary for theme items. */
export class ThemeMarketplaceRepository {
  constructor(private readonly marketplace: MarketplaceClient) {}

  async listThemes(
    query: MarketplaceQuery = {},
    signal?: AbortSignal,
  ): Promise<MarketplacePage<MarketplaceItem>> {
    return this.marketplace.listItems(
      {
        ...query,
        filters: [
          ...(query.filters ?? []).filter(({ field }) => field !== "type"),
          { field: "type", value: "theme" },
        ],
      },
      signal,
    );
  }

  async downloadTheme(
    itemId: number,
    signal?: AbortSignal,
  ): Promise<DownloadedTheme> {
    const { content, metadata } = await this.marketplace.downloadItem(
      itemId,
      signal,
    );

    this.assertTheme(metadata);

    return {
      asset: importThemeAssetJson(await content.text()),
      metadata,
    };
  }

  async publishNewTheme(
    publication: NewThemePublication,
    signal?: AbortSignal,
  ): Promise<MarketplaceItem> {
    const asset = parseThemeAsset(publication.asset);

    return this.marketplace.createItem(
      {
        name: publication.name ?? asset.name,
        description: publication.description,
        type: "theme",
        content: this.toContentBlob(asset),
        thumbnail: publication.thumbnail,
      },
      signal,
    );
  }

  /** Replaces existing bytes in place; the backend has no conflict token. */
  async replacePublishedTheme(
    itemId: number,
    replacement: ThemeReplacement,
    signal?: AbortSignal,
  ): Promise<void> {
    const asset = parseThemeAsset(replacement.asset);
    const existing = await this.marketplace.getItem(itemId, signal);

    this.assertTheme(existing);

    await this.marketplace.updateItem(
      itemId,
      {
        name: replacement.name ?? existing.name,
        description: replacement.description ?? existing.description,
        typeId: existing.typeId,
        content: this.toContentBlob(asset),
      },
      signal,
    );
  }

  private toContentBlob(asset: ThemeAsset): Blob {
    return new Blob([serializeThemeAsset(asset)], {
      type: "application/json",
    });
  }

  private assertTheme(item: MarketplaceItem): void {
    if (item.type !== "theme") {
      throw new MarketplaceThemeTypeError(item.id, item.type);
    }
  }
}
