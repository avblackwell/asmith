/**
 * Appsmith Fixed Modal's detached auto-height update. A Modal is absent from
 * its parent canvas reflow tree, so its child-canvas height is reflected in
 * pixel `height`/`minHeight` as well as its DSL bounds. Its siblings stay put.
 *
 * Source: app/client/src/sagas/autoHeightSagas/{widgets,containers}.ts,
 * helpers.ts:getMinHeightBasedOnChildren, and
 * app/client/src/utils/WidgetSizeUtils.ts:getCanvasBottomRow.
 */
import type { AppsmithWidgetDsl, DashboardDocument } from "../../../document";
import {
  CANVAS_EXTENSION_OFFSET,
  DEFAULT_GRID_ROW_HEIGHT,
  getWidgetMaxAutoHeight,
  getWidgetMinAutoHeight,
  isAutoHeightEnabledForWidget,
} from "../../appsmith-fixed-autoheight/autoHeightRules";

function targetRows(modal: AppsmithWidgetDsl): number | null {
  if (modal.type !== "MODAL_WIDGET" || modal.detachFromLayout !== true ||
    !isAutoHeightEnabledForWidget(modal)) return null;
  const canvas = modal.children?.find((child) => child.type === "CANVAS_WIDGET");
  if (!canvas) return null;
  const minimum = getWidgetMinAutoHeight(modal) ?? 4;
  const maximum = getWidgetMaxAutoHeight(modal) ?? 9000;
  const occupiedBottom = Math.max(0, ...(canvas.children ?? [])
    .filter((child) => child.detachFromLayout !== true &&
      child.bottomRow !== child.topRow)
    .map((child) => child.bottomRow));
  const requested = (canvas.children?.length ?? 0) > 0
    ? Math.max(minimum, occupiedBottom + CANVAS_EXTENSION_OFFSET)
    : minimum;
  return Math.min(maximum, Math.max(minimum, requested));
}

/**
 * Recompute every detached Fixed Modal after its descendants have reflowed.
 * Local DSL bounds are row coordinates, so `bottomRow` includes `topRow`;
 * Appsmith's detached saga writes the height in rows to `bottomRow` because
 * its Modal is normally rooted at row zero. The panel dimensions are pixels.
 */
export function recomputeModalAutoHeight(sourceJson: string): string {
  const document = JSON.parse(sourceJson) as DashboardDocument;
  let changed = false;
  function visit(widget: AppsmithWidgetDsl): void {
    for (const child of widget.children ?? []) visit(child);
    const rows = targetRows(widget);
    if (rows === null) return;
    const px = rows * DEFAULT_GRID_ROW_HEIGHT;
    const canvas = widget.children?.find((child) => child.type === "CANVAS_WIDGET");
    if (!canvas) return;
    const bottomRow = widget.topRow + rows;
    if (widget.bottomRow !== bottomRow || widget.height !== px ||
      widget.minHeight !== px || canvas.bottomRow !== rows ||
      canvas.minHeight !== px) changed = true;
    widget.bottomRow = bottomRow;
    widget.height = px;
    widget.minHeight = px;
    // The local nested canvas stores row bounds; its render frame still uses
    // the Modal pixel height, matching ModalComponent.renderChildWidget.
    canvas.bottomRow = rows;
    canvas.minHeight = px;
  }
  visit(document.layout.dsl);
  return changed ? JSON.stringify(document) : sourceJson;
}
