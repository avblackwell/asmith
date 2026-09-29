import {
  configureStore,
  createAsyncThunk,
  createSlice,
} from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import type { TypedUseSelectorHook } from "react-redux";
import {
  MarketplaceClient,
  marketplaceErrorMessage,
} from "../api/marketplace";
import type { MarketplaceApi } from "../api/marketplace";
import type { MarketplaceUser } from "../api/types";
import catalogReducer from "../features/marketplace/catalogSlice";
import { workspaceReducer } from "../features/workspace";
import workbenchReducer from "../features/workbench/workbenchSlice";

export interface StoreDependencies {
  marketplace: MarketplaceApi;
}

export type LoadStatus = "idle" | "loading" | "succeeded" | "failed";

export interface SessionState {
  user: MarketplaceUser | null;
  status: LoadStatus;
  error: string | null;
  requestId: string | null;
}

export const loadSession = createAsyncThunk<
  MarketplaceUser,
  void,
  { extra: StoreDependencies; rejectValue: string }
>("session/load", async (_, { extra, rejectWithValue, signal }) => {
  try {
    return await extra.marketplace.getCurrentUser(signal);
  } catch (error) {
    return rejectWithValue(marketplaceErrorMessage(error, "Loading account"));
  }
});

const initialSession: SessionState = {
  user: null,
  status: "idle",
  error: null,
  requestId: null,
};

const sessionSlice = createSlice({
  name: "session",
  initialState: initialSession,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadSession.pending, (state, action) => {
        state.status = "loading";
        state.error = null;
        state.requestId = action.meta.requestId;
      })
      .addCase(loadSession.fulfilled, (state, action) => {
        if (state.requestId !== action.meta.requestId) return;

        state.status = "succeeded";
        state.user = action.payload;
        state.requestId = null;
      })
      .addCase(loadSession.rejected, (state, action) => {
        if (state.requestId !== action.meta.requestId) return;

        state.requestId = null;

        if (action.meta.aborted) return;

        state.status = "failed";
        state.user = null;
        state.error = action.payload ?? "Loading account failed.";
      });
  },
});

export function createAppStore(
  marketplace: MarketplaceApi = new MarketplaceClient(),
) {
  return configureStore({
    reducer: {
      session: sessionSlice.reducer,
      marketplace: catalogReducer,
      workspace: workspaceReducer,
      workbench: workbenchReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        thunk: { extraArgument: { marketplace } satisfies StoreDependencies },
      }),
  });
}

export const store = createAppStore();
export type AppStore = ReturnType<typeof createAppStore>;
export type AppState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
export const useAppSelector: TypedUseSelectorHook<AppState> = useSelector;
export const useAppDispatch = () => useDispatch<AppDispatch>();
