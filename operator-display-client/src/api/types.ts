/** Existing operator_display Java response types used by the first screens. */
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

export interface MarketplaceTag {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
}

export interface MarketplaceItem {
  id: number;
  name: string;
  description?: string | null;
  typeId: number;
  type: string;
  tags?: MarketplaceTag[];
  publisherId?: number;
  thumbnailUrl?: string | null;
  publisherUsername?: string | null;
  createdAt?: number;
  updatedAt?: number;
  downloadCount?: number;
  publishedAt?: number | null;
  rating?: number | null;
  ratingCount?: number;
  previewImages?: string[];
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

export interface MarketplacePageMeta {
  cursor: number;
  previousCursor: number | null;
  nextCursor: number | null;
  pageSize: number;
  currentPage: number;
  totalPages: number;
  totalItems: number;
}

export interface MarketplacePage<T> {
  data: T[];
  meta: MarketplacePageMeta;
}

export interface MarketplaceQuery {
  cursor?: number;
  limit?: number;
  search?: string;
  sorts?: ReadonlyArray<{ field: string; descending: boolean }>;
  filters?: ReadonlyArray<{ field: string; value: string }>;
}
