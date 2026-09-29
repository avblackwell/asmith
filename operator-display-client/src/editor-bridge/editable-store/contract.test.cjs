/* Run from operator-display-client: node src/editor-bridge/editable-store/contract.test.cjs */
const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");

async function loadPackage(entry) {
  const build = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
    logLevel: "silent",
  });
  const loaded = { exports: {} };
  new Function("module", "exports", "require", build.outputFiles[0].text)(
    loaded,
    loaded.exports,
    require,
  );
  return loaded.exports;
}

function widgets(root) {
  return [root, ...(root.children ?? []).flatMap(widgets)];
}

async function waitFor(store, predicate) {
  if (predicate(store.getState())) return store.getState();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for editor saga"));
    }, 2000);
    const unsubscribe = store.subscribe(() => {
      const state = store.getState();
      if (!predicate(state)) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(state);
    });
  });
}

async function verifyCanvasWidthPreset(editor, documents) {
  const document = documents.createBlankDashboardDocument("width-preset-contract");
  const authoredRootWidth = document.layout.dsl.rightColumn;
  const initialJson = JSON.stringify(document);
  let savedDocument;
  const scope = {
    deploymentId: "http://localhost:3004/operator_display",
    accountId: "7",
    documentId: document.documentId,
  };
  const store = editor.createEditableWorkbenchStore(document, {
    draftScope: scope,
    revision: 1,
    draftStore: {
      async save(receivedScope, receivedDocument, expectedRevision) {
        assert.deepEqual(receivedScope, scope);
        assert.equal(expectedRevision, 1);
        savedDocument = receivedDocument;
        return {
          ...receivedScope,
          key: "width-contract-record",
          revision: 2,
          savedAt: "2026-09-28T00:00:00.000Z",
          document: receivedDocument,
          history: [],
        };
      },
    },
  });

  try {
    store.dispatch(editor.setEditorCanvasWidth(400));
    assert.equal(store.getState().canvasWidthPx, 400);
    assert.equal(store.getState().documentJson, initialJson,
      "viewport width does not mutate the authored document");
    assert.equal(store.getState().dirty, false,
      "viewport width alone cannot make a draft dirty");
    assert.equal(store.getState().past.length, 0,
      "viewport width is not an undoable document edit");

    store.dispatch(editor.updateEditorCanvasWidthPreset("MOBILE"));
    assert.equal(editor.selectEditorDocument(store.getState()).compatibility.canvasWidthPreset,
      "MOBILE", "the preset is serialized with the dashboard document");
    assert.equal(editor.selectEditorDocument(store.getState()).layout.dsl.rightColumn,
      authoredRootWidth, "the preset does not rewrite authored Fixed coordinates");
    assert.equal(store.getState().dirty, true);
    assert.equal(store.getState().past.length, 1);
    assert.equal(store.getState().canvasWidthPx, 400);

    store.dispatch(editor.addEditorWidget({ type: "TEXT_WIDGET", leftColumn: 2, topRow: 10 }));
    const addedId = store.getState().selectedWidgetId;
    assert.ok(addedId);
    const added = editor.selectEditorWidgetById(store.getState(), addedId);
    assert.equal(added.parentColumnSpace, (400 - 12) / 64,
      "new widget geometry uses the rendered 400px root snap grid");
    assert.equal(editor.selectEditorDocument(store.getState()).layout.dsl.rightColumn,
      authoredRootWidth, "a geometric edit restores the authored root width");
    assert.equal(store.getState().past.length, 2);

    store.dispatch(editor.undoEditorChange());
    assert.equal(editor.selectEditorWidgetById(store.getState(), addedId), null);
    assert.equal(editor.selectEditorDocument(store.getState()).compatibility.canvasWidthPreset,
      "MOBILE", "undoing geometry retains the preset");
    assert.equal(store.getState().canvasWidthPx, 400);
    store.dispatch(editor.undoEditorChange());
    assert.equal(editor.selectEditorDocument(store.getState()).compatibility.canvasWidthPreset,
      undefined, "the preset itself is an undoable document edit");
    assert.equal(store.getState().dirty, false);
    assert.equal(store.getState().canvasWidthPx, 400);

    store.dispatch(editor.redoEditorChange());
    assert.equal(editor.selectEditorDocument(store.getState()).compatibility.canvasWidthPreset,
      "MOBILE");
    store.dispatch(editor.redoEditorChange());
    assert.equal(editor.selectEditorWidgetById(store.getState(), addedId).parentColumnSpace,
      (400 - 12) / 64);
    assert.equal(editor.selectEditorDocument(store.getState()).layout.dsl.rightColumn,
      authoredRootWidth);

    store.dispatch(editor.requestEditorSave());
    await waitFor(store, (state) => state.saveStatus === "succeeded");
    assert.equal(savedDocument.compatibility.canvasWidthPreset, "MOBILE");
    assert.equal(savedDocument.layout.dsl.rightColumn, authoredRootWidth);
  } finally {
    store.dispose();
  }
}

