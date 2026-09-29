import {
  MarketplaceHttpError,
  MarketplaceResponseError,
} from "../../marketplace";
import type {
  MarketplacePage,
  MarketplaceQuery,
  MarketplaceTag,
  MarketplaceUser,
} from "../../marketplace";

export interface TagFields {
  name: string;
  color?: string | null;
  icon?: string | null;
}

export interface TagChanges {
  name?: string;
  color?: string;
  icon?: string;
}

export interface AdminUsersTagsClientOptions {
  basePath?: string;
  fetcher?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertUser(value: unknown, url: string): MarketplaceUser {
  if (
    !isRecord(value) ||
    typeof value.id !== "number" ||
    typeof value.username !== "string" ||
    typeof value.isSystemAdmin !== "boolean" ||
    !Array.isArray(value.groupMemberships)
  ) {
    throw new MarketplaceResponseError(url, "missing user identity or groups");
  }

  return value as unknown as MarketplaceUser;
}

function assertTag(value: unknown, url: string): MarketplaceTag {
  if (
    !isRecord(value) ||
    typeof value.id !== "number" ||
    typeof value.name !== "string" ||
    (value.color !== null && typeof value.color !== "string") ||
    (value.icon !== null && typeof value.icon !== "string")
  ) {
    throw new MarketplaceResponseError(url, "missing tag identity or fields");
  }

  return value as unknown as MarketplaceTag;
}

function assertPage<T>(
  value: unknown,
  url: string,
  validate: (entry: unknown, url: string) => T,
): MarketplacePage<T> {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.meta)) {
    throw new MarketplaceResponseError(url, "expected { data, meta } page");
  }

  const meta = value.meta;

  if (
    typeof meta.cursor !== "number" ||
    typeof meta.currentPage !== "number" ||
    typeof meta.totalPages !== "number" ||
    typeof meta.totalItems !== "number" ||
    (meta.previousCursor !== null && typeof meta.previousCursor !== "number") ||
    (meta.nextCursor !== null && typeof meta.nextCursor !== "number")
  ) {
    throw new MarketplaceResponseError(url, "missing pagination metadata");
  }

  return {
    data: value.data.map((entry) => validate(entry, url)),
    meta: meta as unknown as MarketplacePage<T>["meta"],
  };
}

function assertId(id: number, label: string): void {
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}

function queryString(query: MarketplaceQuery): string {
  const params = new URLSearchParams();

  if (query.cursor !== undefined) params.set("cursor", String(query.cursor));

  if (query.limit !== undefined) params.set("limit", String(query.limit));

  if (query.search !== undefined) params.set("search", query.search);

  query.sorts?.forEach(({ descending, field }) => {
    params.append("sort", field);
    params.append("sortValue", String(descending));
  });

  const encoded = params.toString();

  return encoded ? `?${encoded}` : "";
}

/** Same-origin adapter to registered operator_display routes, with no Appsmith API bootstrap. */
export class AdminUsersTagsClient {
  private readonly basePath: string;
  private readonly fetcher: typeof fetch;

  constructor(options: AdminUsersTagsClientOptions = {}) {
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

  private async json(url: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.request(url, init);

    try {
      return await response.json();
    } catch {
      throw new MarketplaceResponseError(url, "expected JSON body");
    }
  }

  private jsonInit(
    method: "POST" | "PUT",
    body: object,
    signal?: AbortSignal,
  ): RequestInit {
    return {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    };
  }

  async getCurrentUser(signal?: AbortSignal): Promise<MarketplaceUser> {
    const url = this.url("/system/userInfo");

    return assertUser(await this.json(url, { signal }), url);
  }

  async listUsers(
    query: MarketplaceQuery = {},
    signal?: AbortSignal,
  ): Promise<MarketplacePage<MarketplaceUser>> {
    const url = this.url(`/system/users${queryString(query)}`);

    return assertPage(await this.json(url, { signal }), url, assertUser);
  }

  async getUser(
    userId: number,
    signal?: AbortSignal,
  ): Promise<MarketplaceUser> {
    assertId(userId, "User ID");
    const url = this.url(`/system/users/${userId}`);

    return assertUser(await this.json(url, { signal }), url);
  }

  async addUser(username: string, signal?: AbortSignal): Promise<number> {
    const name = username.trim();

    if (!name) throw new TypeError("Username is required");

    const url = this.url("/system/users");
    const response = await this.request(
      url,
      this.jsonInit("POST", { username: name }, signal),
    );
    const id = Number((await response.text()).trim());

    if (!Number.isSafeInteger(id) || id < 1) {
      throw new MarketplaceResponseError(url, "expected a created user ID");
    }

    return id;
  }

  async listTags(
    query: MarketplaceQuery = {},
    signal?: AbortSignal,
  ): Promise<MarketplacePage<MarketplaceTag>> {
    const url = this.url(`/marketplace/item-tags${queryString(query)}`);

    return assertPage(await this.json(url, { signal }), url, assertTag);
  }

  async getTag(tagId: number, signal?: AbortSignal): Promise<MarketplaceTag> {
    assertId(tagId, "Tag ID");
    const url = this.url(`/marketplace/item-tags/${tagId}`);

    return assertTag(await this.json(url, { signal }), url);
  }

  async checkTagName(name: string, signal?: AbortSignal): Promise<boolean> {
    const tagName = name.trim();

    if (!tagName) throw new TypeError("Tag name is required");

    const url = this.url("/system/checkItemTagName");
    const value = await this.json(
      url,
      this.jsonInit("POST", { tagName }, signal),
    );

    if (!isRecord(value) || typeof value.exists !== "boolean") {
      throw new MarketplaceResponseError(url, "expected name-check result");
    }

    return value.exists;
  }

  async createTag(fields: TagFields, signal?: AbortSignal): Promise<number> {
    const name = fields.name.trim();

    if (!name) throw new TypeError("Tag name is required");

    const url = this.url("/system/item-tags");
    const result = await this.json(
      url,
      this.jsonInit(
        "POST",
        {
          name,
          color: fields.color?.trim() || null,
          icon: fields.icon?.trim() || null,
        },
        signal,
      ),
    );

    if (!isRecord(result) || typeof result.id !== "number") {
      throw new MarketplaceResponseError(url, "expected a created tag ID");
    }

    assertId(result.id, "Created tag ID");

    return result.id;
  }

  async updateTag(
    tagId: number,
    changes: TagChanges,
    signal?: AbortSignal,
  ): Promise<void> {
    assertId(tagId, "Tag ID");

    if (changes.name !== undefined && !changes.name.trim()) {
      throw new TypeError("Tag name cannot be blank");
    }

    const url = this.url(`/marketplace/item-tags/${tagId}`);

    await this.request(url, this.jsonInit("PUT", changes, signal));
  }

  async deleteTag(tagId: number, signal?: AbortSignal): Promise<void> {
    assertId(tagId, "Tag ID");
    await this.request(this.url(`/marketplace/item-tags/${tagId}`), {
      method: "DELETE",
      signal,
    });
  }
}
