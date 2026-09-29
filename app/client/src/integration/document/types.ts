/** The first client-owned marketplace dashboard package. */
export const DASHBOARD_DOCUMENT_SCHEMA_VERSION = 1 as const;

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Appsmith's fixed-layout DSL is retained so its existing widget renderer can use it. */
export interface AppsmithWidgetDsl {
  widgetId: string;
  widgetName: string;
  type: string;
  version: number;
  topRow: number;
  bottomRow: number;
  leftColumn: number;
  rightColumn: number;
  parentId?: string;
  children?: AppsmithWidgetDsl[];
  [property: string]: JsonValue | AppsmithWidgetDsl[] | undefined;
}

/** Resolved against the selected, authorized cell when Run starts. */
export type VariableSelector =
  | { kind: "logicalName"; name: string }
  | { kind: "cyflexId"; id: string }; // uint64 decimal string, never a JS number

export interface DashboardVariable {
  key: string;
  label: string;
  selector: VariableSelector;
  valueType: "number" | "string" | "boolean";
}

interface BindingBase {
  id: string;
  variableKey: string;
  /** Cyflex fbVariable.ucode is a signed 32-bit integer. */
  unitCode: number;
  target: { widgetId: string; propertyPath: string };
}

export type DashboardBinding =
  | (BindingBase & {
      presentation: {
        kind: "latest";
        /** Literal text with a single {value} placeholder. */
        template: string;
        decimalPlaces?: number;
      };
    })
  | (BindingBase & {
      presentation: {
        kind: "history";
        maxPoints: number;
        windowSeconds: number;
      };
    });

export interface InlineDashboardTheme {
  kind: "inline";
  name: string;
  /** Mirrors the selected values of Appsmith's AppThemeProperties. */
  properties: {
    colors: {
      primaryColor: string;
      backgroundColor: string;
      [name: string]: string;
    };
    borderRadius: { appBorderRadius: string; [name: string]: string };
    boxShadow: { appBoxShadow: string; [name: string]: string };
    fontFamily: { appFont: string; [name: string]: string };
  };
}

export interface MarketplaceDashboardTheme {
  kind: "marketplace";
  itemId: string;
  revision: string;
}

export type DashboardTheme = InlineDashboardTheme | MarketplaceDashboardTheme;

/** A copied group is already in the DSL; this records its pinned origin. */
export interface ComponentDependency {
  key: string;
  revision: string;
  rootWidgetId: string;
  source:
    | { kind: "embedded" }
    | { kind: "marketplace"; itemId: string; contentSha256: string };
}

export interface DashboardDocument {
  assetKind: "dashboard";
  schemaVersion: typeof DASHBOARD_DOCUMENT_SCHEMA_VERSION;
  documentId: string;
  name: string;
  compatibility: {
    renderer: "appsmith";
    layoutSystem: "FIXED";
    /** Version of the root CANVAS_WIDGET DSL, distinct from this package version. */
    widgetDslVersion: number;
  };
  layout: { dsl: AppsmithWidgetDsl };
  variables: DashboardVariable[];
  bindings: DashboardBinding[];
  theme: DashboardTheme;
  componentDependencies: ComponentDependency[];
}
