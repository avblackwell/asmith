import {
  parseDashboardDocument,
  serializeDashboardDocument,
} from "../document";
import type { DashboardDocument } from "../document";
import type { MarketplaceClient, MarketplaceItem } from "../marketplace";

export class MarketplaceItemTypeError extends Error {
  constructor(itemId: number, actualType: string) {
    super(`Marketplace item ${itemId} is ${actualType}, not a dashboard`);
    this.name = "MarketplaceItemTypeError";
  }
}

export interface DownloadedDashboard {
  document: DashboardDocument;
  metadata: MarketplaceItem;
}

export interface NewDashboardPublication {
  document: unknown;
  description: string;
  thumbnail: Blob;
  /** Defaults to the validated document name. */
  name?: string;
}

export interface DashboardReplacement {
  document: unknown;
  /** Omitted fields retain the existing marketplace metadata. */
  name?: string;
  description?: string;
}

/**
 * Explicit marketplace publication boundary. Local drafts must be saved through
 * the draft store; this repository only runs when a user requests publication.
 */
export class DashboardMarketplaceRepository {
  constructor(private readonly marketplace: MarketplaceClient) {}

  async downloadDashboard(
    itemId: number,
    signal?: AbortSignal,
  ): Promise<DownloadedDashboard> {
    const { content, metadata } = await this.marketplace.downloadItem(
      itemId,
      signal,
    );

    this.assertDashboard(metadata);
    const document = parseDashboardDocument(JSON.parse(await content.text()));

    return { document, metadata };
  }

  async publishNewDashboard(
    publication: NewDashboardPublication,
    signal?: AbortSignal,
  ): Promise<MarketplaceItem> {
    const document = parseDashboardDocument(publication.document);
    const content = this.toContentBlob(document);

    return this.marketplace.createItem(
      {
        name: publication.name ?? document.name,
        description: publication.description,
        type: "dashboard",
        content,
        thumbnail: publication.thumbnail,
      },
      signal,
    );
  }

  /** Replaces the shared item's bytes in place. The backend has no conflict token. */
  async replacePublishedDashboard(
    itemId: number,
    replacement: DashboardReplacement,
    signal?: AbortSignal,
  ): Promise<void> {
    const document = parseDashboardDocument(replacement.document);
    const content = this.toContentBlob(document);
    const existing = await this.marketplace.getItem(itemId, signal);

    this.assertDashboard(existing);
    await this.marketplace.updateItem(
      itemId,
      {
        name: replacement.name ?? existing.name,
        description: replacement.description ?? existing.description,
        typeId: existing.typeId,
        content,
      },
      signal,
    );
  }

  private toContentBlob(document: DashboardDocument): Blob {
    return new Blob([serializeDashboardDocument(document)], {
      type: "application/json",
    });
  }

  private assertDashboard(item: MarketplaceItem): void {
    if (item.type !== "dashboard") {
      throw new MarketplaceItemTypeError(item.id, item.type);
    }
  }
}
