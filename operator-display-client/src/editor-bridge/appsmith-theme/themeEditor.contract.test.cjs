/* Run from operator-display-client: node src/editor-bridge/appsmith-theme/themeEditor.contract.test.cjs */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

async function loadPackage(entry) {
  const build = await esbuild.build({
    entryPoints: [entry], bundle: true, format: "cjs", platform: "node",
    write: false, logLevel: "silent",
  });
  const loaded = { exports: {} };
  new Function("module", "exports", "require", build.outputFiles[0].text)(
    loaded, loaded.exports, require,
  );
  return loaded.exports;
}

async function waitFor(store, predicate) {
  if (predicate(store.getState())) return store.getState();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for theme command"));
    }, 2000);
    const unsubscribe = store.subscribe(() => {
      if (!predicate(store.getState())) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(store.getState());
    });
  });
}

async function main() {
  const [editor, documents, presets] = await Promise.all([
    loadPackage(path.resolve(__dirname, "../editable-store/index.ts")),
    loadPackage(path.resolve(__dirname, "../../document/index.ts")),
    loadPackage(path.join(__dirname, "presets.ts")),
  ]);
  const source = JSON.parse(fs.readFileSync(path.resolve(__dirname,
    "../../../../app/server/appsmith-server/src/main/resources/system-themes.json"), "utf8"));
  const active = source.filter((theme) => !theme.config.isDeprecated)
    .sort((a, b) => a.config.order - b.config.order);
  assert.equal(presets.FEATURED_FIXED_THEMES.length, 8);
  assert.deepEqual(presets.FEATURED_FIXED_THEMES.map(({ name, displayName,
    config, properties }) => ({ name, displayName, config, properties })),
  active.map(({ name, displayName, config, properties }) =>
    ({ name, displayName, config, properties })),
  "local presets retain the exact active Appsmith source values");

  const document = documents.createBlankDashboardDocument("theme-command-contract");
  const originalTheme = structuredClone(document.theme);
  const scope = { deploymentId: "http://localhost:3004/operator_display",
    accountId: "7", documentId: document.documentId };
  let savedDocument;
  const store = editor.createEditableWorkbenchStore(document, {
    revision: 1, draftScope: scope,
    draftStore: { async save(receivedScope, value, expectedRevision) {
      assert.deepEqual(receivedScope, scope);
      assert.equal(expectedRevision, 1);
      savedDocument = value;
      return { ...scope, key: "theme-contract-record", revision: 2,
        savedAt: "2026-09-28T00:00:00.000Z", document: value, history: [] };
    } },
  });
  try {
    store.dispatch(editor.selectEditorThemePreset("Sunrise"));
    let selected = editor.selectEditorDocument(store.getState());
    assert.equal(selected.theme.kind, "inline");
    assert.equal(selected.theme.name, "Sunrise");
    assert.deepEqual(selected.theme.properties,
      presets.fixedThemePreset("Sunrise").properties);
    assert.equal(store.getState().dirty, true);
    assert.equal(store.getState().past.length, 1);

    const editedProperties = structuredClone(selected.theme.properties);
    editedProperties.colors.primaryColor = "#123456";
    store.dispatch(editor.updateEditorThemeProperties(editedProperties));
    selected = editor.selectEditorDocument(store.getState());
    assert.equal(selected.theme.properties.colors.primaryColor, "#123456");
    assert.equal(store.getState().past.length, 2);
    assert.equal(store.getState().selectedWidgetId, "dashboard-title");

    store.dispatch(editor.undoEditorChange());
    assert.deepEqual(editor.selectEditorDocument(store.getState()).theme.properties,
      presets.fixedThemePreset("Sunrise").properties);
    store.dispatch(editor.undoEditorChange());
    assert.deepEqual(editor.selectEditorDocument(store.getState()).theme, originalTheme);
    assert.equal(store.getState().dirty, false);
    store.dispatch(editor.redoEditorChange());
    store.dispatch(editor.redoEditorChange());
    assert.equal(editor.selectEditorDocument(store.getState()).theme.properties
      .colors.primaryColor, "#123456");
    store.dispatch(editor.requestEditorSave());
    await waitFor(store, (state) => state.saveStatus === "succeeded");
    assert.equal(savedDocument.theme.properties.colors.primaryColor, "#123456");
    assert.equal(store.getState().dirty, false);
  } finally {
    store.dispose();
  }

  const savedThemeDocument = documents.createBlankDashboardDocument("saved-theme-contract");
  const savedThemeScope = { ...scope, documentId: savedThemeDocument.documentId };
  const savedTheme = {
    kind: "inline",
    name: "Control Room Blue",
    displayName: "Control Room Blue for operators",
    basePresetName: "Pacific",
    properties: structuredClone(presets.fixedThemePreset("Pacific").properties),
  };
  savedTheme.properties.colors.primaryColor = "#0b587a";
  const savedThemeFixture = structuredClone(savedThemeDocument);
  savedThemeFixture.theme = structuredClone(savedTheme);
  assert.deepEqual(documents.parseDashboardDocument(savedThemeFixture).theme, savedTheme);
  assert.deepEqual(JSON.parse(documents.serializeDashboardDocument(savedThemeFixture)).theme,
    savedTheme, "saved theme metadata survives document serialization");
  assert.throws(() => documents.parseDashboardDocument({ ...savedThemeFixture,
    theme: { ...savedTheme, displayName: " " },
  }), /\$\.theme\.displayName/);
  assert.throws(() => documents.parseDashboardDocument({ ...savedThemeFixture,
    theme: { ...savedTheme, basePresetName: 123 },
  }), /\$\.theme\.basePresetName/);
  assert.throws(() => documents.parseDashboardDocument({ ...savedThemeFixture,
    theme: { ...savedTheme, libraryItemId: "deleted-theme" },
  }), /\$\.theme\.libraryItemId/);
  let savedThemeDocumentOnDisk;
  const savedThemeStore = editor.createEditableWorkbenchStore(savedThemeDocument, {
    revision: 1, draftScope: savedThemeScope,
    draftStore: { async save(receivedScope, value, expectedRevision) {
      assert.deepEqual(receivedScope, savedThemeScope);
      assert.equal(expectedRevision, 1);
      savedThemeDocumentOnDisk = value;
      return { ...savedThemeScope, key: "saved-theme-contract-record", revision: 2,
        savedAt: "2026-09-28T00:00:00.000Z", document: value, history: [] };
    } },
  });
  try {
    savedThemeStore.dispatch(editor.applyEditorSavedTheme({ ...savedTheme, name: "" }));
    assert.match(savedThemeStore.getState().editError, /\$\.theme\.name/);
    assert.deepEqual(editor.selectEditorDocument(savedThemeStore.getState()).theme,
      savedThemeDocument.theme, "invalid saved themes cannot change the draft");
    assert.equal(savedThemeStore.getState().past.length, 0);

    savedThemeStore.dispatch(editor.applyEditorSavedTheme(savedTheme));
    assert.deepEqual(editor.selectEditorDocument(savedThemeStore.getState()).theme,
      savedTheme, "the saved theme name and properties are applied by value");
    assert.equal(savedThemeStore.getState().dirty, true);
    assert.equal(savedThemeStore.getState().past.length, 1);
    savedThemeStore.dispatch(editor.undoEditorChange());
    assert.deepEqual(editor.selectEditorDocument(savedThemeStore.getState()).theme,
      savedThemeDocument.theme);
    savedThemeStore.dispatch(editor.redoEditorChange());
    assert.deepEqual(editor.selectEditorDocument(savedThemeStore.getState()).theme,
      savedTheme);
    savedThemeStore.dispatch(editor.requestEditorSave());
    await waitFor(savedThemeStore, (state) => state.saveStatus === "succeeded");
    assert.deepEqual(savedThemeDocumentOnDisk.theme, savedTheme);
    assert.equal(savedThemeStore.getState().dirty, false);
  } finally {
    savedThemeStore.dispose();
  }

  const referencedDocument = documents.createBlankDashboardDocument("theme-ref-contract");
  referencedDocument.theme = { kind: "marketplace", itemId: "12", revision: "1" };
  let savedReferencedDocument;
  const referenceScope = { ...scope, documentId: referencedDocument.documentId };
  const referenceStore = editor.createEditableWorkbenchStore(referencedDocument, {
    revision: 1, draftScope: referenceScope,
    draftStore: { async save(receivedScope, value, expectedRevision) {
      assert.deepEqual(receivedScope, referenceScope);
      assert.equal(expectedRevision, 1);
      savedReferencedDocument = value;
      return { ...referenceScope, key: "referenced-theme-record", revision: 2,
        savedAt: "2026-09-28T00:00:00.000Z", document: value, history: [] };
    } },
  });
  try {
    referenceStore.dispatch(editor.updateEditorThemeProperties(
      presets.fixedThemePreset("Default-New").properties));
    assert.match(referenceStore.getState().editError, /Choose a theme/);
    assert.equal(editor.selectEditorDocument(referenceStore.getState()).theme.kind,
      "marketplace");
    assert.equal(referenceStore.getState().past.length, 0);
    const resolvedTheme = { kind: "inline", name: "Marketplace Blue",
      properties: structuredClone(presets.fixedThemePreset("Default-New").properties) };
    const editedReferencedProperties = structuredClone(resolvedTheme.properties);
    editedReferencedProperties.colors.primaryColor = "#456789";
    referenceStore.dispatch(editor.updateEditorReferencedThemeProperties({
      reference: { ...referencedDocument.theme, revision: "stale" },
      resolvedTheme, properties: editedReferencedProperties,
    }));
    assert.match(referenceStore.getState().editError, /referenced theme changed/);
    assert.equal(referenceStore.getState().past.length, 0);
    referenceStore.dispatch(editor.selectEditorThemePreset("Pampas"));
    assert.equal(editor.selectEditorDocument(referenceStore.getState()).theme.name,
      "Pampas");
    referenceStore.dispatch(editor.undoEditorChange());
    assert.deepEqual(editor.selectEditorDocument(referenceStore.getState()).theme,
      referencedDocument.theme);
    referenceStore.dispatch(editor.updateEditorReferencedThemeProperties({
      reference: referencedDocument.theme, resolvedTheme,
      properties: editedReferencedProperties,
    }));
    assert.deepEqual(editor.selectEditorDocument(referenceStore.getState()).theme,
      { kind: "inline", name: "Marketplace Blue",
        properties: editedReferencedProperties });
    assert.equal(referenceStore.getState().past.length, 1,
      "the first edit replaces the reference in one undo step");
    assert.equal(referenceStore.getState().dirty, true);
    referenceStore.dispatch(editor.undoEditorChange());
    assert.deepEqual(editor.selectEditorDocument(referenceStore.getState()).theme,
      referencedDocument.theme);
    referenceStore.dispatch(editor.redoEditorChange());
    assert.equal(editor.selectEditorDocument(referenceStore.getState()).theme.properties
      .colors.primaryColor, "#456789");
    referenceStore.dispatch(editor.requestEditorSave());
    await waitFor(referenceStore, (state) => state.saveStatus === "succeeded");
    assert.deepEqual(savedReferencedDocument.theme,
      editor.selectEditorDocument(referenceStore.getState()).theme);
    assert.equal(referenceStore.getState().dirty, false);
  } finally {
    referenceStore.dispose();
  }
  process.stdout.write("Appsmith theme presets and editor commands passed\n");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
