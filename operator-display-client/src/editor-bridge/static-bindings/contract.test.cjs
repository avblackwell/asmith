const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");

async function main() {
  const bundle = await esbuild.build({
    entryPoints: [path.join(__dirname, "resolveStaticReferences.ts")],
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
  });
  const module = { exports: {} };
  new Function("module", "exports", bundle.outputFiles[0].text)(module, module.exports);
  const { resolveStaticReferences } = module.exports;
  const widgets = {
    source: {
      widgetId: "source",
      widgetName: "SourceText",
      type: "TEXT_WIDGET",
      text: "915",
    },
    bound: {
      widgetId: "bound",
      widgetName: "BoundText",
      type: "TEXT_WIDGET",
      text: "Speed: {{SourceText.text}} rpm",
      dynamicBindingPathList: [{ key: "text" }],
    },
    chartSource: {
      widgetId: "chartSource",
      widgetName: "SourceChart",
      type: "CHART_WIDGET",
      chartData: { speed: { data: [{ x: "10:00", y: 915 }] } },
    },
    chartBound: {
      widgetId: "chartBound",
      widgetName: "BoundChart",
      type: "CHART_WIDGET",
      chartData: { mirror: { data: "{{SourceChart.chartData.speed.data}}" } },
      dynamicBindingPathList: [{ key: "chartData.mirror.data" }],
    },
    logoUrl: {
      widgetId: "logoUrl",
      widgetName: "LogoUrl",
      type: "TEXT_WIDGET",
      text: "https://example.invalid/logo.png",
    },
    imageBound: {
      widgetId: "imageBound",
      widgetName: "BoundImage",
      type: "IMAGE_WIDGET",
      image: "{{LogoUrl.text}}",
      dynamicBindingPathList: [{ key: "image" }],
    },
    imageWrongType: {
      widgetId: "imageWrongType",
      widgetName: "ImageWrongType",
      type: "IMAGE_WIDGET",
      image: "{{SourceChart.chartData.speed.data}}",
      dynamicBindingPathList: [{ key: "image" }],
    },
    progressSource: {
      widgetId: "progressSource",
      widgetName: "ProgressSource",
      type: "PROGRESS_WIDGET",
      progress: 72,
    },
    progressBound: {
      widgetId: "progressBound",
      widgetName: "ProgressBound",
      type: "PROGRESS_WIDGET",
      progress: "{{ProgressSource.progress}}",
      dynamicBindingPathList: [{ key: "progress" }],
    },
    progressWrongType: {
      widgetId: "progressWrongType",
      widgetName: "ProgressWrongType",
      type: "PROGRESS_WIDGET",
      progress: "{{LogoUrl.text}}",
      dynamicBindingPathList: [{ key: "progress" }],
    },
    missing: {
      widgetId: "missing",
      widgetName: "MissingText",
      type: "TEXT_WIDGET",
      text: "{{Unknown.text}}",
      dynamicBindingPathList: [{ key: "text" }],
    },
    javascript: {
      widgetId: "javascript",
      widgetName: "JavaScriptText",
      type: "TEXT_WIDGET",
      text: "{{1 + 1}}",
      dynamicBindingPathList: [{ key: "text" }],
    },
    unsafe: {
      widgetId: "unsafe",
      widgetName: "UnsafeText",
      type: "TEXT_WIDGET",
      text: "{{SourceText.constructor}}",
      dynamicBindingPathList: [{ key: "text" }],
    },
    cycleA: {
      widgetId: "cycleA",
      widgetName: "CycleA",
      type: "TEXT_WIDGET",
      text: "{{CycleB.text}}",
      dynamicBindingPathList: [{ key: "text" }],
    },
    cycleB: {
      widgetId: "cycleB",
      widgetName: "CycleB",
      type: "TEXT_WIDGET",
      text: "{{CycleA.text}}",
      dynamicBindingPathList: [{ key: "text" }],
    },
  };
  const before = JSON.stringify(widgets);
  const updates = resolveStaticReferences(widgets);

  assert.deepEqual(updates, [
    { widgetId: "bound", propertyPath: "text", value: "Speed: 915 rpm" },
    {
      widgetId: "chartBound",
      propertyPath: "chartData.mirror.data",
      value: [{ x: "10:00", y: 915 }],
    },
    {
      widgetId: "imageBound",
      propertyPath: "image",
      value: "https://example.invalid/logo.png",
    },
    { widgetId: "progressBound", propertyPath: "progress", value: 72 },
  ]);
  assert.equal(JSON.stringify(widgets), before);
  assert.equal(({}).polluted, undefined);
  process.stdout.write("Restricted static reference contracts passed.\n");
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
