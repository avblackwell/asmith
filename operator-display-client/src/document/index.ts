/**
 * Copied unchanged in behavior from app/client/src/integration/document.
 * Apache-2.0; see the repository LICENSE. This package has no Appsmith
 * backend, Redux, widget-registry, or browser transport imports.
 */
export { DASHBOARD_DOCUMENT_SCHEMA_VERSION } from "./types";
export type {
  AppsmithWidgetDsl,
  ComponentDependency,
  DashboardBinding,
  DashboardDocument,
  DashboardTheme,
  DashboardVariable,
  InlineDashboardTheme,
  MarketplaceDashboardTheme,
  VariableSelector,
} from "./types";
export {
  DashboardDocumentValidationError,
  importDashboardDocumentFile,
  importDashboardDocumentJson,
  parseDashboardDocument,
  serializeDashboardDocument,
} from "./validation";
export { exampleDashboardDocument } from "./exampleDashboardDocument";
export { createBlankDashboardDocument } from "./createBlankDashboardDocument";
