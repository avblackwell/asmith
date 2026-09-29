/* Run from operator-display-client: node src/editor-bridge/editable-store/canvas-interactions.contract.test.cjs */
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

function blankDocument(documents) {
  const document = documents.createBlankDashboardDocument("canvas-interaction-contract", "Canvas interactions");
  document.layout.dsl.children = [];
  return JSON.stringify(document);
}

function parse(result) {
  return JSON.parse(result.documentJson).layout.dsl;
}

function widget(root, id) {
  if (root.widgetId === id) return root;
  for (const child of root.children ?? []) {
    const found = widget(child, id);
    if (found) return found;
  }
  return null;
}

function overlaps(a, b) {
  return a.leftColumn < b.rightColumn && b.leftColumn < a.rightColumn &&
    a.topRow < b.bottomRow && b.topRow < a.bottomRow;
}

function assertNoOverlaps(root) {
  if (root.type === "CANVAS_WIDGET") {
    for (let first = 0; first < (root.children ?? []).length; first += 1) {
      for (let second = first + 1; second < (root.children ?? []).length; second += 1) {
        assert.equal(
          overlaps(root.children[first], root.children[second]),
          false,
          `${root.children[first].widgetName} overlaps ${root.children[second].widgetName}`,
        );
      }
    }
  }
  for (const child of root.children ?? []) assertNoOverlaps(child);
}

function assertChildOf(root, childId, canvasId) {
  const child = widget(root, childId);
  const parent = widget(root, canvasId);
  assert.ok(child, `widget ${childId} exists`);
  assert.ok(parent, `canvas ${canvasId} exists`);
  assert.equal(child.parentId, canvasId);
  assert.ok(parent.children.some((entry) => entry.widgetId === childId));
}

