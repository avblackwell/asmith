/* Run from operator-display-client: node src/editor-bridge/native-widgets/statbox/statbox.contract.test.cjs */
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

const { createStatboxWidgetBlueprint, NativeStatboxIconButtonView } = require(
  path.join(__dirname, "index.ts"),
);
const { createBlankDashboardDocument, parseDashboardDocument } = require(
  path.join(__dirname, "../../../document/index.ts"),
);

function options() {
  return {
    widgetId: "statbox-1",
    widgetName: "Statbox1",
    parentId: "0",
    topRow: 2,
    bottomRow: 16,
    leftColumn: 3,
    rightColumn: 25,
    parentColumnSpace: 19,
    parentRowSpace: 10,
    childIds: {
      canvas: "canvas-1", label: "label-1", value: "value-1",
      icon: "icon-1", caption: "caption-1",
    },
    childNames: {
      canvas: "Statbox1Canvas", label: "Statbox1Label", value: "Statbox1Value",
      icon: "Statbox1Icon", caption: "Statbox1Caption",
    },
  };
}

const blueprint = createStatboxWidgetBlueprint(options());
assert.equal(blueprint.type, "STATBOX_WIDGET");
assert.deepEqual([
  blueprint.topRow, blueprint.bottomRow, blueprint.leftColumn, blueprint.rightColumn,
], [2, 16, 3, 25]);
assert.deepEqual([
  blueprint.backgroundColor, blueprint.borderWidth, blueprint.borderColor,
  blueprint.dynamicHeight, blueprint.minDynamicHeight, blueprint.shouldScrollContents,
], ["white", "1", "#E0DEDE", "AUTO_HEIGHT", 10, true]);
assert.equal(blueprint.children.length, 1);

const canvas = blueprint.children[0];
assert.deepEqual([
  canvas.type, canvas.parentId, canvas.topRow, canvas.bottomRow,
  canvas.leftColumn, canvas.rightColumn, canvas.minHeight,
  canvas.containerStyle, canvas.canExtend, canvas.detachFromLayout,
], ["CANVAS_WIDGET", "statbox-1", 0, 14, 0, 64, 140, "none", false, true]);
assert.deepEqual(canvas.children.map((child) => [
  child.type, child.parentId, child.leftColumn, child.rightColumn,
  child.topRow, child.bottomRow, child.text ?? child.iconName,
]), [
  ["TEXT_WIDGET", "canvas-1", 1, 37, 0, 4, "Page Views"],
  ["TEXT_WIDGET", "canvas-1", 1, 37, 4, 8, "2.6 M"],
  ["ICON_BUTTON_WIDGET", "canvas-1", 46, 62, 2, 10, "arrow-top-right"],
  ["TEXT_WIDGET", "canvas-1", 1, 37, 8, 12, "21% more than last month"],
]);
assert.deepEqual(canvas.children.map((child) => child.fontSize ?? child.buttonVariant), [
  "0.875rem", "1.25rem", "PRIMARY", "0.875rem",
]);
assert.equal(canvas.children[3].textColor, "#03B365");
for (const widget of [blueprint, canvas, ...canvas.children]) {
  assert.equal(widget.onClick, undefined);
  assert.deepEqual(widget.dynamicTriggerPathList, []);
}

const document = createBlankDashboardDocument("statbox-contract");
document.layout.dsl.children.push(blueprint);
assert.equal(parseDashboardDocument(document).layout.dsl.children.at(-1).type, "STATBOX_WIDGET");

const resized = createStatboxWidgetBlueprint({ ...options(), bottomRow: 22 });
assert.equal(resized.children[0].bottomRow, 20);
assert.equal(resized.children[0].minHeight, 200);
assert.throws(() => createStatboxWidgetBlueprint({
  ...options(), childIds: { ...options().childIds, icon: "label-1" },
}), /unique/);
assert.throws(() => createStatboxWidgetBlueprint({
  ...options(), rightColumn: 3,
}), /bounds/);

const sheet = new ServerStyleSheet();
try {
  const markup = renderToStaticMarkup(sheet.collectStyles(
    React.createElement(NativeStatboxIconButtonView, {
      width: 80, height: 60, iconName: "arrow-top-right",
      buttonColor: "#126e9a", buttonVariant: "PRIMARY",
      themePrimaryColor: "#126e9a", themeBorderRadius: "4px",
      themeBoxShadow: "none",
    }),
  ));
  const styles = sheet.getStyleTags();
  assert.match(markup, /data-native-widget="statbox-icon-button"/);
  assert.match(markup, /data-icon-name="arrow-top-right"/);
  assert.match(markup, /<svg/);
  assert.match(styles, /width:52px/);
  assert.match(styles, /background:#126e9a/);
  assert.doesNotMatch(markup, /onClick=/);
} finally {
  sheet.seal();
}

console.log("Statbox Fixed blueprint contract passed");
