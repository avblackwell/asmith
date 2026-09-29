const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename, compilerOptions: {
      esModuleInterop: true, module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  mod._compile(output, filename);
};

const { MENU_TREE_DEFAULTS, MENU_TREE_DIMENSIONS, MENU_TREE_DEFAULT_PROPERTY_MAP,
  visibleMenuItems, treeOptions, flattenTreeOptions, selectedTree,
} = require(path.join(__dirname, "menuTreeModel.ts"));
const { MENU_TREE_PROPERTY_CONTROLS } = require(path.join(__dirname, "propertyConfig.ts"));

assert.deepEqual(MENU_TREE_DIMENSIONS, {
  MENU_BUTTON_WIDGET: { rows: 4, columns: 16 },
  SINGLE_SELECT_TREE_WIDGET: { rows: 7, columns: 20 },
  MULTI_SELECT_TREE_WIDGET: { rows: 7, columns: 20 },
});
assert.equal(MENU_TREE_DEFAULTS.MENU_BUTTON_WIDGET.label, "Open Menu");
assert.equal(MENU_TREE_DEFAULTS.SINGLE_SELECT_TREE_WIDGET.defaultOptionValue, "BLUE");
assert.deepEqual(MENU_TREE_DEFAULTS.MULTI_SELECT_TREE_WIDGET.defaultOptionValue, ["GREEN"]);
assert.deepEqual(MENU_TREE_DEFAULT_PROPERTY_MAP.SINGLE_SELECT_TREE_WIDGET,
  { selectedOption: "defaultOptionValue", selectedLabel: "defaultOptionValue" });

const menu = { type: "MENU_BUTTON_WIDGET", ...MENU_TREE_DEFAULTS.MENU_BUTTON_WIDGET };
assert.deepEqual(visibleMenuItems(menu).map((item) => item.label),
  ["First Menu Item", "Second Menu Item", "Third Menu Item"]);
assert.deepEqual(visibleMenuItems({ ...menu, menuItems: {
  c: { id: "c", label: "Third", index: 3, isVisible: true },
  b: { id: "b", label: "Hidden", index: 2, isVisible: false },
  a: { id: "a", label: "First", index: 1, isVisible: true },
} }).map((item) => item.label), ["First", "Third"]);
assert.deepEqual(visibleMenuItems({ ...menu, menuItemsSource: "DYNAMIC",
  sourceData: [{ name: "Alpha" }, { name: "Beta" }],
  configureMenuItems: { config: {
    label: ["Alpha", "Beta"], isVisible: [true, false], isDisabled: false,
    onClick: "{{Action.run()}}",
  } },
}).map((item) => item.label), ["Alpha"]);
assert.deepEqual(visibleMenuItems({ ...menu, menuItemsSource: "DYNAMIC",
  sourceData: [{ name: "Alpha" }], configureMenuItems: undefined,
}), []);

const single = { type: "SINGLE_SELECT_TREE_WIDGET", ...MENU_TREE_DEFAULTS.SINGLE_SELECT_TREE_WIDGET };
assert.equal(treeOptions(single).length, 3);
assert.equal(flattenTreeOptions(treeOptions(single)).length, 5);
assert.deepEqual(selectedTree(single).value, "BLUE");
assert.deepEqual(selectedTree(single).label, "Blue");
assert.equal(selectedTree({ ...single, defaultOptionValue: "MISSING", isRequired: true }).isValid, false);
assert.equal(selectedTree(single, { selectedOption: "DARK BLUE" }).label, "Dark Blue");
assert.equal(selectedTree({ ...single, options: "bad" }).value, "");

const multi = { type: "MULTI_SELECT_TREE_WIDGET", ...MENU_TREE_DEFAULTS.MULTI_SELECT_TREE_WIDGET };
assert.deepEqual(selectedTree(multi).value, ["GREEN"]);
assert.deepEqual(selectedTree(multi, { selectedOptionValueArr: ["RED", "MISSING", "DARK BLUE"] }).value,
  ["RED", "DARK BLUE"]);
assert.deepEqual(selectedTree(multi, { selectedOptionValueArr: ["RED", "DARK BLUE"] }).label,
  ["Red", "Dark Blue"]);
assert.equal(selectedTree({ ...multi, isRequired: true }, { selectedOptionValueArr: [] }).isValid, false);

for (const type of Object.keys(MENU_TREE_DIMENSIONS)) {
  assert.ok(MENU_TREE_PROPERTY_CONTROLS[type].content.length > 0);
  assert.ok(MENU_TREE_PROPERTY_CONTROLS[type].style.length > 0);
}
console.log("Menu button and tree widget Fixed defaults, item/selection derivations, meta, and property controls passed");
