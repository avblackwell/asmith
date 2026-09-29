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
  NativeTabsView,
  createTabsWidgetBlueprint,
  orderedVisibleTabs,
  resolveSelectedTabCanvasId,
  tabsCanvasHeightOffsetRows,
} = require(path.join(__dirname, "index.ts"));
const { createBlankDashboardDocument, parseDashboardDocument } = require(
  path.join(__dirname, "../../../document/index.ts"),
);

const blueprint = createTabsWidgetBlueprint({
  widgetId: "tabs-1",
  widgetName: "Tabs1",
  parentId: "root",
  topRow: 4,
  bottomRow: 19,
  leftColumn: 3,
  rightColumn: 27,
  parentColumnSpace: 19.2,
  parentRowSpace: 10,
  childCanvasIds: ["tab-canvas-1", "tab-canvas-2"],
  childCanvasNames: ["Tabs1Tab1Canvas", "Tabs1Tab2Canvas"],
  canvasVersion: 91,
});
assert.equal(blueprint.type, "TABS_WIDGET");
assert.equal(blueprint.version, 3);
assert.equal(blueprint.dynamicHeight, "AUTO_HEIGHT");
assert.equal(blueprint.minDynamicHeight, 15);
assert.equal(blueprint.shouldScrollContents, true);
assert.equal(blueprint.children.length, 2);
assert.deepEqual(blueprint.children.map((canvas) => [
  canvas.type, canvas.parentId, canvas.tabId, canvas.tabName,
  canvas.leftColumn, canvas.rightColumn, canvas.topRow, canvas.bottomRow,
  canvas.canExtend, canvas.detachFromLayout, canvas.version,
]), [
  ["CANVAS_WIDGET", "tabs-1", "tab1", "Tab 1", 0, 64, 0, 10, true, true, 91],
  ["CANVAS_WIDGET", "tabs-1", "tab2", "Tab 2", 0, 64, 0, 10, true, true, 91],
]);
assert.equal(blueprint.tabsObj.tab1.widgetId, blueprint.children[0].widgetId);
assert.equal(blueprint.tabsObj.tab2.widgetId, blueprint.children[1].widgetId);
const document = createBlankDashboardDocument("tabs-contract");
document.layout.dsl.children.push({ ...blueprint, parentId: "0" });
assert.equal(parseDashboardDocument(document).layout.dsl.children[1].type, "TABS_WIDGET");

const tabsObj = {
  tab2: { ...blueprint.tabsObj.tab2, index: 2 },
  hidden: { id: "hidden", label: "Hidden", widgetId: "hidden-canvas", index: 1, isVisible: false },
  tab1: { ...blueprint.tabsObj.tab1, index: 0 },
};
assert.deepEqual(orderedVisibleTabs(tabsObj).map((tab) => tab.label), ["Tab 1", "Tab 2"]);
assert.equal(resolveSelectedTabCanvasId(tabsObj, "Tab 2"), "tab-canvas-2");
assert.equal(resolveSelectedTabCanvasId(tabsObj, "Missing"), "tab-canvas-1");
assert.equal(resolveSelectedTabCanvasId(tabsObj, "Tab 1", "tab-canvas-2"), "tab-canvas-2");
assert.equal(resolveSelectedTabCanvasId(tabsObj, "Tab 1", "hidden-canvas"), "tab-canvas-1");
assert.equal(resolveSelectedTabCanvasId(tabsObj, "Tab 1", null, ["hidden-canvas"]), "hidden-canvas");
assert.equal(resolveSelectedTabCanvasId({}, "Tab 1"), null);
assert.equal(tabsCanvasHeightOffsetRows(1, true), 4);
assert.equal(tabsCanvasHeightOffsetRows(3, true), 5);
assert.equal(tabsCanvasHeightOffsetRows("1.5", true), 5);
assert.equal(tabsCanvasHeightOffsetRows(1, false), 0);

function render(props = {}) {
  const sheet = new ServerStyleSheet();
  try {
    const markup = renderToStaticMarkup(sheet.collectStyles(
      React.createElement(NativeTabsView, {
        widgetId: "tabs-1",
        tabsObj,
        defaultTab: "Tab 2",
        shouldShowTabs: true,
        renderCanvas: (id) => React.createElement("div", { "data-rendered-canvas": id }),
        ...props,
      }),
    ));
    return { markup, styles: sheet.getStyleTags() };
  } finally {
    sheet.seal();
  }
}

const selected = render();
assert.match(selected.markup, /data-native-widget="tabs"/);
assert.match(selected.markup, /role="tablist"/);
assert.match(selected.markup, /aria-selected="true"[^>]*><span>Tab 2<\/span>/);
assert.match(selected.markup, /data-rendered-canvas="tab-canvas-2"/);
assert.doesNotMatch(selected.markup, /data-rendered-canvas="tab-canvas-1"/);
assert.doesNotMatch(selected.markup, />Hidden<\/span>/);
assert.match(selected.styles, /height:40px/);

const forced = render({ selectedTabWidgetId: "tab-canvas-1", shouldShowTabs: false });
assert.doesNotMatch(forced.markup, /role="tablist"/);
assert.match(forced.markup, /data-rendered-canvas="tab-canvas-1"/);
assert.doesNotMatch(forced.markup, /data-rendered-canvas="tab-canvas-2"/);

console.log("Tabs blueprint and read-only renderer contract passed");
