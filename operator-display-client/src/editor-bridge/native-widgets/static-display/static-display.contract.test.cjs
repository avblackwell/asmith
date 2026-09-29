const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
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
  NativeDividerView,
  NativeImageView,
  safeImageSource,
} = require(path.join(__dirname, "index.ts"));

assert.equal(safeImageSource("https://example.test/diagram.png"), "https://example.test/diagram.png");
assert.equal(safeImageSource("/assets/diagram.png"), "/assets/diagram.png");
assert.equal(safeImageSource("./diagram.png"), "./diagram.png");
assert.equal(safeImageSource("/operator_display/asset/diagram.png"), "/operator_display/asset/diagram.png");
assert.equal(safeImageSource("data:image/svg+xml,%3Csvg%3E%3C/svg%3E"), "data:image/svg+xml,%3Csvg%3E%3C/svg%3E");
for (const unsafe of [
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "blob:https://example.test/id",
  "//example.test/diagram.png",
  "{{MissingWidget.image}}",
  "https://",
  "/api" + "/v1/assets/diagram.png",
  "../api" + "/v1/assets/diagram.png",
  "https://read-only-image.invalid/api" + "/v1/assets/diagram.png",
]) {
  assert.equal(safeImageSource(unsafe), undefined, unsafe);
}

const image = renderToStaticMarkup(React.createElement(NativeImageView, {
  widgetName: "Pump diagram",
  image: "https://example.test/pump.png",
  defaultImage: "/assets/default.png",
  objectFit: "auto",
  borderRadius: "8px",
  boxShadow: "0 2px 4px #333",
}));
assert.match(image, /data-native-widget="image"/);
assert.match(image, /alt="Pump diagram"/);
assert.match(image, /src="https:\/\/example\.test\/pump\.png"/);
assert.match(image, /referrerPolicy="no-referrer"/i);
assert.match(image, /object-fit:none/);
assert.match(image, /border-radius:8px/);
assert.doesNotMatch(image, /button|download|onclick/i);

const fallbackImage = renderToStaticMarkup(React.createElement(NativeImageView, {
  widgetName: "Fallback",
  image: "javascript:alert(1)",
  defaultImage: "data:image/png;base64,AAAA",
  objectFit: "contain",
}));
assert.match(fallbackImage, /data-image-source="default"/);
assert.match(fallbackImage, /src="data:image\/png;base64,AAAA"/);
assert.match(fallbackImage, /object-fit:contain/);

const horizontal = renderToStaticMarkup(React.createElement(NativeDividerView, {
  orientation: "horizontal",
  strokeStyle: "dashed",
  dividerColor: "#123456",
  thickness: 3,
  capType: "dot",
  capSide: 0,
}));
assert.match(horizontal, /role="separator"/);
assert.match(horizontal, /aria-orientation="horizontal"/);
assert.match(horizontal, /border-top:3px dashed #123456/);
assert.equal((horizontal.match(/data-cap-position=/g) || []).length, 2);

const vertical = renderToStaticMarkup(React.createElement(NativeDividerView, {
  orientation: "vertical",
  strokeStyle: "dotted",
  dividerColor: "#654321",
  thickness: 2,
  capType: "arrow",
  capSide: 1,
}));
assert.match(vertical, /data-orientation="vertical"/);
assert.match(vertical, /border-right:2px dotted #654321/);
assert.doesNotMatch(vertical, /data-cap-position="start"/);
assert.match(vertical, /data-cap-position="end"/);

console.log("Image and Divider read-only renderer contract passed");