async function main() {
  const edits = await loadPackage(path.join(__dirname, "editDocument.ts"));
  const documents = await loadPackage(path.resolve(__dirname, "../../document/index.ts"));

  // Dropping onto occupied space keeps the new widget at the intended location
  // and makes room in that canvas, including for subsequent drops.
  let json = blankDocument(documents);
  let result = edits.addWidgetToDocument(json, {
    type: "TEXT_WIDGET", parentId: "0", leftColumn: 2, topRow: 10,
  });
  const firstId = result.selectedWidgetId;
  json = result.documentJson;
  const occupiedChange = {
    kind: "add",
    request: { type: "TEXT_WIDGET", parentId: "0", leftColumn: 2, topRow: 10 },
  };
  const occupiedPreview = edits.previewLayoutChange(json, occupiedChange);
  assert.equal(occupiedPreview.valid, true);
  assert.equal(occupiedPreview.parentId, "0");
  assert.equal(occupiedPreview.target.leftColumn, 2);
  assert.equal(occupiedPreview.target.topRow, 10);
  assert.ok(occupiedPreview.reflowed[firstId],
    "drag feedback includes the displaced widget");
  assert.deepEqual(edits.previewCommittedLayoutChange(json, occupiedChange,
    occupiedPreview), occupiedPreview,
  "the drag-session plan uses the same validation at preview and commit");
  assert.equal(edits.previewCommittedLayoutChange(json, occupiedChange, {
    ...occupiedPreview, reflowed: { unknownWidget: occupiedPreview.target },
  }).valid, false, "unknown displaced widgets cannot be committed");
  assert.equal(edits.previewCommittedLayoutChange(json, occupiedChange, {
    ...occupiedPreview, reflowed: { [firstId]: occupiedPreview.target },
  }).valid, false, "overlapping session output cannot be committed");
  result = edits.commitFixedLayoutChange(json, occupiedChange, occupiedPreview);
  const secondId = result.selectedWidgetId;
  let root = parse(result);
  assert.equal(widget(root, secondId).leftColumn, 2);
  assert.equal(widget(root, secondId).topRow, 10);
  assertNoOverlaps(root);
  assert.notEqual(widget(root, firstId).topRow, 10, "the existing widget yields the occupied slot");
  for (const [id, expected] of [[firstId, occupiedPreview.reflowed[firstId]],
    [secondId, occupiedPreview.target]]) {
    const actual = widget(root, id);
    assert.deepEqual(
      [actual.leftColumn, actual.topRow, actual.rightColumn, actual.bottomRow],
      [expected.leftColumn, expected.topRow, expected.rightColumn, expected.bottomRow],
      "committed geometry matches the drag preview",
    );
  }

  // Appsmith delays reflow of a colliding Container, while ordinary siblings
  // can still reflow on the first drag sample.
  json = blankDocument(documents);
  result = edits.addWidgetToDocument(json, {
    type: "CONTAINER_WIDGET", parentId: "0", leftColumn: 2, topRow: 10,
  });
  const delayedContainerId = result.selectedWidgetId;
  const overContainer = { kind: "add",
    request: { type: "TEXT_WIDGET", parentId: "0", leftColumn: 2, topRow: 10 } };
  const beforeContainerDelay = edits.previewLayoutChange(result.documentJson,
    overContainer, { shouldReflowDropTarget: false });
  const afterContainerDelay = edits.previewLayoutChange(result.documentJson,
    overContainer, { shouldReflowDropTarget: true });
  assert.equal(beforeContainerDelay.valid, false);
  assert.equal(afterContainerDelay.valid, true);
  assert.ok(afterContainerDelay.reflowed[delayedContainerId]);

  // A target beyond the fixed canvas row limit is visibly invalid and cannot commit.
  json = blankDocument(documents);
  const invalidPreview = edits.previewLayoutChange(json, {
    kind: "add",
    request: { type: "TEXT_WIDGET", parentId: "0", leftColumn: 2, topRow: 8998 },
  });
  assert.equal(invalidPreview.valid, false);
  assert.ok(invalidPreview.error);
  assert.throws(() => edits.addWidgetToDocument(json, {
    type: "TEXT_WIDGET", parentId: "0", leftColumn: 2, topRow: 8998,
  }));

  // The same contract applies when an existing widget is dragged onto another.
  json = blankDocument(documents);
  result = edits.addWidgetToDocument(json, {
    type: "TEXT_WIDGET", parentId: "0", leftColumn: 2, topRow: 10,
  });
  const stationaryId = result.selectedWidgetId;
  result = edits.addWidgetToDocument(result.documentJson, {
    type: "TEXT_WIDGET", parentId: "0", leftColumn: 32, topRow: 10,
  });
  const movingId = result.selectedWidgetId;
  const movePreview = edits.previewLayoutChange(result.documentJson, {
    kind: "move",
    request: { widgetId: movingId, leftColumn: 2, topRow: 10 },
  });
  assert.equal(movePreview.valid, true);
  assert.ok(movePreview.reflowed[stationaryId]);
  result = edits.moveWidgetInDocument(result.documentJson, {
    widgetId: movingId, leftColumn: 2, topRow: 10,
  });
  root = parse(result);
  assert.equal(widget(root, movingId).leftColumn, 2);
  assert.equal(widget(root, movingId).topRow, 10);
  assertNoOverlaps(root);
  assert.notDeepEqual(
    [widget(root, stationaryId).leftColumn, widget(root, stationaryId).topRow],
    [2, 10],
  );
  assert.deepEqual(
    [widget(root, stationaryId).leftColumn, widget(root, stationaryId).topRow],
    [movePreview.reflowed[stationaryId].leftColumn, movePreview.reflowed[stationaryId].topRow],
  );

  // Resizing through a neighbor must reflow it rather than leave an overlap.
  json = blankDocument(documents);
  result = edits.addWidgetToDocument(json, {
    type: "TEXT_WIDGET", parentId: "0", leftColumn: 2, topRow: 10,
  });
  const resizedId = result.selectedWidgetId;
  result = edits.addWidgetToDocument(result.documentJson, {
    type: "TEXT_WIDGET", parentId: "0", leftColumn: 22, topRow: 10,
  });
  const neighborId = result.selectedWidgetId;
  assert.equal(widget(parse(result), neighborId).topRow, 10,
    "widgets that only touch edges do not reflow");
  const resizePreview = edits.previewLayoutChange(result.documentJson, {
    kind: "resize",
    request: { widgetId: resizedId, width: 25, height: 6 },
  });
  assert.equal(resizePreview.valid, true);
  assert.ok(resizePreview.reflowed[neighborId]);
  result = edits.resizeWidgetInDocument(result.documentJson, {
    widgetId: resizedId, width: 25, height: 6,
  });
  root = parse(result);
  assert.equal(widget(root, resizedId).rightColumn - widget(root, resizedId).leftColumn, 25);
  assertNoOverlaps(root);
  assert.notDeepEqual(
    [widget(root, neighborId).leftColumn, widget(root, neighborId).topRow],
    [22, 10],
    "resizing moves the obstructing neighbor",
  );
  assert.deepEqual(
    [widget(root, neighborId).leftColumn, widget(root, neighborId).topRow],
    [resizePreview.reflowed[neighborId].leftColumn, resizePreview.reflowed[neighborId].topRow],
  );

  // A container move updates both parentId and actual child membership. Moving
  // between nested canvases, out to the root, and back is one undoable document edit each.
  json = blankDocument(documents);
  result = edits.addWidgetToDocument(json, {
    type: "CONTAINER_WIDGET", parentId: "0", leftColumn: 2, topRow: 10,
  });
  const firstContainerId = result.selectedWidgetId;
  result = edits.addWidgetToDocument(result.documentJson, {
    type: "CONTAINER_WIDGET", parentId: "0", leftColumn: 32, topRow: 10,
  });
  const secondContainerId = result.selectedWidgetId;
  // Appsmith defaults new Containers to scrolling; bound this destination so
  // the out-of-range move below still verifies nested canvas rejection.
  result = edits.updateWidgetPropertyInDocument(result.documentJson, {
    widgetId: secondContainerId, property: "shouldScrollContents", value: false,
  });
  result = edits.addWidgetToDocument(result.documentJson, {
    type: "TEXT_WIDGET", parentId: firstContainerId, leftColumn: 2, topRow: 2,
  });
  const nestedId = result.selectedWidgetId;
  const firstCanvasId = widget(parse(result), firstContainerId).children[0].widgetId;
  const secondCanvasId = widget(parse(result), secondContainerId).children[0].widgetId;
  assertChildOf(parse(result), nestedId, firstCanvasId);

  result = edits.moveWidgetInDocument(result.documentJson, {
    widgetId: nestedId, parentId: secondContainerId, leftColumn: 2, topRow: 2,
  });
  assertChildOf(parse(result), nestedId, secondCanvasId);
  assert.equal(widget(parse(result), firstCanvasId).children.length, 0);
  assertNoOverlaps(parse(result));

  result = edits.moveWidgetInDocument(result.documentJson, {
    widgetId: nestedId, parentId: "0", leftColumn: 2, topRow: 40,
  });
  assertChildOf(parse(result), nestedId, "0");
  assert.equal(widget(parse(result), secondCanvasId).children.length, 0);
  assertNoOverlaps(parse(result));

  result = edits.moveWidgetInDocument(result.documentJson, {
    widgetId: nestedId, parentId: firstContainerId, leftColumn: 2, topRow: 2,
  });
  assertChildOf(parse(result), nestedId, firstCanvasId);
  assertNoOverlaps(parse(result));

  const beforeInvalidContainerMove = result.documentJson;
  assert.throws(() => edits.moveWidgetInDocument(beforeInvalidContainerMove, {
    widgetId: nestedId, parentId: secondContainerId, leftColumn: 2, topRow: 15,
  }));
  assertChildOf(JSON.parse(beforeInvalidContainerMove).layout.dsl, nestedId, firstCanvasId);

  // The same move goes through Redux/saga history as one atomic edit.
  const editor = await loadPackage(path.join(__dirname, "index.ts"));
  const store = editor.createEditableWorkbenchStore(JSON.parse(beforeInvalidContainerMove));
  try {
    const initialJson = store.getState().documentJson;
    store.dispatch(editor.moveEditorWidget({
      widgetId: nestedId, parentId: secondContainerId, leftColumn: 2, topRow: 2,
    }));
    assertChildOf(editor.selectEditorDocument(store.getState()).layout.dsl, nestedId, secondCanvasId);
    store.dispatch(editor.undoEditorChange());
    assert.equal(store.getState().documentJson, initialJson);
    assertChildOf(editor.selectEditorDocument(store.getState()).layout.dsl, nestedId, firstCanvasId);
    store.dispatch(editor.redoEditorChange());
    assertChildOf(editor.selectEditorDocument(store.getState()).layout.dsl, nestedId, secondCanvasId);

    const beforeRejected = store.getState().documentJson;
    store.dispatch(editor.moveEditorWidget({
      widgetId: nestedId, parentId: "missing-canvas", leftColumn: 2, topRow: 2,
    }));
    assert.ok(store.getState().editError);
    assert.equal(store.getState().documentJson, beforeRejected);
  } finally {
    store.dispose();
  }

  // Left/top resize changes the origin while retaining the opposite edge.
  json = blankDocument(documents);
  result = edits.addWidgetToDocument(json, {
    type: "TEXT_WIDGET", parentId: "0", leftColumn: 25, topRow: 30,
  });
  const edgeId = result.selectedWidgetId;
  const original = widget(parse(result), edgeId);
  result = edits.resizeWidgetInDocument(result.documentJson, {
    widgetId: edgeId,
    leftColumn: 20,
    topRow: 25,
    width: original.rightColumn - 20,
    height: original.bottomRow - 25,
  });
  const changed = widget(parse(result), edgeId);
  assert.deepEqual(
    [changed.leftColumn, changed.topRow, changed.rightColumn, changed.bottomRow],
    [20, 25, original.rightColumn, original.bottomRow],
  );
  assertNoOverlaps(parse(result));

  // Bad destination or overflow must reject without changing the authored DSL.
  const safeJson = result.documentJson;
  assert.throws(() => edits.moveWidgetInDocument(safeJson, {
    widgetId: edgeId, parentId: "missing-canvas", leftColumn: 0, topRow: 0,
  }));
  assert.throws(() => edits.moveWidgetInDocument(safeJson, {
    widgetId: edgeId, leftColumn: 60, topRow: 0,
  }));
  assert.throws(() => edits.resizeWidgetInDocument(safeJson, {
    widgetId: edgeId, leftColumn: 20, topRow: 25, width: 100, height: 11,
  }));
  assert.equal(safeJson, result.documentJson);

  // A destination's drop flag blocks incoming widgets, while an existing
  // child can still move and resize under its own drag/resize flags.
  const guarded = JSON.parse(safeJson);
  guarded.layout.dsl.dropDisabled = true;
  let guardedJson = JSON.stringify(guarded);
  assert.equal(edits.previewLayoutChange(guardedJson, {
    kind: "add", request: { type: "TEXT_WIDGET", parentId: "0", leftColumn: 2, topRow: 2 },
  }).valid, false);
  assert.throws(() => edits.addWidgetToDocument(guardedJson, {
    type: "TEXT_WIDGET", parentId: "0", leftColumn: 2, topRow: 2,
  }));
  assert.equal(widget(parse(edits.moveWidgetInDocument(guardedJson, {
    widgetId: edgeId, leftColumn: 21, topRow: 25,
  })), edgeId).leftColumn, 21);
  assert.equal(widget(parse(edits.resizeWidgetInDocument(guardedJson, {
    widgetId: edgeId, width: changed.rightColumn - changed.leftColumn + 1,
    height: changed.bottomRow - changed.topRow,
  })), edgeId).rightColumn, changed.rightColumn + 1);
  widget(guarded.layout.dsl, edgeId).dragDisabled = true;
  guardedJson = JSON.stringify(guarded);
  assert.throws(() => edits.moveWidgetInDocument(guardedJson, {
    widgetId: edgeId, leftColumn: 21, topRow: 25,
  }));
  widget(guarded.layout.dsl, edgeId).resizeDisabled = true;
  guardedJson = JSON.stringify(guarded);
  assert.throws(() => edits.resizeWidgetInDocument(guardedJson, {
    widgetId: edgeId, width: changed.rightColumn - changed.leftColumn + 1,
    height: changed.bottomRow - changed.topRow,
  }));

  console.log("Canvas interaction contract passed: occupied drops, move/resize reflow, cross-container moves, anchored resize, disabled flags, and rejected edits");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
