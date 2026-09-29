const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");

async function main() {
  const bundle = await esbuild.build({
    entryPoints: [path.join(__dirname, "chartDataModel.ts")],
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
  });
  const module = { exports: {} };
  new Function("module", "exports", "require", bundle.outputFiles[0].text)(module, module.exports, require);
  const { copySeriesMap, nextSeriesId, normalizeChartData, parseChartPoints } = module.exports;

  assert.deepEqual(parseChartPoints('[{"x":"Mon","y":12},{"x":2,"y":0}]'), [
    { x: "Mon", y: 12 }, { x: 2, y: 0 },
  ]);
  assert.throws(() => parseChartPoints('{"x":"Mon","y":12}'), /JSON array/);
  assert.throws(() => parseChartPoints('[{"x":"Mon","y":"12"}]'), /finite numeric y/);
  assert.throws(() => parseChartPoints('[{"x":"Mon","y":NaN}]'), /valid JSON/);

  const original = {
    speed: { seriesName: "Engine speed", data: [{ x: "Mon", y: 12 }], color: "#123456" },
  };
  const normalized = normalizeChartData(original);
  assert.equal(normalized.speed.color, "#123456");
  assert.deepEqual(normalized.speed.data, [{ x: "Mon", y: 12 }]);
  assert.deepEqual(normalizeChartData({ old: {
    seriesName: "Old", data: '[{"x":"Tue","y":4}]',
  } }).old.data, [{ x: "Tue", y: 4 }]);
  assert.equal(normalizeChartData({ bad: { seriesName: "Bad", data: "{{JSObject.data}}" } }), null);

  const copy = copySeriesMap(normalized);
  copy.speed.data[0].y = 100;
  assert.equal(original.speed.data[0].y, 12);
  assert.notEqual(nextSeriesId(copy), "speed");
  const special = normalizeChartData(JSON.parse('{"__proto__":{"seriesName":"Special","data":[]}}'));
  assert.equal(Object.hasOwn(special, "__proto__"), true);
  assert.equal(Object.hasOwn(copySeriesMap(special), "__proto__"), true);
  assert.equal({}.seriesName, undefined);

  process.stdout.write("Chart data editor model contracts passed.\n");
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
