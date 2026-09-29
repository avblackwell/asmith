/**
 * Appsmith Fixed Tabs uses selectedTabWidgetId meta when checking container
 * auto height. The authored DSL does not contain that meta value, so project
 * its geometry for rendering without changing the editable document.
 *
 * Source: app/client/src/widgets/TabsWidget/widget/index.tsx (onTabChange and
 * getCanvasHeightOffset), sagas/autoHeightSagas/helpers.ts
 * (getChildOfContainerLikeWidget), containers.ts
 * (dynamicallyUpdateContainersSaga), and utils/autoHeight/reflow.ts.
 */
import type { AppsmithWidgetDsl, DashboardDocument } from "../../../document";
import {
  CANVAS_EXTENSION_OFFSET,
  DEFAULT_GRID_ROW_HEIGHT,
  getWidgetMaxAutoHeight,
  getWidgetMinAutoHeight,
  isAutoHeightEnabledForWidget,
  normalizedMainCanvasBottomRow,
} from "../../appsmith-fixed-autoheight/autoHeightRules";
import { buildAutoHeightTree } from "../../editable-store/autoHeightDocument";
import { computeChangeInPositionBasedOnDelta } from "../../editable-store/appsmith-auto-height/reflow";
import { recomputeModalAutoHeight } from "../modal/modalAutoHeight";
import { resolveSelectedTabCanvasId, tabsCanvasHeightOffsetRows } from "./tabsModel";

export interface ActiveTabAutoHeightProjection {
  documentJson: string;
  changed: boolean;
}

interface ContainerCandidate {
  widget: AppsmithWidgetDsl;
  depth: number;
}

function collectCandidates(
  widget: AppsmithWidgetDsl,
  depth: number,
  candidates: ContainerCandidate[],
  byId: Map<string, AppsmithWidgetDsl>,
): void {
  byId.set(widget.widgetId, widget);
  if (widget.type === "TABS_WIDGET") candidates.push({ widget, depth });
  for (const child of widget.children ?? []) {
    collectCandidates(child, depth + 1, candidates, byId);
  }
}

function includeContainerAncestors(
  candidates: ContainerCandidate[],
  byId: ReadonlyMap<string, AppsmithWidgetDsl>,
): ContainerCandidate[] {
  const candidateIds = new Set(candidates.map(({ widget }) => widget.widgetId));
  for (const { widget, depth } of [...candidates]) {
    let parentId = widget.parentId;
    let ancestorDepth = depth - 1;
    while (parentId) {
      const parent = byId.get(parentId);
      if (!parent) break;
      if ((parent.type === "CONTAINER_WIDGET" || parent.type === "STATBOX_WIDGET" ||
        parent.type === "TABS_WIDGET") &&
        !candidateIds.has(parent.widgetId)) {
        candidates.push({ widget: parent, depth: ancestorDepth });
        candidateIds.add(parent.widgetId);
      }
      parentId = parent.parentId;
      ancestorDepth--;
    }
  }
  return candidates.sort((left, right) => right.depth - left.depth);
}

function occupiedBottom(canvas: AppsmithWidgetDsl): number {
  return Math.max(0, ...(canvas.children ?? [])
    .filter((child) => child.detachFromLayout !== true)
    .map((child) => child.bottomRow));
}

function containerHeightOffsetRows(container: AppsmithWidgetDsl): number {
  if (container.type === "TABS_WIDGET") {
    return tabsCanvasHeightOffsetRows(
      container.borderWidth as string | number | undefined,
      container.shouldShowTabs !== false,
    );
  }
  const border = Number(container.borderWidth ?? 0);
  return Number.isFinite(border) && border > 1
    ? Math.ceil((border * 2) / DEFAULT_GRID_ROW_HEIGHT) : 0;
}

