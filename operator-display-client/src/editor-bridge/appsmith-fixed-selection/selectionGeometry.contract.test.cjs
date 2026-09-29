/* Run from operator-display-client: node src/editor-bridge/appsmith-fixed-selection/selectionGeometry.contract.test.cjs */
const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");

async function main() {
  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, "selectionGeometry.ts")],
    bundle: true, format: "cjs", platform: "node", write: false,
    logLevel: "silent",
  });
  const loaded = { exports: {} };
  new Function("module", "exports", "require", result.outputFiles[0].text)(
    loaded, loaded.exports, require,
  );
  const { normalizedSelectionRectangle, selectionStartSnapshot,
    selectWidgetsInArea, shiftSelectWidgets, pushPopWidgetSelection } = loaded.exports;
  const widgets = [
    { id: "a", parentId: "0", left: 1, right: 3, top: 1, bottom: 3 },
    { id: "b", parentId: "0", left: 5, right: 7, top: 1, bottom: 3 },
    { id: "child", parentId: "nested", left: 1, right: 3, top: 1, bottom: 3 },
    { id: "detached", parentId: "0", left: 1, right: 3, top: 1, bottom: 3,
      detachFromLayout: true },
  ];
  assert.deepEqual(selectionStartSnapshot("0", ["child", "a", "detached"], widgets), ["a"]);
  const request = {
    canvasId: "0", occupiedWidgets: widgets, startingSelection: [],
    rectangle: { left: 10, top: 10, width: 20, height: 20 },
    snapColumnSpace: 10, snapRowSpace: 10,
    snapToNextColumn: false, snapToNextRow: false, isMultiSelect: false,
  };
  assert.deepEqual(selectWidgetsInArea(request), ["a"],
    "selection intersects direct children only");
  assert.deepEqual(selectWidgetsInArea({ ...request,
    rectangle: { left: 30, top: 10, width: 20, height: 20 },
  }), [], "touching edges do not intersect");
  assert.deepEqual(selectWidgetsInArea({ ...request,
    rectangle: { left: 10, top: 10, width: 60, height: 20 },
    startingSelection: ["a"], isMultiSelect: true,
  }), ["b"], "modifier marquee toggles the starting snapshot");
  assert.deepEqual(normalizedSelectionRectangle(70, 30, 10, 10),
    { left: 10, top: 10, width: 60, height: 20 });
  assert.deepEqual(selectWidgetsInArea({ ...request,
    rectangle: { left: 20, top: 20, width: 0, height: 0 },
    snapToNextColumn: true, snapToNextRow: true,
  }), ["a"], "reverse direction uses Appsmith's previous-cell snap");
  assert.deepEqual(shiftSelectWidgets("c", ["a", "b", "c", "d"], ["a"], "a"),
    ["a", "c", "b"], "Shift selects the sibling range in Appsmith's insertion order");
  assert.deepEqual(shiftSelectWidgets("c", ["a", "b", "c"], ["a", "c"], "a"),
    ["a"], "Shift clicking an already selected widget removes it");
  assert.deepEqual(shiftSelectWidgets("c", ["a", "b", "c"], ["a"], "other"),
    ["c"], "an anchor outside the canvas resets to the clicked widget");
  assert.deepEqual(pushPopWidgetSelection("b", ["a"], ["a", "b"]),
    ["a", "b"], "Ctrl/Cmd appends a sibling");
  assert.deepEqual(pushPopWidgetSelection("a", ["a", "b"], ["a", "b"]),
    ["b"], "Ctrl/Cmd toggles an already selected widget");
  console.log("Appsmith Fixed selection geometry contract passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
