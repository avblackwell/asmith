/* Run from operator-display-client: node src/editor-bridge/appsmith-fixed-autoheight/autoHeightRules.contract.test.cjs */
const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");

async function main() {
  const built = await esbuild.build({
    entryPoints: [path.join(__dirname, "autoHeightRules.ts")],
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
  const rules = loaded.exports;

  assert.equal(rules.paddedContentHeight(41), 50);
  assert.equal(rules.paddedContentHeight(0), 10);
  assert.deepEqual(rules.defaultDynamicHeightProperties(false), {
    dynamicHeight: "AUTO_HEIGHT", minDynamicHeight: 4, maxDynamicHeight: 9000,
  });
  assert.deepEqual(rules.defaultDynamicHeightProperties(true), {
    dynamicHeight: "AUTO_HEIGHT", minDynamicHeight: 10, maxDynamicHeight: 9000,
    shouldScrollContents: true,
  });
  const text = { dynamicHeight: "AUTO_HEIGHT_WITH_LIMITS", topRow: 5, bottomRow: 11,
    minDynamicHeight: 4, maxDynamicHeight: 20 };
  assert.equal(rules.isAutoHeightEnabledForWidgetWithLimits(text), true);
  assert.equal(rules.isAutoHeightEnabledForWidgetWithLimits({ ...text, isFlexChild: true }), false);
  assert.equal(rules.shouldUpdateWidgetHeightAutomatically(220, text), true);
  assert.equal(rules.shouldUpdateWidgetHeightAutomatically(220, { ...text, dynamicHeight: "FIXED" }), false);
  assert.deepEqual(rules.dynamicHeightModeUpdates({
    dynamicHeight: "FIXED", topRow: 2, bottomRow: 12, overflow: "SCROLL",
    shouldScrollContents: false, minDynamicHeight: 4, maxDynamicHeight: 9000,
  }, "AUTO_HEIGHT_WITH_LIMITS"), [
    { propertyPath: "dynamicHeight", propertyValue: "AUTO_HEIGHT_WITH_LIMITS" },
    { propertyPath: "maxDynamicHeight", propertyValue: 12 },
    { propertyPath: "originalBottomRow", propertyValue: 12 },
    { propertyPath: "originalTopRow", propertyValue: 2 },
    { propertyPath: "shouldScrollContents", propertyValue: true },
    { propertyPath: "overflow", propertyValue: "NONE" },
  ]);

  const initial = rules.initialHeightLimitDragState(4, 8);
  const movedMax = rules.moveMaxHeightLimit(rules.initialHeightLimitDragState(6, 10), -40, 10);
  assert.equal(movedMax.maxdY, -40);
  assert.equal(movedMax.mindY, -10, "max handle drags min to keep one row of separation");
  assert.deepEqual(rules.heightLimitRowsAfterDrag(movedMax), { minRows: 5, maxRows: 6 });

  const movedMin = rules.moveMinHeightLimit(initial, 40, 10);
  assert.equal(movedMin.mindY, 40);
  assert.equal(movedMin.maxdY, 10, "min handle drags max to keep one row of separation");
  assert.deepEqual(rules.heightLimitRowsAfterDrag(movedMin), { minRows: 8, maxRows: 9 });

  const occupied = [{ id: "dragged", bottom: 50 }, { id: "sibling", bottom: 70 }];
  assert.equal(rules.calculateDropTargetRows(["dragged"], 60, occupied, true), 78);
  assert.equal(rules.calculateDropTargetRows(["dragged"], 60, occupied, false), 72);
  assert.equal(rules.getCanvasSnapRows(1200), 119);
  assert.deepEqual(rules.getFixedCanvasSnapGrid(1242, { isMainCanvas: true }), {
    columnSpace: 1230 / 64, rowSpace: 10, padding: 6,
  });
  assert.deepEqual(rules.getFixedCanvasSnapGrid(500, { isMainCanvas: false }), {
    columnSpace: 480 / 64, rowSpace: 10, padding: 10,
  });
  assert.equal(rules.normalizedMainCanvasBottomRow([{ topRow: 2, bottomRow: 7 }]), 380);
  assert.equal(rules.normalizedMainCanvasBottomRow([{ topRow: 2, bottomRow: 53 }]), 530);
  assert.equal(rules.mainCanvasRenderBottomRow(380, 1200, "editor"), 1200);
  assert.equal(rules.mainCanvasRenderBottomRow(380, 1200, "viewer"), 430);
  assert.equal(rules.shouldExtendDropTarget(119, 120), true);
  assert.equal(rules.shouldExtendDropTarget(110, 120), false);
  assert.equal(rules.nextTemporaryDropTargetRows(120, ["dragged"], 119, occupied, true), 127);
  assert.equal(rules.nextTemporaryDropTargetRows(120, ["dragged"], 110, occupied, true), 120);
  console.log("Appsmith Fixed auto-height rules: pass");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
