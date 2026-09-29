import type { CanvasWidgetsReduxState } from "ee/reducers/entityReducers/canvasWidgetsReducer";
import { buildPaletteWidget } from "./buildPaletteWidget";

function widgets(): CanvasWidgetsReduxState {
  return {
    "0": {
      widgetId: "0",
      type: "CANVAS_WIDGET",
      leftColumn: 0,
      rightColumn: 1242,
      topRow: 0,
      bottomRow: 120,
      parentColumnSpace: 1,
      parentRowSpace: 1,
      children: ["heading", "container"],
    },
    heading: {
      widgetId: "heading",
      type: "TEXT_WIDGET",
      parentId: "0",
      leftColumn: 2,
      rightColumn: 62,
      topRow: 2,
      bottomRow: 7,
    },
    container: {
      widgetId: "container",
      type: "CONTAINER_WIDGET",
      parentId: "0",
      leftColumn: 2,
      rightColumn: 62,
      topRow: 10,
      bottomRow: 54,
      children: ["container-canvas"],
    },
    "container-canvas": {
      widgetId: "container-canvas",
      type: "CANVAS_WIDGET",
      parentId: "container",
      leftColumn: 0,
      rightColumn: 60,
      topRow: 0,
      bottomRow: 44,
      parentColumnSpace: 19.4,
      parentRowSpace: 10,
      children: [],
    },
  } as unknown as CanvasWidgetsReduxState;
}

test("places a new chart below root widgets with an empty series", () => {
  const payload = buildPaletteWidget(
    "chart",
    widgets(),
    ["heading"],
    1242,
    "new-chart",
  );

  expect(payload).toMatchObject({
    widgetId: "0",
    type: "CHART_WIDGET",
    leftColumn: 2,
    topRow: 56,
    columns: 60,
    rows: 32,
    newWidgetId: "new-chart",
    props: {
      chartName: "Chart",
      chartType: "LINE_CHART",
      chartData: { series1: { seriesName: "Series 1", data: [] } },
    },
  });
});

test("places text inside a selected container canvas", () => {
  const payload = buildPaletteWidget(
    "text",
    widgets(),
    ["container"],
    1242,
    "new-text",
  );

  expect(payload).toMatchObject({
    widgetId: "container-canvas",
    type: "TEXT_WIDGET",
    leftColumn: 2,
    topRow: 2,
    columns: 56,
    rows: 5,
    parentColumnSpace: 19.4,
    props: { text: "Text" },
  });
});

test("only offers a container preset without event handlers", () => {
  const payload = buildPaletteWidget(
    "container",
    widgets(),
    [],
    1242,
    "new-container",
  );

  expect(payload.type).toBe("CONTAINER_WIDGET");
  expect(payload.rows).toBe(44);
  expect(payload.props).not.toHaveProperty("onClick");
});
