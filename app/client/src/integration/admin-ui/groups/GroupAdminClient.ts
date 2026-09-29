import { MarketplaceClient, MarketplaceHttpError } from "../../marketplace";
import type {
  MarketplaceGroup,
  MarketplacePage,
  MarketplaceUser,
  MarketplaceUserInfo,
} from "../../marketplace";

export interface GroupMember {
  user: MarketplaceUserInfo;
  roleId: number;
  role: string;
  addedBy: MarketplaceUserInfo | null;
}

export interface GroupListQuery {
  cursor?: number;
  limit?: number;
  search?: string;
  /** Supported by the group list DAO; true means descending. */
  sort?: { field: "name" | "member_count"; descending: boolean };
}

export interface CreateGroup {
  name: string;
  description?: string;
  /** Records an Entra group object ID; this backend does not sync members. */
  externalGroupId?: string;
}

export interface GroupAdminClientOptions {
  basePath?: string;
  fetcher?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positiveId(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}

function queryString(query: GroupListQuery): string {
  const params = new URLSearchParams();

  if (query.cursor !== undefined) {
    if (!Number.isSafeInteger(query.cursor) || query.cursor < 0) {
      throw new TypeError("Cursor must be a nonnegative safe integer");
    }

    params.set("cursor", String(query.cursor));
  }

  if (query.limit !== undefined) {
    if (
      !Number.isSafeInteger(query.limit) ||
      query.limit < 1 ||
      query.limit > 100
    ) {
      throw new TypeError("Page size must be between 1 and 100");
    }

    params.set("limit", String(query.limit));
  }

  if (query.search) params.set("search", query.search);

  if (query.sort) {
    params.set("sort", query.sort.field);
    params.set("sortValue", String(query.sort.descending));
  }

  return params.size ? `?${params}` : "";
}

function parseGroup(value: unknown, url: string): MarketplaceGroup {
  if (
    !isRecord(value) ||
    typeof value.id !== "number" ||
    typeof value.name !== "string"
  ) {
    throw new Error(`Invalid group response from ${url}`);
  }

  return value as unknown as MarketplaceGroup;
}

function parseMember(value: unknown, url: string): GroupMember {
  if (
    !isRecord(value) ||
    !isRecord(value.user) ||
    typeof value.user.id !== "number" ||
    typeof value.user.username !== "string" ||
    typeof value.role !== "string"
  ) {
    throw new Error(`Invalid group member response from ${url}`);
  }

  return value as unknown as GroupMember;
}

function parsePage<T>(
  value: unknown,
  url: string,
  parseEntry: (entry: unknown, url: string) => T,
): MarketplacePage<T> {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.meta)) {
    throw new Error(`Invalid paginated response from ${url}`);
  }

  const meta = value.meta;

  if (
    typeof meta.totalItems !== "number" ||
    typeof meta.currentPage !== "number" ||
    typeof meta.totalPages !== "number" ||
    (meta.nextCursor !== null && typeof meta.nextCursor !== "number") ||
    (meta.previousCursor !== null && typeof meta.previousCursor !== "number")
  ) {
    throw new Error(`Invalid pagination metadata from ${url}`);
  }

  return {
    data: value.data.map((entry) => parseEntry(entry, url)),
    meta: meta as unknown as MarketplacePage<T>["meta"],
  };
}

/** Same-origin adapter for the Java /system/groups routes, without Appsmith API middleware. */
export class GroupAdminClient {
  private readonly basePath: string;
  private readonly fetcher: typeof fetch;
  private readonly marketplace: MarketplaceClient;

  constructor(options: GroupAdminClientOptions = {}) {
    this.basePath = (options.basePath ?? "/operator_display").replace(
      /\/$/,
      "",
    );
    this.fetcher = options.fetcher ?? fetch;
    this.marketplace = new MarketplaceClient(options);
  }

  async getCurrentUser(signal?: AbortSignal): Promise<MarketplaceUser> {
    return this.marketplace.getCurrentUser(signal);
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

  private async json(url: string, init?: RequestInit): Promise<unknown> {
    const response = await this.request(url, init);

    try {
      return await response.json();
    } catch {
      throw new Error(`Expected JSON response from ${url}`);
    }
  }

  private async send(
    url: string,
    method: "POST" | "PUT",
    body: unknown,
  ): Promise<Response> {
    return this.request(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async listGroups(
    query: GroupListQuery = {},
    signal?: AbortSignal,
  ): Promise<MarketplacePage<MarketplaceGroup>> {
    const url = this.url(`/system/groups${queryString(query)}`);

    return parsePage(await this.json(url, { signal }), url, parseGroup);
  }

  async getGroup(
    groupId: number,
    signal?: AbortSignal,
  ): Promise<MarketplaceGroup> {
    positiveId(groupId, "Group ID");
    const url = this.url(`/system/groups/${groupId}`);

    return parseGroup(await this.json(url, { signal }), url);
  }

  async createGroup(group: CreateGroup): Promise<number> {
    const url = this.url("/system/groups");
    const response = await this.send(url, "POST", group);
    const value: unknown = await response.json();

    if (!isRecord(value) || typeof value.groupId !== "number") {
      throw new Error(`Invalid create-group response from ${url}`);
    }

    positiveId(value.groupId, "Created group ID");

    return value.groupId;
  }

  async updateGroup(
    groupId: number,
    changes: { name: string; description: string },
  ): Promise<void> {
    positiveId(groupId, "Group ID");
    await this.send(this.url(`/system/groups/${groupId}`), "PUT", changes);
  }

  async listMembers(
    groupId: number,
    query: Omit<GroupListQuery, "sort"> = {},
    signal?: AbortSignal,
  ): Promise<MarketplacePage<GroupMember>> {
    positiveId(groupId, "Group ID");
    const url = this.url(
      `/system/groups/${groupId}/members${queryString(query)}`,
    );

    return parsePage(await this.json(url, { signal }), url, parseMember);
  }

  async addMember(
    groupId: number,
    userId: number,
    role: "MEMBER" | "ADMIN",
  ): Promise<void> {
    positiveId(groupId, "Group ID");
    positiveId(userId, "Application user ID");
    await this.send(this.url(`/system/groups/${groupId}/members`), "POST", {
      userId,
      role,
    });
  }

  async updateMemberRole(
    groupId: number,
    userId: number,
    role: "MEMBER" | "ADMIN",
  ): Promise<void> {
    positiveId(groupId, "Group ID");
    positiveId(userId, "Application user ID");
    await this.send(
      this.url(`/system/groups/${groupId}/members/${userId}`),
      "PUT",
      {
        role,
      },
    );
  }

  async removeMember(groupId: number, userId: number): Promise<void> {
    positiveId(groupId, "Group ID");
    positiveId(userId, "Application user ID");
    await this.request(
      this.url(`/system/groups/${groupId}/members/${userId}`),
      {
        method: "DELETE",
      },
    );
  }
}
