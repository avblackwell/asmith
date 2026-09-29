/* Run from operator-display-client: node src/editor-bridge/live-bindings/contract.test.cjs */
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
  const bindings = await loadPackage(path.join(__dirname, "index.ts"));
  assert.equal(bindings.isSupportedDisplayTarget("TEXT_WIDGET", "text"), true);
  assert.equal(bindings.isSupportedDisplayTarget("TEXT_WIDGET", "widgetName"), false);
  assert.equal(bindings.isSupportedDisplayTarget("CHART_WIDGET", "chartData.speed.data"), true);
  assert.equal(bindings.isSupportedDisplayTarget("CHART_WIDGET", "chartData.__proto__.data"), false);
  assert.equal(bindings.isSupportedDisplayTarget("CHART_WIDGET", "widgetName"), false);
  const { exampleDashboardDocument } = await loadPackage(
    path.resolve(__dirname, "../../document/index.ts"),
  );
  const cloneDocument = () => JSON.parse(JSON.stringify(exampleDashboardDocument));
  const variableId = "18446744073709551615";
  const resolved = [{ key: "engineSpeed", id: variableId }];
  const sample = (timestampMs, value) => ({
    cellId: "cell-A",
    variableId,
    unitCode: 16,
    timestampMs,
    value,
  });
  const document = cloneDocument();
  const savedBefore = JSON.stringify(document);
  const run = new bindings.LiveBindingProjector(document, "cell-A", resolved);
  const first = run.accept(sample(Date.UTC(2026, 0, 1), 1234.4));

  assert.deepEqual(first, [
    {
      widgetId: "engine-speed-value",
      propertyPath: "text",
      value: "1234 rpm",
    },
    {
      widgetId: "engine-speed-chart",
      propertyPath: "chartData.speedSeries.data",
      value: [{ x: "2026-01-01T00:00:00.000Z", y: 1234.4 }],
    },
  ]);
  assert.equal(JSON.stringify(document), savedBefore, "samples never enter the document");
  assert.deepEqual(run.accept({ ...sample(2000, 1), cellId: "cell-B" }), []);
  assert.deepEqual(run.accept({ ...sample(2000, 1), variableId: "1" }), []);
  assert.deepEqual(run.accept({ ...sample(2000, 1), unitCode: 17 }), []);
  assert.deepEqual(run.accept(sample(Date.UTC(2025, 11, 31), 1)), []);
  assert.throws(() => run.accept(sample(Date.UTC(2026, 0, 2), NaN)), /type does not match/);
  assert.throws(
    () => new bindings.LiveBindingProjector(document, "cell-A", []),
    /was not resolved/,
  );

  const bounded = cloneDocument();
  bounded.bindings[1].presentation.maxPoints = 2;
  bounded.bindings[1].presentation.windowSeconds = 2;
  const boundedRun = new bindings.LiveBindingProjector(bounded, "cell-A", resolved);

  boundedRun.accept(sample(1000, 1));
  boundedRun.accept(sample(2000, 2));
  assert.deepEqual(boundedRun.accept(sample(4000, 4))[1].value, [
    { x: "1970-01-01T00:00:02.000Z", y: 2 },
    { x: "1970-01-01T00:00:04.000Z", y: 4 },
  ]);
  assert.deepEqual(boundedRun.accept(sample(3000, 3)), []);
  assert.deepEqual(boundedRun.accept(sample(4000, 5))[1].value, [
    { x: "1970-01-01T00:00:02.000Z", y: 2 },
    { x: "1970-01-01T00:00:04.000Z", y: 5 },
  ]);

  const statusDocument = cloneDocument();
  statusDocument.bindings = [statusDocument.bindings[0]];
  statusDocument.variables[0].valueType = "string";
  statusDocument.bindings[0].presentation = {
    kind: "latest",
    template: "State: {value}",
  };
  const statusRun = new bindings.LiveBindingProjector(
    statusDocument,
    "cell-A",
    resolved,
  );

  assert.equal(statusRun.accept(sample(1000, "RUNNING"))[0].value, "State: RUNNING");
  assert.throws(() => statusRun.accept(sample(2000, 1)), /type does not match/);

  const overlay = new bindings.TransientWidgetOverlay();
  const valueNotifications = [];
  const chartNotifications = [];
  const unsubscribeValue = overlay.subscribe("engine-speed-value", () =>
    valueNotifications.push("changed"),
  );
  overlay.subscribe("engine-speed-chart", () =>
    chartNotifications.push("changed"),
  );
  overlay.apply(first);
  assert.equal(valueNotifications.length, 1);
  assert.equal(chartNotifications.length, 1);

  const textProps = { widgetId: "engine-speed-value", text: "— rpm" };
  const chartProps = {
    widgetId: "engine-speed-chart",
    chartData: { speedSeries: { seriesName: "Speed", data: [] } },
  };
  const textView = bindings.applyTransientWidgetProps(
    textProps,
    overlay.getWidgetUpdates(textProps.widgetId),
  );
  const chartView = bindings.applyTransientWidgetProps(
    chartProps,
    overlay.getWidgetUpdates(chartProps.widgetId),
  );

  assert.equal(textView.text, "1234 rpm");
  assert.deepEqual(chartView.chartData.speedSeries.data, first[1].value);
  assert.equal(textProps.text, "— rpm");
  assert.deepEqual(chartProps.chartData.speedSeries.data, []);
  assert.notEqual(chartView.chartData.speedSeries, chartProps.chartData.speedSeries);
  assert.equal(bindings.applyTransientWidgetProps(textProps, []), textProps);
  assert.equal(
    bindings.applyTransientWidgetProps(textProps, [
      { widgetId: "other", propertyPath: "text", value: "ignored" },
    ]),
    textProps,
  );
  assert.equal(
    bindings.applyTransientWidgetProps(textProps, [
      { widgetId: textProps.widgetId, propertyPath: "missing", value: "ignored" },
    ]),
    textProps,
  );

  assert.throws(
    () => overlay.apply([
      { widgetId: textProps.widgetId, propertyPath: "text", value: "new" },
      { widgetId: textProps.widgetId, propertyPath: "__proto__.changed", value: "bad" },
    ]),
    /Invalid widget property path/,
  );
  assert.equal(overlay.getWidgetUpdates(textProps.widgetId)[0].value, "1234 rpm");
  assert.equal(valueNotifications.length, 1, "invalid frames are atomic");

  overlay.clear();
  assert.deepEqual(overlay.getWidgetUpdates(textProps.widgetId), []);
  assert.equal(valueNotifications.length, 2);
  assert.equal(chartNotifications.length, 2);
  unsubscribeValue();
  overlay.apply(first);
  assert.equal(valueNotifications.length, 2);

  process.stdout.write("Frontend live-binding projection contracts passed.\n");
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
