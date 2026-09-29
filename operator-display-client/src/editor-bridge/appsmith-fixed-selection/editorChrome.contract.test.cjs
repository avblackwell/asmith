/* Run from operator-display-client: node src/editor-bridge/appsmith-fixed-selection/editorChrome.contract.test.cjs */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  new Function("module", "exports", "require", compiled.outputText)(
    module, module.exports, require,
  );
  return module.exports;
}

function main() {
  const { sanitizeTabOrder } = load("tabOrder.ts");
  for (const [input, expected] of [[1, 1], ["3", 3], [3.5, undefined],
    [0, undefined], [-2, undefined], ["", undefined], ["abc", undefined],
    [Infinity, undefined], [null, undefined]]) {
    assert.equal(sanitizeTabOrder(input), expected);
  }
  const { outsideCanvasSelectionStart } = load("outsideSelection.ts");
  const bounds = { left: 100, top: 50, width: 500, height: 300 };
  assert.deepEqual(outsideCanvasSelectionStart(40, 10, bounds), { x: 2, y: 2 });
  assert.deepEqual(outsideCanvasSelectionStart(620, 370, bounds),
    { x: 498, y: 298 });
  assert.deepEqual(outsideCanvasSelectionStart(300, 200, bounds),
    { x: 200, y: 150 });
  console.log("Appsmith Fixed editor chrome contract passed");
}

try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
