/* Run from operator-display-client: node src/editor-bridge/editable-store/auto-height.contract.test.cjs */
const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");

async function load(entry) {
  const built = await esbuild.build({
    entryPoints: [entry], bundle: true, format: "cjs", platform: "node",
    loader: { ".png": "dataurl", ".css": "empty",
      ".scss": "empty", ".less": "empty", ".woff": "dataurl",
      ".woff2": "dataurl" },
    plugins: [{ name: "svg-test-stub", setup(build) {
      build.onLoad({ filter: /\.svg$/ }, () => ({
        contents: 'export const ReactComponent = () => null; export default "";',
        loader: "js",
      }));
    } }],
    write: false, logLevel: "silent",
  });
  const module = { exports: {} };
  new Function("module", "exports", "require", built.outputFiles[0].text)(
    module, module.exports, require,
  );
  return module.exports;
}

function widget(root, id) {
  if (root.widgetId === id) return root;
  for (const child of root.children ?? []) {
    const match = widget(child, id);
    if (match) return match;
  }
  return null;
}

function current(store, editor, id) {
  return widget(editor.selectEditorDocument(store.getState()).layout.dsl, id);
}

async function waitFor(store, predicate) {
  if (predicate(store.getState())) return store.getState();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { unsubscribe(); reject(new Error("Save timed out")); }, 2000);
    const unsubscribe = store.subscribe(() => {
      if (!predicate(store.getState())) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(store.getState());
    });
  });
}

