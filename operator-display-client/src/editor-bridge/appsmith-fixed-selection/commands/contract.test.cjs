/* Run from operator-display-client: node src/editor-bridge/appsmith-fixed-selection/commands/contract.test.cjs */
const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");

async function load(entry) {
  const build = await esbuild.build({ entryPoints: [entry], bundle: true,
    format: "cjs", platform: "node", write: false, logLevel: "silent" });
  const module = { exports: {} };
  new Function("module", "exports", "require", build.outputFiles[0].text)(
    module, module.exports, require,
  );
  return module.exports;
}

function all(root) {
  return [root, ...(root.children ?? []).flatMap(all)];
}

function assertNoNewOverlap(canvas) {
  for (let a = 0; a < canvas.children.length; a += 1) {
    for (let b = a + 1; b < canvas.children.length; b += 1) {
      const left = canvas.children[a], right = canvas.children[b];
      assert.equal(left.leftColumn < right.rightColumn &&
        right.leftColumn < left.rightColumn && left.topRow < right.bottomRow &&
        right.topRow < left.bottomRow, false,
      `${left.widgetName} overlaps ${right.widgetName}`);
    }
  }
}

async function main() {
  const commands = await load(path.join(__dirname, "index.ts"));
  const edits = await load(path.resolve(__dirname, "../../editable-store/editDocument.ts"));
  const documents = await load(path.resolve(__dirname, "../../../document/index.ts"));
  const document = documents.createBlankDashboardDocument("multi-selection-contract", "Multi selection");
  document.layout.dsl.children = [];
  let json = JSON.stringify(document);
  const first = edits.addWidgetToDocument(json, { type: "TEXT_WIDGET", parentId: "0",
    leftColumn: 2, topRow: 10 });
  json = first.documentJson;
  const second = edits.addWidgetToDocument(json, { type: "TEXT_WIDGET", parentId: "0",
    leftColumn: 26, topRow: 10 });
  json = second.documentJson;
  const ids = [first.selectedWidgetId, second.selectedWidgetId];
  const bindingDoc = JSON.parse(json);
  const sourceText = all(bindingDoc.layout.dsl).find((widget) =>
    widget.widgetId === ids[0]);
  const referencedText = all(bindingDoc.layout.dsl).find((widget) =>
    widget.widgetId === ids[1]);
  sourceText.text = `{{${referencedText.widgetName}.text}}`;
  sourceText.dynamicBindingPathList = [{ key: "text" }];
  bindingDoc.variables.push({ key: "speed", label: "Speed",
    selector: { kind: "logicalName", name: "speed" }, valueType: "string" });
  bindingDoc.bindings.push({ id: "speed-binding", variableKey: "speed", unitCode: 0,
    target: { widgetId: ids[0], propertyPath: "text" },
    presentation: { kind: "latest", template: "{value}" } });
  json = JSON.stringify(documents.parseDashboardDocument(bindingDoc));

  const clipboard = commands.copySelectedWidgets(json, ids);
  assert.deepEqual(clipboard.widgets.map((widget) => widget.widgetId), ids);
  assert.equal(clipboard.bindings.length, 1);
  const selectedPasteTarget = commands.resolveFixedPasteTarget(json, clipboard, ids);
  assert.deepEqual(selectedPasteTarget, { parentId: "0", leftColumn: 2,
    topRow: Math.max(...clipboard.widgets.map((widget) => widget.bottomRow)) + 1 },
  "Appsmith centers the copied pair on its selected siblings and pastes one row below");
  const selectedPaste = commands.pasteSelectedWidgets(json, clipboard,
    selectedPasteTarget);
  assert.equal(selectedPaste.selectedWidgetIds.length, 2);
  const noSelectionTarget = commands.resolveFixedPasteTarget(json, clipboard, []);
  assert.deepEqual(noSelectionTarget, { parentId: "0", leftColumn: 2,
    topRow: Math.max(...JSON.parse(json).layout.dsl.children.map((widget) =>
      widget.bottomRow)) + 1 },
  "without selection or a mouse point Appsmith preserves X and uses the next row");
  const pasted = commands.pasteSelectedWidgets(json, clipboard,
    { parentId: "0", leftColumn: 2, topRow: 25 });
  const pastedDoc = JSON.parse(pasted.documentJson);
  assert.equal(pasted.selectedWidgetIds.length, 2);
  const copiedText = all(pastedDoc.layout.dsl).find((widget) =>
    widget.widgetId === pasted.selectedWidgetIds[0]);
  assert.equal(copiedText.widgetName, `${sourceText.widgetName}Copy`,
    "ordinary Appsmith paste uses the complete old name plus Copy");
  assert.equal(copiedText.text, sourceText.text,
    "ordinary Appsmith paste preserves supported Text expressions verbatim");
  assert.deepEqual(copiedText.dynamicBindingPathList, [{ key: "text" }]);
  const pastedAgain = commands.pasteSelectedWidgets(pasted.documentJson,
    clipboard, { parentId: "0", leftColumn: 2, topRow: 50 });
  const copiedAgain = all(JSON.parse(pastedAgain.documentJson).layout.dsl)
    .find((widget) => widget.widgetId === pastedAgain.selectedWidgetIds[0]);
  assert.equal(copiedAgain.widgetName, `${sourceText.widgetName}Copy1`,
    "Appsmith's getNextEntityName suffixes an existing Copy name");
  assert.equal(new Set(all(pastedDoc.layout.dsl).map((widget) => widget.widgetName)).size,
    all(pastedDoc.layout.dsl).length, "copied names remain globally unique");
  assert.equal(pastedDoc.bindings.length, 2);
  assert.ok(pastedDoc.bindings.some((binding) =>
    pasted.selectedWidgetIds.includes(binding.target.widgetId)));
  assertNoNewOverlap(pastedDoc.layout.dsl);

  const groupRequest = {
    widgetIds: ids, parentId: "0", leftColumn: 2, topRow: 25,
  };
  const preview = commands.previewGroupMove(pasted.documentJson, groupRequest);
  assert.equal(preview.valid, true, preview.error);
  assert.deepEqual(commands.previewCommittedGroupMove(pasted.documentJson,
    groupRequest, preview), preview,
  "group drag history is validated against the same plan before commit");
  assert.equal(commands.previewCommittedGroupMove(pasted.documentJson,
    groupRequest, { ...preview, reflowed: {
      unknownWidget: preview.targets[ids[0]],
    } }).valid, false, "group plans cannot move unknown siblings");
  assert.equal(commands.previewCommittedGroupMove(pasted.documentJson,
    groupRequest, { ...preview, reflowed: {} }).valid, false,
  "group plans cannot omit a sibling displacement needed to avoid overlap");
  const moved = commands.moveSelectedWidgets(pasted.documentJson,
    groupRequest, preview);
  const movedDoc = JSON.parse(moved.documentJson);
  assert.deepEqual(moved.selectedWidgetIds, ids);
  assertNoNewOverlap(movedDoc.layout.dsl);

  const cut = commands.cutSelectedWidgets(moved.documentJson, pasted.selectedWidgetIds);
  assert.equal(cut.clipboard.widgets.length, 2);
  const cutDoc = JSON.parse(cut.documentJson);
  assert.equal(cutDoc.layout.dsl.children.length, 2);
  assert.equal(cutDoc.bindings.length, 1, "bulk delete removes descendants' bindings");
  documents.parseDashboardDocument(cutDoc);

  const originalGroupBottom = Math.max(...cutDoc.layout.dsl.children.map((widget) => widget.bottomRow));
  const below = edits.addWidgetToDocument(cut.documentJson, {
    type: "TEXT_WIDGET", parentId: "0", leftColumn: 2, topRow: originalGroupBottom,
  });
  const grouped = commands.groupSelectedWidgets(below.documentJson, ids);
  const groupedDoc = JSON.parse(grouped.documentJson);
  const container = groupedDoc.layout.dsl.children.find((widget) =>
    widget.widgetId === grouped.selectedWidgetIds[0]);
  const inner = container.children[0];
  assert.equal(container.type, "CONTAINER_WIDGET");
  assert.equal(container.dynamicHeight, "AUTO_HEIGHT");
  assert.equal(container.minDynamicHeight, 10);
  assert.equal(container.maxDynamicHeight, 9000);
  assert.equal(container.shouldScrollContents, true);
  assert.equal(inner.type, "CANVAS_WIDGET");
  assert.equal(inner.children.length, 2);
  assert.equal(inner.rightColumn, 64,
    "grouped children use Appsmith's 64 logical inner columns");
  assert.equal(inner.children[0].parentId, inner.widgetId);
  const rootColSpace = (groupedDoc.layout.dsl.rightColumn -
    groupedDoc.layout.dsl.leftColumn - 12) / 64;
  const firstOriginal = cutDoc.layout.dsl.children.find((widget) => widget.widgetId === ids[0]);
  const firstGrouped = inner.children.find((widget) => widget.widgetId === ids[0]);
  assert.ok(Math.abs((container.leftColumn * rootColSpace +
    firstGrouped.leftColumn * firstGrouped.parentColumnSpace) -
    firstOriginal.leftColumn * rootColSpace) < 0.0001,
  "grouping preserves selected widget's rendered horizontal position");
  const secondOriginal = cutDoc.layout.dsl.children.find((widget) => widget.widgetId === ids[1]);
  const secondGrouped = inner.children.find((widget) => widget.widgetId === ids[1]);
  assert.ok(Math.abs((container.leftColumn * rootColSpace +
    secondGrouped.leftColumn * secondGrouped.parentColumnSpace) -
    secondOriginal.leftColumn * rootColSpace) < 0.0001,
  "grouping uses Appsmith's source column rescale");
  assert.ok(groupedDoc.layout.dsl.children.find((widget) =>
    widget.widgetId === below.selectedWidgetId).topRow >= originalGroupBottom + 2,
  `Appsmith bottom reflow makes room for the two extra group rows: ${JSON.stringify(groupedDoc.layout.dsl.children.map((w) => [w.widgetId, w.topRow, w.bottomRow]))}`);
  assert.equal(groupedDoc.bindings.length, 1,
    "reparenting keeps the selected widget's Cyflex binding");
  assert.equal(groupedDoc.layout.dsl.minHeight, cutDoc.layout.dsl.minHeight,
    "root minHeight is not derived from its DSL bottomRow");
  assert.equal(groupedDoc.layout.dsl.bottomRow,
    Math.max(38, ...groupedDoc.layout.dsl.children.map((widget) => widget.bottomRow)) * 10,
    "root DSL bottomRow is normalized in pixels after the command");
  documents.parseDashboardDocument(groupedDoc);

  let cross = JSON.stringify({ ...documents.createBlankDashboardDocument(
    "group-cross-canvas", "Cross canvas"),
    layout: { dsl: { ...documents.createBlankDashboardDocument(
      "group-cross-canvas", "Cross canvas").layout.dsl, children: [] } },
  });
  const verticalFirst = edits.addWidgetToDocument(cross, {
    type: "TEXT_WIDGET", parentId: "0", leftColumn: 2, topRow: 5,
  });
  cross = verticalFirst.documentJson;
  const verticalSecond = edits.addWidgetToDocument(cross, {
    type: "TEXT_WIDGET", parentId: "0", leftColumn: 2, topRow: 13,
  });
  cross = verticalSecond.documentJson;
  const containerAdded = edits.addWidgetToDocument(cross, {
    type: "CONTAINER_WIDGET", parentId: "0", leftColumn: 30, topRow: 5,
  });
  cross = containerAdded.documentJson;
  const pinned = JSON.parse(cross);
  pinned.componentDependencies.push({ key: "local-group-pin", revision: "r1",
    rootWidgetId: containerAdded.selectedWidgetId, source: { kind: "embedded" } });
  cross = JSON.stringify(documents.parseDashboardDocument(pinned));
  const innerId = JSON.parse(cross).layout.dsl.children.find((widget) =>
    widget.widgetId === containerAdded.selectedWidgetId).children[0].widgetId;
  const verticalIds = [verticalFirst.selectedWidgetId, verticalSecond.selectedWidgetId];
  const verticalClipboard = commands.copySelectedWidgets(cross, verticalIds);
  const containerPasteTarget = commands.resolveFixedPasteTarget(cross,
    verticalClipboard, [containerAdded.selectedWidgetId]);
  assert.deepEqual(containerPasteTarget, { parentId: innerId,
    leftColumn: 2, topRow: 1 },
  "selecting a Container routes paste to its first inner canvas");
  const containerPaste = commands.pasteSelectedWidgets(cross, verticalClipboard,
    containerPasteTarget);
  assert.ok(all(JSON.parse(containerPaste.documentJson).layout.dsl).find((widget) =>
    widget.widgetId === innerId).children.every((widget) =>
      widget.parentId === innerId));
  const populatedContainer = edits.addWidgetToDocument(cross, {
    type: "TEXT_WIDGET", parentId: innerId, leftColumn: 32, topRow: 1,
  });
  const coveredContainer = commands.previewGroupMove(populatedContainer.documentJson, {
    widgetIds: verticalIds, parentId: "0", leftColumn: 30, topRow: 5,
  });
  assert.equal(coveredContainer.valid, true, coveredContainer.error);
  const gatedContainer = commands.previewGroupMove(populatedContainer.documentJson, {
    widgetIds: verticalIds, parentId: "0", leftColumn: 30, topRow: 5,
  }, { shouldReflowDropTarget: false });
  assert.equal(gatedContainer.valid, false,
    "Appsmith waits before reflowing a colliding populated Container");
  const pinnedClipboard = commands.copySelectedWidgets(cross, [containerAdded.selectedWidgetId]);
  const pinnedPaste = commands.pasteSelectedWidgets(cross, pinnedClipboard,
    { parentId: "0", leftColumn: 30, topRow: 30 });
  const pastedPins = JSON.parse(pinnedPaste.documentJson).componentDependencies;
  assert.equal(pastedPins.length, 2);
  assert.equal(new Set(pastedPins.map((dependency) => dependency.key)).size, 2,
    "pasting a pinned group creates a distinct component dependency key");
  assert.equal(pastedPins[1].rootWidgetId, pinnedPaste.selectedWidgetIds[0]);
  documents.parseDashboardDocument(JSON.parse(pinnedPaste.documentJson));
  const crossClipboard = commands.copySelectedWidgets(cross, verticalIds);
  const crossPaste = commands.pasteSelectedWidgets(cross, crossClipboard,
    { parentId: innerId, leftColumn: 1, topRow: 1 });
  assert.equal(crossPaste.selectedWidgetIds.length, 2);
  const pastedInner = all(JSON.parse(crossPaste.documentJson).layout.dsl).find((widget) =>
    widget.widgetId === innerId);
  assert.equal(pastedInner.children.length, 2);
  assert.ok(pastedInner.children.every((widget) => widget.parentId === innerId));
  const parentContainer = all(JSON.parse(crossPaste.documentJson).layout.dsl).find((widget) =>
    widget.widgetId === containerAdded.selectedWidgetId);
  const nestedColumnSpace = ((parentContainer.rightColumn - parentContainer.leftColumn) *
    ((JSON.parse(crossPaste.documentJson).layout.dsl.rightColumn - 12) / 64) - 20) / 64;
  assert.ok(pastedInner.children.every((widget) =>
    Math.abs(widget.parentColumnSpace - nestedColumnSpace) < 0.0001),
  "cross-canvas paste uses nested rendered width minus 20px, over 64 columns");
  documents.parseDashboardDocument(JSON.parse(crossPaste.documentJson));
  const innerAfterDelete = commands.deleteSelectedWidgets(crossPaste.documentJson,
    crossPaste.selectedWidgetIds);
  const crossMove = commands.moveSelectedWidgets(innerAfterDelete.documentJson, {
    widgetIds: verticalIds, parentId: innerId, leftColumn: 1, topRow: 1,
  });
  const movedInner = all(JSON.parse(crossMove.documentJson).layout.dsl).find((widget) =>
    widget.widgetId === innerId);
  assert.equal(movedInner.children.length, 2);
  assert.ok(movedInner.children.every((widget) => widget.parentId === innerId));
  documents.parseDashboardDocument(JSON.parse(crossMove.documentJson));

  const sameVariableDestination = documents.createBlankDashboardDocument(
    "cross-draft-same-variable", "Cross draft same variable");
  sameVariableDestination.layout.dsl.children = [];
  sameVariableDestination.variables = [structuredClone(bindingDoc.variables[0])];
  const sameVariablePaste = commands.pasteSelectedWidgets(
    JSON.stringify(sameVariableDestination), clipboard,
    { parentId: "0", leftColumn: 2, topRow: 10 });
  const sameVariableResult = JSON.parse(sameVariablePaste.documentJson);
  assert.equal(sameVariableResult.variables.length, 1,
    "the same Cyflex declaration is reused across drafts");
  assert.equal(sameVariableResult.bindings.length, 1);
  assert.equal(sameVariableResult.bindings[0].variableKey, "speed");
  documents.parseDashboardDocument(sameVariableResult);

  const conflictingDestination = documents.createBlankDashboardDocument(
    "cross-draft-conflicting-variable", "Cross draft conflicting variable");
  conflictingDestination.layout.dsl.children = [];
  const destinationSpeed = { key: "speed", label: "Other speed",
    selector: { kind: "cyflexId", id: "7" }, valueType: "string" };
  conflictingDestination.variables = [destinationSpeed];
  const conflictingPaste = commands.pasteSelectedWidgets(
    JSON.stringify(conflictingDestination), clipboard,
    { parentId: "0", leftColumn: 2, topRow: 10 });
  const conflictingResult = JSON.parse(conflictingPaste.documentJson);
  assert.deepEqual(conflictingResult.variables.find((variable) =>
    variable.key === "speed"), destinationSpeed,
  "cross-draft paste preserves the destination's existing declaration");
  assert.deepEqual(conflictingResult.variables.find((variable) =>
    variable.key === "speedCopy"), { ...bindingDoc.variables[0], key: "speedCopy" });
  assert.equal(conflictingResult.bindings[0].variableKey, "speedCopy");
  const repeatedConflict = commands.pasteSelectedWidgets(
    conflictingPaste.documentJson, clipboard,
    { parentId: "0", leftColumn: 2, topRow: 35 });
  assert.equal(JSON.parse(repeatedConflict.documentJson).variables.length, 2,
    "repeated paste reuses the copied declaration");
  documents.parseDashboardDocument(JSON.parse(repeatedConflict.documentJson));

  const noBindingClipboard = commands.copySelectedWidgets(json, [ids[1]]);
  assert.deepEqual(noBindingClipboard.variables, []);
  assert.deepEqual(noBindingClipboard.bindings, []);
  const unboundDestination = documents.createBlankDashboardDocument(
    "cross-draft-unbound", "Cross draft unbound");
  unboundDestination.layout.dsl.children = [];
  const unboundPaste = commands.pasteSelectedWidgets(
    JSON.stringify(unboundDestination), noBindingClipboard,
    { parentId: "0", leftColumn: 2, topRow: 10 });
  assert.equal(JSON.parse(unboundPaste.documentJson).variables.length, 0);
  assert.equal(JSON.parse(unboundPaste.documentJson).bindings.length, 0);
  documents.parseDashboardDocument(JSON.parse(unboundPaste.documentJson));
  assert.throws(() => commands.pasteSelectedWidgets(
    JSON.stringify(unboundDestination),
    { ...noBindingClipboard, sourceLayoutSystem: "ANVIL" },
    { parentId: "0", leftColumn: 2, topRow: 10 }),
  /Fixed layout/);
  console.log("Appsmith Fixed group command contract passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
