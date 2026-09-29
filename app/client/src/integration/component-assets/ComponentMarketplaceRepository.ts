import type {
  MarketplaceClient,
  MarketplaceItem,
  MarketplacePage,
  MarketplaceQuery,
} from "../marketplace";
import {
  parseComponentPackage,
  serializeComponentPackage,
} from "./componentPackage";
import {
  componentContentSha256,
  installDownloadedComponent,
  type DownloadedComponent,
  type InstallComponentOptions,
  type InstalledComponent,
} from "./installComponent";

export class MarketplaceComponentTypeError extends Error {
  constructor(itemId: number, actualType: string) {
    super(`Marketplace item ${itemId} is ${actualType}, not a component`);
    this.name = "MarketplaceComponentTypeError";
  }
}

export interface NewComponentPublication {
  component: unknown;
  description: string;
  thumbnail: Blob;
  /** Defaults to the validated package name. */
  name?: string;
}

export interface ComponentReplacement {
  component: unknown;
  name?: string;
  description?: string;
}

/** Explicit marketplace operations; local draft autosave never calls these. */
export class ComponentMarketplaceRepository {
  constructor(private readonly marketplace: MarketplaceClient) {}

  async browseComponents(
    query: MarketplaceQuery = {},
    signal?: AbortSignal,
  ): Promise<MarketplacePage<MarketplaceItem>> {
    return this.marketplace.listItems(
      {
        ...query,
        filters: [
          ...(query.filters ?? []).filter(({ field }) => field !== "type"),
          { field: "type", value: "component" },
        ],
      },
      signal,
    );
  }

  async downloadComponent(
    itemId: number,
    signal?: AbortSignal,
  ): Promise<DownloadedComponent> {
    const { content, metadata } = await this.marketplace.downloadItem(
      itemId,
      signal,
    );

    this.assertComponent(metadata);
    const component = parseComponentPackage(JSON.parse(await content.text()));
    const contentSha256 = await componentContentSha256(content);

    return { component, contentSha256, metadata };
  }

  async installComponent(
    itemId: number,
    dashboard: unknown,
    options: InstallComponentOptions = {},
    signal?: AbortSignal,
  ): Promise<InstalledComponent> {
    const downloaded = await this.downloadComponent(itemId, signal);

    return await installDownloadedComponent(downloaded, dashboard, options);
  }

  async publishNewComponent(
    publication: NewComponentPublication,
    signal?: AbortSignal,
  ): Promise<MarketplaceItem> {
    const component = parseComponentPackage(publication.component);

    return this.marketplace.createItem(
      {
        name: publication.name ?? component.name,
        description: publication.description,
        type: "component",
        content: this.contentBlob(component),
        thumbnail: publication.thumbnail,
      },
      signal,
    );
  }

  /** Replaces the shared item's bytes in place; the backend has no conflict token. */
  async replacePublishedComponent(
    itemId: number,
    replacement: ComponentReplacement,
    signal?: AbortSignal,
  ): Promise<void> {
    const component = parseComponentPackage(replacement.component);
    const existing = await this.marketplace.getItem(itemId, signal);

    this.assertComponent(existing);
    await this.marketplace.updateItem(
      itemId,
      {
        name: replacement.name ?? existing.name,
        description: replacement.description ?? existing.description,
        typeId: existing.typeId,
        content: this.contentBlob(component),
      },
      signal,
    );
  }

  private contentBlob(component: unknown): Blob {
    return new Blob([serializeComponentPackage(component)], {
      type: "application/json",
    });
  }

  private assertComponent(item: MarketplaceItem): void {
    if (item.type !== "component") {
      throw new MarketplaceComponentTypeError(item.id, item.type);
    }
  }
}
