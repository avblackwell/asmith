import {
  createBlankDashboardDocument,
  parseDashboardDocument,
} from "../document";
import type { DashboardDocument } from "../document";
import type {
  DraftListResult,
  DraftRecord,
  DraftScope,
  IndexedDbDraftStore,
} from "../drafts";
import type {
  MarketplaceClient,
  MarketplaceItem,
  MarketplacePage,
  MarketplaceQuery,
  MarketplaceUser,
} from "../marketplace";
import { DashboardMarketplaceRepository } from "../publishing";
import type {
  DashboardReplacement,
  DownloadedDashboard,
  NewDashboardPublication,
} from "../publishing";

export interface DashboardWorkspaceOptions {
  /** Stable installation identifier, supplied by deployment configuration. */
  deploymentId: string;
  marketplace: MarketplaceClient;
  drafts: IndexedDbDraftStore;
  /** Defaults to a repository backed by marketplace. Injectable for tests. */
  publishing?: DashboardMarketplaceRepository;
}

export interface OpenDashboardResult {
  /** Identity used for the draft lookup, which may differ from an earlier catalog load. */
  user: MarketplaceUser;
  source: "local" | "marketplace";
  document: DashboardDocument;
  marketplace: DownloadedDashboard;
  localDraft: DraftRecord | null;
}

export interface LocalDashboardResult {
  user: MarketplaceUser;
  document: DashboardDocument;
  localDraft: DraftRecord;
}

/**
 * Workspace orchestration around the unchanged Java marketplace and local
 * browser drafts. Saving locally never invokes marketplace publication.
 */
export class DashboardWorkspaceService {
  private readonly deploymentId: string;
  private readonly marketplace: MarketplaceClient;
  private readonly drafts: IndexedDbDraftStore;
  private readonly publishing: DashboardMarketplaceRepository;

  constructor(options: DashboardWorkspaceOptions) {
    const deploymentId = options.deploymentId?.trim();

    if (!deploymentId) {
      throw new TypeError("A stable deploymentId is required");
    }

    this.deploymentId = deploymentId;
    this.marketplace = options.marketplace;
    this.drafts = options.drafts;
    this.publishing =
      options.publishing ??
      new DashboardMarketplaceRepository(this.marketplace);
  }

  /** Resolves the active cookie-backed marketplace identity. */
  async authenticate(signal?: AbortSignal): Promise<MarketplaceUser> {
    return this.marketplace.getCurrentUser(signal);
  }

  /** The Java paginator implements an exact item-type filter. */
  async listDashboardItems(
    query: MarketplaceQuery = {},
    signal?: AbortSignal,
  ): Promise<MarketplacePage<MarketplaceItem>> {
    return this.marketplace.listItems(
      {
        ...query,
        filters: [
          ...(query.filters ?? []).filter(({ field }) => field !== "type"),
          { field: "type", value: "dashboard" },
        ],
      },
      signal,
    );
  }

  /** Downloads and validates the shared asset before selecting a local copy. */
  async openDashboard(
    itemId: number,
    signal?: AbortSignal,
  ): Promise<OpenDashboardResult> {
    const user = await this.authenticate(signal);
    const marketplace = await this.publishing.downloadDashboard(itemId, signal);
    const localDraft = await this.drafts.load(
      this.scope(user, marketplace.document.documentId),
    );

    return {
      user,
      source: localDraft ? "local" : "marketplace",
      document: localDraft?.document ?? marketplace.document,
      marketplace,
      localDraft,
    };
  }

  /** Account-owned browser drafts are available without a shared item. */
  async listLocalDashboards(user: MarketplaceUser): Promise<DraftListResult> {
    return this.drafts.list(this.deploymentId, String(user.id));
  }

  /** Saves a new private working copy before returning it to the editor. */
  async createNewDashboard(
    signal?: AbortSignal,
  ): Promise<LocalDashboardResult> {
    const user = await this.authenticate(signal);
    const document = createBlankDashboardDocument(
      globalThis.crypto.randomUUID(),
    );
    const localDraft = await this.drafts.save(
      this.scope(user, document.documentId),
      document,
      null,
    );

    return { user, document: localDraft.document, localDraft };
  }

  /** Loads one account-owned draft directly; no marketplace download occurs. */
  async openLocalDashboard(
    documentId: string,
    signal?: AbortSignal,
  ): Promise<LocalDashboardResult> {
    const user = await this.authenticate(signal);
    const localDraft = await this.drafts.load(this.scope(user, documentId));

    if (!localDraft) throw new Error("Local dashboard draft was not found");

    return { user, document: localDraft.document, localDraft };
  }

  /** Reads a known local document without downloading catalog content. */
  async loadLocalDraft(
    documentId: string,
    signal?: AbortSignal,
  ): Promise<DraftRecord | null> {
    const user = await this.authenticate(signal);

    return this.drafts.load(this.scope(user, documentId));
  }

  /** Uses the draft store's revision check; it never uploads the document. */
  async saveLocally(
    input: unknown,
    expectedRevision: number | null,
    signal?: AbortSignal,
  ): Promise<DraftRecord> {
    const document = parseDashboardDocument(input);
    const user = await this.authenticate(signal);

    return this.drafts.save(
      this.scope(user, document.documentId),
      document,
      expectedRevision,
    );
  }

  /** Creates a new shared item only when explicitly called. */
  async publishNewDashboard(
    publication: NewDashboardPublication,
    signal?: AbortSignal,
  ): Promise<MarketplaceItem> {
    return this.publishing.publishNewDashboard(publication, signal);
  }

  /** Overwrites the selected shared item only when explicitly called. */
  async replacePublishedDashboard(
    itemId: number,
    replacement: DashboardReplacement,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.publishing.replacePublishedDashboard(
      itemId,
      replacement,
      signal,
    );
  }

  private scope(user: MarketplaceUser, documentId: string): DraftScope {
    return {
      deploymentId: this.deploymentId,
      accountId: String(user.id),
      documentId,
    };
  }
}
