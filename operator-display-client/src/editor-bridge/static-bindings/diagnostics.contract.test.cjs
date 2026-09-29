/* Run from operator-display-client: node src/editor-bridge/static-bindings/diagnostics.contract.test.cjs */
const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");

function text(widgetId, widgetName, source, declared = true) {
  return { widgetId, widgetName, type: "TEXT_WIDGET", text: source,
    dynamicBindingPathList: declared ? [{ key: "text" }] : [] };
}

async function main() {
  const built = await esbuild.build({
    entryPoints: [path.join(__dirname, "diagnoseStaticReferenceErrors.ts")],
    bundle: true, format: "cjs", platform: "node", write: false, logLevel: "silent",
  });
  const loaded = { exports: {} };
  new Function("module", "exports", "require", built.outputFiles[0].text)(
    loaded, loaded.exports, require,
  );
  const { diagnoseStaticReferenceErrors } = loaded.exports;

  const widgets = {
    source: text("source", "Source", "hello", false),
    valid: text("valid", "Valid", "{{Source.text}}"),
    missingWidget: text("missingWidget", "MissingWidget", "{{Gone.text}}"),
    missingPath: text("missingPath", "MissingPath", "{{Source.absent}}"),
    multiple: text("multiple", "Multiple", "{{Gone.text}} / {{Source.absent}}"),
    unsupportedJs: text("unsupportedJs", "UnsupportedJs", "{{Gone.text + 1}}"),
    mixedUnsupported: text("mixedUnsupported", "MixedUnsupported",
      "{{Gone.text}} / {{Math.max(1, 2)}}"),
    cyflex: text("cyflex", "Cyflex", "{{EngineSpeed.value}}"),
    reserved: text("reserved", "Reserved", "{{appsmith.theme.colors.primaryColor}}"),
    builtin: text("builtin", "Builtin", "{{Math.PI}}"),
    listCurrentItem: text("listCurrentItem", "ListCurrentItem", "{{currentItem.name}}"),
    listCurrentIndex: text("listCurrentIndex", "ListCurrentIndex", "{{currentIndex.value}}"),
    listCurrentView: text("listCurrentView", "ListCurrentView", "{{currentView.name}}"),
    undeclared: text("undeclared", "Undeclared", "{{Gone.text}}", false),
    unsafe: text("unsafe", "Unsafe", "{{Source.constructor}}"),
    primitiveAccessor: text("primitiveAccessor", "PrimitiveAccessor", "{{Source.text.length}}"),
    a: text("a", "A", "{{B.text}}"),
    b: text("b", "B", "{{A.text}}"),
    chain: text("chain", "Chain", "{{A.text}}"),
    self: text("self", "Self", "{{Self.text}}"),
    firstDuplicate: text("firstDuplicate", "Duplicate", "first", false),
    secondDuplicate: text("secondDuplicate", "Duplicate", "second", false),
    ambiguous: text("ambiguous", "Ambiguous", "{{Duplicate.absent}}"),
  };
  const before = JSON.stringify(widgets);
  const counts = diagnoseStaticReferenceErrors(widgets, {
    externalEntityNames: ["EngineSpeed"],
  });
  assert.deepEqual(counts, {
    missingWidget: 1,
    missingPath: 1,
    multiple: 2,
    a: 1,
    b: 1,
    self: 1,
  });
  assert.equal(counts.chain, undefined,
    "a reference into a cycle is not itself a proven cycle");
  assert.equal(JSON.stringify(widgets), before, "diagnostics never mutate DSL values");

  const nested = {
    chart: { widgetId: "chart", widgetName: "Chart", type: "CHART_WIDGET",
      chartData: { speed: { data: [] } } },
    bound: { widgetId: "bound", widgetName: "Bound", type: "CHART_WIDGET",
      chartData: { mirror: { data: "{{Chart.chartData.missing.data}}" } },
      dynamicBindingPathList: [{ key: "chartData.mirror.data" }] },
  };
  assert.deepEqual(diagnoseStaticReferenceErrors(nested), { bound: 1 });
  nested.arrayAccessor = text("arrayAccessor", "ArrayAccessor",
    "{{Chart.chartData.speed.data.length}}");
  assert.deepEqual(diagnoseStaticReferenceErrors(nested), { bound: 1 },
    "JavaScript array accessors remain outside the proven own-object-path subset");
  const shadowedBuiltin = {
    math: text("math", "Math", "plain", false),
    widget: text("widget", "Widget", "{{Math.absent}}"),
  };
  assert.deepEqual(diagnoseStaticReferenceErrors(shadowedBuiltin), { widget: 1 },
    "an actual widget name takes precedence over a built-in namespace");
  console.log("Restricted static reference diagnostics: pass");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
