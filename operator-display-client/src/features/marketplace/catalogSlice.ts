import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import {
  MarketplaceHttpError,
  marketplaceErrorMessage,
} from "../../api/marketplace";
import type {
  MarketplaceGroup,
  MarketplaceItem,
  MarketplacePage,
} from "../../api/types";
import type { LoadStatus, StoreDependencies } from "../../state/store";

export interface CatalogState {
  selectedGroupId: number | null;
  search: string;
  cursor: number | undefined;
  refreshVersion: number;
  groups: MarketplaceGroup[];
  groupsNextCursor: number | null;
  groupsStatus: LoadStatus;
  groupsError: string | null;
  groupsRequestId: string | null;
  page: MarketplacePage<MarketplaceItem> | null;
  itemsStatus: LoadStatus;
  itemsError: string | null;
  itemsRequestId: string | null;
  detailItem: MarketplaceItem | null;
  detailStatus: LoadStatus;
  detailError: string | null;
  detailRequestId: string | null;
}

const initialState: CatalogState = {
  selectedGroupId: null,
  search: "",
  cursor: undefined,
  refreshVersion: 0,
  groups: [],
  groupsNextCursor: null,
  groupsStatus: "idle",
  groupsError: null,
  groupsRequestId: null,
  page: null,
  itemsStatus: "idle",
  itemsError: null,
  itemsRequestId: null,
  detailItem: null,
  detailStatus: "idle",
  detailError: null,
  detailRequestId: null,
};

export const loadGroups = createAsyncThunk<
  MarketplacePage<MarketplaceGroup>,
  { cursor?: number },
  { extra: StoreDependencies; rejectValue: string }
>("marketplace/groups", async ({ cursor }, { extra, rejectWithValue, signal }) => {
  try {
    return await extra.marketplace.listGroups({ cursor, limit: 100 }, signal);
  } catch (error) {
    return rejectWithValue(marketplaceErrorMessage(error, "Loading groups"));
  }
});

export const loadItems = createAsyncThunk<
  MarketplacePage<MarketplaceItem>,
  { groupId: number | null; search: string; cursor?: number },
  { extra: StoreDependencies; rejectValue: string }
>(
  "marketplace/items",
  async ({ cursor, groupId, search }, { extra, rejectWithValue, signal }) => {
    try {
      return await extra.marketplace.listItems(
        {
          cursor,
          limit: 12,
          search: search || undefined,
          filters:
            groupId === null
              ? undefined
              : [{ field: "group_id", value: String(groupId) }],
        },
        signal,
      );
    } catch (error) {
      return rejectWithValue(marketplaceErrorMessage(error, "Loading items"));
    }
  },
);

export const loadItem = createAsyncThunk<
  MarketplaceItem,
  number,
  { extra: StoreDependencies; rejectValue: string }
>("marketplace/item", async (id, { extra, rejectWithValue, signal }) => {
  try {
    return await extra.marketplace.getItem(id, signal);
  } catch (error) {
    if (error instanceof MarketplaceHttpError && error.status === 404) {
      return rejectWithValue("This item was not found or is unavailable to your account.");
    }

    return rejectWithValue(marketplaceErrorMessage(error, "Loading item"));
  }
});

const catalogSlice = createSlice({
  name: "marketplace",
  initialState,
  reducers: {
    selectGroup(state, action: PayloadAction<number | null>) {
      state.selectedGroupId = action.payload;
      state.cursor = undefined;
    },
    setSearch(state, action: PayloadAction<string>) {
      state.search = action.payload;
      state.cursor = undefined;
    },
    setCursor(state, action: PayloadAction<number | undefined>) {
      state.cursor = action.payload;
    },
    refreshCatalog(state) {
      state.refreshVersion += 1;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadGroups.pending, (state, action) => {
        state.groupsStatus = "loading";
        state.groupsError = null;
        state.groupsRequestId = action.meta.requestId;
      })
      .addCase(loadGroups.fulfilled, (state, action) => {
        if (state.groupsRequestId !== action.meta.requestId) return;

        const nextGroups = action.meta.arg.cursor !== undefined
          ? [...state.groups, ...action.payload.data]
          : action.payload.data;
        state.groups = nextGroups.filter(
          (group, index) =>
            nextGroups.findIndex((candidate) => candidate.id === group.id) ===
            index,
        );
        state.groupsNextCursor = action.payload.meta.nextCursor;
        state.groupsStatus = "succeeded";
        state.groupsRequestId = null;
      })
      .addCase(loadGroups.rejected, (state, action) => {
        if (state.groupsRequestId !== action.meta.requestId) return;

        state.groupsRequestId = null;

        if (action.meta.aborted) return;

        state.groupsStatus = "failed";
        state.groupsError = action.payload ?? "Loading groups failed.";
      })
      .addCase(loadItems.pending, (state, action) => {
        state.itemsStatus = "loading";
        state.itemsError = null;
        state.itemsRequestId = action.meta.requestId;
      })
      .addCase(loadItems.fulfilled, (state, action) => {
        if (state.itemsRequestId !== action.meta.requestId) return;

        state.page = action.payload;
        state.itemsStatus = "succeeded";
        state.itemsRequestId = null;
      })
      .addCase(loadItems.rejected, (state, action) => {
        if (state.itemsRequestId !== action.meta.requestId) return;

        state.itemsRequestId = null;

        if (action.meta.aborted) return;

        state.itemsStatus = "failed";
        state.itemsError = action.payload ?? "Loading items failed.";
      })
      .addCase(loadItem.pending, (state, action) => {
        state.detailItem = null;
        state.detailStatus = "loading";
        state.detailError = null;
        state.detailRequestId = action.meta.requestId;
      })
      .addCase(loadItem.fulfilled, (state, action) => {
        if (state.detailRequestId !== action.meta.requestId) return;

        state.detailItem = action.payload;
        state.detailStatus = "succeeded";
        state.detailRequestId = null;
      })
      .addCase(loadItem.rejected, (state, action) => {
        if (state.detailRequestId !== action.meta.requestId) return;

        state.detailRequestId = null;

        if (action.meta.aborted) return;

        state.detailStatus = "failed";
        state.detailError = action.payload ?? "Loading item failed.";
      });
  },
});

export const { refreshCatalog, selectGroup, setCursor, setSearch } =
  catalogSlice.actions;
export default catalogSlice.reducer;
