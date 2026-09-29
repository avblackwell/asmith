import { parseDashboardDocument } from "../document";
import type { DashboardDocument, MarketplaceDashboardTheme } from "../document";
import type { MarketplaceItem } from "./types";
import type { DownloadedMarketplaceItem } from "./marketplace";
import { applyThemeAsset, parseThemeAsset, type ThemeAsset } from "./themeAsset";

/** Adapted from app/client/src/integration/publishing/DashboardMarketplaceRepository.ts
 * and app/client/src/integration/viewer-entry/index.tsx (Apache-2.0).
 */
export interface MarketplaceDownloadApi {
  downloadItem(id: number, signal?: AbortSignal): Promise<DownloadedMarketplaceItem>;
}

export interface PublishedDashboard {
  document: DashboardDocument;
  metadata: MarketplaceItem;
}

export class MarketplaceItemTypeError extends Error {
  constructor(itemId: number, actualType: string, expectedType: string) {
    super(`Marketplace item ${itemId} is ${actualType}, not a ${expectedType}`);
    this.name = "MarketplaceItemTypeError";
  }
}

export class MarketplaceContentError extends Error {
  constructor(itemId: number, assetType: string, message: string) {
    super(`Marketplace ${assetType} ${itemId} content is invalid: ${message}`);
    this.name = "MarketplaceContentError";
  }
}

function parseJson(content: Blob, itemId: number, assetType: string): Promise<unknown> {
  return content.text().then((raw) => {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new MarketplaceContentError(itemId, assetType, "expected JSON");
    }
  });
}

function themeItemId(raw: string): number {
  const id = Number(raw);

  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(id)) {
    throw new TypeError("Referenced theme item ID must be a positive safe integer");
  }

  return id;
}

/** The editor and published viewer resolve the same current Marketplace bytes. */
export async function downloadReferencedThemeAsset(
  reference: MarketplaceDashboardTheme,
  marketplace: MarketplaceDownloadApi,
  signal?: AbortSignal,
): Promise<ThemeAsset> {
  const id = themeItemId(reference.itemId);
  const theme = await marketplace.downloadItem(id, signal);

  if (theme.metadata.type !== "theme") {
    throw new MarketplaceItemTypeError(id, theme.metadata.type, "theme");
  }

  // Java replacement overwrites bytes in place. The saved revision is
  // descriptive; this backend cannot fetch an immutable pinned revision.
  return parseThemeAsset(await parseJson(theme.content, id, "theme"));
}

/** Loads marketplace bytes directly; it never reads or modifies local drafts. */
export class PublishedDashboardRepository {
  constructor(private readonly marketplace: MarketplaceDownloadApi) {}

  async load(itemId: number, signal?: AbortSignal): Promise<PublishedDashboard> {
    const dashboard = await this.marketplace.downloadItem(itemId, signal);

    if (dashboard.metadata.type !== "dashboard") {
      throw new MarketplaceItemTypeError(
        itemId,
        dashboard.metadata.type,
        "dashboard",
      );
    }

    let document = parseDashboardDocument(
      await parseJson(dashboard.content, itemId, "dashboard"),
    );

    if (document.theme.kind === "marketplace") {
      const asset = await downloadReferencedThemeAsset(
        document.theme, this.marketplace, signal,
      );
      document = applyThemeAsset(document, asset);
    }

    return { document, metadata: dashboard.metadata };
  }
}
