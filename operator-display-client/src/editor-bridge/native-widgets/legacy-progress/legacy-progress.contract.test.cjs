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

const { LegacyProgressBarView, LegacyCircularProgressView } =
  require(path.join(__dirname, "index.ts"));

function render(Component, props) {
  const sheet = new ServerStyleSheet();
  try {
    const markup = renderToStaticMarkup(sheet.collectStyles(
      React.createElement(Component, { widgetId: "legacy-1", ...props }),
    ));
    return { markup, styles: sheet.getStyleTags() };
  } finally {
    sheet.seal();
  }
}

const bar = render(LegacyProgressBarView, {
  barType: "indeterminate", progress: 50, showResult: false,
  fillColor: "#03B365",
});
assert.match(bar.markup, /t--progressbar-widget/);
assert.match(bar.markup, /data-native-widget="legacy-progress-bar"/);
assert.doesNotMatch(bar.markup, />50%<\/div>/);
assert.match(bar.styles, /width:50%/);

const stepped = render(LegacyProgressBarView, {
  barType: "determinate", progress: 50, steps: 4, showResult: true,
});
assert.equal((stepped.markup.match(/data-testid="(?:0|100)"/g) || []).length, 4);
assert.match(stepped.markup, />50%<\/div>/);

const circle = render(LegacyCircularProgressView, {
  progress: 65, counterClockwise: true, showResult: true,
  fillColor: "#03B365",
});
assert.match(circle.markup, /data-testid="CircularProgressbar"/);
assert.match(circle.markup, /viewBox="0 0 100 100"/);
assert.match(circle.markup, />65%<\/text>/);
assert.match(circle.markup, /stroke-dashoffset:-/);
assert.match(circle.styles, /#03B365/i);

console.log("Retired Appsmith progress widget renderers passed");
