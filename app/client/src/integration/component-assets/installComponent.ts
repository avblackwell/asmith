import { sha256 } from "js-sha256";
import { LATEST_DSL_VERSION, migrateDSL } from "@shared/dsl";
import { insertCopiedComponent } from "../components";
import {
  parseDashboardDocument,
  serializeDashboardDocument,
  type AppsmithWidgetDsl,
  type DashboardDocument,
} from "../document";
import type { MarketplaceItem } from "../marketplace";
import { parseComponentPackage } from "./componentPackage";
import type { ComponentPackage } from "./types";

export class ComponentInstallationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComponentInstallationError";
  }
}

export interface DownloadedComponent {
  component: ComponentPackage;
  contentSha256: string;
  metadata: MarketplaceItem;
}

export interface InstallComponentOptions {
  /** Defaults to the dashboard's root canvas. */
  targetParentId?: string;
  reservedNames?: readonly string[];
}

export interface InstalledComponent {
  document: DashboardDocument;
  copiedSubtree: AppsmithWidgetDsl;
  widgetIdMap: Record<string, string>;
  widgetNameMap: Record<string, string>;
  unresolvedDynamicPaths: string[];
  contentSha256: string;
  metadata: MarketplaceItem;
}

function findWidget(
  root: AppsmithWidgetDsl,
  id: string,
): AppsmithWidgetDsl | null {
  if (root.widgetId === id) return root;

  for (const child of root.children ?? []) {
    const found = findWidget(child, id);

    if (found) return found;
  }

  return null;
}

function reserveName(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 1;

  while (used.has(candidate)) {
    candidate = `${base}Copy${suffix}`;
    suffix += 1;
  }

  used.add(candidate);

  return candidate;
}

function freeSentinel(
  root: AppsmithWidgetDsl,
  base: string,
  field: "widgetId" | "widgetName",
): string {
  const used = new Set<string>();

  function visit(widget: AppsmithWidgetDsl): void {
    used.add(widget[field]);
    widget.children?.forEach(visit);
  }

  visit(root);
  let candidate = base;
  let suffix = 1;

  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }

  return candidate;
}

/**
 * Run the same Appsmith DSL migration used when the editor opens a dashboard.
 * It operates on a synthetic canvas because DSL migrations are page-scoped.
 * The package validator catches bindings broken by a structural migration.
 */
