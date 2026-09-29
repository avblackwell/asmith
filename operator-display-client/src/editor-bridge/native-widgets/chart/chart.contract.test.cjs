const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");

async function main() {
  const entry = path.join(__dirname, "basicChartOptions.ts");
  const bundle = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
  });
  const module = { exports: {} };
  new Function("module", "exports", bundle.outputFiles[0].text)(module, module.exports);
  const { buildBasicChartOptions } = module.exports;
  const widget = {
    widgetId: "chart",
    widgetName: "Chart1",
    type: "CHART_WIDGET",
    version: 1,
    topRow: 0,
    bottomRow: 30,
    leftColumn: 0,
    rightColumn: 40,
    chartType: "LINE_CHART",
    chartName: "Speed",
    chartData: { speed: { seriesName: "Speed", data: [] } },
  };
  const dimensions = { width: 600, height: 320 };

  assert.deepEqual(buildBasicChartOptions(widget, dimensions), {
    status: "empty",
    message: "No chart data to display",
  });

  const populated = {
    ...widget,
    chartData: {
      speed: { seriesName: "Speed", data: [{ x: "10:00", y: 920 }] },
    },
  };
  const ready = buildBasicChartOptions(populated, dimensions);
  assert.equal(ready.status, "ready");
  assert.deepEqual(ready.options.dataset.source, [
    ["Category", "speed"],
    ["10:00", 920],
  ]);
  assert.equal(ready.options.series[0].type, "line");
  assert.equal(ready.options.title.textStyle.fontFamily, "",
    "Appsmith leaves System Default to the chart renderer");
  const themed = buildBasicChartOptions(populated, dimensions,
    { fontFamily: "Inter" });
  assert.match(themed.options.title.textStyle.fontFamily, /^Inter, Arial, sans-serif$/);
  const specialKeys = buildBasicChartOptions({
    ...populated,
    chartData: {
      ["__proto__"]: { seriesName: "Special", data: [{ x: "__proto__", y: 7 }] },
    },
  }, dimensions);
  assert.equal(specialKeys.status, "ready");
  assert.deepEqual(specialKeys.options.dataset.source, [
    ["Category", "__proto__"],
    ["__proto__", 7],
  ]);
  assert.equal(({}).speed, undefined);

  assert.equal(buildBasicChartOptions({ ...populated, chartType: "CUSTOM_ECHART" }, dimensions).status, "unsupported");
  assert.equal(buildBasicChartOptions({ ...populated, chartData: "{{bad}}" }, dimensions).status, "invalid");
  assert.equal(buildBasicChartOptions({
    ...widget,
    chartType: "PIE_CHART",
    chartData: {
      first: { seriesName: "First", data: [] },
      second: { seriesName: "Second", data: [{ x: "A", y: 5 }] },
    },
  }, dimensions).status, "empty");
  process.stdout.write("Chart option and fallback contracts passed.\n");
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
