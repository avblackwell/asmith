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
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  mod._compile(output, filename);
}
require.extensions[".ts"] = loadTypeScript;
require.extensions[".tsx"] = loadTypeScript;

const {
  NativeContainerView,
  NativeTextView,
  OverflowTypes,
  addHttpIfMissing,
  fontSizeUtility,
} = require(path.join(__dirname, "index.ts"));
const { LinkFilter } = require(path.join(__dirname, "LinkFilter.ts"));

assert.equal(fontSizeUtility("HEADING1"), "1.5rem");
assert.equal(fontSizeUtility("PARAGRAPH2"), "0.75rem");
assert.equal(fontSizeUtility("1.875rem"), "1.875rem");
assert.equal(addHttpIfMissing("example.com"), "http://example.com");
assert.equal(addHttpIfMissing("mailto:person@example.com"), "mailto:person@example.com");
assert.equal(new LinkFilter().attribute("href", "plant.example"), "http://plant.example");
assert.equal(new LinkFilter().attribute("title", "unchanged"), "unchanged");

const sheet = new ServerStyleSheet();
const markup = renderToStaticMarkup(sheet.collectStyles(React.createElement(
  NativeContainerView,
  {
    widgetId: "container-1",
    backgroundColor: "#f3f4f5",
    borderColor: "#7a7b7c",
    borderWidth: 1,
    shouldScrollContents: true,
    layoutSystemType: "FIXED",
  },
  React.createElement(NativeTextView, {
    widgetId: "text-1",
    text: '<strong>Motor speed</strong> <a href="plant.example">details</a>',
    fontSize: "HEADING2",
    fontStyle: "BOLD",
    overflow: OverflowTypes.SCROLL,
    textColor: "#123456",
  }),
)));
const styles = sheet.getStyleTags();
sheet.seal();

assert.match(markup, /container-wrapper-container-1/);
assert.match(markup, /appsmith_widget_container-1/);
assert.match(markup, /native-text-text-1/);
assert.match(styles, /1\.125rem/);
assert.match(styles, /#123456/);
assert.match(styles, /overflow-y:auto/);

console.log("Text and Container read-only renderer contract passed");
