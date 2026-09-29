/** Local equivalents of Appsmith's CanvasEditorConstants and boxHelpers types. */
export interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface OccupiedSpace extends Rect {
  id: string;
  parentId?: string;
}

export function areIntersecting(first: Rect, second: Rect): boolean {
  return !(
    second.left >= first.right ||
    second.right <= first.left ||
    second.top >= first.bottom ||
    second.bottom <= first.top
  );
}
