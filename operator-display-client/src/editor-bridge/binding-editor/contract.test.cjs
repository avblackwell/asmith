/* Run from operator-display-client: node src/editor-bridge/binding-editor/contract.test.cjs */
const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");

async function loadPackage(entry) {
  const build = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
    logLevel: "silent",
  });
  const loaded = { exports: {} };
  new Function("module", "exports", "require", build.outputFiles[0].text)(
    loaded,
    loaded.exports,
    require,
  );
  return loaded.exports;
}

async function main() {
  const model = await loadPackage(path.join(__dirname, "model.ts"));
  const documents = await loadPackage(path.resolve(__dirname, "../../document/index.ts"));
  const runtime = await loadPackage(path.resolve(__dirname, "../live-bindings/index.ts"));
  const source = JSON.parse(JSON.stringify(documents.exampleDashboardDocument));
  const sourceJson = JSON.stringify(source);

  const added = model.saveWidgetBinding(source, {
    id: "engine-title-binding",
    variable: {
      key: "engineStatus",
      label: "Engine status",
      selector: { kind: "logicalName", name: "ENGINE_STATUS" },
      valueType: "string",
    },
    unitCode: -17,
    target: { widgetId: "engine-title", propertyPath: "text" },
    presentation: { kind: "latest", template: "Status: {value}" },
  });

  assert.equal(JSON.stringify(source), sourceJson, "authoring must not mutate the source");
  assert.equal(added.bindings.length, source.bindings.length + 1);
  assert.equal(added.variables.length, source.variables.length + 1);
  assert.strictEqual(documents.parseDashboardDocument(added), added);

  const projector = new runtime.LiveBindingProjector(added, "cell-a", [
    { key: "engineSpeed", id: "42" },
    { key: "engineStatus", id: "18446744073709551615" },
  ]);
  assert.deepEqual(projector.accept({
    cellId: "cell-a",
    variableId: "18446744073709551615",
    unitCode: -17,
    timestampMs: 1_700_000_000_000,
    value: "RUNNING",
  }), [{ widgetId: "engine-title", propertyPath: "text", value: "Status: RUNNING" }]);

  const updated = model.saveWidgetBinding(added, {
    id: "engine-title-binding",
    variable: added.variables.find((variable) => variable.key === "engineStatus"),
    unitCode: 0,
    target: { widgetId: "engine-title", propertyPath: "text" },
    presentation: { kind: "latest", template: "{value} now" },
  });
  assert.equal(updated.bindings.length, added.bindings.length);
  assert.equal(updated.bindings.find((binding) => binding.id === "engine-title-binding").unitCode, 0);

  const removed = model.removeWidgetBinding(updated, "engine-title-binding");
  assert.equal(removed.bindings.length, source.bindings.length);
  assert.equal(removed.variables.length, updated.variables.length,
    "a declaration can be reused by another binding");

  const chartSource = JSON.parse(JSON.stringify(source));
  const chart = chartSource.layout.dsl.children.find((widget) =>
    widget.widgetId === "engine-speed-chart");
  chart.chartData.temperatureSeries = { seriesName: "Temperature", data: [] };
  const chartSourceJson = JSON.stringify(chartSource);
  const history = model.saveWidgetBinding(chartSource, {
    id: "temperature-history",
    variable: chartSource.variables[0],
    unitCode: 16,
    target: {
      widgetId: "engine-speed-chart",
      propertyPath: "chartData.temperatureSeries.data",
    },
    presentation: { kind: "history", maxPoints: 2, windowSeconds: 10 },
  });
  assert.equal(JSON.stringify(chartSource), chartSourceJson,
    "binding authoring must leave the chart source untouched");
  assert.equal(history.variables.length, 1,
    "the new chart binding must reuse the existing engineSpeed declaration");
  assert.deepEqual(history.bindings.slice(0, 2), chartSource.bindings,
    "adding a chart binding must preserve existing text and chart bindings");
  assert.deepEqual(history.layout, chartSource.layout,
    "binding edits must not change the saved widget layout or static data");
  assert.deepEqual(history.theme, chartSource.theme);
  assert.deepEqual(history.componentDependencies, chartSource.componentDependencies);
  assert.equal(history.documentId, chartSource.documentId);

  const historyProjector = new runtime.LiveBindingProjector(history, "cell-a", [
    { key: "engineSpeed", id: "42" },
  ]);
  const projected = historyProjector.accept({
    cellId: "cell-a",
    variableId: "42",
    unitCode: 16,
    timestampMs: 1_700_000_000_000,
    value: 915.4,
  });
  assert.deepEqual(projected.find((update) =>
    update.propertyPath === "chartData.temperatureSeries.data"), {
    widgetId: "engine-speed-chart",
    propertyPath: "chartData.temperatureSeries.data",
    value: [{ x: "2023-11-14T22:13:20.000Z", y: 915.4 }],
  });

  const withoutHistory = model.removeWidgetBinding(history, "temperature-history");
  assert.deepEqual(withoutHistory.bindings, chartSource.bindings,
    "removing one shared-variable binding must retain the others");
  assert.deepEqual(withoutHistory.variables, chartSource.variables,
    "removing one binding must retain its reusable variable declaration");
  assert.deepEqual(withoutHistory.layout, chartSource.layout);

  assert.throws(() => model.saveWidgetBinding(source, {
    id: "duplicate-target",
    variable: source.variables[0],
    unitCode: 16,
    target: { widgetId: "engine-speed-value", propertyPath: "text" },
    presentation: { kind: "latest", template: "{value}" },
  }), /another binding already writes this property/);
  assert.throws(() => model.saveWidgetBinding(source, {
    id: "wrong-chart-target",
    variable: source.variables[0],
    unitCode: 16,
    target: { widgetId: "engine-speed-chart", propertyPath: "chartData.missing.data" },
    presentation: { kind: "history", maxPoints: 180, windowSeconds: 180 },
  }), /existing data series/);
  assert.throws(() => model.saveWidgetBinding(source, {
    id: "out-of-range-unit",
    variable: source.variables[0],
    unitCode: 2147483648,
    target: { widgetId: "engine-title", propertyPath: "text" },
    presentation: { kind: "latest", template: "{value}" },
  }), /expected an integer/);
  assert.throws(() => model.saveWidgetBinding(source, {
    id: "invalid-variable-id",
    variable: {
      key: "invalidId",
      label: "Invalid ID",
      selector: { kind: "cyflexId", id: "18446744073709551616" },
      valueType: "number",
    },
    unitCode: 0,
    target: { widgetId: "engine-title", propertyPath: "text" },
    presentation: { kind: "latest", template: "{value}" },
  }), /expected a decimal uint64 string/);
  assert.throws(() => model.saveWidgetBinding(source, {
    id: "wrong-text-target",
    variable: source.variables[0],
    unitCode: 16,
    target: { widgetId: "engine-title", propertyPath: "fontSize" },
    presentation: { kind: "latest", template: "{value}" },
  }), /Text widgets support only a latest text binding/);

  console.log("Binding editor model contract passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
