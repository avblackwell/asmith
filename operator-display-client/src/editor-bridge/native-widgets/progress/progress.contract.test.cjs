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

const { NativeProgressView, normalizeProgressProps } = require(path.join(__dirname, "index.ts"));

function render(props) {
  const sheet = new ServerStyleSheet();
  try {
    const markup = renderToStaticMarkup(sheet.collectStyles(
      React.createElement(NativeProgressView, { widgetId: "progress-1", ...props }),
    ));
    return { markup, styles: sheet.getStyleTags() };
  } finally {
    sheet.seal();
  }
}

assert.deepEqual(
  normalizeProgressProps({ progress: 150, steps: 250, progressType: "invalid", fillColor: "red; background: url(bad)", borderRadius: "1px; color: red" }),
  {
    value: 100,
    type: "linear",
    variant: "determinate",
    steps: 100,
    showResult: false,
    counterClockwise: false,
    fillColor: "#03B365",
    borderRadius: "0px",
    isScaleY: false,
  },
);
assert.equal(normalizeProgressProps({ progress: -8, steps: 0 }).value, 0);
assert.equal(normalizeProgressProps({ progress: Number.NaN }).value, 50);
assert.equal(normalizeProgressProps({ progress: 67, fillColor: "{{appsmith.theme.colors.primaryColor}}", themePrimaryColor: "#553de9" }).fillColor, "#553de9");

const linear = render({ widgetName: "Valve opening", progress: 67, showResult: true, fillColor: "#123abc" });
assert.match(linear.markup, /data-testid="native-progress-progress-1"/);
assert.match(linear.markup, /data-progress-type="linear"/);
assert.match(linear.markup, /role="progressbar"/);
assert.match(linear.markup, /aria-label="Valve opening"/);
assert.match(linear.markup, /aria-valuenow="67"/);
assert.match(linear.markup, />67%<\/div>/);
assert.match(linear.styles, /#123abc/);
assert.match(linear.styles, /width:67%/);

const stepped = render({ progress: 25, steps: 4, showResult: true });
assert.equal((stepped.markup.match(/data-testid="step"/g) || []).length, 4);
assert.match(stepped.styles, /width:100%/);

const circular = render({ progressType: "circular", progress: 75, showResult: true, dimensions: { width: 100, height: 180 } });
assert.match(circular.markup, /data-testid="circular"/);
assert.match(circular.markup, /data-progress-type="circular"/);
assert.match(circular.markup, /data-testid="circular-label"[^>]*>75%<\/text>/);
assert.match(circular.markup, /aria-valuenow="75"/);

const indeterminate = render({ progressType: "circular", isIndeterminate: true, showResult: true });
assert.match(indeterminate.markup, /data-testid="circular"/);
assert.doesNotMatch(indeterminate.markup, /aria-valuenow/);
assert.doesNotMatch(indeterminate.markup, /circular-label/);

const indeterminateLinear = render({ isIndeterminate: true });
assert.match(indeterminateLinear.markup, /data-testid="indeterminate-linear-progress"/);
assert.doesNotMatch(indeterminateLinear.markup, /aria-valuenow/);

console.log("Progress read-only renderer contract passed");
