const assert = require("node:assert/strict");
const esbuild = require("esbuild");

async function load(entry) {
  const built = await esbuild.build({ entryPoints: [entry], bundle: true,
    format: "cjs", platform: "node", write: false, logLevel: "silent" });
  const loaded = { exports: {} };
  new Function("module", "exports", "require", built.outputFiles[0].text)(
    loaded, loaded.exports, require);
  return loaded.exports;
}

(async () => {
  const editor = await load("src/editor-bridge/editable-store/index.ts");
  const documents = await load("src/document/createBlankDashboardDocument.ts");
  const store = editor.createEditableWorkbenchStore(
    documents.createBlankDashboardDocument("custom-builder-contract"));
  try {
    store.dispatch(editor.addEditorWidget({ type: "CUSTOM_WIDGET", leftColumn: 2,
      topRow: 1 }));
    const widgetId = store.getState().selectedWidgetId;
    assert.ok(widgetId);
    const before = editor.selectEditorWidgetById(store.getState(), widgetId);
    assert.equal(before.type, "CUSTOM_WIDGET");
    const past = store.getState().past.length;
    const uncompiledSrcDoc = { html: '<div id="root"></div>',
      css: "$accent: red; #root { color: $accent; }",
      js: 'appsmith.onReady(() => { document.getElementById("root").textContent = "Edited"; });' };
    const srcDoc = { ...uncompiledSrcDoc, css: "#root { color: red; }" };
    store.dispatch(editor.updateEditorCustomWidgetSource({ widgetId, srcDoc,
      uncompiledSrcDoc }));
    const updated = editor.selectEditorWidgetById(store.getState(), widgetId);
    assert.deepEqual(updated.srcDoc, srcDoc);
    assert.deepEqual(updated.uncompiledSrcDoc, uncompiledSrcDoc);
    assert.equal(store.getState().past.length, past + 1,
      "both source properties are one undoable document edit");
    store.dispatch(editor.undoEditorChange());
    const undone = editor.selectEditorWidgetById(store.getState(), widgetId);
    assert.deepEqual(undone.srcDoc, before.srcDoc);
    assert.deepEqual(undone.uncompiledSrcDoc, before.uncompiledSrcDoc);
    console.log("Custom source batch save and single-step undo passed");
  } finally { store.dispose(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
