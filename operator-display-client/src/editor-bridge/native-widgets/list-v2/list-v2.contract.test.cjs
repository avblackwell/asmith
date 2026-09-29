const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { ServerStyleSheet } = require("styled-components");
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
  NativeListV2View,
  assertListV2Nesting,
  createListV2Blueprint,
  listV2ContainerRowHeight,
  listV2DataIsEmpty,
  listV2PageSize,
  listV2PageStartIndex,
  listV2TemplateDoesNotFit,
  shouldPaginateListV2,
} = require(path.join(__dirname, "index.ts"));
const { createBlankDashboardDocument, parseDashboardDocument } = require(
  path.join(__dirname, "../../../document/index.ts"),
);

const childIds = {
  mainCanvas: "list-main-canvas",
  itemContainer: "list-item-container",
  itemCanvas: "list-item-canvas",
  image: "list-image",
  heading: "list-heading",
  body: "list-body",
};
const childNames = {
  mainCanvas: "List1MainCanvas",
  itemContainer: "List1ItemContainer",
  itemCanvas: "List1ItemCanvas",
  image: "List1Image",
  heading: "List1Heading",
  body: "List1Body",
};
const blueprint = createListV2Blueprint({
  widgetId: "list-1",
  widgetName: "List1",
  parentId: "0",
  topRow: 2,
  bottomRow: 42,
  leftColumn: 32,
  rightColumn: 56,
  parentColumnSpace: 15.5234375,
  parentRowSpace: 10,
  childIds,
  childNames,
  defaultImageUrl: "https://example.test/default.png",
});
assert.equal(blueprint.type, "LIST_WIDGET_V2");
assert.equal(blueprint.hasMetaWidgets, true);
assert.equal(blueprint.requiresFlatWidgetChildren, true);
assert.equal(blueprint.dynamicHeight, "FIXED");
assert.equal(blueprint.templateHeight, 160);
assert.equal(blueprint.itemSpacing, 8);
assert.equal(blueprint.pageSize, 3);
assert.equal(blueprint.mainCanvasId, childIds.mainCanvas);
assert.equal(blueprint.mainContainerId, childIds.itemContainer);
assert.equal(blueprint.primaryKeys,
  '{{List1.listData.map((currentItem, currentIndex) => currentItem["id"] )}}');
assert.deepEqual(blueprint.listData.map(({ id, name }) => [id, name]), [
  ["001", "Blue"], ["002", "Green"], ["003", "Red"],
]);
const mainCanvas = blueprint.children[0];
const container = mainCanvas.children[0];
const innerCanvas = container.children[0];
const [image, heading, body] = innerCanvas.children;
assert.deepEqual([mainCanvas.type, container.type, innerCanvas.type], [
  "CANVAS_WIDGET", "CONTAINER_WIDGET", "CANVAS_WIDGET",
]);
assert.deepEqual([mainCanvas.topRow, mainCanvas.bottomRow,
  mainCanvas.leftColumn, mainCanvas.rightColumn], [0, 400, 0, 372.5625]);
assert.deepEqual([mainCanvas.detachFromLayout, mainCanvas.dropDisabled,
  mainCanvas.openParentPropertyPane, mainCanvas.noPad], [true, true, true, true]);
assert.deepEqual([container.topRow, container.bottomRow,
  container.leftColumn, container.rightColumn], [0, 12, 0, 64]);
assert.deepEqual([container.dragDisabled, container.isDeletable,
  container.isListItemContainer, container.noContainerOffset,
  container.dynamicHeight, container.disabledWidgetFeatures],
  [true, false, true, true, "FIXED", ["dynamicHeight"]]);
assert.deepEqual([innerCanvas.useAutoLayout, innerCanvas.detachFromLayout,
  innerCanvas.canExtend], [false, true, false]);
assert.deepEqual([image.type, image.topRow, image.bottomRow,
  image.leftColumn, image.rightColumn, image.image],
  ["IMAGE_WIDGET", 0, 8, 0, 16, "{{currentItem.img}}"]);
assert.deepEqual([heading.type, heading.topRow, heading.bottomRow,
  heading.leftColumn, heading.rightColumn, heading.text, heading.textStyle],
  ["TEXT_WIDGET", 0, 4, 16, 28, "{{currentItem.name}}", "HEADING"]);
