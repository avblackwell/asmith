/* Run from operator-display-client: node src/editor-bridge/native-widgets/modal/modal.contract.test.cjs */
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
  NativeModalView,
  NativeModalButtonView,
  NativeModalIconButtonView,
  createModalWidgetBlueprint,
  modalIsVisible,
  modalRenderMetrics,
  resolvedModalWidth,
} = require(path.join(__dirname, "index.ts"));
const { createBlankDashboardDocument, parseDashboardDocument } = require(
  path.join(__dirname, "../../../document/index.ts"),
);

const blueprint = createModalWidgetBlueprint({
  widgetId: "modal-1",
  widgetName: "Modal1",
  parentId: "root",
  topRow: 2,
  bottomRow: 26,
  leftColumn: 2,
  rightColumn: 26,
  parentColumnSpace: 19.2,
  parentRowSpace: 10,
  childIds: {
    canvas: "modal-canvas-1",
    closeIcon: "modal-close-icon-1",
    title: "modal-title-1",
    closeButton: "modal-close-button-1",
    confirmButton: "modal-confirm-button-1",
  },
  childNames: {
    canvas: "Modal1Canvas",
    closeIcon: "Modal1CloseIcon",
    title: "Modal1Title",
    closeButton: "Modal1CloseButton",
    confirmButton: "Modal1ConfirmButton",
  },
});
assert.equal(blueprint.type, "MODAL_WIDGET");
assert.equal(blueprint.version, 2);
assert.equal(blueprint.width, 456);
assert.equal(blueprint.height, 240);
assert.equal(blueprint.dynamicHeight, "AUTO_HEIGHT");
assert.equal(blueprint.minDynamicHeight, 24);
assert.equal(blueprint.isVisible, false);
assert.equal(blueprint.canEscapeKeyClose, true);
assert.equal(blueprint.canOutsideClickClose, true);
assert.equal(blueprint.shouldScrollContents, true);
assert.equal(blueprint.detachFromLayout, true);
assert.equal(blueprint.children.length, 1);
const canvas = blueprint.children[0];
assert.deepEqual([canvas.type, canvas.parentId, canvas.leftColumn, canvas.rightColumn,
  canvas.topRow, canvas.bottomRow, canvas.detachFromLayout, canvas.canExtend,
  canvas.shouldScrollContents],
  ["CANVAS_WIDGET", "modal-1", 0, 64, 0, 24, true, true, false]);
assert.deepEqual(canvas.children.map((child) => [
  child.type, child.parentId, child.leftColumn, child.rightColumn,
  child.topRow, child.bottomRow,
]), [
  ["ICON_BUTTON_WIDGET", "modal-canvas-1", 58, 64, 0, 4],
  ["TEXT_WIDGET", "modal-canvas-1", 1, 41, 1, 5],
  ["BUTTON_WIDGET", "modal-canvas-1", 31, 47, 18, 22],
  ["BUTTON_WIDGET", "modal-canvas-1", 47, 63, 18, 22],
]);
assert.deepEqual(canvas.children.map((child) => child.text ?? child.iconName),
  ["cross", "Modal Title", "Close", "Confirm"]);
for (const widget of [blueprint, canvas, ...canvas.children]) {
  assert.equal(widget.onClick, undefined,
    "the Appsmith blueprint's closeModal action requires a product action contract");
  assert.ok(!widget.dynamicTriggerPathList?.length,
    "no unsupported Appsmith action path is serialized");
}
const document = createBlankDashboardDocument("modal-contract");
document.layout.dsl.children.push({ ...blueprint, parentId: "0" });
assert.equal(parseDashboardDocument(document).layout.dsl.children[1].type, "MODAL_WIDGET");

assert.equal(resolvedModalWidth(456, 1200), 456);
assert.equal(resolvedModalWidth(456, 400), 380);
assert.equal(resolvedModalWidth(456, 0), 0);
assert.deepEqual(modalRenderMetrics({
  requestedWidthPx: 456,
  requestedHeightPx: 240,
  mainCanvasWidthPx: 400,
  shouldScrollContents: true,
}), {
  widthPx: 380,
  heightPx: 240,
  childCanvasWidthPx: 388,
  childCanvasMinHeightPx: 240,
  canExtendChildCanvas: true,
});
assert.equal(modalIsVisible("modal-1", false), false);
assert.equal(modalIsVisible("modal-1", true), true);
assert.equal(modalIsVisible("modal-1", false, ["root", "modal-1", "child"]), true);

function render(props = {}) {
  const sheet = new ServerStyleSheet();
  try {
    const markup = renderToStaticMarkup(sheet.collectStyles(
      React.createElement(NativeModalView, {
        widgetId: "modal-1",
        widgetName: "Modal1",
        canvasWidgetId: "modal-canvas-1",
        mainCanvasWidthPx: 400,
        widthPx: 456,
        heightPx: 240,
        isVisible: true,
        shouldScrollContents: true,
        renderCanvas: (id, metrics) => React.createElement("div", {
          "data-canvas-id": id,
          "data-canvas-width": metrics.childCanvasWidthPx,
          "data-canvas-height": metrics.childCanvasMinHeightPx,
        }),
        ...props,
      }),
    ));
    return { markup, styles: sheet.getStyleTags() };
  } finally {
    sheet.seal();
  }
}

assert.equal(render({ isVisible: false }).markup, "");
const open = render();
assert.match(open.markup, /data-native-widget="modal"/);
assert.match(open.markup, /role="dialog"/);
assert.match(open.markup, /aria-modal="true"/);
assert.match(open.markup, /data-canvas-id="modal-canvas-1"/);
assert.match(open.markup, /data-canvas-width="388"/);
assert.match(open.styles, /width:380px/);
assert.match(open.styles, /height:240px/);
assert.match(open.styles, /overflow-y:auto/);
const selected = render({ isVisible: false, selectedWidgetAncestry: ["modal-1"] });
assert.match(selected.markup, /role="dialog"/);
const clipped = render({ shouldScrollContents: false });
assert.match(clipped.styles, /overflow-y:hidden/);
const editorOpen = render({ isEditMode: true });
assert.doesNotMatch(editorOpen.markup, /aria-modal="true"/,
  "the editor overlay leaves the palette and properties accessible");
const button = renderToStaticMarkup(React.createElement(NativeModalButtonView, {
  text: "Confirm", variant: "PRIMARY", themePrimaryColor: "#553de9",
}));
assert.match(button, /data-native-widget="modal-button"/);
assert.match(button, /Confirm/);
assert.doesNotMatch(button, /onClick=/);
const closeIcon = renderToStaticMarkup(React.createElement(NativeModalIconButtonView, {
  iconName: "cross", color: "#858282",
}));
assert.match(closeIcon, /data-native-widget="modal-icon-button"/);
assert.match(closeIcon, /aria-label="Close"/);

console.log("Modal blueprint and read-only renderer contract passed");
