/**
 * Port of Appsmith's useRenderBlocksOnCanvas:drawBlockOnCanvas/renderBlocks.
 * The caller supplies the blocks after reflow has adjusted their rectangles,
 * as useRenderBlocksOnCanvas receives modifyDrawingRectangles' result.
 */
export interface FixedCanvasPaintBlock {
  /** Pixel coordinates in the drag arena's canvas, before container padding. */
  left: number;
  top: number;
  width: number;
  height: number;
  valid: boolean;
}

export interface FixedCanvasPaintInput {
  canvas: HTMLCanvasElement;
  blocks: readonly FixedCanvasPaintBlock[];
  snapColumnSpace: number;
  snapRowSpace: number;
  noPad: boolean;
  zoomLevel?: number;
}

function absolutePixels(size: string): number {
  const pixelIndex = size.indexOf("px");
  return pixelIndex === -1 ? 0 : Number.parseInt(size.slice(0, pixelIndex), 10);
}

export function paintFixedCanvasBlocks({
  canvas, blocks, snapColumnSpace, snapRowSpace, noPad,
  zoomLevel = 1,
}: FixedCanvasPaintInput): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const topOffset = absolutePixels(canvas.style.top);
  const leftOffset = absolutePixels(canvas.style.left);
  const padding = noPad ? 0 : 6;
  context.save();
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.beginPath();
  context.transform(zoomLevel, 0, 0, zoomLevel, 0, 0);
  for (const block of blocks) {
    const snappedX = Math.round(block.left / snapColumnSpace) * snapColumnSpace;
    const snappedY = Math.round(block.top / snapRowSpace) * snapRowSpace;
    context.fillStyle = block.valid
      ? "rgb(104, 113, 239, 0.6)" : "rgb(255, 55, 35, 0.6)";
    context.fillRect(block.left - leftOffset + padding,
      block.top - topOffset + padding, block.width, block.height);
    context.setLineDash([3]);
    context.strokeStyle = block.valid ? "rgb(104, 113, 239)" : "red";
    context.strokeRect(snappedX - leftOffset + 1 + padding,
      snappedY - topOffset + 1 + padding,
      block.width - 1, block.height - 1);
  }
  context.restore();
}
