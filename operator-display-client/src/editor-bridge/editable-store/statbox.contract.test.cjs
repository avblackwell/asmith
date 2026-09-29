/* Run from operator-display-client: node src/editor-bridge/editable-store/statbox.contract.test.cjs */
const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");

async function load(entry) {
  const build = await esbuild.build({ entryPoints: [entry], bundle: true,
    format: "cjs", platform: "node", write: false, logLevel: "silent" });
  const loaded = { exports: {} };
  new Function("module", "exports", "require", build.outputFiles[0].text)(
    loaded, loaded.exports, require);
  return loaded.exports;
}

async function main() {
  const editor = await load(path.join(__dirname, "index.ts"));
  const documents = await load(path.join(__dirname, "../../document/index.ts"));
  const controls = await load(path.join(__dirname, "../property-controls/config/index.ts"));
  const tabsProjection = await load(path.join(__dirname,
    "../native-widgets/tabs/projectActiveTabsAutoHeight.ts"));
  const store = editor.createEditableWorkbenchStore(
    documents.createBlankDashboardDocument("statbox-editor-contract"),
  );
  const get = (id) => editor.selectEditorWidgetById(store.getState(), id);
  try {
    const startingHistory = store.getState().past.length;
    store.dispatch(editor.addEditorWidget({ type: "STATBOX_WIDGET", leftColumn: 2, topRow: 10 }));
    assert.equal(store.getState().editError, null);
    const statboxId = store.getState().selectedWidgetId;
    let statbox = get(statboxId);
    assert.equal(statbox.type, "STATBOX_WIDGET");
    assert.equal(statbox.rightColumn - statbox.leftColumn, 22);
    assert.equal(statbox.bottomRow - statbox.topRow, 14);
    assert.equal(store.getState().past.length, startingHistory + 1,
      "the nested Statbox blueprint is one Redux/saga edit");
    assert.equal(statbox.children.length, 1);
    const canvas = statbox.children[0];
    assert.equal(canvas.type, "CANVAS_WIDGET");
    assert.deepEqual(canvas.children.map((child) => child.type), [
      "TEXT_WIDGET", "TEXT_WIDGET", "ICON_BUTTON_WIDGET", "TEXT_WIDGET",
    ]);
    assert.ok(canvas.children.every((child) => !child.onClick &&
      !child.dynamicTriggerPathList?.length));
    assert.deepEqual(controls.getPropertySections("STATBOX_WIDGET", "content", statbox)
      .flatMap((section) => section.children.map((field) => field.propertyName)), [
      "isVisible", "shouldScrollContents", "animateLoading", "dynamicHeight",
    ]);

    store.dispatch(editor.addEditorWidget({ type: "TEXT_WIDGET", leftColumn: 2, topRow: 27 }));
    const siblingId = store.getState().selectedWidgetId;
    const siblingTop = get(siblingId).topRow;
    const captionId = canvas.children[3].widgetId;
    store.dispatch(editor.updateEditorWidgetProperty({ widgetId: captionId,
      property: "text", value: "Longer caption" }));
    assert.equal(get(captionId).text, "Longer caption");
    store.dispatch(editor.measureEditorWidgetHeight({ widgetId: captionId,
      paddedHeightPx: 160 }));
    assert.equal(store.getState().editError, null);
    statbox = get(statboxId);
    assert.equal(get(captionId).bottomRow - get(captionId).topRow, 16);
    assert.equal(statbox.bottomRow - statbox.topRow, 26,
      "Statbox uses Appsmith's bottommost-child plus two-row autoheight rule");
    assert.equal(get(siblingId).topRow, siblingTop + 12,
      "outer Fixed dependency graph reflows a sibling below a growing Statbox");
    assert.equal(statbox.children[0].bottomRow, 260,
      "Appsmith stores the nested Statbox canvas height in pixels");

    store.dispatch(editor.updateEditorWidgetProperty({ widgetId: statboxId,
      property: "borderColor", value: "#123456" }));
    assert.equal(get(statboxId).borderColor, "#123456");
    store.dispatch(editor.updateEditorWidgetHeightMode({ widgetId: statboxId,
      mode: "AUTO_HEIGHT_WITH_LIMITS" }));
    assert.equal(get(statboxId).dynamicHeight, "AUTO_HEIGHT_WITH_LIMITS");
    store.dispatch(editor.updateEditorWidgetHeightLimits({ widgetId: statboxId,
      minRows: 12, maxRows: 30 }));
    assert.equal(get(statboxId).minDynamicHeight, 12);
    assert.equal(get(statboxId).maxDynamicHeight, 30);
    documents.parseDashboardDocument(editor.selectEditorDocument(store.getState()));

    // A Statbox can be the target of a normal Fixed canvas drop. This does not
    // mutate any of the source blueprint's four default children.
    store.dispatch(editor.addEditorWidget({ type: "TEXT_WIDGET",
      parentId: canvas.widgetId, leftColumn: 40, topRow: 12 }));
    assert.equal(store.getState().editError, null);
    assert.equal(get(store.getState().selectedWidgetId).parentId, canvas.widgetId);
    assert.equal(get(statboxId).children[0].children.length, 5);

    store.dispatch(editor.undoEditorChange());
    assert.equal(get(statboxId).children[0].children.length, 4);
  } finally {
    store.dispose();
  }

  // A nested Tabs selection is transient, but the enclosing Statbox must
  // reflow with the active tab in the render/drag projection.
  const nested = editor.createEditableWorkbenchStore(
    documents.createBlankDashboardDocument("nested-statbox-tabs"),
  );
  const nestedGet = (id) => editor.selectEditorWidgetById(nested.getState(), id);
  try {
    nested.dispatch(editor.addEditorWidget({ type: "STATBOX_WIDGET", topRow: 10 }));
    const statboxId = nested.getState().selectedWidgetId;
    const statboxCanvasId = nestedGet(statboxId).children[0].widgetId;
    nested.dispatch(editor.addEditorWidget({ type: "TEXT_WIDGET", topRow: 70 }));
    const siblingId = nested.getState().selectedWidgetId;
    nested.dispatch(editor.addEditorWidget({ type: "TABS_WIDGET",
      parentId: statboxCanvasId, leftColumn: 1, topRow: 14 }));
    const tabsId = nested.getState().selectedWidgetId;
    const [firstCanvasId, secondCanvasId] = nestedGet(tabsId).children
      .map((canvas) => canvas.widgetId);
    nested.dispatch(editor.addEditorWidget({ type: "TEXT_WIDGET",
      parentId: secondCanvasId, topRow: 24 }));
    assert.equal(nested.getState().editError, null);
    const authoredJson = nested.getState().documentJson;
    const authoredStatboxRows = nestedGet(statboxId).bottomRow - nestedGet(statboxId).topRow;
    const authoredSiblingTop = nestedGet(siblingId).topRow;
    const projection = tabsProjection.projectActiveTabsAutoHeight(authoredJson,
      { [tabsId]: firstCanvasId });
    assert.equal(projection.changed, true);
    assert.equal(nested.getState().documentJson, authoredJson,
      "active tab geometry is a view projection, not an authored edit");
    const projectedWidgets = [];
    function collect(widget) {
      projectedWidgets.push(widget);
      for (const child of widget.children ?? []) collect(child);
    }
    collect(JSON.parse(projection.documentJson).layout.dsl);
    const projected = (id) => projectedWidgets.find((widget) => widget.widgetId === id);
    assert.ok(projected(statboxId).bottomRow - projected(statboxId).topRow < authoredStatboxRows);
    assert.ok(projected(siblingId).topRow < authoredSiblingTop);
  } finally {
    nested.dispose();
  }
  console.log("Statbox editor, nested Fixed canvas, and autoheight contract passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
