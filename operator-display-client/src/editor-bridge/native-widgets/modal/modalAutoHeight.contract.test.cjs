/* Run from operator-display-client: node src/editor-bridge/native-widgets/modal/modalAutoHeight.contract.test.cjs */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function loadTypeScript(mod, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  mod._compile(output, filename);
}
require.extensions[".ts"] = loadTypeScript;

const { recomputeModalAutoHeight } = require(path.join(__dirname, "modalAutoHeight.ts"));
const { createModalWidgetBlueprint } = require(path.join(__dirname, "modalBlueprint.ts"));
const { createBlankDashboardDocument, parseDashboardDocument } = require(
  path.join(__dirname, "../../../document/index.ts"),
);

const document = createBlankDashboardDocument("modal-height-contract");
const root = document.layout.dsl;
const sibling = root.children[0];
const originalSibling = [sibling.topRow, sibling.bottomRow];
const modal = createModalWidgetBlueprint({
  widgetId: "modal-1",
  widgetName: "Modal1",
  parentId: root.widgetId,
  topRow: 10,
  bottomRow: 34,
  leftColumn: 2,
  rightColumn: 26,
  parentColumnSpace: 19.2,
  parentRowSpace: 10,
  childIds: {
    canvas: "modal-canvas-1", closeIcon: "modal-close-icon-1",
    title: "modal-title-1", closeButton: "modal-close-button-1",
    confirmButton: "modal-confirm-button-1",
  },
  childNames: {
    canvas: "Modal1Canvas", closeIcon: "Modal1CloseIcon",
    title: "Modal1Title", closeButton: "Modal1CloseButton",
    confirmButton: "Modal1ConfirmButton",
  },
});
root.children.push(modal);
const source = JSON.stringify(document);

let result = JSON.parse(recomputeModalAutoHeight(source));
let updated = result.layout.dsl.children.at(-1);
assert.equal(updated.height, 240, "the default Modal remains at its 24-row minimum");
assert.equal(updated.bottomRow, 34);
assert.equal(updated.minHeight, 240);
assert.equal(updated.children[0].minHeight, 240);
assert.equal(recomputeModalAutoHeight(JSON.stringify(result)), JSON.stringify(result),
  "a settled Modal does not rewrite the document");

modal.children[0].children[1].bottomRow = 43;
const growing = recomputeModalAutoHeight(JSON.stringify(document));
result = parseDashboardDocument(JSON.parse(growing));
updated = result.layout.dsl.children.at(-1);
assert.equal(updated.height, 450, "last occupied row plus the two-row canvas extension");
assert.equal(updated.minHeight, 450);
assert.equal(updated.bottomRow, 55, "local DSL bounds retain the nonzero top row");
assert.equal(updated.children[0].bottomRow, 45);
assert.equal(updated.children[0].minHeight, 450);
assert.deepEqual([result.layout.dsl.children[0].topRow,
  result.layout.dsl.children[0].bottomRow], originalSibling,
  "a detached Modal cannot move its root sibling");
assert.equal(result.layout.dsl.bottomRow, root.bottomRow,
  "a detached Modal cannot grow the main canvas");

modal.children[0].children[1].bottomRow = 5;
const shrinkingDocument = JSON.parse(growing);
shrinkingDocument.layout.dsl.children.at(-1).children[0].children[1].bottomRow = 5;
result = JSON.parse(recomputeModalAutoHeight(JSON.stringify(shrinkingDocument)));
updated = result.layout.dsl.children.at(-1);
assert.equal(updated.height, 240, "content shrink returns to the 24-row minimum");

modal.dynamicHeight = "FIXED";
assert.equal(recomputeModalAutoHeight(JSON.stringify(document)), JSON.stringify(document),
  "Fixed Modal dimensions remain authored");

modal.dynamicHeight = "AUTO_HEIGHT_WITH_LIMITS";
modal.maxDynamicHeight = 30;
modal.children[0].children[1].bottomRow = 43;
updated = JSON.parse(recomputeModalAutoHeight(JSON.stringify(document)))
  .layout.dsl.children.at(-1);
assert.equal(updated.height, 300, "automatic height respects the configured maximum");

console.log("Detached Modal auto-height contract passed");
