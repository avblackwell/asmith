import { exampleDashboardDocument } from "../document";
import type { DashboardDocument } from "../document";
import { parseDashboardDocument } from "../document";
import { LiveBindingProjector } from "../runtime/LiveBindingProjector";
import {
  removeWidgetBinding,
  removeWidgetBindings,
  saveWidgetBinding,
} from "./model";
import type { WidgetBindingDraft } from "./model";

function fixture(): DashboardDocument {
  return JSON.parse(JSON.stringify(exampleDashboardDocument));
}

function textDraft(): WidgetBindingDraft {
  return {
    id: "title-binding",
    variable: {
      key: "titleValue",
      label: "Title value",
      selector: { kind: "logicalName", name: "TITLE_VALUE" },
      valueType: "number",
    },
    unitCode: 0,
    target: { widgetId: "engine-title", propertyPath: "text" },
    presentation: {
      kind: "latest",
      template: "Value: {value}",
      decimalPlaces: 1,
    },
  };
}

describe("guided widget binding edits", () => {
  it("adds a Text latest binding without mutating the source document", () => {
    const source = fixture();
    const updated = saveWidgetBinding(source, textDraft());

    expect(source.variables).toHaveLength(1);
    expect(source.bindings).toHaveLength(2);
    expect(updated.variables).toHaveLength(2);
    expect(updated.bindings).toHaveLength(3);
    expect(updated.bindings[2]).toEqual({
      id: "title-binding",
      variableKey: "titleValue",
      unitCode: 0,
      target: { widgetId: "engine-title", propertyPath: "text" },
      presentation: {
        kind: "latest",
        template: "Value: {value}",
        decimalPlaces: 1,
      },
    });
    expect(parseDashboardDocument(updated)).toBe(updated);
  });

  it("adds Chart history for an existing chart series", () => {
    const source = fixture();

    source.bindings = [];

    const updated = saveWidgetBinding(source, {
      id: "history-2",
      variable: source.variables[0],
      unitCode: 16,
      target: {
        widgetId: "engine-speed-chart",
        propertyPath: "chartData.speedSeries.data",
      },
      presentation: { kind: "history", maxPoints: 500, windowSeconds: 300 },
    });

    expect(updated.bindings).toHaveLength(1);
    expect(updated.bindings[0].presentation).toEqual({
      kind: "history",
      maxPoints: 500,
      windowSeconds: 300,
    });
  });

  it("projects samples from newly authored Text and Chart bindings", () => {
    const source = fixture();
    const chartVariable = source.variables[0];

    source.variables = [];
    source.bindings = [];

    const withText = saveWidgetBinding(source, textDraft());
    const authored = saveWidgetBinding(withText, {
      id: "new-history",
      variable: chartVariable,
      unitCode: 16,
      target: {
        widgetId: "engine-speed-chart",
        propertyPath: "chartData.speedSeries.data",
      },
      presentation: { kind: "history", maxPoints: 10, windowSeconds: 60 },
    });
    const projector = new LiveBindingProjector(authored, "cell-1", [
      { key: "titleValue", id: "101" },
      { key: "engineSpeed", id: "202" },
    ]);

    expect(
      projector.accept({
        cellId: "cell-1",
        variableId: "101",
        unitCode: 0,
        timestampMs: 1704067200000,
        value: 12.34,
      }),
    ).toEqual([
      {
        widgetId: "engine-title",
        propertyPath: "text",
        value: "Value: 12.3",
      },
    ]);
    expect(
      projector.accept({
        cellId: "cell-1",
        variableId: "202",
        unitCode: 16,
        timestampMs: 1704067200000,
        value: 42,
      }),
    ).toEqual([
      {
        widgetId: "engine-speed-chart",
        propertyPath: "chartData.speedSeries.data",
        value: [{ x: "2024-01-01T00:00:00.000Z", y: 42 }],
      },
    ]);
  });

  it("updates an existing binding and shared variable by key without dropping others", () => {
    const source = fixture();
    const updated = saveWidgetBinding(source, {
      id: "engine-speed-value-binding",
      variable: { ...source.variables[0], label: "Engine speed updated" },
      unitCode: 17,
      target: { widgetId: "engine-speed-value", propertyPath: "text" },
      presentation: {
        kind: "latest",
        template: "{value} rpm",
        decimalPlaces: 2,
      },
    });

    expect(updated.variables).toHaveLength(1);
    expect(updated.variables[0].label).toBe("Engine speed updated");
    expect(updated.bindings).toHaveLength(2);
    expect(updated.bindings[0].unitCode).toBe(17);
    expect(updated.bindings[1]).toEqual(source.bindings[1]);
    expect(source.variables[0].label).toBe("Engine speed");
  });

  it("rejects duplicate targets, invalid units, invalid IDs, and unsupported targets", () => {
    const source = fixture();
    const duplicate = textDraft();

    duplicate.target.widgetId = "engine-speed-value";
    expect(() => saveWidgetBinding(source, duplicate)).toThrow(
      "another binding already writes this property",
    );

    const invalidUnit = textDraft();

    invalidUnit.unitCode = 2147483648;
    expect(() => saveWidgetBinding(source, invalidUnit)).toThrow(
      "expected an integer from -2147483648 to 2147483647",
    );

    const invalidId = textDraft();

    invalidId.variable.selector = {
      kind: "cyflexId",
      id: "18446744073709551616",
    };
    expect(() => saveWidgetBinding(source, invalidId)).toThrow(
      "expected a decimal uint64 string",
    );

    const wrongTextPath = textDraft();

    wrongTextPath.target.propertyPath = "fontSize";
    expect(() => saveWidgetBinding(source, wrongTextPath)).toThrow(
      "Text widgets support only a latest text binding",
    );

    const wrongChartSeries = textDraft();

    wrongChartSeries.target = {
      widgetId: "engine-speed-chart",
      propertyPath: "chartData.missing.data",
    };
    wrongChartSeries.presentation = {
      kind: "history",
      maxPoints: 100,
      windowSeconds: 60,
    };
    expect(() => saveWidgetBinding(source, wrongChartSeries)).toThrow(
      "Chart widgets support only history for an existing data series",
    );
  });

  it("removes a stale binding after its widget was deleted and retains variables", () => {
    const source = fixture();
    const nestedCanvas = source.layout.dsl.children?.[1].children?.[0];

    if (!nestedCanvas?.children) throw new Error("Missing test canvas");

    nestedCanvas.children = nestedCanvas.children.filter(
      (child) => child.widgetId !== "engine-speed-value",
    );

    expect(() => parseDashboardDocument(source)).toThrow(
      "widget does not exist",
    );

    const updated = removeWidgetBinding(source, "engine-speed-value-binding");

    expect(updated.bindings).toHaveLength(1);
    expect(updated.variables).toHaveLength(1);
    expect(parseDashboardDocument(updated)).toBe(updated);
    expect(source.bindings).toHaveLength(2);
  });

  it("repairs all targets deleted with a container in one validated update", () => {
    const source = fixture();
    const secondText = saveWidgetBinding(source, {
      id: "engine-label-binding",
      variable: source.variables[0],
      unitCode: 16,
      target: { widgetId: "engine-speed-label", propertyPath: "text" },
      presentation: { kind: "latest", template: "{value}" },
    });

    secondText.layout.dsl.children = secondText.layout.dsl.children?.filter(
      (child) => child.widgetId !== "engine-speed-card",
    );
    secondText.componentDependencies = [];

    expect(() =>
      removeWidgetBinding(secondText, "engine-speed-value-binding"),
    ).toThrow("widget does not exist");

    const repaired = removeWidgetBindings(secondText, [
      "engine-speed-value-binding",
      "engine-label-binding",
    ]);

    expect(repaired.bindings).toEqual([secondText.bindings[1]]);
    expect(repaired.variables).toEqual(secondText.variables);
    expect(parseDashboardDocument(repaired)).toBe(repaired);
  });
});
