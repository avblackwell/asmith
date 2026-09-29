import type {
  MarketplaceGroup,
  MarketplaceItem,
  MarketplacePage,
  MarketplaceQuery,
  MarketplaceUser,
} from "./types";

/**
 * Adapted from app/client/src/integration/marketplace/MarketplaceClient.ts.
 * Apache-2.0; see the repository LICENSE. This module keeps only the Java
 * endpoints needed by the standalone marketplace browse and detail pages.
 */
export class MarketplaceHttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly responseText: string;

  constructor(
    status: number,
    url: string,
    responseText: string,
  ) {
    super(responseText || `Marketplace request failed with HTTP ${status}`);
    this.name = "MarketplaceHttpError";
    this.status = status;
    this.url = url;
    this.responseText = responseText;
  }
}

export class MarketplaceResponseError extends Error {
  readonly url: string;

  constructor(url: string, reason: string) {
    super(`Invalid marketplace response from ${url}: ${reason}`);
    this.name = "MarketplaceResponseError";
    this.url = url;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertRecord(value: unknown, url: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new MarketplaceResponseError(url, "expected a JSON object");
  }

  return value;
}

function assertPage<T>(
  value: unknown,
  url: string,
  assertEntry: (entry: unknown, url: string) => T,
): MarketplacePage<T> {
  const page = assertRecord(value, url);

  if (!Array.isArray(page.data) || !isRecord(page.meta)) {
    throw new MarketplaceResponseError(url, "expected { data, meta } page");
  }

  const meta = page.meta;

  if (
    typeof meta.totalItems !== "number" ||
    typeof meta.currentPage !== "number" ||
    typeof meta.totalPages !== "number" ||
    (meta.nextCursor !== null && typeof meta.nextCursor !== "number") ||
    (meta.previousCursor !== null && typeof meta.previousCursor !== "number")
  ) {
    throw new MarketplaceResponseError(url, "invalid page metadata");
  }

  return {
    data: page.data.map((entry) => assertEntry(entry, url)),
    meta: meta as unknown as MarketplacePage<T>["meta"],
  };
}

function assertItem(entry: unknown, url: string): MarketplaceItem {
  const item = assertRecord(entry, url);

  if (
    typeof item.id !== "number" ||
    typeof item.name !== "string" ||
    typeof item.typeId !== "number" ||
    typeof item.type !== "string"
  ) {
    throw new MarketplaceResponseError(url, "missing item identity or type");
  }

  return item as unknown as MarketplaceItem;
}

function assertGroup(entry: unknown, url: string): MarketplaceGroup {
  const group = assertRecord(entry, url);

  if (typeof group.id !== "number" || typeof group.name !== "string") {
    throw new MarketplaceResponseError(url, "missing group identity or name");
  }

  return group as unknown as MarketplaceGroup;
}

/**
 * The Java development storage implementation hardcodes localhost:8080 asset
 * URLs. On this app's Vite port, use its same-origin /operator_display proxy
 * so the session cookie follows the content request. Leave all other storage
 * URLs, including production presigned URLs, untouched.
 */
function localDevelopmentAssetUrl(url: URL, pageUrl: string, basePath: string): URL {
  const page = new URL(pageUrl);

  if (
    basePath === "/operator_display" &&
    page.protocol === "http:" &&
    (page.hostname === "localhost" || page.hostname === "127.0.0.1") &&
    page.port === "3004" &&
    url.origin === "http://localhost:8080" &&
    url.pathname.startsWith("/operator_display/asset/")
  ) {
    return new URL(`${url.pathname}${url.search}`, page.origin);
  }

  return url;
}

export function marketplaceQueryString(query: MarketplaceQuery = {}): string {
  const params = new URLSearchParams();

  if (query.cursor !== undefined) params.set("cursor", String(query.cursor));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.search !== undefined) params.set("search", query.search);

  query.sorts?.forEach(({ descending, field }) => {
    params.append("sort", field);
    params.append("sortValue", String(descending));
  });

  query.filters?.forEach(({ field, value }) => {
    params.append("filter", field);
    params.append("filterValue", value);
  });

  const encoded = params.toString();

  return encoded ? `?${encoded}` : "";
}

export interface MarketplaceApi {
  getCurrentUser(signal?: AbortSignal): Promise<MarketplaceUser>;
  listGroups(
    query?: MarketplaceQuery,
    signal?: AbortSignal,
  ): Promise<MarketplacePage<MarketplaceGroup>>;
  listItems(
    query?: MarketplaceQuery,
    signal?: AbortSignal,
  ): Promise<MarketplacePage<MarketplaceItem>>;
  getItem(id: number, signal?: AbortSignal): Promise<MarketplaceItem>;
}

export interface MarketplaceDownload {
  downloadUrl: string;
  metadata: MarketplaceItem;
}

export interface DownloadedMarketplaceItem extends MarketplaceDownload {
  content: Blob;
}

export class MarketplaceClient implements MarketplaceApi {
  private readonly basePath: string;
  private readonly fetcher: typeof fetch;

