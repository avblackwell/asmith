import { WIDGET_PADDING } from "../../appsmith-fixed-autoheight/autoHeightRules";

export interface ModalRenderMetrics {
  widthPx: number;
  heightPx: number;
  childCanvasWidthPx: number;
  childCanvasMinHeightPx: number;
  canExtendChildCanvas: boolean;
}

/** Appsmith useModalWidth caps the modal at 95% of ui.mainCanvas.width. */
export function resolvedModalWidth(requestedWidthPx: number,
  mainCanvasWidthPx: number): number {
  return Math.min((mainCanvasWidthPx || 0) * 0.95, requestedWidthPx || 0);
}

/** ModalComponent.renderChildWidget overrides these nested canvas props. */
export function modalRenderMetrics(options: {
  requestedWidthPx: number;
  requestedHeightPx: number;
  mainCanvasWidthPx: number;
  shouldScrollContents: boolean;
}): ModalRenderMetrics {
  const widthPx = resolvedModalWidth(options.requestedWidthPx,
    options.mainCanvasWidthPx);
  return {
    widthPx,
    heightPx: options.requestedHeightPx,
    childCanvasWidthPx: widthPx + WIDGET_PADDING * 2,
    childCanvasMinHeightPx: options.requestedHeightPx,
    canExtendChildCanvas: options.shouldScrollContents,
  };
}

/** ModalWidget.getModalVisibility / ModalOverlayLayer visibility rule. */
export function modalIsVisible(widgetId: string, isVisible: boolean | undefined,
  selectedWidgetAncestry?: readonly string[]): boolean {
  return selectedWidgetAncestry?.includes(widgetId) === true || isVisible === true;
}
