/* Run from operator-display-client: node src/editor-bridge/editable-store/tabs.contract.test.cjs */
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

function allWidgets(root) {
  return [root, ...(root.children ?? []).flatMap(allWidgets)];
}

async function main() {
  const editor = await load(path.join(__dirname, "index.ts"));
  const documents = await load(path.join(__dirname, "../../document/index.ts"));
  const controls = await load(path.join(__dirname, "../property-controls/config/index.ts"));
  const document = documents.createBlankDashboardDocument("tabs-contract");
  const store = editor.createEditableWorkbenchStore(document);
  const current = () => editor.selectEditorDocument(store.getState());
  const get = (id) => editor.selectEditorWidgetById(store.getState(), id);
  try {
    store.dispatch(editor.addEditorWidget({ type: "TABS_WIDGET", leftColumn: 2, topRow: 10 }));
    const tabsId = store.getState().selectedWidgetId;
    let tabs = get(tabsId);
    assert.equal(tabs.type, "TABS_WIDGET");
    assert.deepEqual(controls.getPropertySections("TABS_WIDGET", "content", tabs)
      .flatMap((section) => section.children.map((field) => field.controlType))
      .filter((type) => type === "TABS_INPUT"), ["TABS_INPUT"]);
    assert.equal(tabs.children.length, 2);
    assert.deepEqual(Object.values(tabs.tabsObj).map((tab) => tab.widgetId),
      tabs.children.map((canvas) => canvas.widgetId));
    assert.deepEqual(tabs.children.map((canvas) => [canvas.type, canvas.parentId,
      canvas.leftColumn, canvas.rightColumn]), [
      ["CANVAS_WIDGET", tabsId, 0, 64], ["CANVAS_WIDGET", tabsId, 0, 64],
    ]);
    const [firstCanvas, secondCanvas] = tabs.children.map((canvas) => canvas.widgetId);
    assert.equal(store.getState().editError, null);

    // View/editor tab state follows Appsmith meta state: it has no history entry.
    const beforeTabSelection = store.getState().documentJson;
    const beforeTabHistory = store.getState().past.length;
    store.dispatch(editor.selectEditorTabCanvas({ tabsWidgetId: tabsId,
      canvasWidgetId: secondCanvas }));
    assert.equal(store.getState().activeTabCanvasIds[tabsId], secondCanvas);
    assert.equal(store.getState().documentJson, beforeTabSelection);
    assert.equal(store.getState().past.length, beforeTabHistory);
    assert.equal(store.getState().selectedWidgetId, tabsId);
    store.dispatch(editor.selectEditorTabCanvas({ tabsWidgetId: tabsId,
      canvasWidgetId: "missing-canvas" }));
    assert.equal(store.getState().activeTabCanvasIds[tabsId], secondCanvas);

    // The active CANVAS_WIDGET is a real Fixed drop parent, with its own grid.
    store.dispatch(editor.addEditorWidget({ type: "TEXT_WIDGET",
      parentId: secondCanvas, leftColumn: 2, topRow: 24 }));
    const childId = store.getState().selectedWidgetId;
    assert.equal(get(childId).parentId, secondCanvas);
    assert.equal(get(childId).topRow, 24);
    tabs = get(tabsId);
    const tallerHeight = tabs.bottomRow - tabs.topRow;
    assert.ok(tallerHeight >= get(childId).bottomRow + 4,
      "the Tabs widget reserves its 4-row strip and fits the tallest authored tab");
    assert.equal(tabs.children.find((canvas) => canvas.widgetId === firstCanvas).children.length, 0);

    // Deliberate first-slice difference from Appsmith: authored autoheight
    // projects the tallest tab; switching the active tab remains transient.
    const authoredJson = store.getState().documentJson;
    const authoredHistory = store.getState().past.length;
    store.dispatch(editor.selectEditorTabCanvas({ tabsWidgetId: tabsId,
      canvasWidgetId: firstCanvas }));
    assert.equal(store.getState().documentJson, authoredJson);
    assert.equal(store.getState().past.length, authoredHistory);
    assert.equal(get(tabsId).bottomRow - get(tabsId).topRow, tallerHeight);

    store.dispatch(editor.editEditorTab({ widgetId: tabsId, kind: "add" }));
    tabs = get(tabsId);
    assert.equal(tabs.children.length, 3);
    const newTab = Object.values(tabs.tabsObj).find((tab) => tab.index === 2);
    assert.equal(newTab.label, "Tab 3");
    assert.equal(tabs.children[2].tabId, newTab.id);
    assert.equal(tabs.children[2].tabName, "Tab 3");
    assert.equal(store.getState().past.length, authoredHistory + 1);
    store.dispatch(editor.editEditorTab({ widgetId: tabsId, kind: "rename",
      tabId: newTab.id, label: "Notes" }));
    assert.equal(get(tabsId).children[2].tabName, "Notes");
    assert.equal(get(tabsId).tabsObj[newTab.id].label, "Notes");
    store.dispatch(editor.editEditorTab({ widgetId: tabsId, kind: "reorder",
      tabId: newTab.id, toIndex: 0 }));
    assert.equal(get(tabsId).tabsObj[newTab.id].index, 0);
    store.dispatch(editor.editEditorTab({ widgetId: tabsId, kind: "visibility",
      tabId: newTab.id, isVisible: false }));
    assert.equal(get(tabsId).tabsObj[newTab.id].isVisible, false);

    const beforeInvalid = store.getState().documentJson;
    store.dispatch(editor.editEditorTab({ widgetId: tabsId, kind: "rename",
      tabId: newTab.id, label: "Tab 1" }));
    assert.match(store.getState().editError, /unique/);
    assert.equal(store.getState().documentJson, beforeInvalid);
    store.dispatch(editor.editEditorTab({ widgetId: tabsId, kind: "delete",
      tabId: newTab.id }));
    assert.equal(get(tabsId).children.length, 2);
    assert.equal(get(tabsId).tabsObj[newTab.id], undefined);
    store.dispatch(editor.undoEditorChange());
    assert.equal(get(tabsId).children.length, 3);
    store.dispatch(editor.redoEditorChange());
    assert.equal(get(tabsId).children.length, 2);
    assert.equal(store.getState().editError, null);

    // Deleting the child from an active tab retains the Tabs selection.
    store.dispatch(editor.deleteEditorWidget({ widgetId: childId }));
    assert.equal(get(childId), null);
    assert.equal(store.getState().selectedWidgetId, tabsId);
    assert.equal(allWidgets(current().layout.dsl).filter((widget) =>
      widget.widgetId === secondCanvas).length, 1);
    documents.parseDashboardDocument(current());
  } finally {
    store.dispose();
  }
  console.log("Tabs editor, transient selection, and autoheight contract passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
