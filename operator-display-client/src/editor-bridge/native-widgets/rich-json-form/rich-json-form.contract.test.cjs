const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename, compilerOptions: { esModuleInterop: true,
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  mod._compile(output, filename);
};

const model = require(path.join(__dirname, "jsonFormModel.ts"));
const rich = require(path.join(__dirname, "richTextModel.ts"));
const { RICH_JSON_PROPERTY_CONTROLS } = require(path.join(__dirname, "propertyConfig.ts"));

assert.equal(rich.RICH_TEXT_DEFAULTS.rows, 20);
assert.equal(rich.RICH_TEXT_DEFAULTS.columns, 24);
assert.deepEqual(rich.RICH_TEXT_DEFAULT_PROPERTIES, { text: "defaultText" });
assert.match(rich.richTextEditorValue("**bold**", "markdown"), /<strong>bold<\/strong>/);
assert.equal(rich.richTextIsValid("", true), false);
assert.equal(rich.richTextIsValid("", false), true);

const source = { "full name": "Ada", age: 31, active: true,
  address: { city: "London" }, awards: [{ title: "Fellow" }] };
assert.deepEqual(model.parseJsonFormSourceData(JSON.stringify(source)), source);
assert.equal(model.parseJsonFormSourceData("[1,2]"), undefined);
assert.equal(model.sanitizeJsonFormKey("föö", ["xn__f_1gaa"]), "xn__f_1gaa1");
assert.equal(model.jsonFormFieldTypeFor("ada@example.org"), "Email Input");
assert.equal(model.jsonFormFieldTypeFor("2025-06-15"), "Datepicker");
assert.equal(model.jsonFormFieldTypeFor(["A", "B"]), "Multiselect");
assert.equal(model.jsonFormFieldTypeFor([{ title: "Fellow" }]), "Array");
assert.equal(model.countJsonFormFields(source), 7);
const schema = model.generateJsonFormSchema(source);
const root = schema[model.ROOT_SCHEMA_KEY];
assert.equal(root.fieldType, "Object");
assert.equal(root.children.full_name.originalIdentifier, "full name");
assert.equal(root.children.awards.children[model.ARRAY_ITEM_KEY].children.title.fieldType,
  "Text Input");
assert.deepEqual(model.formDefaultsFromSchema(root, source), {
  full_name: "Ada", age: 31, active: true,
  address: { city: "London" }, awards: [{ title: "Fellow" }],
});
root.children.full_name.accessor = "personName";
root.children.full_name.isRequired = true;
root.children.active.isVisible = false;
const regenerated = model.generateJsonFormSchema({ ...source, age: 32 }, schema);
assert.equal(regenerated[model.ROOT_SCHEMA_KEY].children.full_name.accessor, "personName");
assert.equal(regenerated[model.ROOT_SCHEMA_KEY].children.full_name.isRequired, true);
assert.equal(regenerated[model.ROOT_SCHEMA_KEY].children.age.sourceData, 32);
assert.equal(model.jsonFormValid(root, { full_name: "", age: 31 }), false);
assert.equal(model.fieldStateFromSchema(root, { full_name: "", age: 31 }).personName.isValid,
  false);
assert.deepEqual(model.formDataFromSchema(root, {
  full_name: "Grace", age: 32, active: false,
  address: { city: "Paris" }, awards: [{ title: "Doctor" }],
}, source, false), {
  personName: "Grace", age: 32, address: { city: "Paris" },
  awards: [{ title: "Doctor" }],
});
assert.equal(RICH_JSON_PROPERTY_CONTROLS.JSON_FORM_WIDGET.content[0].sectionName, "Data");
assert.equal(RICH_JSON_PROPERTY_CONTROLS.RICH_TEXT_EDITOR_WIDGET.content[0].sectionName, "Data");
console.log("Rich Text defaults and JSON Form source/schema/meta contract passed");
