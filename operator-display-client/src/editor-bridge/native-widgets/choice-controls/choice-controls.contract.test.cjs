const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020 },
  }).outputText;
  mod._compile(output, filename);
};

const { CHOICE_DEFAULTS, CHOICE_DIMENSIONS, CHOICE_DEFAULT_PROPERTY_MAP,
  sourceOptions, selectedChoice, defaultGroupValues, groupOptions } = require(path.join(__dirname, "choiceModel.ts"));
const { CHOICE_PROPERTY_CONTROLS } = require(path.join(__dirname, "propertyConfig.ts"));

assert.deepEqual(CHOICE_DIMENSIONS, {
  SELECT_WIDGET: { rows: 7, columns: 20 },
  MULTI_SELECT_WIDGET_V2: { rows: 7, columns: 20 },
  CHECKBOX_GROUP_WIDGET: { rows: 6, columns: 23 },
  SWITCH_GROUP_WIDGET: { rows: 6, columns: 26 },
});
assert.equal(CHOICE_DEFAULTS.SELECT_WIDGET.defaultOptionValue, "GREEN");
assert.deepEqual(CHOICE_DEFAULTS.MULTI_SELECT_WIDGET_V2.defaultOptionValue, ["GREEN", "RED"]);
assert.deepEqual(CHOICE_DEFAULTS.CHECKBOX_GROUP_WIDGET.defaultSelectedValues, ["BLUE"]);
assert.deepEqual(CHOICE_DEFAULT_PROPERTY_MAP.SWITCH_GROUP_WIDGET,
  { selectedValuesArray: "defaultSelectedValues" });

const select = { type: "SELECT_WIDGET", sourceData: [
  { name: "Blue", code: "BLUE" }, { name: "Green", code: "GREEN" },
], optionLabel: "name", optionValue: "code", defaultOptionValue: "GREEN" };
assert.deepEqual(sourceOptions(select), [
  { label: "Blue", value: "BLUE" }, { label: "Green", value: "GREEN" },
]);
assert.deepEqual(sourceOptions({ ...select, optionLabel: ["name", "name"] }), [
  { label: "Blue", value: "BLUE" }, { label: "Green", value: "GREEN" },
]);
assert.deepEqual(sourceOptions({ ...select, optionLabel: ["Sky", "Grass"] }), [
  { label: "Sky", value: "BLUE" }, { label: "Grass", value: "GREEN" },
]);
assert.equal(sourceOptions({ ...select, sourceData: "not JSON" }), null);
assert.deepEqual(selectedChoice(select).value, "GREEN");
assert.deepEqual(selectedChoice(select).label, "Green");
assert.equal(selectedChoice({ ...select, defaultOptionValue: "YELLOW" }).value, "");
assert.equal(selectedChoice({ ...select, defaultOptionValue: "YELLOW", serverSideFiltering: true }).value, "");
assert.equal(selectedChoice({ ...select, defaultOptionValue: { label: "Yellow", value: "YELLOW" },
  serverSideFiltering: true }).value, "YELLOW");
assert.equal(selectedChoice({ ...select, serverSideFiltering: true },
  { value: "YELLOW", label: "Yellow", isDirty: true }).label, "Yellow");

const multi = { ...select, type: "MULTI_SELECT_WIDGET_V2",
  defaultOptionValue: ["GREEN", "YELLOW"] };
assert.deepEqual(selectedChoice(multi).values, ["GREEN"]);
assert.deepEqual(selectedChoice(multi, { selectedOptions: [
  { value: "GREEN", label: "Greenish" }, { value: "YELLOW", label: "Yellow" },
], isDirty: true }).labels, ["Green", "Yellow"]);
assert.deepEqual(sourceOptions({ ...multi, optionLabel: ["name", "name"] }, true), [
  { label: "name", value: "BLUE" }, { label: "name", value: "GREEN" },
]);

const group = { type: "CHECKBOX_GROUP_WIDGET", options: [
  { label: "Blue", value: "BLUE" }, { label: "Green", value: "GREEN" },
], defaultSelectedValues: "BLUE,GREEN" };
assert.deepEqual(defaultGroupValues("BLUE,GREEN", true), ["BLUE", "GREEN"]);
assert.deepEqual(selectedChoice(group).values, ["BLUE", "GREEN"]);
assert.deepEqual(selectedChoice({ ...group, defaultSelectedValues: ["BLUE", "MISSING"] }).values, ["BLUE"]);
assert.deepEqual(groupOptions("bad"), null);
assert.deepEqual(selectedChoice({ ...group, type: "SWITCH_GROUP_WIDGET" },
  { selectedValuesArray: ["GREEN", "MISSING"] }).values, ["GREEN"]);

for (const type of Object.keys(CHOICE_DIMENSIONS)) {
  assert.ok(CHOICE_PROPERTY_CONTROLS[type].content.some((section) => section.sectionName === "Data"));
  assert.ok(CHOICE_PROPERTY_CONTROLS[type].style.length > 0);
}
console.log("Choice widget Fixed defaults, derived options/selections, meta names, and properties passed");
