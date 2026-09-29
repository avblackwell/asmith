/* Run from operator-display-client: node src/editor-bridge/compat-store/contract.test.cjs */
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

async function main() {
  const compat = await loadPackage(path.join(__dirname, "index.ts"));
  const documentPackage = await loadPackage(
    path.resolve(__dirname, "../../document/index.ts"),
  );
  const first = await compat.createReadOnlyCompatStoreForDocument(
    documentPackage.exampleDashboardDocument,
  );
  const second = await compat.createReadOnlyCompatStoreForDocument(
    documentPackage.exampleDashboardDocument,
  );

  assert.notEqual(first, second, "each canvas mount owns its Redux store");
  assert.equal(first.getState().entities.app.mode, "PUBLISHED");
  assert.equal(first.getState().ui.mainCanvas.width, 1242);
  first.dispatch(compat.updateCanvasWidth(400));
  assert.equal(first.getState().ui.mainCanvas.width, 400);
  assert.equal(first.getState().ui.mainCanvas.isMobile, true);
  first.dispatch(compat.updateCanvasWidth(0));
  first.dispatch(compat.updateCanvasWidth(Number.NaN));
  assert.equal(first.getState().ui.mainCanvas.width, 400,
    "invalid viewport measurements leave the previous canvas width intact");
  assert.equal(compat.selectFixedRootCanvasMetrics(first.getState(), "0", "editor").widthPx, 400);
  assert.equal(compat.selectFixedRootCanvasMetrics(second.getState(), "0", "editor").widthPx, 1242,
    "viewport widths are isolated between canvas stores");
  assert.equal(compat.selectWidgetById(first.getState(), "0").rightColumn, 1242,
    "viewport resize does not write to the saved DSL");
  assert.equal(compat.selectRenderMode(first.getState()), "PAGE");
  assert.equal(compat.selectLayoutSystemType(first.getState()), "FIXED");
  assert.deepEqual(compat.selectChildWidgetIds(first.getState(), "0"), [
    "engine-title",
    "engine-speed-card",
    "engine-speed-chart",
  ]);
  assert.equal(
    compat.selectEvaluatedWidgetById(first.getState(), "engine-title").text,
    "Engine overview",
  );

  first.dispatch(compat.selectWidget("engine-title"));
  assert.equal(compat.selectSelectedWidgetId(first.getState()), "engine-title");
  assert.equal(compat.selectSelectedWidgetId(second.getState()), null);
  first.dispatch(compat.setWidgetMetaProperty({
    widgetId: "engine-title", propertyName: "isChecked", propertyValue: false,
  }));
  assert.equal(compat.selectWidgetMetaProps(first.getState(), "engine-title").isChecked,
    false, "widget interaction state is kept in Appsmith's meta branch");
  assert.equal(compat.selectWidgetMetaProps(second.getState(), "engine-title"), undefined,
    "widget meta state does not cross canvas mounts");
  first.dispatch(compat.batchSetWidgetMetaProperties({ widgetId: "engine-title",
    properties: { inputText: "1200", text: 1200, isDirty: true } }));
  assert.deepEqual(compat.selectWidgetMetaProps(first.getState(), "engine-title"), {
    isChecked: false, inputText: "1200", text: 1200, isDirty: true,
  }, "Appsmith batch meta updates merge transient properties atomically");

  const canvasPayload = await loadPackage(path.resolve(__dirname, "../canvasPayload.ts"));
  const editedDocument = JSON.parse(JSON.stringify(documentPackage.exampleDashboardDocument));
  editedDocument.layout.dsl.children[0].text = "Updated engine overview";
  const mountedStore = first;
  let notifications = 0;
  const unsubscribe = mountedStore.subscribe(() => { notifications += 1; });

  first.dispatch(compat.replaceCanvasPayload(
    await canvasPayload.canvasPayloadForDocument(editedDocument),
  ));
  assert.equal(first, mountedStore, "an edited payload updates the mounted store");
  assert.equal(notifications, 1, "mounted subscribers receive the edited payload");
  assert.equal(compat.selectSelectedWidgetId(first.getState()), "engine-title",
    "replacing an edited canvas preserves selection of surviving widgets");
  assert.equal(compat.selectWidgetMetaProps(first.getState(), "engine-title").isChecked,
    false, "document edits preserve transient widget state for surviving widgets");
  assert.equal(first.getState().ui.mainCanvas.width, 400,
    "a document edit does not reset the resolved viewport width");
  assert.equal(compat.selectHydratedWidgetById(first.getState(), "engine-title").text,
    "Updated engine overview", "the mounted canvas reads the latest widget props");
  assert.equal(compat.selectHydratedWidgetById(second.getState(), "engine-title").text,
    "Engine overview", "an edited payload does not change another canvas store");

  editedDocument.layout.dsl.children = editedDocument.layout.dsl.children.filter(
    (widget) => widget.widgetId !== "engine-title",
  );
  first.dispatch(compat.replaceCanvasPayload(
    await canvasPayload.canvasPayloadForDocument(editedDocument),
  ));
  assert.equal(notifications, 2);
  assert.equal(compat.selectSelectedWidgetId(first.getState()), null,
    "removing a selected widget clears the invalid selection");
  assert.equal(compat.selectWidgetById(first.getState(), "engine-title"), undefined);
  assert.equal(compat.selectWidgetMetaProps(first.getState(), "engine-title"), undefined,
    "removing a widget clears its transient state");
  unsubscribe();

  first.dispatch(compat.selectWidget("not-a-widget"));
  assert.equal(compat.selectSelectedWidgetId(first.getState()), null);

  first.dispatch(
    compat.replaceEvaluatedProperties({
      widgetId: "engine-speed-value",
      properties: {
        text: "123 rpm",
        widgetId: "incorrect",
        topRow: 900,
      },
    }),
  );
  const hydrated = compat.selectHydratedWidgetById(
    first.getState(),
    "engine-speed-value",
  );
  assert.equal(hydrated.text, "123 rpm");
  assert.equal(hydrated.widgetId, "engine-speed-value");
  assert.equal(hydrated.topRow, 7);
  assert.equal(
    compat.selectWidgetById(first.getState(), "engine-speed-value").text,
    "— rpm",
    "evaluation cannot modify saved DSL",
  );
  assert.equal(
    compat.selectHydratedWidgetById(second.getState(), "engine-speed-value")
      .text,
    "— rpm",
    "evaluation cannot cross canvas mounts",
  );

  const dynamicDocument = JSON.parse(
    JSON.stringify(documentPackage.exampleDashboardDocument),
  );
  dynamicDocument.layout.dsl.children[1].children[0].children[1].text =
    "{{EngineSpeed.value}} rpm";
  dynamicDocument.layout.dsl.children[1].children[0].children[1]
    .dynamicBindingPathList = [{ key: "text" }];
  const dynamicStore = await compat.createReadOnlyCompatStoreForDocument(
    dynamicDocument,
  );
  assert.deepEqual(
    compat.selectUnresolvedDynamicPaths(
      dynamicStore.getState(),
      "engine-speed-value",
    ),
    ["text"],
  );
  dynamicStore.dispatch(
    compat.replaceEvaluatedProperties({
      widgetId: "engine-speed-value",
      properties: { text: "123 rpm" },
    }),
  );
  assert.deepEqual(
    compat.selectUnresolvedDynamicPaths(
      dynamicStore.getState(),
      "engine-speed-value",
    ),
    [],
  );

  const blank = documentPackage.createBlankDashboardDocument(
    "00000000-0000-4000-8000-000000000001",
  );
  const payload = await loadPackage(
    path.resolve(__dirname, "../canvasPayload.ts"),
  );
  first.dispatch(
    compat.replaceCanvasPayload(await payload.canvasPayloadForDocument(blank)),
  );
  assert.equal(
    compat.selectWidgetById(first.getState(), "engine-speed-chart"),
    undefined,
  );
  assert.equal(compat.selectSelectedWidgetId(first.getState()), null);
  assert.ok(compat.selectWidgetById(second.getState(), "engine-speed-chart"));

  await compat.replaceReadOnlyCompatDocument(second, blank);
  assert.equal(
    compat.selectWidgetById(second.getState(), "engine-speed-chart"),
    undefined,
  );

  console.log("Read-only compatibility store contract passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