function activeCanvas(
  container: AppsmithWidgetDsl,
  activeTabCanvasIds: Readonly<Record<string, string>>,
): AppsmithWidgetDsl | undefined {
  const canvases = container.children?.filter((child) => child.type === "CANVAS_WIDGET") ?? [];
  if (container.type !== "TABS_WIDGET") return canvases[0];
  const canvasId = resolveSelectedTabCanvasId(
    container.tabsObj,
    typeof container.defaultTab === "string" ? container.defaultTab : undefined,
    activeTabCanvasIds[container.widgetId],
  );
  return canvases.find((canvas) => canvas.widgetId === canvasId);
}

function targetHeightRows(
  container: AppsmithWidgetDsl,
  activeTabCanvasIds: Readonly<Record<string, string>>,
): number | null {
  if (!isAutoHeightEnabledForWidget(container)) return null;
  const canvas = activeCanvas(container, activeTabCanvasIds);
  if (!canvas) return null;
  const minimum = getWidgetMinAutoHeight(container) ?? 4;
  const maximum = getWidgetMaxAutoHeight(container) ?? 9000;
  const offset = containerHeightOffsetRows(container);
  // Appsmith's container check handles a truly empty canvas separately. A
  // nonempty canvas uses the bottommost in-layout child plus two extension rows.
  const requested = (canvas.children?.length ?? 0) > 0
    ? Math.max(minimum, occupiedBottom(canvas) + CANVAS_EXTENSION_OFFSET + offset)
    : minimum + offset;
  return Math.min(maximum, Math.max(minimum, requested));
}

function applyHeight(
  root: AppsmithWidgetDsl,
  container: AppsmithWidgetDsl,
  targetRows: number,
  byId: ReadonlyMap<string, AppsmithWidgetDsl>,
): boolean {
  const parent = container.parentId ? byId.get(container.parentId) : undefined;
  if (parent?.type !== "CANVAS_WIDGET") return false;
  const tree = buildAutoHeightTree(root);
  if (!tree[container.widgetId]) return false;
  const delta = targetRows - (container.bottomRow - container.topRow);
  if (delta === 0) return false;
  const bounds = computeChangeInPositionBasedOnDelta(tree, { [container.widgetId]: delta });
  for (const sibling of parent.children ?? []) {
    const next = bounds[sibling.widgetId];
    if (!next) continue;
    sibling.topRow = next.topRow;
    sibling.bottomRow = next.bottomRow;
  }
  // Container's one canvas tracks its auto-height parent; Tabs renders its
  // selected canvas using the parent componentHeight and keeps both authored
  // tab canvases untouched.
  if (container.type === "CONTAINER_WIDGET" || container.type === "STATBOX_WIDGET") {
    const inner = container.children?.find((child) => child.type === "CANVAS_WIDGET");
    if (inner) inner.bottomRow = targetRows;
  }
  return true;
}

/**
 * Return active-tab geometry for the Fixed renderer and planner. The caller
 * must keep `sourceJson` as the Redux document/save source. This is a pure
 * view projection: tab switching creates no undo entry and cannot mark dirty.
 */
export function projectActiveTabsAutoHeight(
  sourceJson: string,
  activeTabCanvasIds: Readonly<Record<string, string>>,
): ActiveTabAutoHeightProjection {
  const document = JSON.parse(sourceJson) as DashboardDocument;
  const root = document.layout.dsl;
  const candidates: ContainerCandidate[] = [];
  const byId = new Map<string, AppsmithWidgetDsl>();
  collectCandidates(root, 0, candidates, byId);
  if (candidates.length === 0) return { documentJson: sourceJson, changed: false };
  includeContainerAncestors(candidates, byId);

  let changed = false;
  for (const { widget } of candidates) {
    const target = targetHeightRows(widget, activeTabCanvasIds);
    if (target !== null) changed = applyHeight(root, widget, target, byId) || changed;
  }
  if (!changed) return { documentJson: sourceJson, changed: false };
  root.bottomRow = normalizedMainCanvasBottomRow(root.children ?? []);
  // A Tabs canvas can sit inside a detached Modal. Its selected-tab reflow
  // changes the Modal's panel height, but never moves root siblings.
  return { documentJson: recomputeModalAutoHeight(JSON.stringify(document)), changed: true };
}
