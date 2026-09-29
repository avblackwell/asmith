import type { CanvasWidgetsReduxState } from "ee/reducers/entityReducers/canvasWidgetsReducer";
import {
  getOutlineAncestorIds,
  outlineWidgetTypeLabel,
  projectWidgetOutline,
} from "./projectWidgetOutline";

function widgets(): CanvasWidgetsReduxState {
  return {
    "0": {
      widgetId: "0",
      widgetName: "MainContainer",
      type: "CANVAS_WIDGET",
      children: ["title", "card", "chart"],
    },
    title: {
      widgetId: "title",
      widgetName: "EngineTitle",
      type: "TEXT_WIDGET",
      parentId: "0",
    },
    card: {
      widgetId: "card",
      widgetName: "EngineCard",
      type: "CONTAINER_WIDGET",
      parentId: "0",
      children: ["card-canvas"],
    },
    "card-canvas": {
      widgetId: "card-canvas",
      widgetName: "EngineCardCanvas",
      type: "CANVAS_WIDGET",
      parentId: "card",
      children: ["value", "label"],
    },
    value: {
      widgetId: "value",
      widgetName: "EngineValue",
      type: "TEXT_WIDGET",
      parentId: "card-canvas",
    },
    label: {
      widgetId: "label",
      widgetName: "EngineLabel",
      type: "TEXT_WIDGET",
      parentId: "card-canvas",
    },
    chart: {
      widgetId: "chart",
      widgetName: "EngineChart",
      type: "CHART_WIDGET",
      parentId: "0",
    },
  } as unknown as CanvasWidgetsReduxState;
}

test("projects visible widgets in canvas order and flattens internal canvases", () => {
  const outline = projectWidgetOutline(widgets(), ["value"], new Set());

  expect(outline.map(({ id }) => id)).toEqual(["title", "card", "chart"]);
  expect(outline[1].children?.map(({ id }) => id)).toEqual(["value", "label"]);
  expect(outline[1].children?.[0].isSelected).toBe(true);
  expect(outline[1].children?.[0].type).toBe("TEXT_WIDGET");
});

test("search keeps ancestors and shows descendants when a group matches", () => {
  const data = widgets();
  const leaf = projectWidgetOutline(data, [], new Set(), "EngineValue");

  expect(leaf.map(({ id }) => id)).toEqual(["card"]);
  expect(leaf[0].children?.map(({ id }) => id)).toEqual(["value"]);
  expect(leaf[0].isExpanded).toBe(true);

  const group = projectWidgetOutline(data, [], new Set(), "EngineCard");

  expect(group.map(({ id }) => id)).toEqual(["card"]);
  expect(group[0].children?.map(({ id }) => id)).toEqual(["value", "label"]);
  expect(projectWidgetOutline(data, [], new Set(), "EngineCardCanvas")).toEqual(
    [],
  );
});

test("collapsed groups hide descendants until expanded or searched", () => {
  const data = widgets();
  const collapsed = projectWidgetOutline(data, [], new Set(["card"]));

  expect(collapsed[1].isExpanded).toBe(false);
  expect(collapsed[1].children?.map(({ id }) => id)).toEqual([
    "value",
    "label",
  ]);
  expect(
    projectWidgetOutline(data, [], new Set(["card"]), "value")[0].isExpanded,
  ).toBe(true);
  expect(getOutlineAncestorIds(data, ["value"])).toEqual(new Set(["card"]));
});

test("ignores missing or cyclic child references and labels widget types", () => {
  const data = widgets();

  data.card.children = ["card-canvas", "missing", "card"];

  expect(projectWidgetOutline(data, [], new Set())[1].children?.length).toBe(2);
  expect(outlineWidgetTypeLabel("CHART_WIDGET")).toBe("Chart");
  expect(outlineWidgetTypeLabel("WDS_PARAGRAPH_WIDGET")).toBe("Paragraph");
});
