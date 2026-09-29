/* Run from operator-display-client: node src/editor-bridge/native-widgets/modal/modal-resize.contract.test.cjs */
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
  const editor = await load(path.join(__dirname, "../../editable-store/index.ts"));
  const model = await load(path.join(__dirname, "modalResizeModel.ts"));
  const docs = await load(path.join(__dirname, "../../../document/index.ts"));
  const store = editor.createEditableWorkbenchStore(docs.createBlankDashboardDocument("modal-resize"));
  const get = (id) => editor.selectEditorWidgetById(store.getState(), id);
  try {
    store.dispatch(editor.addEditorWidget({ type: "MODAL_WIDGET", leftColumn: 2, topRow: 10 }));
    const modalId = store.getState().selectedWidgetId;
    const canvasId = get(modalId).children[0].widgetId;
    const rootBefore = editor.selectEditorDocument(store.getState()).layout.dsl.children
      .filter((widget) => widget.widgetId !== modalId)
      .map((widget) => [widget.widgetId, widget.topRow, widget.bottomRow]);
    assert.deepEqual(model.modalResizeDimensions({ width: 456 + 2 * 20,
      height: 240, currentHeight: 240, mainCanvasWidth: 1000,
      autoHeight: false }), { width: 496, height: 240 },
    "a 20px right-edge drag symmetrically grows the panel by 40px");
    assert.deepEqual(model.modalResizeDimensions({ width: 456 - 2 * 20,
      height: 240, currentHeight: 240, mainCanvasWidth: 1000,
      autoHeight: false }), { width: 416, height: 240 },
    "a 20px left-edge drag symmetrically shrinks the panel by 40px");

    const history = store.getState().past.length;
    store.dispatch(editor.resizeEditorModal({ widgetId: modalId,
      canvasWidgetId: canvasId, width: 500, height: 500, mainCanvasWidth: 400 }));
    assert.equal(store.getState().editError, null);
    assert.equal(get(modalId).width, 380, "Modal width caps at 95% of the main canvas");
    assert.equal(get(modalId).height, 240, "Auto Height ignores vertical resize");
    assert.equal(store.getState().past.length, history + 1);
    store.dispatch(editor.undoEditorChange());
    assert.equal(get(modalId).width, 456);
    store.dispatch(editor.redoEditorChange());
    assert.equal(get(modalId).width, 380);

    store.dispatch(editor.updateEditorWidgetHeightMode({ widgetId: modalId, mode: "FIXED" }));
    const fixedHistory = store.getState().past.length;
    const titleId = get(modalId).children[0].children.find((child) =>
      child.type === "TEXT_WIDGET").widgetId;
    const titleRowsBefore = get(titleId).bottomRow - get(titleId).topRow;
    store.dispatch(editor.beginEditorModalResize(modalId));
    assert.equal(store.getState().resizingModalWidgetId, modalId);
    const beforeQueuedMeasurement = store.getState().documentJson;
    store.dispatch(editor.measureEditorWidgetHeight({ widgetId: titleId,
      paddedHeightPx: 600 }));
    assert.equal(store.getState().documentJson, beforeQueuedMeasurement,
      "child ResizeObserver updates queue while the Modal handle is active");
    store.dispatch(editor.resizeEditorModal({ widgetId: modalId,
      canvasWidgetId: canvasId, width: 300, height: 320, mainCanvasWidth: 1000 }));
    assert.equal(store.getState().resizingModalWidgetId, modalId,
      "the resize command keeps its interaction gate through commit");
    assert.equal(get(titleId).bottomRow - get(titleId).topRow, titleRowsBefore,
      "a queued child measurement cannot flush midway through release");
    let modal = get(modalId);
    assert.equal(modal.width, 300);
    assert.equal(modal.height, 320);
    assert.equal(modal.bottomRow, modal.topRow + 32);
    assert.equal(modal.minHeight, 320);
    assert.equal(modal.children[0].minHeight, 320);
    assert.equal(modal.children[0].bottomRow,
      model.modalCanvasBottomRows(320, modal.children[0]));
    assert.equal(store.getState().past.length, fixedHistory + 1,
      "one pixel resize creates one undo entry");
    store.dispatch(editor.endEditorModalResize(modalId));
    assert.equal(store.getState().resizingModalWidgetId, null);
    assert.ok(get(titleId).bottomRow - get(titleId).topRow > titleRowsBefore,
      "queued child measurement flushes after the matching Modal end action");

    const source = store.getState().documentJson;
    store.dispatch(editor.resizeEditorModal({ widgetId: modalId,
      canvasWidgetId: "missing", width: 330, height: 330, mainCanvasWidth: 1000 }));
    assert.match(store.getState().editError, /child canvas has changed/);
    assert.equal(store.getState().documentJson, source,
      "stale child canvas IDs cannot write Modal dimensions");

    store.dispatch(editor.resizeEditorModal({ widgetId: modalId,
      canvasWidgetId: canvasId, width: 12, height: 20, mainCanvasWidth: 1000 }));
    modal = get(modalId);
    assert.equal(modal.width, 100);
    assert.equal(modal.height, 100);
    assert.deepEqual(editor.selectEditorDocument(store.getState()).layout.dsl.children
      .filter((widget) => widget.widgetId !== modalId)
      .map((widget) => [widget.widgetId, widget.topRow, widget.bottomRow]), rootBefore,
    "detached Modal resize never reflows root siblings");
    docs.parseDashboardDocument(editor.selectEditorDocument(store.getState()));
  } finally {
    store.dispose();
  }
  console.log("Fixed Modal edge geometry, Redux command, limits, and undo contract passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
