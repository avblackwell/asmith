import type { EntityListTreeItem } from "@appsmith/ads";
import type { CanvasWidgetsReduxState } from "ee/reducers/entityReducers/canvasWidgetsReducer";

const ROOT_WIDGET_ID = "0";

function childIds(widget: CanvasWidgetsReduxState[string]): string[] {
  return Array.isArray(widget.children) ? widget.children : [];
}

/**
 * Build the author-facing widget tree from the editable Redux canvas.
 * Appsmith's root and container canvases are implementation details, so their
 * children appear directly beneath the nearest visible widget.
 */
export function projectWidgetOutline(
  widgets: CanvasWidgetsReduxState,
  selectedWidgetIds: readonly string[],
  collapsedWidgetIds: ReadonlySet<string>,
  searchText = "",
): EntityListTreeItem[] {
  const root = widgets[ROOT_WIDGET_ID];

  if (!root) return [];

  const query = searchText.trim().toLocaleLowerCase();
  const selected = new Set(selectedWidgetIds);

  function visit(
    widgetId: string,
    ancestors: ReadonlySet<string>,
    includeDescendants: boolean,
  ): EntityListTreeItem[] {
    const widget = widgets[widgetId];

    if (!widget || ancestors.has(widgetId)) return [];

    const nextAncestors = new Set(ancestors);

    nextAncestors.add(widgetId);

    const name = widget.widgetName?.trim() || widget.type;
    const matches =
      widget.type !== "CANVAS_WIDGET" &&
      (!query ||
        name.toLocaleLowerCase().includes(query) ||
        widget.type.replaceAll("_", " ").toLocaleLowerCase().includes(query));
    const children = childIds(widget).flatMap((id) =>
      visit(id, nextAncestors, includeDescendants || matches),
    );

    if (widget.type === "CANVAS_WIDGET") return children;

    if (query && !includeDescendants && !matches && children.length === 0) {
      return [];
    }

    return [
      {
        id: widgetId,
        name,
        type: widget.type,
        hasError: Boolean(widget.hasError),
        isSelected: selected.has(widgetId),
        isExpanded: Boolean(query) || !collapsedWidgetIds.has(widgetId),
        children: children.length ? children : undefined,
      },
    ];
  }

  return childIds(root).flatMap((id) =>
    visit(id, new Set([ROOT_WIDGET_ID]), false),
  );
}

/** Expand the visible ancestors of a widget selected on the canvas. */
export function getOutlineAncestorIds(
  widgets: CanvasWidgetsReduxState,
  selectedWidgetIds: readonly string[],
): Set<string> {
  const ancestors = new Set<string>();

  for (const selectedId of selectedWidgetIds) {
    const visited = new Set<string>([selectedId]);
    let parentId = widgets[selectedId]?.parentId;

    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);

      const parent = widgets[parentId];

      if (!parent) break;

      if (parent.type !== "CANVAS_WIDGET") ancestors.add(parentId);

      parentId = parent.parentId;
    }
  }

  return ancestors;
}

export function outlineWidgetTypeLabel(type: string): string {
  return type
    .replace(/^WDS_/, "")
    .replace(/_WIDGET$/, "")
    .replaceAll("_", " ")
    .toLocaleLowerCase()
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
}
