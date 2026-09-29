/* Run from operator-display-client: node src/editor-bridge/editable-store/fixed-drop-target.contract.test.cjs */
const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");

async function main() {
  const built = await esbuild.build({
    entryPoints: [path.join(__dirname, "fixedLayoutPlanner.ts")],
    bundle: true, format: "cjs", platform: "node", write: false, logLevel: "silent",
  });
  const module = { exports: {} };
  new Function("module", "exports", "require", built.outputFiles[0].text)(
    module, module.exports, require,
  );
  const { planFixedLayout } = module.exports;
  const target = { leftColumn: 8, topRow: 8, rightColumn: 16, bottomRow: 16 };
  const occupied = {
    widgetId: "occupied", leftColumn: 12, topRow: 10,
    rightColumn: 32, bottomRow: 28,
  };
  const planWith = (type, detachFromLayout = false) => planFixedLayout({
    target,
    siblings: [{ ...occupied, type, detachFromLayout }],
    columns: 64, rows: 120, columnSpace: 10, rowSpace: 10,
    directions: ["BOTTOM"], shouldReflowDropTarget: false,
  });

  // Appsmith editorSelectors.getOccupiedSpaces flags every widget whose
  // config has isCanvas. Before the delayed container reflow, these widgets
  // resist displacement while an ordinary widget is reflowed away.
  assert.ok(planWith("TEXT_WIDGET").reflowed.occupied);
  for (const type of [
    "CONTAINER_WIDGET", "STATBOX_WIDGET", "TABS_WIDGET", "MODAL_WIDGET",
    "LIST_WIDGET_V2",
  ]) {
    assert.throws(() => planWith(type), /without overlap/,
      `${type} must resist immediate reflow as an Appsmith canvas widget`);
  }
  assert.deepEqual(planWith("MODAL_WIDGET", true).reflowed, {},
    "detached Modal widgets are absent from occupied Fixed spaces");
  console.log("Fixed drop-target planner contract passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
