const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function loadTypeScript(mod, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      esModuleInterop: true, jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  mod._compile(output, filename);
}
require.extensions[".ts"] = loadTypeScript;
require.extensions[".tsx"] = loadTypeScript;

const model = require(path.join(__dirname, "specialInputsModel.ts"));
const controls = require(path.join(__dirname, "propertyConfig.ts"));
const phone = model.specialInputDefaults("PHONE_INPUT_WIDGET");
const currency = model.specialInputDefaults("CURRENCY_INPUT_WIDGET");
const date = model.specialInputDefaults("DATE_PICKER_WIDGET2");

assert.deepEqual([phone.rows, phone.columns, phone.defaultDialCode, phone.allowFormatting],
  [7, 20, "+1", true]);
assert.deepEqual([currency.rows, currency.columns, currency.defaultCurrencyCode, currency.decimals],
  [7, 20, "INR", 0]);
assert.deepEqual([date.rows, date.columns, date.dateFormat, date.timePrecision, date.version],
  [7, 20, "YYYY-MM-DD HH:mm", "minute", 2]);
assert.ok(Math.abs(Date.parse(date.defaultDate) - Date.now()) < 2000);
assert.deepEqual(model.SPECIAL_INPUT_DEFAULT_PROPERTIES, {
  DATE_PICKER_WIDGET2: { value: "defaultDate" },
  PHONE_INPUT_WIDGET: { text: "defaultText", dialCode: "defaultDialCode" },
  CURRENCY_INPUT_WIDGET: { text: "defaultText", currencyCode: "defaultCurrencyCode" },
});

assert.equal(model.countryCodeForDialCode("+1"), "US");
assert.equal(model.phoneDisplayText("2025550123", "+1", true), "(202) 555-0123");
assert.deepEqual(model.nextPhoneText("2025550123", "", "+1", true), {
  text: "(202) 555-0123", value: "2025550123", isDirty: true,
});
assert.deepEqual(model.nextPhoneText("(202) 555-012", "(202) 555-0123", "+1", true), {
  text: "(202) 555-012", value: "202555012", isDirty: true,
});
assert.equal(model.countryCodeForDialCode("+91"), "IN");
assert.equal(model.currencyOption("INR").symbol_native, "₹");
assert.equal(model.currencyOption("invalid").currency, "INR");

assert.equal(model.limitDecimalValue(2, "1,234.567", "en-US"), "1234.56");
assert.equal(model.parseLocaleCurrency("1,234.56", "en-US"), 1234.56);
assert.equal(model.formatCurrencyNumber(2, "1234.56", "en-US"), "1,234.56");
assert.deepEqual(model.nextCurrencyText("12.345", 2, "en-US"), {
  text: "12.34", isDirty: true,
});
assert.equal(model.limitDecimalValue(1, "1 234,56", "fr-FR"), "1234,5");
assert.equal(model.parseLocaleCurrency("1 234,5", "fr-FR"), 1234.5);

assert.equal(model.dateValueInRange("2025-01-01T16:00:00.000Z",
  "2025-01-01T12:00:00.000Z", "2025-01-01T17:00:00.000Z"), true);
assert.equal(model.dateValueInRange("2025-01-04T16:00:00.000Z",
  "2025-01-01T12:00:00.000Z", "2025-01-02T13:00:00.000Z"), false);
assert.equal(model.dateValueInRange("", date.minDate, date.maxDate), true);
assert.equal(model.dateInitialMonth("2025-06-15T12:00:00.000Z",
  "2025-01-01T00:00:00.000Z", "2025-12-31T23:59:59.000Z").toISOString(),
"2025-06-15T12:00:00.000Z");
assert.equal(model.dateInitialMonth("2026-06-15T12:00:00.000Z",
  "2025-01-01T00:00:00.000Z", "2025-12-31T23:59:59.000Z").toISOString(),
"2025-01-01T00:00:00.000Z");
assert.ok(model.DATE_FORMAT_OPTIONS.includes("DD/MM/YYYY"));

for (const type of Object.keys(controls.SPECIAL_INPUT_PROPERTY_CONTROLS)) {
  const config = controls.SPECIAL_INPUT_PROPERTY_CONTROLS[type];
  assert.equal(config.content.some((section) => section.sectionName === "Label"), true);
  assert.equal(config.style.some((section) => section.sectionName === "Border and shadow"), true);
}
assert.equal(controls.SPECIAL_INPUT_PROPERTY_CONTROLS.DATE_PICKER_WIDGET2.content[0]
  .children.some((control) => control.propertyName === "timePrecision"), true);
assert.equal(controls.SPECIAL_INPUT_PROPERTY_CONTROLS.PHONE_INPUT_WIDGET.content[0]
  .children.find((control) => control.propertyName === "defaultDialCode").options.length > 200, true);
assert.equal(controls.SPECIAL_INPUT_PROPERTY_CONTROLS.CURRENCY_INPUT_WIDGET.content[0]
  .children.find((control) => control.propertyName === "defaultCurrencyCode").options.length > 100, true);

console.log("Date, phone, and currency source defaults and value transforms passed");