async function main() {
  const [editor, documents, modalBlueprint] = await Promise.all([
    load(path.join(__dirname, "index.ts")),
    load(path.resolve(__dirname, "../../document/index.ts")),
    load(path.resolve(__dirname, "../native-widgets/modal/modalBlueprint.ts")),
  ]);

  // Migration 068 makes legacy Appsmith widgets Fixed. Existing integration
  // documents missing the field should remain Fixed until the user opts in.
  const legacy = documents.createBlankDashboardDocument("legacy-height", "Legacy");
  const legacyId = legacy.layout.dsl.children.find((item) => item.type === "TEXT_WIDGET").widgetId;
  const legacyStore = editor.createEditableWorkbenchStore(legacy);
  try {
    const before = legacyStore.getState().documentJson;
    legacyStore.dispatch(editor.measureEditorWidgetHeight({ widgetId: legacyId, paddedHeightPx: 400 }));
    assert.equal(legacyStore.getState().documentJson, before);
    assert.equal(current(legacyStore, editor, legacyId).dynamicHeight, undefined);
  } finally { legacyStore.dispose(); }

  const imported = documents.createBlankDashboardDocument("imported-auto", "Imported");
  imported.layout.dsl.children = [{
    widgetId: "imported-container", widgetName: "ImportedContainer",
    type: "CONTAINER_WIDGET", version: 1,
    parentId: imported.layout.dsl.widgetId, topRow: 10, bottomRow: 28,
    leftColumn: 2, rightColumn: 26, dynamicHeight: "AUTO_HEIGHT",
    minDynamicHeight: 10, maxDynamicHeight: 9000, borderWidth: "1",
    children: [{ widgetId: "imported-inner", widgetName: "ImportedInner",
      type: "CANVAS_WIDGET", version: 1, parentId: "imported-container",
      topRow: 0, bottomRow: 18, leftColumn: 0, rightColumn: 64,
      children: [] }],
  }];
  const importedStore = editor.createEditableWorkbenchStore(imported);
  try {
    assert.equal(current(importedStore, editor, "imported-container").bottomRow, 20,
      "Appsmith's page-load Container check shrinks an empty explicit AUTO Container");
    assert.equal(current(importedStore, editor, "imported-inner").bottomRow, 100,
      "Appsmith normalizes the child canvas in pixels");
    assert.equal(importedStore.getState().dirty, true,
      "normalized imported geometry needs saving");
    assert.equal(importedStore.getState().past.length, 0,
      "page-load Container normalization is not a user undo command");
  } finally { importedStore.dispose(); }

  const blank = documents.createBlankDashboardDocument("auto-height", "Auto height");
  blank.layout.dsl.children = [];
  const creationStore = editor.createEditableWorkbenchStore(blank);
  try {
    creationStore.dispatch(editor.addEditorWidget({ type: "TEXT_WIDGET", topRow: 2 }));
    const text = current(creationStore, editor, creationStore.getState().selectedWidgetId);
    assert.deepEqual([text.dynamicHeight, text.minDynamicHeight, text.maxDynamicHeight],
      ["AUTO_HEIGHT", 4, 9000]);
    creationStore.dispatch(editor.addEditorWidget({ type: "CONTAINER_WIDGET", topRow: 20 }));
    const container = current(creationStore, editor, creationStore.getState().selectedWidgetId);
    assert.deepEqual([
      container.dynamicHeight, container.minDynamicHeight,
      container.maxDynamicHeight, container.shouldScrollContents,
    ], ["AUTO_HEIGHT", 10, 9000, true]);
  } finally { creationStore.dispose(); }

  // JSON Form is a non-canvas Auto Height widget in Appsmith; Custom and Rich
  // Text expose the same feature with a Fixed default. Measured content must
  // use the ordinary Fixed sibling reflow for each of them.
  const expanded = documents.createBlankDashboardDocument("expanded-height", "Expanded");
  expanded.layout.dsl.children = [];
  const expandedStore = editor.createEditableWorkbenchStore(expanded);
  try {
    expandedStore.dispatch(editor.addEditorWidget({ type: "JSON_FORM_WIDGET", topRow: 2 }));
    const formId = expandedStore.getState().selectedWidgetId;
    assert.equal(current(expandedStore, editor, formId).dynamicHeight, "AUTO_HEIGHT");
    assert.equal(current(expandedStore, editor, formId).minDynamicHeight, 4);
    expandedStore.dispatch(editor.addEditorWidget({ type: "TEXT_WIDGET", topRow: 46 }));
    const belowId = expandedStore.getState().selectedWidgetId;
    const beforeBelow = current(expandedStore, editor, belowId).topRow;
    expandedStore.dispatch(editor.measureEditorWidgetHeight({
      widgetId: formId, paddedHeightPx: 620,
    }));
    assert.equal(current(expandedStore, editor, formId).bottomRow, 64);
    assert.ok(current(expandedStore, editor, belowId).topRow > beforeBelow,
      "JSON Form content growth reflows a lower overlapping widget");

    expandedStore.dispatch(editor.addEditorWidget({ type: "CUSTOM_WIDGET", topRow: 90 }));
    const customId = expandedStore.getState().selectedWidgetId;
    assert.equal(current(expandedStore, editor, customId).dynamicHeight, "FIXED");
    expandedStore.dispatch(editor.updateEditorWidgetHeightMode({
      widgetId: customId, mode: "AUTO_HEIGHT",
    }));
    expandedStore.dispatch(editor.measureEditorWidgetHeight({
      widgetId: customId, paddedHeightPx: 510,
    }));
    const custom = current(expandedStore, editor, customId);
    assert.equal(custom.dynamicHeight, "AUTO_HEIGHT");
    assert.equal(custom.bottomRow - custom.topRow, 51);
  } finally { expandedStore.dispose(); }

  // WidgetFeatures injects Height for these checked-in Fixed widgets. Verify
  // that the palette default and one mode switch are accepted for every type.
  const autoFeatureTypes = [
    "TEXT_WIDGET", "CONTAINER_WIDGET", "STATBOX_WIDGET", "TABS_WIDGET",
    "MODAL_WIDGET", "FORM_WIDGET", "CARD_WIDGET", "CHECKBOX_WIDGET",
    "SWITCH_WIDGET", "RADIO_GROUP_WIDGET", "RATE_WIDGET",
    "CHECKBOX_GROUP_WIDGET", "SWITCH_GROUP_WIDGET", "JSON_FORM_WIDGET",
  ];
  const fixedFeatureTypes = [
    "INPUT_WIDGET_V2", "SELECT_WIDGET", "MULTI_SELECT_WIDGET_V2",
    "DATE_PICKER_WIDGET2", "PHONE_INPUT_WIDGET", "CURRENCY_INPUT_WIDGET",
    "SINGLE_SELECT_TREE_WIDGET", "MULTI_SELECT_TREE_WIDGET",
    "RICH_TEXT_EDITOR_WIDGET", "CUSTOM_WIDGET",
  ];
  for (const [type, initial, next] of [
    ...autoFeatureTypes.map((type) => [type, "AUTO_HEIGHT", "FIXED"]),
    ...fixedFeatureTypes.map((type) => [type, "FIXED", "AUTO_HEIGHT"]),
  ]) {
    const source = documents.createBlankDashboardDocument(`height-${type}`, type);
    source.layout.dsl.children = [];
    const featureStore = editor.createEditableWorkbenchStore(source);
    try {
      featureStore.dispatch(editor.addEditorWidget({ type }));
      const id = featureStore.getState().selectedWidgetId;
      assert.equal(current(featureStore, editor, id).dynamicHeight, initial,
        `${type} Appsmith feature default`);
      featureStore.dispatch(editor.updateEditorWidgetHeightMode({ widgetId: id, mode: next }));
      assert.equal(current(featureStore, editor, id).dynamicHeight, next,
        `${type} Height control update`);
    } finally { featureStore.dispose(); }
  }

  // The dependency graph uses horizontal overlap. The right-hand widget does
  // not move; a lower widget in the same columns keeps its original gap.
  const simple = documents.createBlankDashboardDocument("simple-height", "Simple");
  simple.layout.dsl.children = [
    { widgetId: "a", widgetName: "TextA", type: "TEXT_WIDGET", version: 1,
      parentId: simple.layout.dsl.widgetId, topRow: 2, bottomRow: 8,
      leftColumn: 2, rightColumn: 22, dynamicHeight: "AUTO_HEIGHT",
      minDynamicHeight: 4, maxDynamicHeight: 9000, text: "A" },
    { widgetId: "b", widgetName: "TextB", type: "TEXT_WIDGET", version: 1,
      parentId: simple.layout.dsl.widgetId, topRow: 10, bottomRow: 16,
      leftColumn: 2, rightColumn: 22, text: "B" },
    { widgetId: "c", widgetName: "TextC", type: "TEXT_WIDGET", version: 1,
      parentId: simple.layout.dsl.widgetId, topRow: 10, bottomRow: 16,
      leftColumn: 24, rightColumn: 44, text: "C" },
  ];
  const store = editor.createEditableWorkbenchStore(simple);
  try {
    const history = store.getState().past.length;
    store.dispatch(editor.beginEditorDrag({ kind: "widget", widgetId: "a" }));
    store.dispatch(editor.measureEditorWidgetHeight({ widgetId: "a", paddedHeightPx: 120 }));
    assert.equal(current(store, editor, "a").bottomRow, 8,
      "measurement waits while Appsmith's drag session is active");
    store.dispatch(editor.endEditorDrag());
    assert.equal(current(store, editor, "a").bottomRow, 14,
      "the queued measurement flushes when dragging ends");
    store.dispatch(editor.measureEditorWidgetHeight({ widgetId: "a", paddedHeightPx: 120 }));
    assert.deepEqual([current(store, editor, "a").bottomRow,
      current(store, editor, "b").topRow,
      current(store, editor, "c").topRow], [14, 16, 10]);
    assert.equal(store.getState().past.length, history,
      "content measurements must not add undo entries");
    store.dispatch(editor.measureEditorWidgetHeight({ widgetId: "a", paddedHeightPx: 40 }));
    assert.deepEqual([current(store, editor, "a").bottomRow,
      current(store, editor, "b").topRow], [6, 8]);
    assert.equal(store.getState().past.length, history);

    store.dispatch(editor.updateEditorWidgetHeightMode({
      widgetId: "a", mode: "AUTO_HEIGHT_WITH_LIMITS",
    }));
    store.dispatch(editor.updateEditorWidgetHeightLimits({
      widgetId: "a", minRows: 5, maxRows: 9,
    }));
    assert.equal(store.getState().past.length, history + 2,
      "mode and paired limits are each one user command");
    store.dispatch(editor.measureEditorWidgetHeight({ widgetId: "a", paddedHeightPx: 300 }));
    assert.equal(current(store, editor, "a").bottomRow, 11,
      "30 rows of content clamp to the nine-row maximum");
    store.dispatch(editor.measureEditorWidgetHeight({ widgetId: "a", paddedHeightPx: 10 }));
    assert.equal(current(store, editor, "a").bottomRow, 7,
      "one row of content clamps to the five-row minimum");
    assert.equal(store.getState().past.length, history + 2);
    store.dispatch(editor.undoEditorChange());
    assert.equal(current(store, editor, "a").maxDynamicHeight, 6,
      "undo restores the pre-limit mode configuration");
  } finally { store.dispose(); }

  // A child measurement reflows its nested siblings, grows the Container by
  // the two-row inner canvas extension, and moves root-level siblings below.
  const nested = documents.createBlankDashboardDocument("nested-height", "Nested");
  nested.layout.dsl.children = [
    { widgetId: "box", widgetName: "Container1", type: "CONTAINER_WIDGET", version: 1,
      parentId: nested.layout.dsl.widgetId, topRow: 10, bottomRow: 26,
      leftColumn: 2, rightColumn: 26, dynamicHeight: "AUTO_HEIGHT",
      minDynamicHeight: 10, maxDynamicHeight: 9000,
      shouldScrollContents: true, borderWidth: "1", children: [
        { widgetId: "inner", widgetName: "Container1Canvas", type: "CANVAS_WIDGET",
          version: 1, parentId: "box", topRow: 0, bottomRow: 16,
          leftColumn: 0, rightColumn: 64, children: [
            { widgetId: "child", widgetName: "ChildText", type: "TEXT_WIDGET", version: 1,
              parentId: "inner", topRow: 2, bottomRow: 8, leftColumn: 2,
              rightColumn: 20, dynamicHeight: "AUTO_HEIGHT",
              minDynamicHeight: 4, maxDynamicHeight: 9000, text: "Child" },
            { widgetId: "lower", widgetName: "LowerText", type: "TEXT_WIDGET", version: 1,
              parentId: "inner", topRow: 10, bottomRow: 14,
              leftColumn: 2, rightColumn: 20, text: "Below" },
          ] },
      ] },
    { widgetId: "root-lower", widgetName: "RootLower", type: "TEXT_WIDGET", version: 1,
      parentId: nested.layout.dsl.widgetId, topRow: 28, bottomRow: 34,
      leftColumn: 2, rightColumn: 20, text: "Below Container" },
  ];
  let persisted;
  const scope = {
    deploymentId: "http://localhost:3004/operator_display",
    accountId: "7", documentId: nested.documentId,
  };
  const nestedStore = editor.createEditableWorkbenchStore(nested, {
    draftScope: scope,
    draftStore: { async save(receivedScope, savedDocument) {
      persisted = structuredClone(savedDocument);
      return { ...receivedScope, key: "auto-height-draft", revision: 1,
        savedAt: "2026-09-28T00:00:00.000Z", document: persisted, history: [] };
    } },
  });
  try {
    nestedStore.dispatch(editor.measureEditorWidgetHeight({
      widgetId: "child", paddedHeightPx: 130,
    }));
    assert.deepEqual([
      current(nestedStore, editor, "child").bottomRow,
      current(nestedStore, editor, "lower").topRow,
      current(nestedStore, editor, "box").bottomRow,
      current(nestedStore, editor, "inner").bottomRow,
      current(nestedStore, editor, "root-lower").topRow,
    ], [15, 17, 33, 230, 35],
    "Appsmith stores nested CANVAS_WIDGET bottomRow in pixels after auto-height reflow");
    assert.equal(nestedStore.getState().past.length, 0);
    nestedStore.dispatch(editor.requestEditorSave());
    await waitFor(nestedStore, (state) => state.saveStatus === "succeeded");
    const reopened = editor.createEditableWorkbenchStore(persisted);
    try {
      assert.deepEqual([
        current(reopened, editor, "child").bottomRow,
        current(reopened, editor, "box").bottomRow,
        current(reopened, editor, "root-lower").topRow,
      ], [15, 33, 35], "saved auto-height geometry reloads from the local draft");
    } finally { reopened.dispose(); }
  } finally { nestedStore.dispose(); }

  // Appsmith's detached Modal grows from its own child canvas. It updates
  // pixel height/minHeight, while the main canvas and its siblings stay put.
  const modalDocument = documents.createBlankDashboardDocument("modal-auto-height", "Modal height");
  const modalRoot = modalDocument.layout.dsl;
  // MainContainer's hydrated minimum is 380px; set the authored root to that
  // normalized baseline so the Modal assertion isolates detached behavior.
  modalRoot.bottomRow = 380;
  const rootSibling = modalRoot.children[0];
  const rootSiblingBounds = [rootSibling.topRow, rootSibling.bottomRow];
  const modal = modalBlueprint.createModalWidgetBlueprint({
    widgetId: "auto-modal", widgetName: "AutoModal", parentId: modalRoot.widgetId,
    topRow: 10, bottomRow: 34, leftColumn: 2, rightColumn: 26,
    parentColumnSpace: 19.2, parentRowSpace: 10,
    childIds: { canvas: "auto-modal-canvas", closeIcon: "auto-modal-icon",
      title: "auto-modal-title", closeButton: "auto-modal-close",
      confirmButton: "auto-modal-confirm" },
    childNames: { canvas: "AutoModalCanvas", closeIcon: "AutoModalIcon",
      title: "AutoModalTitle", closeButton: "AutoModalClose",
      confirmButton: "AutoModalConfirm" },
  });
  modal.children[0].children.push({
    widgetId: "auto-modal-tail", widgetName: "AutoModalTail",
    type: "TEXT_WIDGET", version: 1, parentId: "auto-modal-canvas",
    topRow: 35, bottomRow: 39, leftColumn: 1, rightColumn: 20,
    text: "Tail",
  });
  modalRoot.children = [rootSibling, modal];
  const modalStore = editor.createEditableWorkbenchStore(modalDocument);
  try {
    assert.equal(current(modalStore, editor, "auto-modal").height, 410,
      "page-load normalization includes the bottommost Modal child and two extension rows");
    assert.equal(current(modalStore, editor, "auto-modal").bottomRow, 51);
    assert.equal(current(modalStore, editor, "auto-modal-canvas").bottomRow, 41);
    assert.equal(modalStore.getState().past.length, 0);
    const mainCanvasBottom = editor.selectEditorDocument(modalStore.getState()).layout.dsl.bottomRow;
    modalStore.dispatch(editor.measureEditorWidgetHeight({
      widgetId: "auto-modal-title", paddedHeightPx: 300,
    }));
    const growingModal = current(modalStore, editor, "auto-modal");
    assert.ok(growingModal.height > 410, "child Text measurement grows the Modal panel");
    assert.equal(growingModal.height, growingModal.minHeight);
    assert.equal(growingModal.bottomRow, growingModal.topRow + growingModal.height / 10);
    assert.equal(current(modalStore, editor, "auto-modal-canvas").minHeight,
      growingModal.height, "the nested drop target follows the Modal panel");
    assert.deepEqual([current(modalStore, editor, rootSibling.widgetId).topRow,
      current(modalStore, editor, rootSibling.widgetId).bottomRow], rootSiblingBounds);
    assert.equal(editor.selectEditorDocument(modalStore.getState()).layout.dsl.bottomRow,
      mainCanvasBottom, "a detached Modal does not grow the root canvas");
    modalStore.dispatch(editor.measureEditorWidgetHeight({
      widgetId: "auto-modal-title", paddedHeightPx: 40,
    }));
    assert.equal(current(modalStore, editor, "auto-modal").height, 410,
      "the Modal panel shrinks with its child content");
    assert.equal(modalStore.getState().past.length, 0,
      "measurements never create undo entries");
  } finally { modalStore.dispose(); }

  // Old imported DSL can carry the generic limited mode even though Appsmith
  // only offers Auto/Fixed in the Modal property dropdown. Keep its limits
  // functional until the user explicitly chooses a supported visible mode.
  const limitedModalDocument = structuredClone(modalDocument);
  const limitedModal = limitedModalDocument.layout.dsl.children.at(-1);
  limitedModal.dynamicHeight = "AUTO_HEIGHT_WITH_LIMITS";
  limitedModal.minDynamicHeight = 24;
  limitedModal.maxDynamicHeight = 30;
  const limitedModalStore = editor.createEditableWorkbenchStore(limitedModalDocument);
  try {
    assert.equal(current(limitedModalStore, editor, "auto-modal").height, 300);
    limitedModalStore.dispatch(editor.updateEditorWidgetHeightLimits({
      widgetId: "auto-modal", maxRows: 50,
    }));
    assert.equal(current(limitedModalStore, editor, "auto-modal").height, 410);
    limitedModalStore.dispatch(editor.updateEditorWidgetHeightLimits({
      widgetId: "auto-modal", minRows: 42,
    }));
    assert.equal(current(limitedModalStore, editor, "auto-modal").height, 420);
    limitedModalStore.dispatch(editor.undoEditorChange());
    assert.equal(current(limitedModalStore, editor, "auto-modal").height, 410);
    limitedModalStore.dispatch(editor.updateEditorWidgetHeightMode({
      widgetId: "auto-modal", mode: "AUTO_HEIGHT",
    }));
    assert.equal(current(limitedModalStore, editor, "auto-modal").minDynamicHeight, 10);
    assert.equal(current(limitedModalStore, editor, "auto-modal").height, 410);
  } finally { limitedModalStore.dispose(); }

  console.log("Fixed auto-height editor contract passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
