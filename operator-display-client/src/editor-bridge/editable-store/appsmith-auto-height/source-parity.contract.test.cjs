/* Run from operator-display-client: node src/editor-bridge/editable-store/appsmith-auto-height/source-parity.contract.test.cjs */
const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");

async function load(entry) {
  const built = await esbuild.build({
    entryPoints: [entry], bundle: true, format: "cjs", platform: "node",
    write: false, logLevel: "silent",
  });
  const module = { exports: {} };
  new Function("module", "exports", "require", built.outputFiles[0].text)(
    module, module.exports, require,
  );
  return module.exports;
}

async function main() {
  const [trees, reflow] = await Promise.all([
    load(path.join(__dirname, "generateTree.ts")),
    load(path.join(__dirname, "reflow.ts")),
  ]);
  const adjacent = trees.generateTree({
    a: { id: "a", left: 0, right: 20, top: 0, bottom: 8 },
    b: { id: "b", left: 20, right: 40, top: 10, bottom: 18 },
    c: { id: "c", left: 18, right: 30, top: 22, bottom: 28 },
  }, false, {});
  assert.deepEqual(adjacent.a.belows, ["c"],
    "partial horizontal overlap creates a dependency");
  assert.deepEqual(adjacent.b.aboves, [],
    "widgets touching only at the horizontal edge stay independent");

  const previous = trees.generateTree({
    top: { id: "top", left: 0, right: 20, top: 10, bottom: 20 },
    lower: { id: "lower", left: 0, right: 20, top: 30, bottom: 40 },
  }, false, {});
  const afterMeasure = trees.generateTree({
    top: { id: "top", left: 0, right: 20, top: 10, bottom: 100 },
    lower: { id: "lower", left: 0, right: 20, top: 110, bottom: 120 },
  }, false, previous);
  assert.deepEqual([
    afterMeasure.top.originalBottomRow, afterMeasure.lower.originalTopRow,
  ], [20, 30], "content measurement preserves the user-positioned originals");
  const afterLayoutEdit = trees.generateTree({
    top: { id: "top", left: 0, right: 20, top: 10, bottom: 100 },
    lower: { id: "lower", left: 0, right: 20, top: 110, bottom: 120 },
  }, true, afterMeasure);
  assert.deepEqual([
    afterLayoutEdit.top.originalBottomRow, afterLayoutEdit.lower.originalTopRow,
  ], [100, 110], "a user layout edit resets the originals");

  // Appsmith's blocking-box shrink case: the lower widget has two overlapping
  // widgets above it. Shrinking top must not pull lower through blocker.
  const blocked = {
    top: { aboves: [], belows: ["lower"], topRow: 10, bottomRow: 100,
      originalTopRow: 10, originalBottomRow: 15, distanceToNearestAbove: 0 },
    blocker: { aboves: [], belows: ["lower"], topRow: 50, bottomRow: 120,
      originalTopRow: 10, originalBottomRow: 20, distanceToNearestAbove: 0 },
    lower: { aboves: ["top", "blocker"], belows: [], topRow: 140, bottomRow: 230,
      originalTopRow: 30, originalBottomRow: 40, distanceToNearestAbove: 20 },
  };
  const moved = reflow.computeChangeInPositionBasedOnDelta(blocked,
    { top: -50, lower: -50 });
  assert.deepEqual(moved.lower, { topRow: 140, bottomRow: 180 });
  console.log("Appsmith auto-height source parity passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
