import type {
  CreateMarketplaceItem,
  DownloadedMarketplaceItem,
  MarketplaceDownload,
  MarketplaceGroup,
  MarketplaceItem,
  MarketplacePage,
  MarketplacePreview,
  MarketplaceQuery,
  MarketplaceTag,
  MarketplaceTestCell,
  MarketplaceUser,
  ProxyTestCellRequest,
  UpdateMarketplaceItem,
} from "./types";

export class MarketplaceHttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly responseText: string,
  ) {
    super(responseText || `Marketplace request failed with HTTP ${status}`);
    this.name = "MarketplaceHttpError";
  }
}

export class MarketplaceResponseError extends Error {
  constructor(
    readonly url: string,
    reason: string,
  ) {
    super(`Invalid marketplace response from ${url}: ${reason}`);
    this.name = "MarketplaceResponseError";
  }
}

export interface MarketplaceClientOptions {
  /** Same-origin backend context path. The deployed default is /operator_display. */
  basePath?: string;
  /** Dependency injection for tests or an application-owned fetch transport. */
  fetcher?: typeof fetch;
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

function assertItem(value: unknown, url: string): MarketplaceItem {
  const item = assertRecord(value, url);

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

function assertTestCell(value: unknown, url: string): MarketplaceTestCell {
  const cell = assertRecord(value, url);

  if (
    typeof cell.id !== "number" ||
    typeof cell.name !== "string" ||
    (cell.site !== null &&
      (!isRecord(cell.site) || typeof cell.site.oid !== "number")) ||
    (cell.state !== null && !isRecord(cell.state))
  ) {
    throw new MarketplaceResponseError(
      url,
      "missing test cell identity or site",
    );
  }

  return cell as unknown as MarketplaceTestCell;
}

function assertPreview(value: unknown, url: string): MarketplacePreview {
  const preview = assertRecord(value, url);

  if (
    typeof preview.id !== "number" ||
    typeof preview.index !== "number" ||
    typeof preview.url !== "string"
  ) {
    throw new MarketplaceResponseError(url, "missing preview identity or URL");
  }

  return preview as unknown as MarketplacePreview;
}

function assertPage<T>(
  value: unknown,
  url: string,
  validateEntry?: (entry: unknown, url: string) => T,
): MarketplacePage<T> {
  const page = assertRecord(value, url);

  if (!Array.isArray(page.data) || !isRecord(page.meta)) {
    throw new MarketplaceResponseError(url, "expected { data, meta } page");
  }

  return {
    data: validateEntry
      ? page.data.map((entry) => validateEntry(entry, url))
      : (page.data as T[]),
    meta: page.meta as unknown as MarketplacePage<T>["meta"],
  };
}

function assertId(id: number, label = "Marketplace item ID"): void {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}

function assertNonemptyBlob(blob: Blob, label: string): void {
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new TypeError(`${label} must be a nonempty Blob`);
  }
}

function buildQuery(query: MarketplaceQuery = {}): string {
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

function buildProxyPath(path: string): string {
  const segments = path.replace(/^\//, "").split("/");

  if (
    segments.some((segment) => {
      let decoded: string;

      try {
        decoded = decodeURIComponent(segment);
      } catch {
        return true;
      }

      return (
        !segment ||
        decoded === "." ||
        decoded === ".." ||
        /[\\/?#]/.test(decoded)
      );
    })
  ) {
    throw new TypeError("Proxy path must contain nonempty relative segments");
  }

  return segments.map(encodeURIComponent).join("/");
}

/** Direct browser adapter; intentionally bypasses Appsmith's API interceptors. */
export class MarketplaceClient {
  private readonly basePath: string;
  private readonly fetcher: typeof fetch;

  constructor(options: MarketplaceClientOptions = {}) {
    this.basePath = (options.basePath ?? "/operator_display").replace(
      /\/$/,
      "",
    );
    this.fetcher = options.fetcher ?? fetch;
  }

  private url(path: string): string {
    return `${this.basePath}${path}`;
  }

  private async request(
    url: string,
    init: RequestInit = {},
  ): Promise<Response> {
    // The Java session is cookie backed. Cross-origin credentialed CORS is not
    // configured by the supplied backend, so callers should use a same-origin route.
    const response = await this.fetcher(url, {
      credentials: "same-origin",
      ...init,
    });

    if (!response.ok) {
      throw new MarketplaceHttpError(
        response.status,
        url,
        (await response.text()).trim(),
      );
    }

    return response;
  }

  private async json(url: string, init?: RequestInit): Promise<unknown> {
    const response = await this.request(url, init);

    try {
      return await response.json();
    } catch {
      throw new MarketplaceResponseError(url, "expected JSON body");
    }
  }

  async getCurrentUser(signal?: AbortSignal): Promise<MarketplaceUser> {
    const url = this.url("/system/userInfo");
    const user = assertRecord(await this.json(url, { signal }), url);

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

  async listItems(
    query: MarketplaceQuery = {},
    signal?: AbortSignal,
  ): Promise<MarketplacePage<MarketplaceItem>> {
    const url = this.url(`/marketplace/items${buildQuery(query)}`);

    return assertPage(await this.json(url, { signal }), url, assertItem);
  }

  async listGroups(
    query: MarketplaceQuery = {},
    signal?: AbortSignal,
  ): Promise<MarketplacePage<MarketplaceGroup>> {
    const url = this.url(`/marketplace/groups${buildQuery(query)}`);

    return assertPage(await this.json(url, { signal }), url);
  }

  async listItemTags(
    query: MarketplaceQuery = {},
    signal?: AbortSignal,
  ): Promise<MarketplacePage<MarketplaceTag>> {
    const url = this.url(`/marketplace/item-tags${buildQuery(query)}`);

    return assertPage(await this.json(url, { signal }), url);
  }

  async listTestCells(
    query: MarketplaceQuery = {},
    signal?: AbortSignal,
  ): Promise<MarketplacePage<MarketplaceTestCell>> {
    const url = this.url(`/system/testcells${buildQuery(query)}`);

    return assertPage(await this.json(url, { signal }), url, assertTestCell);
  }

  async getTestCell(
    softwareId: number,
    signal?: AbortSignal,
  ): Promise<MarketplaceTestCell> {
    assertId(softwareId, "Test cell software ID");
    const url = this.url(`/system/testcells/${softwareId}`);

    return assertTestCell(await this.json(url, { signal }), url);
  }

  /**
   * Calls the permission-checked Java proxy and returns the raw downstream
   * response. The caller must inspect a successful response body for Cyflex
   * application errors. Java currently forwards Accept, query and body type,
   * but its downstream destination/authentication still needs deployment proof.
   */
  async proxyTestCellRequest(
    softwareId: number,
    options: ProxyTestCellRequest,
  ): Promise<Response> {
    assertId(softwareId, "Test cell software ID");
    const path = buildProxyPath(options.path);
    const params = new URLSearchParams();

    options.query?.forEach(([key, value]) => {
      if (key === "url") {
        throw new TypeError("The Java proxy discards the url query parameter");
      }

      params.append(key, value);
    });
    const query = params.toString();
    const url = this.url(
      `/remote/tc/${softwareId}/${path}${query ? `?${query}` : ""}`,
    );
    const headers = new Headers();

    if (options.accept) headers.set("Accept", options.accept);

    if (options.method === "GET" || options.method === "DELETE") {
      if (options.body !== undefined || options.contentType !== undefined) {
        throw new TypeError(
          `${options.method} proxy requests cannot have a body`,
        );
      }
    } else if (options.body !== undefined) {
      headers.set(
        "Content-Type",
        options.contentType ?? "application/octet-stream",
      );
    }

    return this.request(url, {
      method: options.method,
      headers,
      body: options.body,
      signal: options.signal,
    });
  }

  async getItem(id: number, signal?: AbortSignal): Promise<MarketplaceItem> {
    assertId(id);
    const url = this.url(`/marketplace/items/${id}`);

    return assertItem(await this.json(url, { signal }), url);
  }

  async requestDownload(
    id: number,
    signal?: AbortSignal,
  ): Promise<MarketplaceDownload> {
    assertId(id);
    const url = this.url(`/marketplace/items/${id}/download`);
    const download = assertRecord(
      await this.json(url, { method: "POST", signal }),
      url,
    );

    if (typeof download.downloadUrl !== "string" || !download.downloadUrl) {
      throw new MarketplaceResponseError(url, "missing downloadUrl");
    }

    return {
      downloadUrl: download.downloadUrl,
      metadata: assertItem(download.metadata, url),
    };
  }

  async downloadItem(
    id: number,
    signal?: AbortSignal,
  ): Promise<DownloadedMarketplaceItem> {
    const download = await this.requestDownload(id, signal);
    const pageUrl =
      typeof window === "undefined"
        ? "http://localhost/"
        : window.location.href;
    const serviceUrl = new URL(this.url("/"), pageUrl);
    const downloadUrl = new URL(download.downloadUrl, serviceUrl);

    if (!/^https?:$/.test(downloadUrl.protocol)) {
      throw new MarketplaceResponseError(
        this.url(`/marketplace/items/${id}/download`),
        "downloadUrl must use HTTP(S)",
      );
    }

    const response = await this.request(downloadUrl.href, { signal });

    return { ...download, content: await response.blob() };
  }

  async createItem(
    item: CreateMarketplaceItem,
    signal?: AbortSignal,
  ): Promise<MarketplaceItem> {
    assertNonemptyBlob(item.content, "content");
    assertNonemptyBlob(item.thumbnail, "thumbnail");
    const body = new FormData();

    body.append(
      "itemInfo",
      new Blob(
        [
          JSON.stringify({
            name: item.name,
            description: item.description,
            type: item.type,
          }),
        ],
        { type: "application/json" },
      ),
    );
    body.append("content", item.content);
    body.append("thumbnail", item.thumbnail);
    const url = this.url("/marketplace/items");

    return assertItem(
      await this.json(url, { method: "POST", body, signal }),
      url,
    );
  }

  async updateItem(
    id: number,
    item: UpdateMarketplaceItem,
    signal?: AbortSignal,
  ): Promise<void> {
    assertId(id);
    assertNonemptyBlob(item.content, "content");
    const body = new FormData();

    body.append(
      "itemInfo",
      new Blob(
        [
          JSON.stringify({
            name: item.name,
            description: item.description,
            typeId: item.typeId,
          }),
        ],
        { type: "application/json" },
      ),
    );
    body.append("content", item.content);
    await this.request(this.url(`/marketplace/items/${id}`), {
      method: "PUT",
      body,
      signal,
    });
  }

  async deleteItem(id: number, signal?: AbortSignal): Promise<void> {
    assertId(id);
    await this.request(this.url(`/marketplace/items/${id}`), {
      method: "DELETE",
      signal,
    });
  }

  async updateThumbnail(
    id: number,
    thumbnail: Blob,
    signal?: AbortSignal,
  ): Promise<void> {
    assertId(id);
    assertNonemptyBlob(thumbnail, "thumbnail");
    const body = new FormData();

    body.append("thumbnail", thumbnail);
    await this.request(this.url(`/marketplace/items/${id}/thumbnail`), {
      method: "PUT",
      body,
      signal,
    });
  }

  async listPreviews(
    id: number,
    signal?: AbortSignal,
  ): Promise<MarketplacePreview[]> {
    assertId(id);
    const url = this.url(`/marketplace/items/${id}/previews`);
    const value = await this.json(url, { signal });

    if (!Array.isArray(value)) {
      throw new MarketplaceResponseError(url, "expected preview list");
    }

    return value.map((entry) => assertPreview(entry, url));
  }

  async addPreview(
    id: number,
    preview: Blob,
    signal?: AbortSignal,
  ): Promise<void> {
    assertId(id);
    assertNonemptyBlob(preview, "preview");
    const body = new FormData();

    body.append("preview", preview);
    await this.request(this.url(`/marketplace/items/${id}/previews`), {
      method: "POST",
      body,
      signal,
    });
  }

  async reorderPreviews(
    id: number,
    order: number[],
    signal?: AbortSignal,
  ): Promise<void> {
    assertId(id);

    if (
      !order.length ||
      order.some((index) => !Number.isSafeInteger(index) || index < 0) ||
      new Set(order).size !== order.length
    ) {
      throw new TypeError(
        "Preview order must contain unique nonnegative indices",
      );
    }

    await this.request(this.url(`/marketplace/items/${id}/previews`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
      signal,
    });
  }

  async deletePreview(
    id: number,
    index: number,
    signal?: AbortSignal,
  ): Promise<void> {
    assertId(id);

    if (!Number.isSafeInteger(index) || index < 0) {
      throw new TypeError("Preview index must be a nonnegative integer");
    }

    await this.request(this.url(`/marketplace/items/${id}/previews/${index}`), {
      method: "DELETE",
      signal,
    });
  }

  async assignTag(
    id: number,
    tagId: number,
    signal?: AbortSignal,
  ): Promise<void> {
    assertId(id);
    assertId(tagId, "Tag ID");
    await this.request(this.url(`/marketplace/items/${id}/tags/${tagId}`), {
      method: "POST",
      signal,
    });
  }

  async removeTag(
    id: number,
    tagId: number,
    signal?: AbortSignal,
  ): Promise<void> {
    assertId(id);
    assertId(tagId, "Tag ID");
    await this.request(this.url(`/marketplace/items/${id}/tags/${tagId}`), {
      method: "DELETE",
      signal,
    });
  }
}
