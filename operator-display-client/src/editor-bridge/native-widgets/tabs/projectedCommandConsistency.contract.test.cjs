/* Run from operator-display-client: node src/editor-bridge/native-widgets/tabs/projectedCommandConsistency.contract.test.cjs */
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

function find(widget, id) {
  if (widget.widgetId === id) return widget;
  for (const child of widget.children ?? []) {
    const result = find(child, id);
    if (result) return result;
  }
  return undefined;
}

async function main() {
  const editor = await load(path.join(__dirname, "../../editable-store/index.ts"));
  const editDocument = await load(path.join(__dirname, "../../editable-store/editDocument.ts"));
  const documents = await load(path.join(__dirname, "../../../document/index.ts"));
  const projection = await load(path.join(__dirname, "projectActiveTabsAutoHeight.ts"));
  const autoHeight = await load(path.join(__dirname, "../../editable-store/autoHeightDocument.ts"));
  const store = editor.createEditableWorkbenchStore(
    documents.createBlankDashboardDocument("projected-command-consistency"),
  );

  try {
    store.dispatch(editor.addEditorWidget({ type: "TABS_WIDGET", leftColumn: 2, topRow: 10 }));
    const tabsId = store.getState().selectedWidgetId;
    const tabs = find(JSON.parse(store.getState().documentJson).layout.dsl, tabsId);
    const [shortCanvasId, longCanvasId] = tabs.children.map((canvas) => canvas.widgetId);
    store.dispatch(editor.addEditorWidget({ type: "TEXT_WIDGET", parentId: longCanvasId,
      leftColumn: 2, topRow: 22 }));
    assert.equal(store.getState().editError, null);
    store.dispatch(editor.addEditorWidget({ type: "TEXT_WIDGET", parentId: "0",
      leftColumn: 2, topRow: 60 }));
    assert.equal(store.getState().editError, null);
    const belowId = store.getState().selectedWidgetId;
    const sourceBefore = store.getState().documentJson;

    // WorkbenchPage renders and plans against this transient active-tab projection.
    const activeTabIds = { [tabsId]: shortCanvasId };
    store.dispatch(editor.selectEditorTabCanvas({ tabsWidgetId: tabsId,
      canvasWidgetId: shortCanvasId }));
    const projectedBefore = projection.projectActiveTabsAutoHeight(
      sourceBefore, activeTabIds).documentJson;
    const authoredBelow = find(JSON.parse(sourceBefore).layout.dsl, belowId);
    const visibleBelow = find(JSON.parse(projectedBefore).layout.dsl, belowId);
    assert.notEqual(visibleBelow.topRow, authoredBelow.topRow,
      "a shorter selected tab changes the sibling's visible grid row");

    const requestedTopRow = visibleBelow.topRow + 10;
    const change = { kind: "move", request: { widgetId: belowId,
      parentId: "0", leftColumn: visibleBelow.leftColumn, topRow: requestedTopRow } };
    const plan = editDocument.previewLayoutChange(projectedBefore, change);
    assert.equal(plan.valid, true, plan.error);

    store.dispatch(editor.commitEditorLayoutPlan({ change, plan,
      expectedDocumentJson: sourceBefore,
      expectedPlanningJson: projectedBefore,
      expectedActiveTabCanvasIds: activeTabIds }));
    assert.equal(store.getState().editError, null);
    const sourceAfter = store.getState().documentJson;
    const projectedAfter = projection.projectActiveTabsAutoHeight(
      sourceAfter, activeTabIds).documentJson;
    const visibleAfter = find(JSON.parse(projectedAfter).layout.dsl, belowId);
    assert.equal(visibleAfter.topRow, requestedTopRow,
      "the committed widget must stay where drag preview placed it");

    console.log(`Projected Tabs command round trip passed: authored ${authoredBelow.topRow}, ` +
      `visible ${visibleBelow.topRow}, requested ${requestedTopRow}, visible after ${visibleAfter.topRow}`);

    // A command committed from the same projected basis, then normalized to
    // the tallest authored tab, should project back to its requested target.
    const projectedCommit = editDocument.commitFixedLayoutChange(projectedBefore, change, plan);
    const canonicalAfter = autoHeight.recomputeAutoHeightContainers(projectedCommit.documentJson);
    const projectedRoundTrip = projection.projectActiveTabsAutoHeight(
      canonicalAfter, activeTabIds).documentJson;
    assert.equal(find(JSON.parse(projectedRoundTrip).layout.dsl, belowId).topRow,
      requestedTopRow, "canonical normalization must round trip the visible command target");

    store.dispatch(editor.undoEditorChange());
    assert.equal(find(JSON.parse(projection.projectActiveTabsAutoHeight(
      store.getState().documentJson, activeTabIds).documentJson).layout.dsl,
    belowId).topRow, visibleBelow.topRow,
    "undo must restore the previous selected-tab visual position");
    store.dispatch(editor.redoEditorChange());
    assert.equal(find(JSON.parse(projection.projectActiveTabsAutoHeight(
      store.getState().documentJson, activeTabIds).documentJson).layout.dsl,
    belowId).topRow, requestedTopRow,
    "redo must restore the committed selected-tab visual position");

    const staleSource = store.getState().documentJson;
    const staleProjection = projection.projectActiveTabsAutoHeight(
      staleSource, activeTabIds).documentJson;
    const staleChange = { kind: "move", request: { widgetId: belowId,
      parentId: "0", leftColumn: visibleBelow.leftColumn, topRow: requestedTopRow + 2 } };
    const stalePlan = editDocument.previewLayoutChange(staleProjection, staleChange);
    assert.equal(stalePlan.valid, true, stalePlan.error);
    store.dispatch(editor.selectEditorTabCanvas({ tabsWidgetId: tabsId,
      canvasWidgetId: longCanvasId }));
    store.dispatch(editor.commitEditorLayoutPlan({ change: staleChange, plan: stalePlan,
      expectedDocumentJson: staleSource,
      expectedPlanningJson: staleProjection,
      expectedActiveTabCanvasIds: activeTabIds }));
    assert.match(store.getState().editError ?? "", /Canvas changed during drag/);
    assert.equal(store.getState().documentJson, staleSource,
      "a tab switch during drag cannot commit a stale target or sibling map");
  } finally {
    store.dispose();
  }

  const equalStore = editor.createEditableWorkbenchStore(
    documents.createBlankDashboardDocument("equal-height-tab-guard"),
  );
  try {
    equalStore.dispatch(editor.addEditorWidget({ type: "TABS_WIDGET", topRow: 10 }));
    const equalTabsId = equalStore.getState().selectedWidgetId;
    const equalTabs = find(JSON.parse(equalStore.getState().documentJson).layout.dsl,
      equalTabsId);
    const [firstCanvas, secondCanvas] = equalTabs.children.map((canvas) => canvas.widgetId);
    equalStore.dispatch(editor.addEditorWidget({ type: "TEXT_WIDGET", topRow: 35 }));
    const equalBelowId = equalStore.getState().selectedWidgetId;
    equalStore.dispatch(editor.selectEditorTabCanvas({ tabsWidgetId: equalTabsId,
      canvasWidgetId: firstCanvas }));
    const equalSource = equalStore.getState().documentJson;
    const firstSelection = { [equalTabsId]: firstCanvas };
    const firstProjection = projection.projectActiveTabsAutoHeight(
      equalSource, firstSelection).documentJson;
    const equalChange = { kind: "move", request: { widgetId: equalBelowId,
      parentId: "0", leftColumn: 2, topRow: 38 } };
    const equalPlan = editDocument.previewLayoutChange(firstProjection, equalChange);
    assert.equal(equalPlan.valid, true, equalPlan.error);
    equalStore.dispatch(editor.selectEditorTabCanvas({ tabsWidgetId: equalTabsId,
      canvasWidgetId: secondCanvas }));
    assert.equal(projection.projectActiveTabsAutoHeight(equalSource,
      { [equalTabsId]: secondCanvas }).documentJson, firstProjection,
    "equal-height tabs may produce identical planning JSON");
    equalStore.dispatch(editor.commitEditorLayoutPlan({ change: equalChange, plan: equalPlan,
      expectedDocumentJson: equalSource,
      expectedPlanningJson: firstProjection,
      expectedActiveTabCanvasIds: firstSelection }));
    assert.match(equalStore.getState().editError ?? "", /Canvas changed during drag/);
    assert.equal(equalStore.getState().documentJson, equalSource);
  } finally {
    equalStore.dispose();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
