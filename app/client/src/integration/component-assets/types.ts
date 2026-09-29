import type {
  AppsmithWidgetDsl,
  DashboardBinding,
  DashboardVariable,
} from "../document";

export const COMPONENT_PACKAGE_SCHEMA_VERSION = 1 as const;

/** A portable copy of a widget group and the stream bindings inside it. */
export interface ComponentPackage {
  assetKind: "component";
  schemaVersion: typeof COMPONENT_PACKAGE_SCHEMA_VERSION;
  componentId: string;
  name: string;
  compatibility: {
    renderer: "appsmith";
    layoutSystem: "FIXED";
    widgetDslVersion: number;
  };
  /** The root group has no parentId until it is inserted into a dashboard. */
  subtree: AppsmithWidgetDsl;
  variables: DashboardVariable[];
  bindings: DashboardBinding[];
}
