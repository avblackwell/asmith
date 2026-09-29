/* Run from operator-display-client: node src/editor-bridge/native-widgets/form-card/form-card.contract.test.cjs */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { ServerStyleSheet } = require("styled-components");
const ts = require("typescript");

function loadTypeScript(mod, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  mod._compile(output, filename);
}
require.extensions[".ts"] = loadTypeScript;
require.extensions[".tsx"] = loadTypeScript;

const {
  createFormWidgetBlueprint, createCardWidgetBlueprint,
  formDataFromChildren, formHasChanges, cardChromeHeightInPx, cardViewModel,
  NativeFormView, NativeCardView,
} = require("./index.ts");
const { createBlankDashboardDocument, parseDashboardDocument } = require("../../../document/index.ts");

function base() {
  return { widgetId: "outer-1", widgetName: "Outer1", parentId: "0",
    topRow: 2, bottomRow: 42, leftColumn: 2, rightColumn: 26,
    parentColumnSpace: 19, parentRowSpace: 10 };
}

const form = createFormWidgetBlueprint({ ...base(), childIds: {
  canvas: "form-canvas", title: "form-title", submit: "form-submit", reset: "form-reset",
}, childNames: {
  canvas: "FormCanvas1", title: "FormTitle1", submit: "FormSubmit1", reset: "FormReset1",
} });
assert.equal(form.type, "FORM_WIDGET");
assert.equal(form.dynamicHeight, "AUTO_HEIGHT");
assert.equal(form.children[0].type, "CANVAS_WIDGET");
assert.deepEqual(form.children[0].children.map((child) => [
  child.type, child.topRow, child.bottomRow, child.leftColumn, child.rightColumn,
]), [
  ["TEXT_WIDGET", 1, 5, 1.5, 25.5],
  ["BUTTON_WIDGET", 33, 37, 46, 62],
  ["BUTTON_WIDGET", 33, 37, 30, 46],
]);
assert.equal(form.children[0].children[1].disabledWhenInvalid, true);
assert.equal(form.children[0].children[2].buttonVariant, "SECONDARY");

assert.deepEqual(formDataFromChildren([
  { widgetName: "Name", value: "Ada" },
  { widgetName: "Alias", originalWidgetName: "PreferredName", value: "A" },
  { widgetName: "Missing", value: null },
]), { Name: "Ada", PreferredName: "A" });
assert.equal(formHasChanges([{ children: [{ children: [{ widgetName: "Deep", isDirty: true }] }] }]), true);
assert.equal(formHasChanges([{ widgetName: "Name", isDirty: false }]), false);

const card = createCardWidgetBlueprint({ ...base(), bottomRow: 32,
  childIds: { canvas: "card-canvas", bodyHint: "card-hint" },
  childNames: { canvas: "CardCanvas1", bodyHint: "CardHint1" },
});
assert.equal(card.type, "CARD_WIDGET");
assert.equal(card.children[0].bottomRow, 20);
assert.equal(card.children[0].minHeight, 200);
assert.equal(card.children[0].children[0].text, "Add widgets to design the card body");
assert.equal(cardChromeHeightInPx(card), 100);
assert.equal(cardChromeHeightInPx({ ...card, mediaPosition: "TOP", mediaImage: "image.png" }), 240);
assert.equal(cardChromeHeightInPx({ ...card, mediaPosition: "LEFT", mediaImage: "image.png" }), 100);
assert.equal(cardChromeHeightInPx({ ...card, showFooter: false, showHeader: false }), 2);
assert.equal(cardViewModel(card).footerActions.length, 2);
assert.equal(cardViewModel({ ...card, showMenu: false }).menuItems.length, 0);
assert.equal(cardViewModel({ ...card, expandCollapseEnabled: true, defaultExpanded: false }).expanded, false);

const document = createBlankDashboardDocument("form-card-contract");
document.layout.dsl.children.push(form);
const secondCard = { ...card, widgetId: "outer-2", widgetName: "Outer2",
  children: [{ ...card.children[0], parentId: "outer-2" }] };
document.layout.dsl.children.push(secondCard);
assert.equal(parseDashboardDocument(document).layout.dsl.children.length, 3);
assert.throws(() => createFormWidgetBlueprint({ ...base(), childIds: {
  canvas: "same", title: "same", submit: "submit", reset: "reset",
}, childNames: {
  canvas: "Canvas", title: "Title", submit: "Submit", reset: "Reset",
} }), /unique/);

function markup(element) {
  const sheet = new ServerStyleSheet();
  try {
    return renderToStaticMarkup(sheet.collectStyles(element));
  } finally { sheet.seal(); }
}
const formMarkup = markup(React.createElement(NativeFormView, {
  widget: form, themeBorderRadius: "5px", themeBoxShadow: "none",
}, React.createElement("div", { "data-form-canvas": true }, "Form body")));
assert.match(formMarkup, /native-container-form-canvas|native-container-outer-1/);
assert.match(formMarkup, /Form body/);

const cardMarkup = markup(React.createElement(NativeCardView, {
  widget: card, themePrimaryColor: "#126e9a", themeBorderRadius: "5px",
}, React.createElement("div", { "data-card-content": true }, "Card body")));
assert.match(cardMarkup, /data-native-widget="card"/);
assert.match(cardMarkup, /data-card-zone="header"/);
assert.match(cardMarkup, /data-card-zone="body"/);
assert.match(cardMarkup, /data-card-zone="footer"/);
assert.match(cardMarkup, /Action 1/);
assert.match(cardMarkup, /Card body/);
assert.doesNotMatch(cardMarkup, /data-card-zone="media"/);

console.log("Form and Card Fixed contracts passed");
