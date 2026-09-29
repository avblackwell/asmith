const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function loadTypeScript(mod, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  mod._compile(output, filename);
}
require.extensions[".ts"] = loadTypeScript;
require.extensions[".tsx"] = loadTypeScript;

const {
  createListV2Blueprint,
  materializeStaticListV2Rows,
} = require(path.join(__dirname, "index.ts"));
const { createBlankDashboardDocument, parseDashboardDocument } = require(
  path.join(__dirname, "../../../document/index.ts"),
);

function makeList() {
  return createListV2Blueprint({
    widgetId: "list-1",
    widgetName: "List1",
    parentId: "0",
    topRow: 2,
    bottomRow: 42,
    leftColumn: 32,
    rightColumn: 56,
    parentColumnSpace: 15.5234375,
    parentRowSpace: 10,
    childIds: {
      mainCanvas: "list-main-canvas",
      itemContainer: "list-item-container",
      itemCanvas: "list-item-canvas",
      image: "list-image",
      heading: "list-heading",
      body: "list-body",
    },
    childNames: {
      mainCanvas: "List1MainCanvas",
      itemContainer: "List1ItemContainer",
      itemCanvas: "List1ItemCanvas",
      image: "List1Image",
      heading: "List1Heading",
      body: "List1Body",
    },
    defaultImageUrl: "https://example.test/default.png",
  });
}

function leaf(row, index) {
  return row.runtimeWidget.dsl.children[0].children[index];
}

const list = makeList();
const authoredBefore = JSON.stringify(list);
const firstPage = materializeStaticListV2Rows(list, { pageNo: 1, pageSize: 2 });
assert.equal(firstPage.status, "ready");
assert.deepEqual([firstPage.totalItems, firstPage.pageCount, firstPage.empty], [3, 2, false]);
assert.deepEqual(firstPage.rows.map((row) => [row.key, row.currentIndex, row.viewIndex]), [
  ["001", 0, 0], ["002", 1, 1],
]);
assert.deepEqual(firstPage.rows.map((row) => [
  leaf(row, 0).image, leaf(row, 1).text, leaf(row, 2).text,
]), [
  ["https://example.test/default.png", "Blue", "001"],
  ["https://example.test/default.png", "Green", "002"],
]);
assert.deepEqual(firstPage.rows.map((row) => [
  row.runtimeWidget.dsl.topRow, row.runtimeWidget.dsl.bottomRow,
]), [[0, 12], [12, 24]]);
assert.equal(firstPage.rows[0].runtimeWidget.templateWidgetId, "list-item-container");
assert.equal(firstPage.rows[0].runtimeWidget.dsl.referencedWidgetId, "list-item-container");
assert.equal(firstPage.rows[0].runtimeWidget.dsl.currentIndex, 0);
assert.notEqual(firstPage.rows[0].runtimeWidget.dsl.widgetId,
  firstPage.rows[1].runtimeWidget.dsl.widgetId);
assert.equal(firstPage.rows[0].runtimeWidget.dsl.children[0].parentId,
  firstPage.rows[0].runtimeWidget.dsl.widgetId);
assert.equal(leaf(firstPage.rows[0], 1).referencedWidgetId, "list-heading");
assert.deepEqual(firstPage.rows[0].unresolvedBindings, []);

const secondPage = materializeStaticListV2Rows(list, { pageNo: 2, pageSize: 2 });
assert.equal(secondPage.status, "ready");
assert.deepEqual(secondPage.rows.map((row) => [row.key, row.currentIndex, row.viewIndex]), [
  ["003", 2, 0],
]);
assert.equal(secondPage.rows[0].runtimeWidget.dsl.topRow, 0);
assert.equal(leaf(secondPage.rows[0], 1).text, "Red");
const beyondLast = materializeStaticListV2Rows(list, { pageNo: 3, pageSize: 2 });
assert.equal(beyondLast.status, "ready");
assert.equal(beyondLast.empty, false);
assert.deepEqual(beyondLast.rows, []);

// Primary keys identify rows across reorder. Runtime IDs follow the key, while
// currentIndex and evaluated content follow the new position.
const reordered = makeList();
[reordered.listData[0], reordered.listData[1]] =
  [reordered.listData[1], reordered.listData[0]];
const reorderedRows = materializeStaticListV2Rows(reordered, { pageNo: 1, pageSize: 2 });
assert.equal(reorderedRows.status, "ready");
assert.deepEqual(reorderedRows.rows.map((row) => [row.primaryKey, row.currentIndex]), [
  ["002", 0], ["001", 1],
]);
assert.equal(reorderedRows.rows[0].runtimeWidget.dsl.widgetId,
  firstPage.rows[1].runtimeWidget.dsl.widgetId);

const literalKeys = makeList();
literalKeys.primaryKeys = [42, 0, null];
const literalPage = materializeStaticListV2Rows(literalKeys, { pageNo: 1, pageSize: 3 });
assert.equal(literalPage.status, "ready");
assert.deepEqual(literalPage.rows.map((row) => [row.primaryKey, row.keySource]), [
  ["42", "literal"], ["0", "literal"],
  ['value:{"id":"003","img":"https://example.test/default.png","name":"Red"}', "value"],
]);
const duplicates = makeList();
duplicates.primaryKeys = ["same", "same", "same"];
const duplicatePage = materializeStaticListV2Rows(duplicates, { pageNo: 2, pageSize: 1 });
assert.equal(duplicatePage.status, "ready");
assert.equal(duplicatePage.rows[0].primaryKey, "same");
assert.equal(duplicatePage.rows[0].key, "same#1");

