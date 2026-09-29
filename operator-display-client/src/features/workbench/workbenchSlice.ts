import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { exampleDashboardDocument } from "../../document";
import { IndexedDbDraftStore } from "../../drafts/IndexedDbDraftStore";

export type WorkbenchSection = "widgets" | "outline" | "tools" | "settings";

interface WorkbenchState {
  /** JSON keeps the recursive widget DSL out of Immer's mapped reducer type. */
  documentJson: string;
  source: "example" | "draft";
  revision: number | null;
  selectedWidgetId: string | null;
  section: WorkbenchSection;
  isPreviewMode: boolean;
  showTabOrderOverlay: boolean;
  loadStatus: "idle" | "loading" | "succeeded" | "failed";
  loadError: string | null;
  requestId: string | null;
}

const initialState: WorkbenchState = {
  documentJson: JSON.stringify(exampleDashboardDocument),
  source: "example",
  revision: null,
  selectedWidgetId: "engine-title",
  section: "widgets",
  isPreviewMode: false,
  showTabOrderOverlay: false,
  loadStatus: "idle",
  loadError: null,
  requestId: null,
};

export const loadWorkbenchDraft = createAsyncThunk<
  { documentJson: string; firstWidgetId: string | null; revision: number },
  { accountId: number; draftId: string },
  { rejectValue: string }
>("workbench/loadDraft", async ({ accountId, draftId }, { rejectWithValue }) => {
  try {
    const record = await new IndexedDbDraftStore().load({
      deploymentId: `${window.location.origin}/operator_display`,
      accountId: String(accountId),
      documentId: draftId,
    });

    if (!record) return rejectWithValue("This local draft was not found for your account.");

    return {
      documentJson: JSON.stringify(record.document),
      firstWidgetId: record.document.layout.dsl.children?.[0]?.widgetId ?? null,
      revision: record.revision,
    };
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : "Loading the local draft failed.",
    );
  }
});

const slice = createSlice({
  name: "workbench",
  initialState,
  reducers: {
    selectWorkbenchWidget(state, action: PayloadAction<string | null>) {
      state.selectedWidgetId = action.payload;
    },
    chooseWorkbenchSection(state, action: PayloadAction<WorkbenchSection>) {
      state.section = action.payload;
    },
    setWorkbenchPreviewMode(state, action: PayloadAction<boolean>) {
      state.isPreviewMode = action.payload;
    },
    setShowTabOrderOverlay(state, action: PayloadAction<boolean>) {
      state.showTabOrderOverlay = action.payload;
    },
    showExampleDocument(state) {
      state.documentJson = JSON.stringify(exampleDashboardDocument);
      state.source = "example";
      state.revision = null;
      state.selectedWidgetId = "engine-title";
      state.isPreviewMode = false;
      state.loadStatus = "succeeded";
      state.loadError = null;
      state.requestId = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadWorkbenchDraft.pending, (state, action) => {
        state.loadStatus = "loading";
        state.isPreviewMode = false;
        state.loadError = null;
        state.requestId = action.meta.requestId;
      })
      .addCase(loadWorkbenchDraft.fulfilled, (state, action) => {
        if (state.requestId !== action.meta.requestId) return;

        state.documentJson = action.payload.documentJson;
        state.source = "draft";
        state.revision = action.payload.revision;
        state.selectedWidgetId = action.payload.firstWidgetId ?? "0";
        state.loadStatus = "succeeded";
        state.requestId = null;
      })
      .addCase(loadWorkbenchDraft.rejected, (state, action) => {
        if (state.requestId !== action.meta.requestId) return;

        state.requestId = null;

        if (action.meta.aborted) return;

        state.loadStatus = "failed";
        state.loadError = action.payload ?? "Loading the local draft failed.";
      });
  },
});

export const {
  chooseWorkbenchSection,
  selectWorkbenchWidget,
  setShowTabOrderOverlay,
  setWorkbenchPreviewMode,
  showExampleDocument,
} = slice.actions;
export default slice.reducer;
