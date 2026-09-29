/* Run from operator-display-client: node src/editor-bridge/editable-store/nested-resize-extension.contract.test.cjs */
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

function find(root, id) {
  if (root.widgetId === id) return root;
  for (const child of root.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

function rootOf(result) {
  return JSON.parse(result.documentJson).layout.dsl;
}

async function main() {
  const [edits, documents, editor] = await Promise.all([
    load(path.join(__dirname, "editDocument.ts")),
    load(path.resolve(__dirname, "../../document/index.ts")),
    load(path.join(__dirname, "index.ts")),
  ]);
  const blank = documents.createBlankDashboardDocument("nested-resize-extension", "Resize extension");
  blank.layout.dsl.children = [];
  let result = edits.addWidgetToDocument(JSON.stringify(blank), {
    type: "CONTAINER_WIDGET", parentId: "0", leftColumn: 2, topRow: 10,
  });
  const containerId = result.selectedWidgetId;
  result = edits.addWidgetToDocument(result.documentJson, {
    type: "DIVIDER_WIDGET", parentId: containerId, leftColumn: 2, topRow: 2,
  });
  const dividerId = result.selectedWidgetId;
  const fixture = JSON.parse(result.documentJson);
  const container = find(fixture.layout.dsl, containerId);
  const canvasId = container.children.find((child) => child.type === "CANVAS_WIDGET").widgetId;
  container.dynamicHeight = "FIXED";

  // Fixed Container: resize crosses the visible parent bottom, but only its
  // child canvas gets extension rows. The outer widget remains fixed/clipped.
  container.shouldScrollContents = false;
  let json = JSON.stringify(fixture);
  const change = { kind: "resize", request: {
    widgetId: dividerId, width: 20, height: 23,
  } };
  const preview = edits.previewLayoutChange(json, change);
  assert.equal(preview.valid, true, preview.error);
  assert.equal(preview.target.bottomRow, 25);
  result = edits.commitFixedLayoutChange(json, change, preview);
  let root = rootOf(result);
  assert.equal(find(root, dividerId).bottomRow, 25);
  assert.equal(find(root, canvasId).bottomRow, 270,
    "nested CANVAS_WIDGET persists child bottom + two extension rows in pixels");
  assert.equal(find(root, containerId).bottomRow, 20,
    "fixed parent widget does not grow with its child canvas");

  // Scrolling Container: the same bottom extension is saved, including when
  // a different sibling extends farther down than the resized widget.
  container.shouldScrollContents = true;
  json = JSON.stringify(fixture);
  result = edits.addWidgetToDocument(json, {
    type: "DIVIDER_WIDGET", parentId: containerId, leftColumn: 35, topRow: 30,
  });
  const lowerId = result.selectedWidgetId;
  assert.equal(find(rootOf(result), lowerId).bottomRow, 34);
  const scrollingSource = result.documentJson;
  result = edits.resizeWidgetInDocument(scrollingSource, change.request);
  root = rootOf(result);
  assert.equal(find(root, canvasId).bottomRow, 360,
    "the farther sibling bottom plus two rows sets the saved canvas height");
  assert.equal(find(root, containerId).bottomRow, 20);

  const store = editor.createEditableWorkbenchStore(JSON.parse(scrollingSource));
  try {
    store.dispatch(editor.resizeEditorWidget(change.request));
    assert.equal(find(editor.selectEditorDocument(store.getState()).layout.dsl,
      canvasId).bottomRow, 360,
    "the Redux resize command retains the nested canvas pixel bottom");
    store.dispatch(editor.undoEditorChange());
    assert.equal(store.getState().documentJson, scrollingSource);
  } finally {
    store.dispose();
  }

  // The Fixed resize saga saves the child canvas extension before Appsmith's
  // bottom-up auto-height pass expands the parent Container. That subsequent
  // canvas normalization must retain pixels and the two extension rows.
  const autoFixture = JSON.parse(scrollingSource);
  const autoContainer = find(autoFixture.layout.dsl, containerId);
  autoContainer.dynamicHeight = "AUTO_HEIGHT";
  autoContainer.minDynamicHeight = 4;
  const autoStore = editor.createEditableWorkbenchStore(autoFixture);
  try {
    autoStore.dispatch(editor.resizeEditorWidget(change.request));
    const autoRoot = editor.selectEditorDocument(autoStore.getState()).layout.dsl;
    assert.equal(find(autoRoot, containerId).bottomRow, 46,
      "auto-height parent grows to the farther sibling plus two rows");
    assert.equal(find(autoRoot, canvasId).bottomRow, 360,
      "auto-height normalization retains the child canvas extension in pixels");
  } finally {
    autoStore.dispose();
  }

  // Main canvas uses the source's eight-row extension; its minimum height is
  // kept separately and can win if taller than the resized content.
  const rootFixture = JSON.parse(scrollingSource);
  rootFixture.layout.dsl.minHeight = 380;
  const topLevel = edits.addWidgetToDocument(JSON.stringify(rootFixture), {
    type: "TEXT_WIDGET", parentId: "0", leftColumn: 35, topRow: 50,
  });
  const topLevelId = topLevel.selectedWidgetId;
  result = edits.resizeWidgetInDocument(topLevel.documentJson, {
    widgetId: topLevelId, width: 16, height: 10,
  });
  root = rootOf(result);
  assert.equal(find(root, topLevelId).bottomRow, 60);
  assert.equal(root.bottomRow, 680,
    "main CANVAS_WIDGET persists child bottom plus eight rows in pixels");

  console.log("Nested Fixed resize extension contract passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
