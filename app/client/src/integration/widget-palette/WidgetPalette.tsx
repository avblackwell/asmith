import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { DefaultRootState } from "react-redux";
import { WidgetReduxActionTypes } from "ee/constants/ReduxActionConstants";
import {
  UI_ELEMENT_PANEL_SEARCH_TEXT,
  WIDGET_PANEL_EMPTY_MESSAGE,
  createMessage,
} from "ee/constants/messages";
import { setSelectedWidgets } from "actions/widgetSelectionActions";
import { generateReactKey } from "utils/generators";
import { getSelectedWidgets } from "selectors/ui";
import { getWidgetCards } from "selectors/editorSelectors";
import { WIDGET_TAGS } from "constants/WidgetConstants";
import { groupWidgetCardsByTags } from "pages/Editor/utils";
import UIEntitySidebar from "pages/Editor/widgetSidebar/UIEntitySidebar";
import { buildPaletteWidget } from "./buildPaletteWidget";
import type { DisplayWidgetKind } from "./buildPaletteWidget";
import "./widgetPalette.css";

const DISPLAY_WIDGETS: {
  kind: DisplayWidgetKind;
  label: string;
  type: string;
}[] = [
  { kind: "text", label: "Add text", type: "TEXT_WIDGET" },
  { kind: "chart", label: "Add chart", type: "CHART_WIDGET" },
  { kind: "container", label: "Add container", type: "CONTAINER_WIDGET" },
];

export function WidgetPalette({ disabled = false }: { disabled?: boolean }) {
  const dispatch = useDispatch();
  const widgets = useSelector(
    (state: DefaultRootState) => state.entities.canvasWidgets,
  );
  const selectedWidgetIds = useSelector(getSelectedWidgets);
  const widgetCards = useSelector(getWidgetCards);
  const canvasWidth = useSelector(
    (state: DefaultRootState) => state.ui.mainCanvas.width,
  );
  const [pendingWidgetId, setPendingWidgetId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const displayCards = useMemo(
    () =>
      widgetCards
        .filter((card) =>
          DISPLAY_WIDGETS.some((widget) => widget.type === card.type),
        )
        // Text belongs to both Suggested and Content in the full Appsmith
        // catalog. Show each supported card once in this smaller palette.
        .map((card) => ({
          ...card,
          tags: card.tags?.filter(
            (tag) => tag !== WIDGET_TAGS.SUGGESTED_WIDGETS,
          ),
        })),
    [widgetCards],
  );
  const groupedCards = useMemo(
    () => groupWidgetCardsByTags(displayCards),
    [displayCards],
  );

  useEffect(
    function selectAddedWidget() {
      if (!pendingWidgetId) return;

      if (widgets[pendingWidgetId]) {
        dispatch(setSelectedWidgets([pendingWidgetId]));

        setPendingWidgetId(null);

        return;
      }

      const timeout = window.setTimeout(() => {
        setError("Widget could not be added. Please try again.");
        setPendingWidgetId(null);
      }, 10000);

      return () => window.clearTimeout(timeout);
    },
    [dispatch, pendingWidgetId, widgets],
  );

  function addWidget(kind: DisplayWidgetKind) {
    if (disabled || pendingWidgetId) return;

    try {
      const newWidgetId = generateReactKey();
      const payload = buildPaletteWidget(
        kind,
        widgets,
        selectedWidgetIds,
        canvasWidth,
        newWidgetId,
      );

      setError("");
      setPendingWidgetId(newWidgetId);
      dispatch({ type: WidgetReduxActionTypes.WIDGET_ADD_CHILD, payload });
    } catch (cause) {
      setError(String(cause));
    }
  }

  function handleAddWidget(event: React.MouseEvent<HTMLButtonElement>) {
    const kind = event.currentTarget.dataset.kind;

    if (kind === "text" || kind === "chart" || kind === "container") {
      addWidget(kind);
    }
  }

  const handleDragStartCapture = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (disabled || pendingWidgetId) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [disabled, pendingWidgetId],
  );

  return (
    <section aria-label="Add display widgets" className="widget-palette">
      <h2>Widgets</h2>
      <div
        aria-disabled={disabled || Boolean(pendingWidgetId)}
        className="widget-palette__sidebar"
        onDragStartCapture={handleDragStartCapture}
      >
        <UIEntitySidebar
          cards={displayCards}
          emptyMessage={createMessage(WIDGET_PANEL_EMPTY_MESSAGE)}
          groupedCards={groupedCards}
          isActive
          key={displayCards.map((card) => card.key).join(":")}
          searchPlaceholderText={createMessage(UI_ELEMENT_PANEL_SEARCH_TEXT)}
        />
      </div>
      <div className="widget-palette__footer">
        <div className="widget-palette__buttons">
          {DISPLAY_WIDGETS.map(({ kind, label }) => (
            <button
              data-kind={kind}
              data-testid={`t--palette-add-${kind}`}
              disabled={disabled || Boolean(pendingWidgetId)}
              key={kind}
              onClick={handleAddWidget}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <p>Drag a widget onto the canvas, or use an Add button.</p>
        {error && <p role="alert">{error}</p>}
      </div>
    </section>
  );
}
