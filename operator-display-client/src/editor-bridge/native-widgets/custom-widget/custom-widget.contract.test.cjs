const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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

const model = require(path.join(__dirname, "customWidgetModel.ts"));
const property = require(path.join(__dirname, "propertyConfig.ts"));
const { compileSrcDoc } = require(path.join(__dirname, "compileSrcDoc.ts"));
const builder = require(path.join(__dirname, "builderModel.ts"));
const defaults = model.customWidgetDefaults();

assert.equal(defaults.widgetName, "Custom");
assert.deepEqual([defaults.rows, defaults.columns, defaults.version], [30, 23, 1]);
assert.deepEqual(defaults.events, ["onResetClick"]);
assert.equal(defaults.dynamicHeight, "FIXED");
assert.equal(defaults.defaultModel, model.DEFAULT_MODEL);
assert.equal(defaults.srcDoc.html.includes('id="root"'), true);
assert.equal(defaults.srcDoc.js.includes("appsmith.onReady"), true);
assert.equal(defaults.uncompiledSrcDoc.js.includes("appsmith.onReady"), true);
assert.deepEqual(model.CUSTOM_WIDGET_DEFAULT_PROPERTIES, { model: "defaultModel" });

const widget = { defaultModel: '{"value":10}', model: undefined };
assert.deepEqual(model.resolveCustomModel(widget), { value: 10 });
assert.deepEqual(model.resolveCustomModel(widget, { model: { value: 11 } }), { value: 11 });
assert.deepEqual(model.resolveCustomModel({ defaultModel: "{{broken}}" }), {});
assert.deepEqual(model.resolveCustomSrcDoc({ html: "<p>x</p>", css: "", js: "" }),
  { html: "<p>x</p>", css: "", js: "" });
assert.deepEqual(model.resolveCustomSrcDoc({ html: 4, css: null, js: false }),
  { html: "", css: "", js: "" });

const compiled = compileSrcDoc({
  html: '<div id="root"></div>',
  css: "$color: #123456; .app { color: $color; }",
  js: 'appsmith.onReady(() => { const node = <strong>Hello</strong>; });',
});
assert.deepEqual(compiled.errors, []);
assert.match(compiled.code.css, /#123456/);
assert.match(compiled.code.js, /React\.createElement/);
assert.deepEqual(compiled.warnings, []);
assert.equal(compileSrcDoc({ html: "", css: "", js: "const value = 1;" }).warnings.length, 1);
assert.equal(compileSrcDoc({ html: "", css: "", js: "const = ;" }).errors.length, 1);

assert.equal(property.CUSTOM_WIDGET_PROPERTY_CONTROLS.content.some((section) =>
  section.children.some((control) => control.propertyName === "defaultModel")), true);
assert.equal(property.CUSTOM_WIDGET_PROPERTY_CONTROLS.style.some((section) =>
  section.children.some((control) => control.propertyName === "backgroundColor")), true);

const eventWidget = {
  events: ["onResetClick"], onResetClick: "{{showAlert('reset')}}",
  dynamicTriggerPathList: [{ key: "onResetClick" }],
};
assert.equal(builder.sanitizeEventName("on sensor alert"), "on_sensor_alert");
assert.equal(builder.eventNameError(eventWidget, "onResetClick"), "duplicate");
assert.equal(builder.eventNameError(eventWidget, "srcDoc"), "restricted");
assert.equal(builder.eventNameError(eventWidget, ""), "empty");
assert.deepEqual(builder.addEventPatch(eventWidget, "on sensor alert"),
  { events: ["onResetClick", "on_sensor_alert"] });
assert.equal(builder.addEventPatch(eventWidget, "srcDoc"), null);
assert.deepEqual(builder.renameEventPatch(eventWidget, "onResetClick", "on changed"), {
  modify: { events: ["on_changed"] }, triggerPaths: ["on_changed"],
});
assert.deepEqual(builder.deleteEventPatch(eventWidget, "onResetClick"), { events: [] });
assert.deepEqual(builder.eventReferences(eventWidget),
  { onResetClick: "{{showAlert('reset')}}" });
const compiledPatch = builder.sourceUpdatePatch({ html: "<p>Hi</p>", css: "p { color: blue; }",
  js: "appsmith.onReady(() => {});" });
assert.equal(compiledPatch.patch.uncompiledSrcDoc.html, "<p>Hi</p>");
assert.match(compiledPatch.patch.srcDoc.css, /color: blue/);
assert.equal(builder.CUSTOM_WIDGET_BUILDER_EVENTS.UPDATE_SRCDOC, "UPDATE_SRCDOC");

console.log("Custom widget defaults, model, compiler, events, and property controls passed");
