/**
 * CanvasSelectionArena clamps a drag that starts in the surrounding widget
 * editor to two pixels inside the root canvas before drawing its marquee.
 */
export function outsideCanvasSelectionStart(
  startClientX: number,
  startClientY: number,
  bounds: Pick<DOMRect, "left" | "top" | "width" | "height">,
): { x: number; y: number } {
  const buffer = 2;
  const clamp = (point: number, origin: number, extent: number) =>
    Math.max(Math.min(point - origin, extent - buffer), buffer);
  return {
    x: clamp(startClientX, bounds.left, bounds.width),
    y: clamp(startClientY, bounds.top, bounds.height),
  };
}
