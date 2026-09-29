/* Run from operator-display-client: node src/editor-bridge/editable-store/fixed-geometry.contract.test.cjs */
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

function get(root, id) {
  if (root.widgetId === id) return root;
  for (const child of root.children ?? []) {
    const found = get(child, id);
    if (found) return found;
  }
  return null;
}

async function main() {
  const [edits, documents, fixed] = await Promise.all([
    load(path.join(__dirname, "editDocument.ts")),
    load(path.resolve(__dirname, "../../document/index.ts")),
    load(path.resolve(__dirname, "../appsmith-fixed-autoheight/autoHeightRules.ts")),
  ]);
  assert.equal(fixed.DEFAULT_GRID_COLUMNS, 64);
  assert.equal(fixed.DEFAULT_GRID_ROW_HEIGHT, 10);
  const source = documents.createBlankDashboardDocument("fixed-geometry", "Fixed geometry");
  source.layout.dsl.children = [];
  let json = JSON.stringify(source);

  // WidgetOperationUtils.getSnappedGrid and WidgetSizeUtils.getCanvasBottomRow:
  // root uses (rendered width - 12) / 64, 10px rows, and content height in px.
  let result = edits.addWidgetToDocument(json, {
    type: "CONTAINER_WIDGET", parentId: "0", leftColumn: 2, topRow: 10,
  });
  let root = JSON.parse(result.documentJson).layout.dsl;
  const containerId = result.selectedWidgetId;
  const container = get(root, containerId);
  assert.equal(container.children[0].rightColumn, 64,
    "a new Container's inner canvas uses the fixed 64-column grid");
  const rootColumnSpace = (1242 - 12) / 64;
  assert.equal(container.parentColumnSpace, rootColumnSpace);
  assert.equal(container.parentRowSpace, 10);
  assert.equal(root.bottomRow, 380, "root persisted content height is pixel-valued");
  assert.equal(root.minHeight, 1200, "main canvas minimum is independent of content");

  // ContainerWidget.renderChildWidget supplies componentWidth. The inner
  // CANVAS_WIDGET still has 64 columns despite the Container's 24-column span.
  const containerWidthPx = 24 * rootColumnSpace;
  const innerColumnSpace = (containerWidthPx - 20) / 64;
  result = edits.addWidgetToDocument(result.documentJson, {
    type: "DIVIDER_WIDGET", parentId: containerId, leftColumn: 40, topRow: 2,
  });
  root = JSON.parse(result.documentJson).layout.dsl;
  const dividerId = result.selectedWidgetId;
  const divider = get(root, dividerId);
  assert.equal(divider.leftColumn, 40);
  assert.equal(divider.rightColumn, 60);
  assert.equal(divider.parentColumnSpace, innerColumnSpace);
  assert.equal(divider.parentRowSpace, 10);
  assert.equal(root.bottomRow, 380);

  // New Appsmith Containers default to scrolling with auto height. Turn it off
  // explicitly to exercise the bounded inner drop target of 17 rows.
  result = edits.updateWidgetPropertyInDocument(result.documentJson, {
    widgetId: containerId, property: "shouldScrollContents", value: false,
  });
  const overflow = edits.previewLayoutChange(result.documentJson, {
    kind: "add",
    request: { type: "DIVIDER_WIDGET", parentId: containerId,
      leftColumn: 2, topRow: 16 },
  });
  assert.equal(overflow.valid, false);
  const scrolling = edits.updateWidgetPropertyInDocument(result.documentJson, {
    widgetId: containerId, property: "shouldScrollContents", value: true,
  });
  assert.equal(edits.previewLayoutChange(scrolling.documentJson, {
    kind: "add",
    request: { type: "DIVIDER_WIDGET", parentId: containerId,
      leftColumn: 2, topRow: 16 },
  }).valid, true, "scrolling Containers can extend their inner canvas");

  // Resizing the outer Container changes the inner pixel snap space while
  // preserving child column positions in the 64-column inner grid.
  result = edits.resizeWidgetInDocument(result.documentJson, {
    widgetId: containerId, width: 20, height: 18,
  });
  root = JSON.parse(result.documentJson).layout.dsl;
  assert.equal(get(root, containerId).children[0].rightColumn, 64,
    "resizing a Container keeps the inner canvas on its 64-column grid");
  assert.equal(get(root, dividerId).rightColumn, 60);
  assert.equal(get(root, dividerId).parentColumnSpace,
    (20 * rootColumnSpace - 20) / 64);
  assert.equal(root.minHeight, 1200);

  // UPDATE_LAYOUT derives root height from current children, and deletion
  // shrinks it again. Neither operation changes the mainCanvas minHeight.
  result = edits.addWidgetToDocument(result.documentJson, {
    type: "TEXT_WIDGET", parentId: "0", leftColumn: 2, topRow: 200,
  });
  root = JSON.parse(result.documentJson).layout.dsl;
  const tallId = result.selectedWidgetId;
  assert.equal(root.bottomRow, 2040);
  assert.equal(root.minHeight, 1200);
  result = edits.deleteWidgetFromDocument(result.documentJson, { widgetId: tallId });
  root = JSON.parse(result.documentJson).layout.dsl;
  assert.equal(root.bottomRow, 380);
  assert.equal(root.minHeight, 1200);

  // A later root edit must continue to use 10px rows even after root
  // bottomRow changed from the blank document's row value to pixel value.
  result = edits.addWidgetToDocument(result.documentJson, {
    type: "TEXT_WIDGET", parentId: "0", leftColumn: 30, topRow: 50,
  });
  assert.equal(get(JSON.parse(result.documentJson).layout.dsl,
    result.selectedWidgetId).parentRowSpace, 10);
  console.log("Fixed edit geometry: pass");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