const mixedBinding = makeList();
const itemCanvas = mixedBinding.children[0].children[0].children[0];
itemCanvas.children[1].text = "Row {{currentIndex}}: {{currentItem.name}}";
itemCanvas.children[1].onClick = "{{showAlert(currentItem.name)}}";
itemCanvas.children[1].dynamicTriggerPathList = [{ key: "onClick" }];
itemCanvas.children[2].text = "{{currentItem.id.toString()}}";
const mixedRows = materializeStaticListV2Rows(mixedBinding, { pageNo: 1, pageSize: 1 });
assert.equal(mixedRows.status, "ready");
assert.equal(leaf(mixedRows.rows[0], 1).text, "Row 0: Blue");
assert.equal(leaf(mixedRows.rows[0], 1).onClick, undefined);
assert.deepEqual(leaf(mixedRows.rows[0], 1).dynamicTriggerPathList, []);
assert.equal(itemCanvas.children[1].onClick, "{{showAlert(currentItem.name)}}");
assert.equal(leaf(mixedRows.rows[0], 2).text, "{{currentItem.id.toString()}}");
assert.deepEqual(mixedRows.rows[0].unresolvedBindings.map((entry) =>
  [entry.templateWidgetId, entry.propertyPath]), [["list-body", "text"]]);

const nestedData = makeList();
nestedData.listData[0].profile = { label: "Nested" };
nestedData.children[0].children[0].children[0].children[1].text =
  "{{currentItem.profile.label}}";
const nestedRows = materializeStaticListV2Rows(nestedData, { pageNo: 1, pageSize: 1 });
assert.equal(nestedRows.status, "ready");
assert.equal(leaf(nestedRows.rows[0], 1).text, "Nested");
nestedData.children[0].children[0].children[0].children[1].text =
  "{{currentItem.__proto__}}";
const forbiddenRows = materializeStaticListV2Rows(nestedData, { pageNo: 1, pageSize: 1 });
assert.equal(forbiddenRows.status, "ready");
assert.equal(leaf(forbiddenRows.rows[0], 1).text, "{{currentItem.__proto__}}");
assert.equal(forbiddenRows.rows[0].unresolvedBindings.length, 1);

const emptyList = makeList();
emptyList.listData = [{}, null];
const emptyPage = materializeStaticListV2Rows(emptyList, { pageNo: 1, pageSize: 2 });
assert.equal(emptyPage.status, "ready");
assert.equal(emptyPage.empty, true);
const noRows = makeList();
noRows.listData = [];
const noRowsPage = materializeStaticListV2Rows(noRows, { pageNo: 1, pageSize: 2 });
assert.equal(noRowsPage.status, "ready");
assert.equal(noRowsPage.empty, true);
assert.deepEqual(noRowsPage.rows, []);

const dynamic = makeList();
dynamic.listData = "{{Cyflex.records}}";
assert.deepEqual(materializeStaticListV2Rows(dynamic, { pageNo: 1, pageSize: 2 }), {
  status: "unsupported", reason: "dynamic-list-data", rows: [],
});
const customKeys = makeList();
customKeys.primaryKeys = "{{List1.listData.map(x => x.foo)}}";
assert.equal(materializeStaticListV2Rows(customKeys, { pageNo: 1, pageSize: 2 }).reason,
  "unsupported-primary-keys");
const serverSide = makeList();
serverSide.serverSidePagination = true;
assert.equal(materializeStaticListV2Rows(serverSide, { pageNo: 1, pageSize: 2 }).reason,
  "unsupported-pagination");
const nested = makeList();
nested.children[0].children[0].children[0].children.push({
  widgetId: "nested-list", widgetName: "NestedList", type: "LIST_WIDGET_V2",
  version: 1, parentId: "list-item-canvas", topRow: 8, bottomRow: 12,
  leftColumn: 0, rightColumn: 64,
});
assert.equal(materializeStaticListV2Rows(nested, { pageNo: 1, pageSize: 2 }).reason,
  "nested-list");
const dynamicArray = makeList();
dynamicArray.dynamicBindingPathList.push({ key: "listData" });
assert.equal(materializeStaticListV2Rows(dynamicArray, { pageNo: 1, pageSize: 2 }).reason,
  "dynamic-list-data");
assert.equal(materializeStaticListV2Rows(list, { pageNo: 1, pageSize: 0 }).reason,
  "invalid-page");

// A generated page is never appended to the exported DSL; mutating its clone
// or data does not alter the document's single editable template subtree.
firstPage.rows[0].runtimeWidget.dsl.children[0].children[1].text = "runtime edit";
firstPage.rows[0].currentItem.name = "runtime item edit";
assert.equal(JSON.stringify(list), authoredBefore);
const document = createBlankDashboardDocument("static-list-row-contract");
document.layout.dsl.children.push(list);
const exported = parseDashboardDocument(document);
const exportedList = exported.layout.dsl.children[1];
assert.equal(exportedList.children[0].children.length, 1);
assert.equal(exportedList.children[0].children[0].children[0].children[1].text,
  "{{currentItem.name}}");

console.log("List V2 static row materialization contract passed");