  constructor(options: { basePath?: string; fetcher?: typeof fetch } = {}) {
    this.basePath = (options.basePath ?? "/operator_display").replace(/\/$/, "");
    // A detached Window.fetch throws "Illegal invocation" in Chromium.
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  }

  private async json(
    url: string,
    signal?: AbortSignal,
    method?: "POST",
  ): Promise<unknown> {
    const response = await this.fetcher(url, {
      credentials: "same-origin",
      ...(method ? { method } : {}),
      signal,
    });

    if (!response.ok) {
      throw new MarketplaceHttpError(
        response.status,
        url,
        (await response.text()).trim(),
      );
    }

    try {
      return await response.json();
    } catch {
      throw new MarketplaceResponseError(url, "expected JSON body");
    }
  }

  async getCurrentUser(signal?: AbortSignal): Promise<MarketplaceUser> {
    const url = `${this.basePath}/system/userInfo`;
    const user = assertRecord(await this.json(url, signal), url);

    if (
      typeof user.id !== "number" ||
      typeof user.username !== "string" ||
      typeof user.isSystemAdmin !== "boolean" ||
      !Array.isArray(user.groupMemberships)
    ) {
      throw new MarketplaceResponseError(url, "missing user identity or roles");
    }

    return user as unknown as MarketplaceUser;
  }

  async listGroups(
    query: MarketplaceQuery = {},
    signal?: AbortSignal,
  ): Promise<MarketplacePage<MarketplaceGroup>> {
    const url = `${this.basePath}/marketplace/groups${marketplaceQueryString(query)}`;

    return assertPage(await this.json(url, signal), url, assertGroup);
  }

  async listItems(
    query: MarketplaceQuery = {},
    signal?: AbortSignal,
  ): Promise<MarketplacePage<MarketplaceItem>> {
    const url = `${this.basePath}/marketplace/items${marketplaceQueryString(query)}`;

    return assertPage(await this.json(url, signal), url, assertItem);
  }

  async getItem(id: number, signal?: AbortSignal): Promise<MarketplaceItem> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new TypeError("Marketplace item ID must be a positive safe integer");
    }

    const url = `${this.basePath}/marketplace/items/${id}`;

    return assertItem(await this.json(url, signal), url);
  }

  /** The Java endpoint returns a URL and metadata; it does not stream bytes. */
  async requestDownload(
    id: number,
    signal?: AbortSignal,
  ): Promise<MarketplaceDownload> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new TypeError("Marketplace item ID must be a positive safe integer");
    }

    const url = `${this.basePath}/marketplace/items/${id}/download`;
    const response = assertRecord(await this.json(url, signal, "POST"), url);

    if (typeof response.downloadUrl !== "string" || !response.downloadUrl) {
      throw new MarketplaceResponseError(url, "missing downloadUrl");
    }

    const metadata = assertItem(response.metadata, url);

    if (metadata.id !== id) {
      throw new MarketplaceResponseError(url, "download metadata item ID does not match request");
    }

    return { downloadUrl: response.downloadUrl, metadata };
  }

  /** Fetches opaque content bytes from the backend's local or remote storage. */
  async downloadItem(
    id: number,
    signal?: AbortSignal,
  ): Promise<DownloadedMarketplaceItem> {
    const download = await this.requestDownload(id, signal);
    const pageUrl = typeof window === "undefined" ? "http://localhost/" : window.location.href;
    const serviceUrl = new URL(`${this.basePath}/`, pageUrl);
    let contentUrl: URL;

    try {
      contentUrl = new URL(download.downloadUrl, serviceUrl);
    } catch {
      throw new MarketplaceResponseError(
        `${this.basePath}/marketplace/items/${id}/download`,
        "downloadUrl is not a valid URL",
      );
    }

    if (!/^https?:$/.test(contentUrl.protocol) || contentUrl.username || contentUrl.password) {
      throw new MarketplaceResponseError(
        `${this.basePath}/marketplace/items/${id}/download`,
        "downloadUrl must be an HTTP(S) URL without embedded credentials",
      );
    }

    contentUrl = localDevelopmentAssetUrl(contentUrl, pageUrl, this.basePath);

    const response = await this.fetcher(contentUrl.href, {
      credentials: "same-origin",
      signal,
    });

    if (!response.ok) {
      throw new MarketplaceHttpError(
        response.status,
        contentUrl.href,
        (await response.text()).trim(),
      );
    }

    return { ...download, content: await response.blob() };
  }
}

export function marketplaceErrorMessage(error: unknown, action: string): string {
  if (error instanceof MarketplaceHttpError) {
    if (error.status === 401) return "Your session expired. Sign in and retry.";
    if (error.status === 403) return "You do not have access to this area.";

    return `${action} failed (HTTP ${error.status}).`;
  }

  if (error instanceof Error && error.message) {
    return `${action} failed: ${error.message.slice(0, 180)}`;
  }

  return `${action} failed.`;
}
