/** Shapes returned by the unchanged operator_display marketplace API. */
export interface MarketplaceUserInfo {
  id: number;
  username: string;
}

export interface MarketplaceGroupMembership {
  groupId: number;
  groupName: string;
  roleId: number;
  role: string;
  addedBy: MarketplaceUserInfo | null;
  admin?: boolean;
}

export interface MarketplaceUser extends MarketplaceUserInfo {
  isSystemAdmin: boolean;
  groupMemberships: MarketplaceGroupMembership[];
  adminOfAnyGroup?: boolean;
}

export interface MarketplaceTag {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
}

export interface MarketplacePreview {
  id: number;
  index: number;
  url: string;
}

export interface MarketplaceItem {
  id: number;
  name: string;
  description: string;
  typeId: number;
  type: string;
  tags: MarketplaceTag[];
  publisherId: number;
  publisherUsername: string;
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
  downloadCount: number;
  rating: number | null;
  ratingCount: number;
  thumbnailUrl: string;
  previewImages: string[];
}

export interface MarketplaceGroup {
  id: number;
  name: string;
  description: string | null;
  creationSource: string;
  externalGroupId: string | null;
  creatorId: number | null;
  creatorName: string | null;
  memberCount: number;
  createdAt: number;
  updatedAt: number | null;
  admins: MarketplaceUserInfo[];
}

/** The id is the test cell software ID used by /remote/tc/{softwareId}. */
export interface MarketplaceTestCell {
  id: number;
  name: string;
  site: { oid: number; name: string | null } | null;
  state: {
    lastSeen: number | null;
    generation: number | null;
    go_time: number | null;
    rebuild_count: number | null;
    state: string | null;
  } | null;
}

/** Only these methods are registered by CyFlexProxyResource. */
export interface ProxyTestCellRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Path below the test cell's API root, such as cyflex/streaming. */
  path: string;
  /** Passed to the downstream request by the Java proxy. */
  accept?: string;
  /** Set the downstream vendor type for POST/PUT; defaults to octet-stream. */
  contentType?: string;
  body?: BodyInit;
  /** Repeated parameters are allowed. The Java proxy discards a key named url. */
  query?: ReadonlyArray<readonly [string, string]>;
  signal?: AbortSignal;
}

export interface MarketplacePageMeta {
  cursor: number;
  previousCursor: number | null;
  nextCursor: number | null;
  pageSize: number;
  currentPage: number;
  totalPages: number;
  totalItems: number;
  sorts: Record<string, boolean> | null;
  filters: Record<string, string[]> | null;
}

export interface MarketplacePage<T> {
  data: T[];
  meta: MarketplacePageMeta;
}

export interface MarketplaceQuery {
  cursor?: number;
  limit?: number;
  search?: string;
  /** The backend treats true as DESC and false as ASC. */
  sorts?: ReadonlyArray<{ field: string; descending: boolean }>;
  filters?: ReadonlyArray<{ field: string; value: string }>;
}

export interface MarketplaceDownload {
  downloadUrl: string;
  metadata: MarketplaceItem;
}

export interface DownloadedMarketplaceItem extends MarketplaceDownload {
  content: Blob;
}

export interface CreateMarketplaceItem {
  name: string;
  description: string;
  type: string;
  content: Blob;
  thumbnail: Blob;
}

export interface UpdateMarketplaceItem {
  name: string;
  description: string;
  typeId: number;
  content: Blob;
}
