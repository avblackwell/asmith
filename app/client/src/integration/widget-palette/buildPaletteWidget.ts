import type { WidgetAddChild } from "actions/pageActions";
import type { CanvasWidgetsReduxState } from "ee/reducers/entityReducers/canvasWidgetsReducer";
import { GridDefaults } from "constants/WidgetConstants";

export type DisplayWidgetKind = "text" | "chart" | "container";

const WIDGET_PRESETS = {
  text: {
    type: "TEXT_WIDGET",
    rows: 5,
    props: { text: "Text", dynamicBindingPathList: [] },
  },
  chart: {
    type: "CHART_WIDGET",
    rows: 32,
    props: {
      chartName: "Chart",
      chartType: "LINE_CHART",
      chartData: { series1: { seriesName: "Series 1", data: [] } },
      xAxisName: "Time",
      yAxisName: "Value",
    },
  },
  container: {
    type: "CONTAINER_WIDGET",
    rows: 44,
    props: { containerStyle: "card" },
  },
} as const;

function targetCanvas(
  widgets: CanvasWidgetsReduxState,
  selectedWidgetIds: string[],
) {
  let widget: (typeof widgets)[string] | undefined =
    widgets[selectedWidgetIds[0]];

  if (widget?.type === "CONTAINER_WIDGET") {
    const childCanvasId = widget.children?.find(
      (id) => widgets[id]?.type === "CANVAS_WIDGET",
    );

    if (childCanvasId) return widgets[childCanvasId];
  }

  while (widget && widget.type !== "CANVAS_WIDGET") {
    widget = widget.parentId ? widgets[widget.parentId] : undefined;
  }

  return widget ?? widgets["0"];
}

/** Build only the three display types that the integration editor supports. */
export function buildPaletteWidget(
  kind: DisplayWidgetKind,
  widgets: CanvasWidgetsReduxState,
  selectedWidgetIds: string[],
  canvasWidth: number,
  newWidgetId: string,
): WidgetAddChild {
  const parent = targetCanvas(widgets, selectedWidgetIds);

  if (!parent || parent.type !== "CANVAS_WIDGET") {
    throw new Error("The dashboard canvas is unavailable");
  }

  const availableColumns =
    parent.widgetId === "0"
      ? GridDefaults.DEFAULT_GRID_COLUMNS
      : parent.rightColumn - parent.leftColumn;

  if (availableColumns < 8) {
    throw new Error("The selected container is too narrow for a widget");
  }

  const preset = WIDGET_PRESETS[kind];
  const lastBottomRow = Math.max(
    0,
    ...(parent.children ?? []).map((id) => widgets[id]?.bottomRow ?? 0),
  );

  return {
    widgetId: parent.widgetId,
    type: preset.type,
    leftColumn: 2,
    topRow: Math.max(2, lastBottomRow + 2),
    columns: Math.min(60, availableColumns - 4),
    rows: preset.rows,
    parentRowSpace: GridDefaults.DEFAULT_GRID_ROW_HEIGHT,
    parentColumnSpace:
      parent.widgetId === "0"
        ? canvasWidth / GridDefaults.DEFAULT_GRID_COLUMNS
        : parent.parentColumnSpace,
    newWidgetId,
    tabId: "",
    props: preset.props,
  };
}
