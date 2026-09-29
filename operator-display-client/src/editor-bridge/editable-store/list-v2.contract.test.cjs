/* Run from operator-display-client: node src/editor-bridge/editable-store/list-v2.contract.test.cjs */
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
  const docs = await load(path.join(__dirname, "../../document/index.ts"));
  const controls = await load(path.join(__dirname, "../property-controls/config/index.ts"));
  const rows = await load(path.join(__dirname,
    "../native-widgets/list-v2/materializeStaticListV2Rows.ts"));
  const store = editor.createEditableWorkbenchStore(docs.createBlankDashboardDocument("list-v2-contract"));
  const get = (id) => editor.selectEditorWidgetById(store.getState(), id);
  try {
    store.dispatch(editor.addEditorWidget({ type: "LIST_WIDGET_V2", topRow: 12 }));
    assert.equal(store.getState().editError, null);
    const listId = store.getState().selectedWidgetId;
    let list = get(listId);
    assert.equal(list.type, "LIST_WIDGET_V2");
    assert.equal(list.bottomRow - list.topRow, 40);
    assert.deepEqual(list.children[0].children[0].children[0].children.map(
      (child) => child.type), ["IMAGE_WIDGET", "TEXT_WIDGET", "TEXT_WIDGET"]);
    assert.equal(list.children[0].dropDisabled, true);
    docs.parseDashboardDocument(editor.selectEditorDocument(store.getState()));

    const itemCanvas = list.children[0].children[0].children[0];
    const headingId = itemCanvas.children[1].widgetId;
    store.dispatch(editor.selectEditorWidget(headingId));
    assert.equal(store.getState().selectedWidgetId, listId,
      "template selection redirects to its editable List owner");

    const initial = store.getState().documentJson;
    store.dispatch(editor.addEditorWidget({ type: "TEXT_WIDGET", parentId: itemCanvas.widgetId }));
    assert.match(store.getState().editError, /List template/);
    assert.equal(store.getState().documentJson, initial);
    store.dispatch(editor.updateEditorWidgetProperty({ widgetId: headingId,
      property: "text", value: "Edited" }));
    assert.match(store.getState().editError, /List template/);
    assert.equal(store.getState().documentJson, initial);
    store.dispatch(editor.copyEditorWidgets([headingId]));
    assert.match(store.getState().editError, /List template/);

    const data = [
      { id: "a", name: "Alpha", img: "https://example.invalid/a.png" },
      { id: "b", name: "Beta", img: "https://example.invalid/b.png" },
      { id: "c", name: "Gamma", img: "https://example.invalid/c.png" },
      { id: "d", name: "Delta", img: "https://example.invalid/d.png" },
    ];
    store.dispatch(editor.updateEditorWidgetProperty({ widgetId: listId,
      property: "listData", value: data }));
    assert.equal(store.getState().editError, null);
    list = get(listId);
    assert.deepEqual(list.listData, data);
    assert.equal(list.children[0].children.length, 1,
      "literal rows remain one saved template subtree");
    const rendered = rows.materializeStaticListV2Rows(list, { pageNo: 2, pageSize: 2 });
    assert.equal(rendered.status, "ready");
    assert.equal(rendered.rows[0].currentIndex, 2);
    assert.equal(rendered.rows[0].runtimeWidget.dsl.children[0].children[1].text, "Gamma");
    assert.ok(!store.getState().documentJson.includes("__list_runtime__"),
      "generated row IDs never enter the saved JSON");

    const beforeInvalid = store.getState().documentJson;
    store.dispatch(editor.updateEditorWidgetProperty({ widgetId: listId,
      property: "listData", value: { id: "bad" } }));
    assert.match(store.getState().editError, /literal JSON array/);
    assert.equal(store.getState().documentJson, beforeInvalid);
    store.dispatch(editor.updateEditorWidgetProperty({ widgetId: listId,
      property: "itemSpacing", value: 17 }));
    assert.match(store.getState().editError, /0 to 16/);
    assert.equal(store.getState().documentJson, beforeInvalid);

    const fields = controls.getPropertySections("LIST_WIDGET_V2", "content", list)
      .flatMap((section) => section.children.map((field) => field.propertyName));
    assert.ok(fields.includes("listData"));
    assert.ok(!fields.includes("onItemClick"));
    assert.ok(!fields.includes("serverSidePagination"));
    store.dispatch(editor.resizeEditorWidget({ widgetId: listId,
      width: 25, height: 30 }));
    assert.equal(store.getState().editError, null);
    list = get(listId);
    assert.equal(list.children[0].rightColumn,
      25 * list.parentColumnSpace, "List main canvas retains pixel geometry");
    assert.equal(list.children[0].bottomRow,
      30 * list.parentRowSpace, "List main canvas retains pixel height");
    docs.parseDashboardDocument(editor.selectEditorDocument(store.getState()));

    store.dispatch(editor.copyEditorWidgets([listId]));
    assert.equal(store.getState().editError, null);
    store.dispatch(editor.pasteEditorWidgets());
    assert.equal(store.getState().editError, null);
    const copy = get(store.getState().selectedWidgetId);
    assert.equal(copy.type, "LIST_WIDGET_V2");
    assert.notEqual(copy.widgetId, listId);
    assert.equal(copy.mainCanvasId, copy.children[0].widgetId);
    assert.equal(copy.mainContainerId, copy.children[0].children[0].widgetId);
    assert.equal(copy.primaryKeys,
      `{{${copy.widgetName}.listData.map((currentItem, currentIndex) => currentItem["id"] )}}`);
    assert.equal(rows.materializeStaticListV2Rows(copy, { pageNo: 1, pageSize: 2 }).status, "ready");
    assert.equal(copy.children[0].rightColumn,
      25 * copy.parentColumnSpace, "copied List keeps pixel main-canvas width");
    docs.parseDashboardDocument(editor.selectEditorDocument(store.getState()));

    store.dispatch(editor.updateEditorWidgetProperty({ widgetId: copy.widgetId,
      property: "widgetName", value: "VisibleItems" }));
    assert.equal(store.getState().editError, null);
    const renamed = get(copy.widgetId);
    assert.equal(renamed.primaryKeys,
      '{{VisibleItems.listData.map((currentItem, currentIndex) => currentItem["id"] )}}');
    assert.equal(rows.materializeStaticListV2Rows(renamed, { pageNo: 1, pageSize: 2 }).status, "ready");
  } finally {
    store.dispose();
  }
  console.log("List V2 palette, static data, locked template, and pixel geometry contract passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
