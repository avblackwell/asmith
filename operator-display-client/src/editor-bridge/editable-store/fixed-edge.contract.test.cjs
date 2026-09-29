/* Run from operator-display-client: node src/editor-bridge/editable-store/fixed-edge.contract.test.cjs */
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

function widget(root, widgetId) {
  if (root.widgetId === widgetId) return root;
  for (const child of root.children ?? []) {
    const found = widget(child, widgetId);
    if (found) return found;
  }
  return null;
}

async function main() {
  const [drag, edit, documents] = await Promise.all([
    load(path.resolve(__dirname, "../appsmith-fixed-drag/canvasDraggingUtils.ts")),
    load(path.join(__dirname, "editDocument.ts")),
    load(path.resolve(__dirname, "../../document/index.ts")),
  ]);

  // Appsmith canvasDraggingUtils.test.ts:172-290 exercises the same four edges.
  const base = { widgetId: "text", left: -40, top: -30, width: 160,
    height: 100, columnWidth: 16, rowHeight: 10 };
  const upperLeft = drag.modifyBlockDimension(base, 10, 10, 100, true, false);
  assert.deepEqual([upperLeft.left, upperLeft.top, upperLeft.width,
    upperLeft.height, upperLeft.columnWidth, upperLeft.rowHeight],
  [0, 0, 120, 70, 12, 7]);
  const bottomRight = drag.modifyBlockDimension({ ...base, left: 600, top: 960 },
    10, 10, 100, false, false);
  assert.deepEqual([bottomRight.left, bottomRight.top, bottomRight.width,
    bottomRight.height, bottomRight.columnWidth, bottomRight.rowHeight],
  [600, 960, 40, 40, 4, 4]);
  const minLeft = drag.modifyBlockDimension({ ...base, left: -150 },
    10, 10, 100, true, false);
  assert.deepEqual([minLeft.left, minLeft.width, minLeft.columnWidth],
    [-10, 20, 2], "Appsmith keeps the minimum-width block invalid if the pointer is too far outside");
  const autoHeight = drag.modifyBlockDimension({ ...base, fixedHeight: 100 },
    10, 10, 100, false, false);
  assert.equal(autoHeight.top, -30, "fixedHeight blocks do not shrink vertically");
  const clampedChromeGrip = drag.generateDragStartPoints(90, 90,
    { left: 100, top: 100 }, 20, 10, 8, 6);
  assert.deepEqual(clampedChromeGrip, { left: 0, top: 0 },
    "Appsmith bounds a widget-name drag to the first grid cell");
  const clampedFarGrip = drag.generateDragStartPoints(500, 500,
    { left: 100, top: 100 }, 20, 10, 8, 6);
  assert.deepEqual(clampedFarGrip, { left: 7, top: 5 },
    "Appsmith bounds a far-edge drag to the final grid cell");
  const fractionalGrip = drag.generateDragStartPoints(154, 125,
    { left: 104, top: 100 }, 20, 10, 8, 6);
  assert.deepEqual(fractionalGrip, { left: 2.5, top: 2.5 });
  const originForCanvas = (columnSpace, sameParent) => {
    const source = { left: 5, top: 4 };
    const padding = 6;
    const start = drag.getRelativeStartPoints(source, fractionalGrip,
      { left: 20, top: 20 }, true, sameParent, 10, columnSpace, padding);
    const parentDiff = drag.getParentDiff(source, true, sameParent,
      10, columnSpace, padding);
    const blockLeft = source.left * columnSpace + padding;
    return Math.round((blockLeft + 200 - start.left - parentDiff.left) / columnSpace);
  };
  assert.equal(originForCanvas(20, true), 7);
  assert.equal(originForCanvas(10, false), 16,
    "a destination with half-width cells reapplies the fractional grip in its own grid");
  assert.equal(drag.modifyBlockDimension(base, 10, 10, 100, true, true).left,
    -40, "modifyBlock bypasses edge adjustment");
  const space = drag.getDraggingSpacesFromBlocks([upperLeft], 10, 10)[0];
  assert.deepEqual([space.left, space.top, space.right, space.bottom],
    [0, 0, 12, 7]);

  const document = documents.createBlankDashboardDocument("fixed-edge", "Fixed edge");
  document.layout.dsl.children = [];
  const sourceJson = JSON.stringify(document);
  const add = { type: "TEXT_WIDGET", parentId: "0", leftColumn: 0,
    topRow: 10, columns: 2, rows: 4 };
  const addChange = { kind: "add", request: add };
  const addPreview = edit.previewLayoutChange(sourceJson, addChange);
  assert.equal(addPreview.valid, true);
  assert.deepEqual(addPreview.target, { leftColumn: 0, topRow: 10,
    rightColumn: 2, bottomRow: 14 });
  const invalidEdge = edit.previewLayoutChange(sourceJson, {
    kind: "add", request: { ...add, leftColumn: 63 },
  });
  assert.equal(invalidEdge.valid, false,
    "an edge-adjusted minimum-width block outside the canvas stays invalid");
  const added = edit.commitFixedLayoutChange(sourceJson, addChange, addPreview);
  const addedWidget = widget(JSON.parse(added.documentJson).layout.dsl,
    added.selectedWidgetId);
  assert.deepEqual([addedWidget.leftColumn, addedWidget.rightColumn,
    addedWidget.topRow, addedWidget.bottomRow], [0, 2, 10, 14],
  "the add command saves the dimensions drawn by the arena");

  const move = { kind: "move", request: { widgetId: added.selectedWidgetId,
    parentId: "0", leftColumn: 40, topRow: 20,
    rightColumn: 44, bottomRow: 25 } };
  const movePreview = edit.previewLayoutChange(added.documentJson, move);
  assert.equal(movePreview.valid, true);
  const moved = edit.commitFixedLayoutChange(added.documentJson, move, movePreview);
  const movedWidget = widget(JSON.parse(moved.documentJson).layout.dsl,
    added.selectedWidgetId);
  assert.deepEqual([movedWidget.leftColumn, movedWidget.rightColumn,
    movedWidget.topRow, movedWidget.bottomRow], [40, 44, 20, 25],
  "Appsmith WIDGETS_MOVE commits the block's updated right and bottom edges");

  const sameOrigin = { kind: "move", request: { widgetId: added.selectedWidgetId,
    parentId: "0", leftColumn: 40, topRow: 20,
    rightColumn: 42, bottomRow: 24 } };
  const sameOriginPreview = edit.previewLayoutChange(moved.documentJson, sameOrigin);
  assert.equal(sameOriginPreview.valid, true);
  const resizedByEdge = edit.commitFixedLayoutChange(moved.documentJson,
    sameOrigin, sameOriginPreview);
  const finalWidget = widget(JSON.parse(resizedByEdge.documentJson).layout.dsl,
    added.selectedWidgetId);
  assert.deepEqual([finalWidget.rightColumn, finalWidget.bottomRow], [42, 24],
    "a move with edge-adjusted size is not ignored when its origin is unchanged");

  assert.equal(edit.previewCommittedLayoutChange(sourceJson, addChange, {
    ...addPreview, target: { ...addPreview.target, rightColumn: 3 },
  }).valid, false, "a stale preview cannot override the command geometry");
  console.log("Fixed edge geometry and commit: pass");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