async function migrateComponentForDashboard(
  input: ComponentPackage,
  targetVersion: number,
): Promise<ComponentPackage> {
  const sourceVersion = input.compatibility.widgetDslVersion;

  if (sourceVersion === targetVersion) return input;

  if (
    sourceVersion < 89 ||
    sourceVersion > targetVersion ||
    targetVersion !== LATEST_DSL_VERSION
  ) {
    throw new ComponentInstallationError(
      `Unsupported component DSL migration from ${sourceVersion} to ${targetVersion}`,
    );
  }

  const group = JSON.parse(JSON.stringify(input.subtree)) as AppsmithWidgetDsl;
  const canvasId = freeSentinel(
    group,
    "__component_migration_canvas__",
    "widgetId",
  );
  const canvasName = freeSentinel(
    group,
    "__ComponentMigrationCanvas__",
    "widgetName",
  );

  group.parentId = canvasId;
  const canvas = {
    widgetId: canvasId,
    widgetName: canvasName,
    type: "CANVAS_WIDGET",
    version: sourceVersion,
    topRow: 0,
    bottomRow: Math.max(1, group.bottomRow + 1),
    leftColumn: 0,
    rightColumn: Math.max(1, group.rightColumn + 1),
    canExtend: true,
    detachFromLayout: true,
    children: [group],
  };

  let migrated: typeof canvas;

  try {
    migrated = (await migrateDSL(canvas)) as typeof canvas;
  } catch (error) {
    throw new ComponentInstallationError(
      `Component DSL migration failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (
    migrated.version !== targetVersion ||
    migrated.children?.length !== 1 ||
    migrated.children[0].widgetId !== input.subtree.widgetId
  ) {
    throw new ComponentInstallationError(
      "Component DSL migration returned an incompatible group",
    );
  }

  const subtree = migrated.children[0];

  delete subtree.parentId;

  try {
    return parseComponentPackage({
      ...input,
      compatibility: {
        ...input.compatibility,
        widgetDslVersion: targetVersion,
      },
      subtree,
    });
  } catch (error) {
    throw new ComponentInstallationError(
      `Migrated component failed validation: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Installs a copied group into a working document. The published component is
 * pinned by content hash; future marketplace replacements do not change this
 * already copied subtree. Saving the returned document remains a local action.
 */
export async function installDownloadedComponent(
  downloaded: DownloadedComponent,
  input: unknown,
  options: InstallComponentOptions = {},
): Promise<InstalledComponent> {
  const originalComponent = parseComponentPackage(downloaded.component);
  const document = parseDashboardDocument(
    JSON.parse(serializeDashboardDocument(input)),
  );
  const component = await migrateComponentForDashboard(
    originalComponent,
    document.compatibility.widgetDslVersion,
  );

  if (
    downloaded.metadata.type !== "component" ||
    !Number.isSafeInteger(downloaded.metadata.id) ||
    downloaded.metadata.id <= 0
  ) {
    throw new ComponentInstallationError(
      "Marketplace metadata is not a component item",
    );
  }

  if (!/^[a-f0-9]{64}$/.test(downloaded.contentSha256)) {
    throw new ComponentInstallationError("Invalid component content digest");
  }

  const targetParentId = options.targetParentId ?? document.layout.dsl.widgetId;
  const parent = findWidget(document.layout.dsl, targetParentId);

  if (!parent || parent.type !== "CANVAS_WIDGET") {
    throw new ComponentInstallationError(
      "Choose a canvas as the component parent",
    );
  }

  const parentWidth = parent.rightColumn - parent.leftColumn;
  const componentWidth =
    component.subtree.rightColumn - component.subtree.leftColumn;

  if (componentWidth > parentWidth) {
    throw new ComponentInstallationError(
      "Component is wider than the destination canvas",
    );
  }

  const inserted = insertCopiedComponent(
    component.subtree,
    document.layout.dsl,
    { targetParentId, reservedNames: options.reservedNames },
  );
  const targetParent = findWidget(inserted.targetTree, targetParentId);

  if (!targetParent) {
    throw new ComponentInstallationError("Destination canvas disappeared");
  }

  const copy = inserted.copiedSubtree;
  const previousChildren = (targetParent.children ?? []).filter(
    (child) => child.widgetId !== copy.widgetId,
  );
  const bottom = previousChildren.reduce(
    (value, child) => Math.max(value, child.bottomRow),
    0,
  );
  const height = copy.bottomRow - copy.topRow;
  const width = copy.rightColumn - copy.leftColumn;

  copy.topRow = Math.max(copy.topRow, bottom + 2);
  copy.bottomRow = copy.topRow + height;
  copy.leftColumn = Math.min(copy.leftColumn, Math.max(0, parentWidth - width));
  copy.rightColumn = copy.leftColumn + width;

  if (targetParentId === inserted.targetTree.widgetId) {
    inserted.targetTree.bottomRow = Math.max(
      inserted.targetTree.bottomRow,
      copy.bottomRow + 2,
    );
  } else if (copy.bottomRow > targetParent.bottomRow) {
    throw new ComponentInstallationError(
      "Destination canvas cannot fit the copied component",
    );
  }

  const usedVariableKeys = new Set(
    document.variables.map((variable) => variable.key),
  );
  const variableKeyMap = new Map<string, string>();
  const variables = component.variables.map((variable) => {
    const key = reserveName(variable.key, usedVariableKeys);

    variableKeyMap.set(variable.key, key);

    return { ...variable, key };
  });
  const usedBindingIds = new Set(
    document.bindings.map((binding) => binding.id),
  );
  const bindings = component.bindings.map((binding) => ({
    ...binding,
    id: reserveName(binding.id, usedBindingIds),
    variableKey: variableKeyMap.get(binding.variableKey) ?? binding.variableKey,
    target: {
      ...binding.target,
      widgetId: inserted.widgetIdMap[binding.target.widgetId],
    },
  }));
  const dependencyKey = `component:${component.componentId}:${copy.widgetId}`;
  const updated = parseDashboardDocument({
    ...document,
    layout: { dsl: inserted.targetTree },
    variables: [...document.variables, ...variables],
    bindings: [...document.bindings, ...bindings],
    componentDependencies: [
      ...document.componentDependencies,
      {
        key: dependencyKey,
        revision: downloaded.contentSha256,
        rootWidgetId: copy.widgetId,
        source: {
          kind: "marketplace",
          itemId: String(downloaded.metadata.id),
          contentSha256: downloaded.contentSha256,
        },
      },
    ],
  });

  return {
    document: updated,
    copiedSubtree: copy,
    widgetIdMap: inserted.widgetIdMap,
    widgetNameMap: inserted.widgetNameMap,
    unresolvedDynamicPaths: inserted.unresolvedDynamicPaths,
    contentSha256: downloaded.contentSha256,
    metadata: downloaded.metadata,
  };
}

/** Hashes exact downloaded JSON bytes, including whitespace and encoding. */
export async function componentContentSha256(content: Blob): Promise<string> {
  return sha256(new Uint8Array(await content.arrayBuffer()));
}
