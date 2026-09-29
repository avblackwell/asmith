/* Run from operator-display-client: node src/editor-bridge/editable-store/modal.contract.test.cjs */
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
  const store = editor.createEditableWorkbenchStore(docs.createBlankDashboardDocument("modal-contract"));
  const get = (id) => editor.selectEditorWidgetById(store.getState(), id);
  try {
    const initialHistory = store.getState().past.length;
    const originalRootChildren = editor.selectEditorDocument(store.getState()).layout.dsl.children
      .map((widget) => [widget.widgetId, widget.leftColumn, widget.topRow,
        widget.rightColumn, widget.bottomRow]);
    store.dispatch(editor.addEditorWidget({ type: "MODAL_WIDGET", leftColumn: 2, topRow: 10 }));
    assert.equal(store.getState().editError, null);
    const modalId = store.getState().selectedWidgetId;
    let modal = get(modalId);
    assert.equal(modal.type, "MODAL_WIDGET");
    assert.equal(modal.detachFromLayout, true);
    assert.equal(store.getState().openModalIds[modalId], undefined,
      "editor selection reveals the Modal through ancestry without mutating meta visibility");
    assert.equal(store.getState().past.length, initialHistory + 1,
      "the complete Modal blueprint is one undoable command");
    assert.deepEqual(editor.selectEditorDocument(store.getState()).layout.dsl.children
      .filter((widget) => widget.widgetId !== modalId)
      .map((widget) => [widget.widgetId, widget.leftColumn, widget.topRow,
        widget.rightColumn, widget.bottomRow]), originalRootChildren,
    "detached Modal placement does not collide with or reflow root widgets");
    const canvas = modal.children[0];
    assert.equal(canvas.type, "CANVAS_WIDGET");
    assert.deepEqual(canvas.children.map((widget) => widget.type), [
      "ICON_BUTTON_WIDGET", "TEXT_WIDGET", "BUTTON_WIDGET", "BUTTON_WIDGET",
    ]);
    assert.ok(canvas.children.every((widget) => !widget.onClick &&
      !widget.dynamicTriggerPathList?.length), "default controls do not serialize unimplemented actions");
    const autoControls = controls.getPropertySections("MODAL_WIDGET", "content", modal)
      .flatMap((section) => section.children);
    assert.ok(autoControls.some((field) => field.propertyName === "canOutsideClickClose"));
    assert.deepEqual(autoControls.find((field) => field.propertyName === "dynamicHeight")
      .options.map((option) => option.value), ["AUTO_HEIGHT", "FIXED"],
    "Appsmith offers just Auto Height and Fixed for Modal");
    assert.ok(!autoControls.some((field) => field.propertyName === "shouldScrollContents"),
      "auto height hides the scroll control");
    assert.ok(!controls.getPropertySections("MODAL_WIDGET", "content", modal)
      .flatMap((section) => section.children.map((field) => field.propertyName))
      .includes("onClose"));

    // The nested Fixed canvas accepts normal widgets, and its default controls
    // remain separate from the authored dashboard root canvas.
    store.dispatch(editor.addEditorWidget({ type: "TEXT_WIDGET", parentId: canvas.widgetId,
      leftColumn: 2, topRow: 10 }));
    const childId = store.getState().selectedWidgetId;
    assert.equal(get(childId).parentId, canvas.widgetId);
    assert.equal(store.getState().openModalIds[modalId], undefined);
    store.dispatch(editor.updateEditorWidgetHeightMode({ widgetId: modalId, mode: "FIXED" }));
    assert.equal(get(modalId).dynamicHeight, "FIXED");
    assert.ok(controls.getPropertySections("MODAL_WIDGET", "content", get(modalId))
      .flatMap((section) => section.children)
      .some((field) => field.propertyName === "shouldScrollContents"),
    "Fixed height reveals the scroll control");
    store.dispatch(editor.updateEditorWidgetProperty({ widgetId: modalId,
      property: "width", value: 500 }));
    store.dispatch(editor.updateEditorWidgetProperty({ widgetId: modalId,
      property: "height", value: 300 }));
    modal = get(modalId);
    assert.equal(modal.width, 500);
    assert.equal(modal.height, 300);
    assert.equal(modal.minHeight, 300);
    assert.equal(modal.bottomRow, modal.topRow + 30);
    assert.equal(modal.children[0].bottomRow, 30);
    assert.equal(modal.children[0].minHeight, 300);
    store.dispatch(editor.updateEditorWidgetHeightMode({ widgetId: modalId, mode: "AUTO_HEIGHT" }));
    assert.equal(get(modalId).dynamicHeight, "AUTO_HEIGHT");
    assert.equal(get(modalId).minDynamicHeight, 10,
      "WidgetFeatures resets a canvas owner's minimum to ten rows on Auto transition");
    assert.equal(get(modalId).height, 240,
      "returning to Auto immediately recomputes the child canvas height");
    const beforeUnsupportedMode = store.getState().documentJson;
    store.dispatch(editor.updateEditorWidgetHeightMode({
      widgetId: modalId, mode: "AUTO_HEIGHT_WITH_LIMITS",
    }));
    assert.match(store.getState().editError, /Modal supports only/);
    assert.equal(store.getState().documentJson, beforeUnsupportedMode);
    store.dispatch(editor.updateEditorWidgetProperty({ widgetId: modalId,
      property: "height", value: 300 }));
    assert.match(store.getState().editError, /Choose Fixed height/);
    assert.equal(store.getState().documentJson, beforeUnsupportedMode);
    store.dispatch(editor.updateEditorWidgetProperty({ widgetId: modalId,
      property: "canOutsideClickClose", value: false }));
    assert.equal(get(modalId).canOutsideClickClose, false);

    const beforeInvalid = store.getState().documentJson;
    store.dispatch(editor.updateEditorWidgetProperty({ widgetId: modalId,
      property: "width", value: 50 }));
    assert.match(store.getState().editError, /at least 100/);
    assert.equal(store.getState().documentJson, beforeInvalid);
    store.dispatch(editor.updateEditorWidgetProperty({ widgetId: modalId,
      property: "onClose", value: "{{closeModal('Modal1')}}" }));
    assert.match(store.getState().editError, /cannot be edited/);
    assert.equal(store.getState().documentJson, beforeInvalid);

    const transientJson = store.getState().documentJson;
    const transientHistory = store.getState().past.length;
    store.dispatch(editor.setEditorModalOpen({ modalWidgetId: modalId, isOpen: true }));
    assert.equal(store.getState().openModalIds[modalId], true);
    store.dispatch(editor.setEditorModalOpen({ modalWidgetId: modalId, isOpen: false }));
    assert.equal(store.getState().openModalIds[modalId], false);
    assert.equal(store.getState().selectedWidgetId, null,
      "closing clears selected ancestry, so the editor does not reopen the Modal");
    assert.equal(store.getState().documentJson, transientJson);
    assert.equal(store.getState().past.length, transientHistory);
    store.dispatch(editor.setEditorModalOpen({ modalWidgetId: modalId, isOpen: true }));
    assert.equal(store.getState().openModalIds[modalId], true);
    store.dispatch(editor.setEditorModalOpen({ modalWidgetId: modalId, isOpen: false }));
    store.dispatch(editor.selectEditorWidget(childId));
    assert.equal(store.getState().openModalIds[modalId], false,
      "reselecting a descendant reveals the editor Modal without mutating meta visibility");
    docs.parseDashboardDocument(editor.selectEditorDocument(store.getState()));

    store.dispatch(editor.deleteEditorWidget({ widgetId: modalId }));
    assert.equal(get(modalId), null);
    assert.equal(get(childId), null);
    store.dispatch(editor.undoEditorChange());
    assert.equal(get(modalId).type, "MODAL_WIDGET");
  } finally {
    store.dispose();
  }
  console.log("Modal palette, nested canvas, property, and transient state contract passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
