import { parseDashboardDocument, type AppsmithWidgetDsl } from "../document";
import { flattenDSL, migrateDSL, ROOT_CONTAINER_WIDGET_ID } from "./dsl";
import type { DSLWidget } from "./dsl";

/** The identifiers seeded by the existing standalone editor compatibility store. */
export const STANDALONE_APPLICATION_ID = "standalone-dashboard";
export const STANDALONE_PAGE_ID = "standalone-page";
export const STANDALONE_LAYOUT_ID = "standalone-layout";

export interface CanvasPayload {
  pageWidgetId: string;
  currentPageName: string;
  currentPageId: string;
  dsl: DSLWidget;
  widgets: ReturnType<typeof flattenDSL<DSLWidget>>;
  currentLayoutId: string;
  currentApplicationId: string;
  pageActions: [];
  layoutOnLoadActionErrors: [];
}

/**
 * Pure counterpart of standalone's `canvasForDocument` and PageSagas'
 * `getCanvasWidgetsPayload`. The copied @shared/dsl runtime performs the same
 * migration and normalizr flattening. No Page API response or API module is
 * involved. Work on a clone because Appsmith migrations mutate their input.
 */
export async function canvasPayloadForDocument(
  input: unknown,
): Promise<CanvasPayload> {
  const document = parseDashboardDocument(input);
  const sourceDsl = JSON.parse(
    JSON.stringify(document.layout.dsl),
  ) as AppsmithWidgetDsl;
  const dsl = await migrateDSL(sourceDsl, false);

  return {
    pageWidgetId: ROOT_CONTAINER_WIDGET_ID,
    currentPageName: document.name,
    currentPageId: STANDALONE_PAGE_ID,
    dsl,
    widgets: flattenDSL(dsl),
    currentLayoutId: STANDALONE_LAYOUT_ID,
    currentApplicationId: STANDALONE_APPLICATION_ID,
    pageActions: [],
    layoutOnLoadActionErrors: [],
  };
}