async function main() {
  const editor = await loadPackage(path.join(__dirname, "index.ts"));
  const documents = await loadPackage(path.resolve(__dirname, "../../document/index.ts"));
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = () => {
    fetchCalls += 1;
    throw new Error("Editor attempted a transport request");
  };

  await verifyCanvasWidthPreset(editor, documents);

  const document = documents.createBlankDashboardDocument("editable-contract", "Contract dashboard");
  const scope = {
    deploymentId: "http://localhost:3004/operator_display",
    accountId: "7",
    documentId: document.documentId,
  };
  let storedRevision = 5;
  const saveRequests = [];
  const draftStore = {
    async save(receivedScope, savedDocument, expectedRevision) {
      saveRequests.push({ receivedScope, savedDocument, expectedRevision });
      if (expectedRevision !== storedRevision) {
        throw new Error("The local draft changed since it was loaded. Reload it before saving.");
      }
      storedRevision += 1;
      return {
        ...receivedScope,
        key: "local-record",
        revision: storedRevision,
        savedAt: "2026-09-28T00:00:00.000Z",
        document: savedDocument,
        history: [],
      };
    },
  };

  const store = editor.createEditableWorkbenchStore(document, {
    draftScope: scope,
    revision: 4,
    draftStore,
  });

  try {
    store.dispatch(editor.addEditorWidget({ type: "CONTAINER_WIDGET", topRow: 10 }));
    const containerId = store.getState().selectedWidgetId;
    assert.ok(containerId);
    let current = editor.selectEditorDocument(store.getState());
    const container = current.layout.dsl.children.find((child) => child.widgetId === containerId);
    assert.equal(container.type, "CONTAINER_WIDGET");
    assert.equal(container.children[0].type, "CANVAS_WIDGET");
    assert.equal(container.children[0].parentId, containerId);

    store.dispatch(editor.addEditorWidget({ type: "TEXT_WIDGET", parentId: containerId }));
    const nestedId = store.getState().selectedWidgetId;
    store.dispatch(editor.updateEditorWidgetProperty({
      widgetId: nestedId, property: "text", value: "Inside container",
    }));
    current = editor.selectEditorDocument(store.getState());
    assert.equal(
      current.layout.dsl.children.find((child) => child.widgetId === containerId)
        .children[0].children[0].text,
      "Inside container",
    );

    store.dispatch(editor.addEditorWidget({
      type: "TEXT_WIDGET", parentId: "0", leftColumn: 40, topRow: 115,
    }));
    const rootTextId = store.getState().selectedWidgetId;
    store.dispatch(editor.moveEditorWidget({ widgetId: rootTextId, leftColumn: 3, topRow: 165 }));
    store.dispatch(editor.resizeEditorWidget({ widgetId: rootTextId, width: 25, height: 12 }));
    current = editor.selectEditorDocument(store.getState());
    const moved = current.layout.dsl.children.find((child) => child.widgetId === rootTextId);
    assert.deepEqual(
      [moved.leftColumn, moved.topRow, moved.rightColumn, moved.bottomRow],
      [3, 165, 28, 177],
    );
    assert.equal(current.layout.dsl.bottomRow, 1770,
      "Appsmith stores the root content bottom in pixels after a layout edit");
    assert.equal(current.layout.dsl.minHeight, 1200,
      "the main canvas minimum height remains independent of content");

    const beforeOutOfRange = store.getState().documentJson;
    store.dispatch(editor.moveEditorWidget({ widgetId: rootTextId, leftColumn: 3, topRow: 9000 }));
    assert.match(store.getState().editError, /cannot extend beyond 9000 canvas rows/);
    assert.equal(store.getState().documentJson, beforeOutOfRange);
    store.dispatch(editor.resizeEditorWidget({ widgetId: rootTextId, width: 25, height: 10000 }));
    assert.match(store.getState().editError, /cannot extend beyond 9000 canvas rows/);
    assert.equal(store.getState().documentJson, beforeOutOfRange);
    store.dispatch(editor.moveEditorWidget({
      widgetId: rootTextId, leftColumn: 3, topRow: Number.MAX_SAFE_INTEGER + 1,
    }));
    assert.match(store.getState().editError, /Top row must be an integer/);
    assert.equal(store.getState().documentJson, beforeOutOfRange);
    store.dispatch(editor.moveEditorWidget({ widgetId: rootTextId, leftColumn: 3, topRow: 8988 }));
    assert.equal(editor.selectEditorDocument(store.getState()).layout.dsl.bottomRow, 90000);
    store.dispatch(editor.undoEditorChange());

    store.dispatch(editor.undoEditorChange());
    assert.equal(editor.selectEditorWidgetById(store.getState(), rootTextId).bottomRow, 171);
    store.dispatch(editor.undoEditorChange());
    assert.equal(editor.selectEditorWidgetById(store.getState(), rootTextId).topRow, 115);
    store.dispatch(editor.redoEditorChange());
    store.dispatch(editor.redoEditorChange());
    assert.equal(editor.selectEditorWidgetById(store.getState(), rootTextId).bottomRow, 177);

    const tree = widgets(editor.selectEditorDocument(store.getState()).layout.dsl);
    assert.equal(new Set(tree.map((widget) => widget.widgetId)).size, tree.length);
    assert.equal(new Set(tree.map((widget) => widget.widgetName)).size, tree.length);

    store.dispatch(editor.deleteEditorWidget({ widgetId: nestedId }));
    assert.equal(store.getState().selectedWidgetId, containerId, "nested delete selects its container");
    assert.equal(editor.selectEditorWidgetById(store.getState(), nestedId), null);
    store.dispatch(editor.undoEditorChange());
    assert.equal(editor.selectEditorWidgetById(store.getState(), nestedId).text, "Inside container");

    const selectionBeforeRename = store.getState().selectedWidgetId;
    store.dispatch(editor.renameEditorDocument({ name: "  Operations board  " }));
    assert.equal(editor.selectEditorDocument(store.getState()).name, "Operations board");
    assert.equal(editor.selectEditorWidgetById(store.getState(), "dashboard-title").text,
      "Operations board", "untouched starter title follows dashboard name");
    assert.equal(store.getState().selectedWidgetId, selectionBeforeRename);
    store.dispatch(editor.undoEditorChange());
    assert.equal(editor.selectEditorDocument(store.getState()).name, "Contract dashboard");
    assert.equal(editor.selectEditorWidgetById(store.getState(), "dashboard-title").text,
      "Contract dashboard", "undo restores the starter title");
    store.dispatch(editor.redoEditorChange());
    assert.equal(editor.selectEditorDocument(store.getState()).name, "Operations board");
    assert.equal(editor.selectEditorWidgetById(store.getState(), "dashboard-title").text,
      "Operations board");
    const beforeEmptyName = store.getState().documentJson;
    store.dispatch(editor.renameEditorDocument({ name: "   " }));
    assert.match(store.getState().editError, /Dashboard name cannot be empty/);
    assert.equal(store.getState().documentJson, beforeEmptyName);
    store.dispatch(editor.renameEditorDocument({ name: "Operations board" }));
    assert.equal(store.getState().editError, null);

    const unsavedJson = store.getState().documentJson;
    store.dispatch(editor.requestEditorSave());
    const conflicted = await waitFor(store, (state) => state.saveStatus === "failed");
    assert.match(conflicted.saveError, /changed since it was loaded/);
    assert.equal(conflicted.revision, 4, "conflict does not advance the draft revision");
    assert.equal(conflicted.documentJson, unsavedJson, "conflict keeps the authored edits");
    assert.equal(conflicted.dirty, true);
    assert.equal(saveRequests[0].expectedRevision, 4);
    assert.deepEqual(saveRequests[0].receivedScope, scope);
    assert.equal(fetchCalls, 0, "editor edits and local save make no backend calls");

    const reloaded = editor.createEditableWorkbenchStore(
      editor.selectEditorDocument(store.getState()),
      { draftScope: scope, revision: 5, draftStore },
    );
    try {
      reloaded.dispatch(editor.updateEditorWidgetProperty({
        widgetId: nestedId, property: "text", value: "Saved after reload",
      }));
      reloaded.dispatch(editor.requestEditorSave());
      const saved = await waitFor(reloaded, (state) => state.saveStatus === "succeeded");
      assert.equal(saved.revision, 6);
      assert.equal(saved.dirty, false);
      assert.equal(saveRequests[1].expectedRevision, 5);
      assert.equal(saveRequests[1].savedDocument.name, "Operations board");
      assert.equal(saveRequests[1].savedDocument.layout.dsl.children[0].text, "Operations board");
      assert.equal(fetchCalls, 0);
    } finally {
      reloaded.dispose();
    }

    for (const kind of ["custom", "dynamic", "cyflex"]) {
      const variant = documents.createBlankDashboardDocument(`title-${kind}`, "Untitled dashboard");
      const title = variant.layout.dsl.children[0];
      if (kind === "custom") title.text = "My own heading";
      if (kind === "dynamic") title.dynamicBindingPathList = [{ key: "text" }];
      if (kind === "cyflex") {
        variant.variables.push({
          key: "displayTitle", label: "Display title",
          selector: { kind: "logicalName", name: "DISPLAY_TITLE" }, valueType: "string",
        });
        variant.bindings.push({
          id: "title-binding", variableKey: "displayTitle", unitCode: 0,
          target: { widgetId: "dashboard-title", propertyPath: "text" },
          presentation: { kind: "latest", template: "{value}" },
        });
      }
      const variantStore = editor.createEditableWorkbenchStore(variant);
      try {
        variantStore.dispatch(editor.renameEditorDocument({ name: "New dashboard name" }));
        assert.equal(editor.selectEditorDocument(variantStore.getState()).name, "New dashboard name");
        assert.equal(editor.selectEditorWidgetById(variantStore.getState(), "dashboard-title").text,
          kind === "custom" ? "My own heading" : "Untitled dashboard",
          `${kind} starter title remains user controlled`);
      } finally {
        variantStore.dispose();
      }
    }

    const bindingStore = editor.createEditableWorkbenchStore(
      documents.createBlankDashboardDocument("binding-commands", "Binding commands"),
    );
    try {
      const draft = {
        id: "live-title",
        variable: {
          key: "titleSource", label: "Title source",
          selector: { kind: "logicalName", name: "DISPLAY_TITLE" }, valueType: "string",
        },
        unitCode: 0,
        target: { widgetId: "dashboard-title", propertyPath: "text" },
        presentation: { kind: "latest", template: "Current: {value}" },
      };
      bindingStore.dispatch(editor.saveEditorBinding(draft));
      assert.equal(editor.selectEditorDocument(bindingStore.getState()).bindings[0].id, "live-title");
      assert.equal(editor.selectEditorDocument(bindingStore.getState()).variables[0].key, "titleSource");
      assert.equal(bindingStore.getState().dirty, true);
      bindingStore.dispatch(editor.undoEditorChange());
      assert.equal(editor.selectEditorDocument(bindingStore.getState()).bindings.length, 0);
      bindingStore.dispatch(editor.redoEditorChange());
      assert.equal(editor.selectEditorDocument(bindingStore.getState()).bindings.length, 1);

      const beforeInvalid = bindingStore.getState().documentJson;
      bindingStore.dispatch(editor.saveEditorBinding({
        ...draft,
        id: "wrong-target",
        target: { widgetId: "dashboard-title", propertyPath: "fontSize" },
      }));
      assert.match(bindingStore.getState().editError, /Text widgets support only/);
      assert.equal(bindingStore.getState().documentJson, beforeInvalid);

      bindingStore.dispatch(editor.removeEditorBinding("live-title"));
      assert.equal(editor.selectEditorDocument(bindingStore.getState()).bindings.length, 0);
      assert.equal(editor.selectEditorDocument(bindingStore.getState()).variables.length, 1,
        "disconnect retains the variable declaration for reuse");
      bindingStore.dispatch(editor.undoEditorChange());
      assert.equal(editor.selectEditorDocument(bindingStore.getState()).bindings[0].id, "live-title");
      assert.equal(fetchCalls, 0, "binding commands make no backend calls");
    } finally {
      bindingStore.dispose();
    }

    const seriesStore = editor.createEditableWorkbenchStore(documents.exampleDashboardDocument);
    try {
      seriesStore.dispatch(editor.updateEditorWidgetProperty({
        widgetId: "engine-speed-chart", property: "chartData",
        value: { replacement: { seriesName: "Replacement", data: [] } },
      }));
      assert.deepEqual(
        editor.selectEditorDocument(seriesStore.getState()).bindings.map((binding) => binding.id),
        ["engine-speed-value-binding"],
        "deleting a chart series removes its live target atomically",
      );
      seriesStore.dispatch(editor.undoEditorChange());
      assert.equal(editor.selectEditorDocument(seriesStore.getState()).bindings.length, 2);
    } finally {
      seriesStore.dispose();
    }

    const boundStore = editor.createEditableWorkbenchStore(documents.exampleDashboardDocument);
    try {
      boundStore.dispatch(editor.deleteEditorWidget({ widgetId: "engine-speed-card" }));
      const withoutCard = editor.selectEditorDocument(boundStore.getState());
      assert.equal(editor.selectEditorWidgetById(boundStore.getState(), "engine-speed-card"), null);
      assert.equal(editor.selectEditorWidgetById(boundStore.getState(), "engine-speed-value"), null);
      assert.deepEqual(
        withoutCard.bindings.map((binding) => binding.id),
        ["engine-speed-history-binding"],
        "deleting a subtree removes only its target bindings",
      );
      assert.deepEqual(withoutCard.componentDependencies, []);
      assert.equal(boundStore.getState().selectedWidgetId, "0");
      boundStore.dispatch(editor.undoEditorChange());
      const restored = editor.selectEditorDocument(boundStore.getState());
      assert.ok(editor.selectEditorWidgetById(boundStore.getState(), "engine-speed-value"));
      assert.equal(restored.bindings.length, 2);
      assert.equal(restored.componentDependencies.length, 1);
      const beforeRootDelete = boundStore.getState().documentJson;
      boundStore.dispatch(editor.deleteEditorWidget({ widgetId: "0" }));
      assert.match(boundStore.getState().editError, /Canvas widgets are structural/);
      assert.equal(boundStore.getState().documentJson, beforeRootDelete);
      assert.equal(fetchCalls, 0);
    } finally {
      boundStore.dispose();
    }

    const metadataDocument = JSON.parse(JSON.stringify(documents.exampleDashboardDocument));
    const boundText = metadataDocument.layout.dsl.children[1].children[0].children[1];
    boundText.text = "{{EngineTitle.text}}";
    boundText.dynamicBindingPathList = [{ key: "text" }, { key: "fontSize" }];
    const metadataStore = editor.createEditableWorkbenchStore(metadataDocument);
    try {
      metadataStore.dispatch(editor.updateEditorWidgetProperty({
        widgetId: "engine-title", property: "widgetName", value: "RenamedTitle",
      }));
      assert.match(metadataStore.getState().editError, /dashboard expression references it/);
      assert.equal(editor.selectEditorWidgetById(metadataStore.getState(), "engine-title").widgetName,
        "EngineTitle", "referenced names cannot change silently");

      metadataStore.dispatch(editor.updateEditorWidgetProperty({
        widgetId: "engine-speed-value", property: "text", value: "Static fallback",
      }));
      let updated = editor.selectEditorDocument(metadataStore.getState());
      let updatedText = editor.selectEditorWidgetById(metadataStore.getState(), "engine-speed-value");
      assert.deepEqual(updatedText.dynamicBindingPathList, [{ key: "fontSize" }],
        "literal edit removes only its own dynamic path");
      assert.equal(updated.bindings.find((binding) => binding.id === "engine-speed-value-binding")
        .target.propertyPath, "text", "Cyflex binding remains an independent runtime overlay");

      const beforeUnsupported = metadataStore.getState().documentJson;
      metadataStore.dispatch(editor.updateEditorWidgetProperty({
        widgetId: "engine-speed-value", property: "textColor", value: "{{EngineTitle.text}}",
      }));
      assert.match(metadataStore.getState().editError, /Dynamic expressions are unavailable/);
      assert.equal(metadataStore.getState().documentJson, beforeUnsupported);
      metadataStore.dispatch(editor.updateEditorWidgetProperty({
        widgetId: "engine-speed-value", property: "text", value: "{{1 + 2}}",
      }));
      assert.match(metadataStore.getState().editError, /Only \{\{WidgetName\.property\}\}/);
      assert.equal(metadataStore.getState().documentJson, beforeUnsupported);

      metadataStore.dispatch(editor.updateEditorWidgetProperty({
        widgetId: "engine-speed-value", property: "text", value: "{{EngineTitle.text}}",
      }));
      updatedText = editor.selectEditorWidgetById(metadataStore.getState(), "engine-speed-value");
      assert.deepEqual(updatedText.dynamicBindingPathList,
        [{ key: "fontSize" }, { key: "text" }],
        "supported reference edit declares its dynamic path");
      metadataStore.dispatch(editor.updateEditorWidgetProperty({
        widgetId: "engine-speed-value", property: "text", value: "Static fallback",
      }));
      metadataStore.dispatch(editor.updateEditorWidgetProperty({
        widgetId: "engine-title", property: "widgetName", value: "RenamedTitle",
      }));
      updated = editor.selectEditorDocument(metadataStore.getState());
      assert.equal(updated.layout.dsl.children[0].widgetName, "RenamedTitle");
      assert.equal(fetchCalls, 0);
    } finally {
      metadataStore.dispose();
    }
  } finally {
    store.dispose();
    global.fetch = originalFetch;
  }

  console.log("Editable workbench store contract passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
