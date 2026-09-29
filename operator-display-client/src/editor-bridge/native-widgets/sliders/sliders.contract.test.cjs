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
      esModuleInterop: true, jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  mod._compile(output, filename);
}
require.extensions[".ts"] = loadTypeScript;
require.extensions[".tsx"] = loadTypeScript;

const {
  RATE_DEFAULTS, NUMBER_SLIDER_DEFAULTS, RANGE_SLIDER_DEFAULTS, CATEGORY_SLIDER_DEFAULTS,
  NativeRateView, NativeNumberSliderView, NativeRangeSliderView, NativeCategorySliderView,
  getPosition, getChangeValue, setRangedValue, getCategorySliderOptions,
} = require(path.join(__dirname, "index.ts"));

assert.deepEqual([RATE_DEFAULTS.columns, RATE_DEFAULTS.rows, RATE_DEFAULTS.defaultRate, RATE_DEFAULTS.maxCount], [20, 4, 3, 5]);
assert.deepEqual([NUMBER_SLIDER_DEFAULTS.columns, NUMBER_SLIDER_DEFAULTS.rows, NUMBER_SLIDER_DEFAULTS.defaultValue], [40, 8, 10]);
assert.deepEqual([RANGE_SLIDER_DEFAULTS.defaultStartValue, RANGE_SLIDER_DEFAULTS.defaultEndValue, RANGE_SLIDER_DEFAULTS.minRange], [10, 100, 5]);
assert.deepEqual([CATEGORY_SLIDER_DEFAULTS.defaultOptionValue, CATEGORY_SLIDER_DEFAULTS.options.length], ["md", 5]);

assert.equal(getPosition({ value: 25, min: 0, max: 100 }), 25);
assert.equal(getPosition({ value: 125, min: 0, max: 100 }), 100);
assert.equal(getChangeValue({ value: 0.63, min: 10, max: 110, step: 5 }), 75);
assert.equal(getChangeValue({ value: 50, min: 0, max: 100, step: 10, containerWidth: 100 }), 50);
assert.deepEqual(setRangedValue([10, 30], 28, 0, 0, 100, 5), [28, 33]);
assert.deepEqual(setRangedValue([10, 30], 12, 1, 0, 100, 5), [7, 12]);
assert.deepEqual(getCategorySliderOptions([{ label: "a", value: "a" }, { label: "b", value: "b" }, { label: "c", value: "c" }]), {
  stepSize: 33,
  sliderOptions: [
    { value: 33, label: "a", optionValue: "a" },
    { value: 66, label: "b", optionValue: "b" },
    { value: 99, label: "c", optionValue: "c" },
  ],
});

const rate = renderToStaticMarkup(React.createElement(NativeRateView, { widgetId: "rate-1" }));
assert.match(rate, /data-native-widget="rate"/);
assert.match(rate, /data-meta-rate="3"/);
assert.equal((rate.match(/data-star-index=/g) || []).length, 5);
assert.match(rate, /M10 0l3\.1 6\.6/);
const manyStars = renderToStaticMarkup(React.createElement(NativeRateView, { maxCount: 105 }));
assert.equal((manyStars.match(/data-star-index=/g) || []).length, 105);

const number = renderToStaticMarkup(React.createElement(NativeNumberSliderView, {}));
assert.match(number, /data-native-widget="number-slider"/);
assert.match(number, /data-meta-value="10"/);
assert.equal((number.match(/data-slider-mark=/g) || []).length, 3);
assert.equal((number.match(/data-testid="slider-thumb"/g) || []).length, 1);

const range = renderToStaticMarkup(React.createElement(NativeRangeSliderView, {}));
assert.match(range, /data-meta-start="10"/);
assert.match(range, /data-meta-end="100"/);
assert.equal((range.match(/data-testid="slider-thumb"/g) || []).length, 2);

const category = renderToStaticMarkup(React.createElement(NativeCategorySliderView, {}));
assert.match(category, /data-meta-value="md"/);
assert.equal((category.match(/data-slider-mark=/g) || []).length, 5);

console.log("Rate and Slider source defaults, transforms, and renderer contracts passed");
