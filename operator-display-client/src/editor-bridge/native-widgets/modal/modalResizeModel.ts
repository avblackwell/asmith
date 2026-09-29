import type { AppsmithWidgetDsl } from "../../../document";
import { DEFAULT_GRID_ROW_HEIGHT, CANVAS_EXTENSION_OFFSET } from "../../appsmith-fixed-autoheight/autoHeightRules";
import { resolvedModalWidth } from "./modalModel";

/** ModalResizableLayer's pixel limits, independent of Fixed grid geometry. */
export function modalResizeDimensions(options: {
  width: number;
  height: number;
  currentHeight: number;
  mainCanvasWidth: number;
  autoHeight: boolean;
}): { width: number; height: number } {
  if (!Number.isFinite(options.width) || !Number.isFinite(options.height)) {
    throw new Error("Modal dimensions must be finite pixel values.");
  }
  return {
    width: Math.max(100, resolvedModalWidth(options.width, options.mainCanvasWidth)),
    height: options.autoHeight ? options.currentHeight : Math.max(100, options.height),
  };
}

/**
 * Appsmith ModalSagas.getModalCanvasBottomRow translated to the local DSL's
 * row bounds. The upstream reducer stores this canvas bottom in pixels.
 */
export function modalCanvasBottomRows(heightPx: number,
  childCanvas: AppsmithWidgetDsl): number {
  const rowHeight = DEFAULT_GRID_ROW_HEIGHT;
  const baseRows = Math.ceil((heightPx -
    CANVAS_EXTENSION_OFFSET * rowHeight - rowHeight) / rowHeight);
  const occupiedBottom = Math.max(0, ...(childCanvas.children ?? [])
    .map((child) => child.bottomRow));
  return Math.max(baseRows, occupiedBottom) + CANVAS_EXTENSION_OFFSET;
}
