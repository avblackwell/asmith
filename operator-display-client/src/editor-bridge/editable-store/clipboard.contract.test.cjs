/* Run from operator-display-client: node src/editor-bridge/editable-store/clipboard.contract.test.cjs */
const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");

async function load(entry) {
  const build = await esbuild.build({ entryPoints: [entry], bundle: true,
    format: "cjs", platform: "node", write: false, logLevel: "silent" });
  const module = { exports: {} };
  new Function("module", "exports", "require", build.outputFiles[0].text)(
    module, module.exports, require);
  return module.exports;
}

async function waitFor(store, predicate) {
  if (predicate(store.getState())) return store.getState();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { unsubscribe();
      reject(new Error("Timed out waiting for clipboard saga")); }, 2000);
    const unsubscribe = store.subscribe(() => {
      const state = store.getState();
      if (!predicate(state)) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(state);
    });
  });
}

async function main() {
  const editor = await load(path.join(__dirname, "index.ts"));
  const documents = await load(path.resolve(__dirname, "../../document/index.ts"));
  const source = documents.createBlankDashboardDocument("copy-source", "Source");
  source.variables.push({ key: "speed", label: "Speed",
    selector: { kind: "logicalName", name: "speed" }, valueType: "string" });
  source.bindings.push({ id: "speed-title", variableKey: "speed", unitCode: 0,
    target: { widgetId: "dashboard-title", propertyPath: "text" },
    presentation: { kind: "latest", template: "{value}" } });
  const destination = documents.createBlankDashboardDocument("copy-target", "Target");
  const owner = { deploymentId: "http://localhost/operator_display", accountId: "7" };
  const records = new Map();
  let saved;
  const savedClipboard = new Promise((resolve) => { saved = resolve; });
  const clipboardStore = {
    async save(scope, clipboard) {
      records.set(JSON.stringify([scope.deploymentId, scope.accountId]),
        structuredClone(clipboard));
      saved();
    },
    async load(scope) {
      return records.get(JSON.stringify([scope.deploymentId, scope.accountId])) ?? null;
    },
  };
  const scope = (documentId, accountId = owner.accountId) =>
    ({ ...owner, accountId, documentId });
  const sourceStore = editor.createEditableWorkbenchStore(source,
    { draftScope: scope(source.documentId), clipboardStore });
  try {
    sourceStore.dispatch(editor.copyEditorWidgets(["dashboard-title"]));
    await savedClipboard;
    assert.equal(records.size, 1);
    assert.equal(records.values().next().value.variables[0].key, "speed");
  } finally { sourceStore.dispose(); }

  function targetStore() {
    return editor.createEditableWorkbenchStore(destination,
      { draftScope: scope(destination.documentId), clipboardStore });
  }
  const first = targetStore();
  try {
    first.dispatch(editor.pasteEditorWidgets());
    const state = await waitFor(first, (current) =>
      editor.selectEditorDocument(current).layout.dsl.children.length === 2);
    const document = editor.selectEditorDocument(state);
    assert.equal(document.variables.length, 1);
    assert.equal(document.variables[0].key, "speed");
    assert.equal(document.bindings.length, 1);
    assert.equal(document.bindings[0].variableKey, "speed");
    assert.equal(document.bindings[0].target.widgetId, state.selectedWidgetId);
    documents.parseDashboardDocument(document);
  } finally { first.dispose(); }

  const recreated = targetStore();
  try {
    recreated.dispatch(editor.pasteEditorWidgets());
    const state = await waitFor(recreated, (current) =>
      editor.selectEditorDocument(current).layout.dsl.children.length === 2);
    assert.equal(editor.selectEditorDocument(state).bindings.length, 1,
      "a recreated store loads the persistent clipboard");
  } finally { recreated.dispose(); }

  const otherAccount = editor.createEditableWorkbenchStore(destination,
    { draftScope: scope(destination.documentId, "8"), clipboardStore });
  try {
    otherAccount.dispatch(editor.pasteEditorWidgets());
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.equal(editor.selectEditorDocument(otherAccount.getState())
      .layout.dsl.children.length, 1,
    "another account cannot read this clipboard");
  } finally { otherAccount.dispose(); }
  const otherDeployment = editor.createEditableWorkbenchStore(destination,
    { draftScope: { ...scope(destination.documentId),
      deploymentId: "http://other-operator-display" }, clipboardStore });
  try {
    otherDeployment.dispatch(editor.pasteEditorWidgets());
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.equal(editor.selectEditorDocument(otherDeployment.getState())
      .layout.dsl.children.length, 1,
    "another deployment cannot read this clipboard");
  } finally { otherDeployment.dispose(); }

  const failedCut = editor.createEditableWorkbenchStore(source, {
    draftScope: scope(source.documentId),
    clipboardStore: { async save() { throw new Error("Clipboard write failed"); },
      async load() { return null; } },
  });
  try {
    failedCut.dispatch(editor.cutEditorWidgets(["dashboard-title"]));
    const state = await waitFor(failedCut, (current) =>
      current.editError === "Clipboard write failed");
    assert.equal(editor.selectEditorDocument(state).layout.dsl.children.length, 1,
      "cut keeps the widget if the clipboard was not saved");
    assert.equal(editor.selectEditorDocument(state).bindings.length, 1);
  } finally { failedCut.dispose(); }
  console.log("Appsmith Fixed persisted clipboard store contract passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
