/* Run from operator-display-client: node src/editor-bridge/appsmith-fixed-width/widthPresets.contract.test.cjs */
const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");

async function main() {
  const built = await esbuild.build({
    entryPoints: [path.join(__dirname, "widthPresets.ts")],
    bundle: true, format: "cjs", platform: "node", write: false, logLevel: "silent",
  });
  const loaded = { exports: {} };
  new Function("module", "exports", "require", built.outputFiles[0].text)(
    loaded, loaded.exports, require,
  );
  const widths = loaded.exports;

  assert.deepEqual(widths.APPSMITH_CANVAS_WIDTH_PRESETS.map((preset) => preset.type),
    ["FLUID", "DESKTOP", "TABLET_LARGE", "TABLET", "MOBILE"]);
  assert.deepEqual(widths.APPSMITH_CANVAS_WIDTH_RANGES, {
    TABLET_LARGE: { minWidth: 960, maxWidth: 1080 },
    MOBILE: { minWidth: 350, maxWidth: 450 },
    DESKTOP: { minWidth: 1160, maxWidth: 1280 },
    TABLET: { minWidth: 650, maxWidth: 800 },
    FLUID: { minWidth: -1, maxWidth: -1 },
  });
  for (const [preset, { minWidth, maxWidth }] of
    Object.entries(widths.APPSMITH_CANVAS_WIDTH_RANGES)) {
    if (preset === "FLUID") continue;
    const resolve = (containerWidth) => widths.resolveCanvasWidth({
      appLayoutType: preset, containerWidth,
    });
    assert.equal(resolve(minWidth - 1), minWidth, `${preset} min`);
    assert.equal(resolve(maxWidth + 1), maxWidth, `${preset} max`);
    assert.equal(resolve(minWidth + 37.8), minWidth + 37, `${preset} truncation`);
  }
  assert.equal(widths.resolveCanvasWidth({ appLayoutType: "FLUID", containerWidth: 1372.9 }),
    1372);
  assert.equal(widths.isCanvasWidthPreset("TABLET_LARGE"), true);
  assert.equal(widths.isCanvasWidthPreset("unknown"), false);
  console.log("Appsmith Fixed canvas width presets: pass");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
