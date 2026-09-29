/* Run from operator-display-client: node src/editor-bridge/appsmith-fixed-geometry/fixedCanvasGeometry.contract.test.cjs */
const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");

async function main() {
  const built = await esbuild.build({
    entryPoints: [path.join(__dirname, "index.ts")],
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
    logLevel: "silent",
  });
  const loaded = { exports: {} };
  new Function("module", "exports", "require", built.outputFiles[0].text)(
    loaded, loaded.exports, require,
  );
  const geometry = loaded.exports;
  const widgets = {
    0: {
      widgetId: "0", type: "CANVAS_WIDGET", topRow: 0, bottomRow: 120,
      leftColumn: 0, rightColumn: 1242, children: ["title", "card"],
    },
    title: {
      widgetId: "title", type: "TEXT_WIDGET", topRow: 2, bottomRow: 7,
      leftColumn: 2, rightColumn: 62, parentId: "0",
    },
    card: {
      widgetId: "card", type: "CONTAINER_WIDGET", topRow: 10, bottomRow: 32,
      leftColumn: 2, rightColumn: 31, parentId: "0", borderWidth: "1",
      children: ["card-canvas"],
    },
    "card-canvas": {
      widgetId: "card-canvas", type: "CANVAS_WIDGET", topRow: 0,
      bottomRow: 22, leftColumn: 0, rightColumn: 29, parentId: "card",
      children: ["card-label"],
    },
    "card-label": {
      widgetId: "card-label", type: "TEXT_WIDGET", topRow: 2, bottomRow: 6,
      leftColumn: 2, rightColumn: 26, parentId: "card-canvas",
    },
  };
  const editor = geometry.fixedRootCanvasMetrics(widgets, "0", 1242, 1200, "editor");
  assert.equal(editor.normalizedBottomRowPx, 380,
    "Appsmith INIT layout normalizes the root from child rows, not stored root.bottomRow");
  assert.equal(editor.renderBottomRowPx, 1200);
  assert.equal(editor.dropTargetRows, 119);
  assert.equal(editor.dropTargetHeightPx, 1190);
  assert.equal(editor.columnSpace, 1230 / 64);
  assert.equal(geometry.fixedRootCanvasMetrics(widgets, "0", 1242, 1200, "viewer").dropTargetHeightPx, 420);

  const mobile = geometry.fixedRootCanvasMetrics(widgets, "0", 400, 1200, "editor");
  assert.equal(mobile.widthPx, 400,
    "rendered width comes from mainCanvas state, not the root DSL rightColumn");
  assert.equal(mobile.columnSpace, 388 / 64);
  assert.equal(geometry.fixedCanvasChildFrame(widgets.title, mobile.widthPx,
    { isMainCanvas: true }).width, 60 * 388 / 64);

  const title = geometry.fixedCanvasChildFrame(widgets.title, editor.widthPx, {
    isMainCanvas: true,
  });
  assert.deepEqual(title, {
    left: 6 + 2 * 1230 / 64,
    top: 26,
    width: 60 * 1230 / 64,
    height: 50,
  });
  const card = geometry.fixedCanvasChildFrame(widgets.card, editor.widthPx, {
    isMainCanvas: true,
  });
  const inner = geometry.fixedInnerCanvasFrame(card);
  assert.equal(inner.width, card.width);
  assert.equal(inner.height, 210);
  assert.equal(geometry.normalizedInnerCanvasBottomRow(widgets, "card-canvas"), 220);
  const label = geometry.fixedCanvasChildFrame(widgets["card-label"], inner.width, {
    isMainCanvas: false,
  });
  assert.equal(label.left, 6 + 2 * (inner.width - 20) / 64);
  assert.equal(label.top, 26);
  assert.equal(label.height, 40);
  console.log("Appsmith Fixed canvas geometry: pass");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