assert.deepEqual([body.type, body.topRow, body.bottomRow,
  body.leftColumn, body.rightColumn, body.text, body.textStyle],
  ["TEXT_WIDGET", 4, 8, 16, 24, "{{currentItem.id}}", "BODY"]);
for (const [parent, child] of [
  [blueprint, mainCanvas], [mainCanvas, container], [container, innerCanvas],
  [innerCanvas, image], [innerCanvas, heading], [innerCanvas, body],
]) assert.equal(child.parentId, parent.widgetId);
const document = createBlankDashboardDocument("list-v2-contract");
document.layout.dsl.children.push(blueprint);
assert.equal(parseDashboardDocument(document).layout.dsl.children[1].type, "LIST_WIDGET_V2");
assert.throws(() => createListV2Blueprint({
  widgetId: "bad", widgetName: "List 1", parentId: "0",
  topRow: 0, bottomRow: 40, leftColumn: 0, rightColumn: 24,
  parentColumnSpace: 10, parentRowSpace: 10, childIds, childNames,
}), /JavaScript identifier/);

assert.equal(listV2ContainerRowHeight({
  templateHeight: 120, itemSpacing: 8, itemCount: 3,
}), 120);
assert.equal(listV2ContainerRowHeight({
  templateHeight: 120, itemSpacing: 16, itemCount: 4,
}), 126);
assert.equal(listV2PageSize({
  componentHeight: 400, templateHeight: 120,
  itemSpacing: 8, itemCount: 3,
}), 3);
assert.equal(listV2PageSize({
  componentHeight: 400, templateHeight: 120,
  itemSpacing: 8, itemCount: 4,
}), 2);
assert.equal(listV2PageSize({
  componentHeight: 400, templateHeight: 120,
  itemSpacing: 8, itemCount: 3, serverSidePagination: true,
}), 2);
assert.equal(shouldPaginateListV2({ itemCount: 4, pageSize: 2 }), true);
assert.equal(shouldPaginateListV2({ itemCount: 4, pageSize: 2, infiniteScroll: true }), false);
assert.equal(shouldPaginateListV2({ itemCount: 0, pageSize: 2, serverSidePagination: true }), true);
assert.equal(listV2PageStartIndex(3, 2), 4);
assert.equal(listV2TemplateDoesNotFit(360, 400, 1), true);
assert.equal(listV2TemplateDoesNotFit(120, 400, 0), true);
assert.equal(listV2DataIsEmpty([{}, null]), true);
assert.equal(listV2DataIsEmpty([{ id: "001" }]), false);
assert.equal(listV2DataIsEmpty(undefined), false);
assert.doesNotThrow(() => assertListV2Nesting(2));
assert.throws(() => assertListV2Nesting(3), /more than 3 levels/);
assert.throws(() => assertListV2Nesting(1, 3), /more than 3 levels/);

function render(props = {}) {
  const sheet = new ServerStyleSheet();
  try {
    const markup = renderToStaticMarkup(sheet.collectStyles(
      React.createElement(NativeListV2View, {
        widgetId: "list-1",
        componentHeight: 400,
        templateHeight: 120,
        pageSize: 3,
        listData: [{ id: "001" }],
        materializedRows: React.createElement("div", { "data-row": "already-evaluated" }),
        ...props,
      }),
    ));
    return { markup, styles: sheet.getStyleTags() };
  } finally {
    sheet.seal();
  }
}

const items = render();
assert.match(items.markup, /data-native-widget="list-v2"/);
assert.match(items.markup, /data-list-state="items"/);
assert.match(items.markup, /data-row="already-evaluated"/);
assert.match(items.styles, /height:392px/);
const empty = render({ listData: [{}, null] });
assert.match(empty.markup, /data-list-state="empty"/);
assert.match(empty.markup, /No data to display/);
assert.doesNotMatch(empty.markup, /data-row="already-evaluated"/);
const tall = render({ templateHeight: 360 });
assert.match(tall.markup, /data-list-state="template-too-tall"/);
const loading = render({ isLoading: true, pageSize: 2 });
assert.match(loading.markup, /data-list-state="loading"/);
assert.equal((loading.markup.match(/bp3-skeleton/g) || []).length, 2);

console.log("List V2 Fixed blueprint, model, and shell contract passed");
