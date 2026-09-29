import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { nanoid } from "nanoid";
import { marketplaceErrorMessage } from "../../api/marketplace";
import type { MarketplaceItem, MarketplacePage } from "../../api/types";
import { createBlankDashboardDocument } from "../../document";
import { IndexedDbDraftStore } from "../../drafts/IndexedDbDraftStore";
import type { LoadStatus, StoreDependencies } from "../../state/store";
import {
  listLocalDraftMetadata,
  type LocalDraftSummary,
  type LocalDraftSummaryList,
} from "./localDraftMetadata";

export type WorkspaceView = "all" | "local";

export interface WorkspaceState {
  view: WorkspaceView;
  search: string;
  cursor: number | undefined;
  refreshVersion: number;
  page: MarketplacePage<MarketplaceItem> | null;
  itemsStatus: LoadStatus;
  itemsError: string | null;
  itemsRequestId: string | null;
  drafts: LocalDraftSummary[];
  damagedDraftCount: number;
  draftsStatus: LoadStatus;
  draftsError: string | null;
  draftsRequestId: string | null;
  createStatus: LoadStatus;
  createError: string | null;
  createRequestId: string | null;
}

const initialState: WorkspaceState = {
  view: "all",
  search: "",
  cursor: undefined,
  refreshVersion: 0,
  page: null,
  itemsStatus: "idle",
  itemsError: null,
  itemsRequestId: null,
  drafts: [],
  damagedDraftCount: 0,
  draftsStatus: "idle",
  draftsError: null,
  draftsRequestId: null,
  createStatus: "idle",
  createError: null,
  createRequestId: null,
};

export const loadDashboardItems = createAsyncThunk<
  MarketplacePage<MarketplaceItem>,
  { search: string; cursor?: number },
  { extra: StoreDependencies; rejectValue: string }
>(
  "workspace/dashboardItems",
  async ({ cursor, search }, { extra, rejectWithValue, signal }) => {
    try {
      // The Java paginator matches item type exactly. The existing workspace
      // service applies this same filter to avoid including themes/components.
      return await extra.marketplace.listItems(
        {
          cursor,
          limit: 12,
          search: search || undefined,
          filters: [{ field: "type", value: "dashboard" }],
        },
        signal,
      );
    } catch (error) {
      return rejectWithValue(
        marketplaceErrorMessage(error, "Loading dashboards"),
      );
    }
  },
);

export const loadLocalDrafts = createAsyncThunk<
  LocalDraftSummaryList,
  { accountId: number },
  { rejectValue: string }
>("workspace/localDrafts", async ({ accountId }, { rejectWithValue }) => {
  try {
    // Must match integration/workspace-entry/index.tsx so existing drafts are
    // visible to this separate bundle on the same origin.
    return await listLocalDraftMetadata(
      `${window.location.origin}/operator_display`,
      String(accountId),
    );
  } catch (error) {
    return rejectWithValue(
      error instanceof Error
        ? error.message
        : "Loading local drafts failed.",
    );
  }
});

/** Create the same account/deployment scoped draft that WorkbenchPage loads. */
export const createLocalDraft = createAsyncThunk<
  string,
  { accountId: number },
  { rejectValue: string }
>("workspace/createLocalDraft", async ({ accountId }, { rejectWithValue }) => {
  try {
    const documentId = `dashboard-${nanoid(12)}`;
    const document = createBlankDashboardDocument(documentId);

    await new IndexedDbDraftStore().save(
      {
        deploymentId: `${window.location.origin}/operator_display`,
        accountId: String(accountId),
        documentId,
      },
      document,
      null,
    );

    return documentId;
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : "Creating the local draft failed.",
    );
  }
});

const workspaceSlice = createSlice({
  name: "workspace",
  initialState,
  reducers: {
    chooseWorkspaceView(state, action: PayloadAction<WorkspaceView>) {
      state.view = action.payload;
      state.cursor = undefined;
    },
    setWorkspaceSearch(state, action: PayloadAction<string>) {
      state.search = action.payload;
      state.cursor = undefined;
    },
    setWorkspaceCursor(state, action: PayloadAction<number | undefined>) {
      state.cursor = action.payload;
    },
    refreshWorkspace(state) {
      state.refreshVersion += 1;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadDashboardItems.pending, (state, action) => {
        state.itemsStatus = "loading";
        state.itemsError = null;
        state.itemsRequestId = action.meta.requestId;
      })
      .addCase(loadDashboardItems.fulfilled, (state, action) => {
        if (state.itemsRequestId !== action.meta.requestId) return;

        state.page = action.payload;
        state.itemsStatus = "succeeded";
        state.itemsRequestId = null;
      })
      .addCase(loadDashboardItems.rejected, (state, action) => {
        if (state.itemsRequestId !== action.meta.requestId) return;

        state.itemsRequestId = null;

        if (action.meta.aborted) return;

        state.itemsStatus = "failed";
        state.itemsError = action.payload ?? "Loading dashboards failed.";
      })
      .addCase(loadLocalDrafts.pending, (state, action) => {
        state.draftsStatus = "loading";
        state.draftsError = null;
        state.drafts = [];
        state.damagedDraftCount = 0;
        state.draftsRequestId = action.meta.requestId;
      })
      .addCase(loadLocalDrafts.fulfilled, (state, action) => {
        if (state.draftsRequestId !== action.meta.requestId) return;

        state.drafts = action.payload.drafts;
        state.damagedDraftCount = action.payload.damagedCount;
        state.draftsStatus = "succeeded";
        state.draftsRequestId = null;
      })
      .addCase(loadLocalDrafts.rejected, (state, action) => {
        if (state.draftsRequestId !== action.meta.requestId) return;

        state.draftsRequestId = null;

        if (action.meta.aborted) return;

        state.draftsStatus = "failed";
        state.draftsError = action.payload ?? "Loading local drafts failed.";
      })
      .addCase(createLocalDraft.pending, (state, action) => {
        state.createStatus = "loading";
        state.createError = null;
        state.createRequestId = action.meta.requestId;
      })
      .addCase(createLocalDraft.fulfilled, (state, action) => {
        if (state.createRequestId !== action.meta.requestId) return;

        state.createStatus = "succeeded";
        state.createRequestId = null;
        state.refreshVersion += 1;
      })
      .addCase(createLocalDraft.rejected, (state, action) => {
        if (state.createRequestId !== action.meta.requestId) return;

        state.createRequestId = null;

        if (action.meta.aborted) return;

        state.createStatus = "failed";
        state.createError = action.payload ?? "Creating the local draft failed.";
      });
  },
});

export const {
  chooseWorkspaceView,
  refreshWorkspace,
  setWorkspaceCursor,
  setWorkspaceSearch,
} = workspaceSlice.actions;
export default workspaceSlice.reducer;
