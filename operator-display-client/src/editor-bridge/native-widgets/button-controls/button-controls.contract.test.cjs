const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { ServerStyleSheet } = require("styled-components");
const ts = require("typescript");

function loadTypeScript(mod, filename) {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText, filename);
}
require.extensions[".ts"] = loadTypeScript;
require.extensions[".tsx"] = loadTypeScript;

const {
  BUTTON_CONTROL_PROPERTY_CONTRACTS,
  NativeButtonControlsView,
  buttonSurface,
  getButtonControlDefaults,
  getVisibleGroupButtons,
  safeButtonColor,
  safeButtonRadius,
  safeButtonShadow,
} = require(path.join(__dirname, "index.ts"));

function render(widget, width = 160, height = 40) {
  const sheet = new ServerStyleSheet();
  try {
    const markup = renderToStaticMarkup(sheet.collectStyles(
      React.createElement(NativeButtonControlsView, { widget, width, height, mode: "editor", themePrimaryColor: "#2255aa" }),
    ));
    return { markup, styles: sheet.getStyleTags() };
  } finally {
    sheet.seal();
  }
}

const textDefaults = getButtonControlDefaults("BUTTON_WIDGET");
assert.equal(textDefaults.text, "Submit");
assert.equal(textDefaults.buttonVariant, "PRIMARY");
assert.equal(textDefaults.placement, "CENTER");
assert.deepEqual([textDefaults.rows, textDefaults.columns, textDefaults.minWidth], [4, 16, 120]);
const iconDefaults = getButtonControlDefaults("ICON_BUTTON_WIDGET");
assert.deepEqual([iconDefaults.iconName, iconDefaults.rows, iconDefaults.columns, iconDefaults.minWidth],
  ["plus", 4, 4, 50]);
const groupDefaults = getButtonControlDefaults("BUTTON_GROUP_WIDGET");
assert.equal(groupDefaults.orientation, "horizontal");
assert.equal(groupDefaults.minWidth, 450);
assert.deepEqual(getVisibleGroupButtons({ widgetId: "group", type: "BUTTON_GROUP_WIDGET", ...groupDefaults })
  .map((button) => [button.id, button.label, button.buttonType]), [
    ["groupButton1", "Favorite", "SIMPLE"],
    ["groupButton2", "Add", "SIMPLE"],
    ["groupButton3", "More", "MENU"],
  ]);
const anotherGroup = getButtonControlDefaults("BUTTON_GROUP_WIDGET");
groupDefaults.groupButtons.groupButton1.label = "Edited";
assert.equal(anotherGroup.groupButtons.groupButton1.label, "Favorite");

assert.equal(BUTTON_CONTROL_PROPERTY_CONTRACTS.BUTTON_WIDGET.content
  .find((property) => property.propertyName === "onClick").controlType, "ACTION_SELECTOR");
assert.equal(BUTTON_CONTROL_PROPERTY_CONTRACTS.ICON_BUTTON_WIDGET.style
  .find((property) => property.propertyName === "buttonVariant").defaultValue, "PRIMARY");
assert.equal(BUTTON_CONTROL_PROPERTY_CONTRACTS.BUTTON_GROUP_WIDGET.content
  .find((property) => property.propertyName === "groupButtons.*.menuItems").controlType, "MENU_ITEMS");

const sorted = getVisibleGroupButtons({ widgetId: "group", type: "BUTTON_GROUP_WIDGET", groupButtons: {
  late: { id: "late", index: 5, label: "Late", isVisible: true },
  hidden: { id: "hidden", index: 0, label: "Hidden", isVisible: false },
  early: { id: "early", index: 1, label: "Early", isVisible: true },
} });
assert.deepEqual(sorted.map((item) => item.id), ["early", "late"]);

assert.deepEqual(buttonSurface("PRIMARY", "#2255aa"),
  { background: "#2255aa", foreground: "#fff", border: "none" });
assert.deepEqual(buttonSurface("SECONDARY", "#2255aa"),
  { background: "transparent", foreground: "#2255aa", border: "1px solid #2255aa" });
assert.equal(buttonSurface("PRIMARY", "#ffffff").foreground, "#000");
assert.equal(safeButtonColor("red; background: url(https://bad)", "#2255aa"), "#2255aa");
assert.equal(safeButtonRadius("4px; color: red"), "0px");
assert.equal(safeButtonShadow("0 0 2px red; color: red"), "none");

const text = render({ widgetId: "button-1", type: "BUTTON_WIDGET", text: "Start pump", iconName: "plus",
  buttonVariant: "SECONDARY", iconAlign: "right", placement: "BETWEEN", onClick: "{{Pump.run()}}" });
assert.match(text.markup, /data-testid="native-button-button-1"/);
assert.match(text.markup, /aria-label="Start pump"/);
assert.match(text.markup, /data-action-unavailable="true"/);
assert.match(text.markup, /disabled=""/);
assert.match(text.markup, /data-blueprint-icon="plus"/);
assert.match(text.markup, /justify-content:space-between/);
assert.match(text.markup, /Start pump/);

const icon = render({ widgetId: "icon-1", type: "ICON_BUTTON_WIDGET", iconName: "plus" }, 60, 40);
assert.match(icon.markup, /data-testid="native-icon-button-icon-1"/);
assert.match(icon.markup, /width:32px;height:32px/);
assert.match(icon.markup, /data-blueprint-icon="plus"/);
assert.doesNotMatch(icon.markup, /disabled=""/);

const group = render({ widgetId: "group-1", type: "BUTTON_GROUP_WIDGET", ...anotherGroup });
assert.match(group.markup, /t--buttongroup-widget/);
assert.match(group.markup, /data-blueprint-icon="heart"/);
assert.match(group.markup, /data-blueprint-icon="add"/);
assert.match(group.markup, /data-blueprint-icon="more"/);
assert.ok(group.markup.indexOf("Favorite") < group.markup.indexOf("Add"));
assert.ok(group.markup.indexOf("Add") < group.markup.indexOf("More"));
assert.match(group.markup, /data-group-button-type="MENU"[^>]*disabled=""/);
assert.match(group.styles, /gap:1px/);
assert.match(render({ widgetId: "group-vertical", type: "BUTTON_GROUP_WIDGET", ...anotherGroup,
  orientation: "vertical" }).styles, /flex-direction:column/);

console.log("Button, IconButton, and ButtonGroup presentation contract passed");
