const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const esbuild = require("esbuild");

async function bundle(name) {
  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, name)],
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
    external: ["react", "react-dom", "echarts", "@googlemaps/react-wrapper", "@googlemaps/markerclusterer"],
    loader: { ".svg": "dataurl" },
  });
  const module = { exports: {} };
  new Function("module", "exports", "require", result.outputFiles[0].text)(module, module.exports, require);
  return module.exports;
}

function widget(type, other = {}) {
  return { widgetId: type, widgetName: type, type, version: 1,
    topRow: 0, bottomRow: 30, leftColumn: 0, rightColumn: 24, ...other };
}

async function main() {
  const model = await bundle("mapChartModel.ts");
  const { MapTypes } = await bundle("mapChartConstants.ts");
  const embed = await bundle("mapEmbedModel.ts");
  const iframe = await bundle("NativeIframeView.tsx");
  const options = await bundle("mapChartOptions.ts");

  assert.deepEqual([embed.getIframeDefaults().rows, embed.getIframeDefaults().columns], [32, 24]);
  assert.deepEqual([embed.getMapDefaults().rows, embed.getMapDefaults().columns], [40, 24]);
  assert.deepEqual([model.getMapChartDefaults().rows, model.getMapChartDefaults().columns], [32, 24]);
  assert.deepEqual(embed.getMapDefaults().mapCenter, { lat: 40.7128, long: -74.006 });
  assert.deepEqual(model.mapTypeUpdates(MapTypes.USA).map((update) => update.propertyPath), ["mapType", "data"]);
  assert.equal(model.mapTypeUpdates(MapTypes.USA)[1].propertyValue.length, 51);
  assert.equal(model.isMapType("SOURTH_AMERICA"), true);
  assert.equal(model.isMapType("SOUTH_AMERICA"), false); // preserve Appsmith's serialized enum spelling
  assert.deepEqual(model.mapChartData([{ id: "NA", value: "0.82" }, { id: "bad", value: "x" }], MapTypes.WORLD),
    [{ id: "NA", value: 0.82 }]);
  assert.equal(model.mapChartColorRange([{ minValue: 0, maxValue: 1, code: "#ff04d7" }]).length, 1);

  const chartOption = options.getChartOption("Population", true,
    [{ min: 0.5, max: 1, color: "#FFD74D" }], [{ name: "NA", value: 0.82 }],
    MapTypes.WORLD, 320, 600, "Nunito Sans");
  assert.equal(chartOption.title.text, "Population");
  assert.equal(chartOption.series[0].type, "map");
  assert.equal(chartOption.series[0].map, "WORLD");
  assert.equal(chartOption.series[0].label.formatter({ name: "NA", data: { value: 0.82 } }), "NA: 0.82");
  assert.equal(chartOption.series[0].tooltip.formatter({ name: "NA", data: { value: 0.82 } }), "North America, 0.82");

  assert.equal(iframe.safeIframeSource("javascript:alert(1)"), undefined);
  assert.equal(iframe.safeIframeSource("https://example.com"), "https://example.com");
  const iframeMarkup = renderToStaticMarkup(React.createElement(iframe.NativeIframeView,
    { widget: widget("IFRAME_WIDGET", { source: "https://example.com", title: "Remote", srcDoc: "<b>Local</b>" }), mode: "editor" }));
  assert.match(iframeMarkup, /srcDoc="&lt;b&gt;Local&lt;\/b&gt;"/);
  assert.match(iframeMarkup, /sandbox="allow-forms allow-modals/);
  assert.match(iframeMarkup, /data-iframe-editor-overlay="true"/);

  for (const type of model.MAP_TYPES) {
    const asset = fs.readFileSync(path.join(__dirname, "../../../../public/static/maps", `${type}.json`));
    const source = fs.readFileSync(path.join(__dirname,
      "../../../../../app/client/public/static/maps", `${type}.json`));
    assert.equal(crypto.createHash("sha256").update(asset).digest("hex"),
      crypto.createHash("sha256").update(source).digest("hex"), `${type} GeoJSON differs from Appsmith`);
    assert.ok(JSON.parse(asset).features?.length > 0, `${type} map has no features`);
  }
  process.stdout.write("Iframe, Map, and Map Chart source contracts passed.\n");
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
