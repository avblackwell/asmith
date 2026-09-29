/* Run from operator-display-client: node src/editor-bridge/native-widgets/tabs/activeTabAutoHeight.contract.test.cjs */
const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");

async function load() {
  const built = await esbuild.build({
    entryPoints: [path.join(__dirname, "projectActiveTabsAutoHeight.ts")],
    bundle: true, format: "cjs", platform: "node", write: false, logLevel: "silent",
  });
  const mod = { exports: {} };
  new Function("module", "exports", "require", built.outputFiles[0].text)(
    mod, mod.exports, require,
  );
  return mod.exports;
}

function find(widget, id) {
  if (widget.widgetId === id) return widget;
  for (const child of widget.children ?? []) {
    const match = find(child, id);
    if (match) return match;
  }
  return undefined;
}

function canvas(id, parentId, childId, bottomRow) {
  return {
    widgetId: id, widgetName: id, type: "CANVAS_WIDGET", version: 1,
    parentId, topRow: 0, bottomRow: 24,
    leftColumn: 0, rightColumn: 64, detachFromLayout: true,
    children: [{ widgetId: childId, widgetName: childId,
      type: "TEXT_WIDGET", version: 1, parentId: id,
      topRow: 2, bottomRow, leftColumn: 2, rightColumn: 22, text: childId }],
  };
}

function tabs(id, parentId, topRow, bottomRow) {
  return {
    widgetId: id, widgetName: id, type: "TABS_WIDGET", version: 3,
    parentId, topRow, bottomRow, leftColumn: 2, rightColumn: 26,
    dynamicHeight: "AUTO_HEIGHT", minDynamicHeight: 15,
    maxDynamicHeight: 9000, borderWidth: 1, shouldShowTabs: true,
    defaultTab: "Short", tabsObj: {
      short: { id: "short", label: "Short", widgetId: `${id}-short`, index: 0, isVisible: true },
      long: { id: "long", label: "Long", widgetId: `${id}-long`, index: 1, isVisible: true },
    },
    children: [canvas(`${id}-short`, id, `${id}-short-text`, 6),
      canvas(`${id}-long`, id, `${id}-long-text`, 22)],
  };
}

function documentWithChildren(children) {
  return JSON.stringify({
    assetKind: "dashboard", schemaVersion: 1, documentId: "active-height",
    name: "Active height", compatibility: {
      renderer: "appsmith", layoutSystem: "FIXED", widgetDslVersion: 1,
    },
    layout: { dsl: { widgetId: "0", widgetName: "MainContainer",
      type: "CANVAS_WIDGET", version: 1,
      topRow: 0, bottomRow: 380, leftColumn: 0, rightColumn: 1242,
      children } },
    variables: [], bindings: [], componentDependencies: [],
    theme: { kind: "inline", name: "Default", properties: {
      colors: { primaryColor: "#553de9", backgroundColor: "#fff" },
      borderRadius: { appBorderRadius: "0" },
      boxShadow: { appBoxShadow: "none" },
      fontFamily: { appFont: "Inter" },
    } },
  });
}

async function main() {
  const { projectActiveTabsAutoHeight } = await load();
  const source = documentWithChildren([
    tabs("tabs", "0", 10, 38),
    { widgetId: "below", widgetName: "Below", type: "TEXT_WIDGET", version: 1,
      parentId: "0", topRow: 40, bottomRow: 46, leftColumn: 2,
      rightColumn: 22, text: "Below tabs" },
    { widgetId: "side", widgetName: "Side", type: "TEXT_WIDGET", version: 1,
      parentId: "0", topRow: 40, bottomRow: 46, leftColumn: 30,
      rightColumn: 50, text: "Unrelated column" },
  ]);
  const authored = JSON.parse(source);
  const short = projectActiveTabsAutoHeight(source, {});
  assert.equal(short.changed, true);
  assert.equal(find(JSON.parse(short.documentJson).layout.dsl, "tabs").bottomRow, 25,
    "selected short tab uses its own height plus Appsmith's header offset");
  assert.equal(find(JSON.parse(short.documentJson).layout.dsl, "below").topRow, 27,
    "overlapping sibling keeps its two-row gap");
  assert.equal(find(JSON.parse(short.documentJson).layout.dsl, "side").topRow, 40,
    "side-by-side sibling does not reflow");
  assert.deepEqual(JSON.parse(source), authored, "projection does not change authored input");
  assert.equal(find(JSON.parse(short.documentJson).layout.dsl, "tabs-short").bottomRow, 24,
    "authored child canvases stay intact");

  const long = projectActiveTabsAutoHeight(source, { tabs: "tabs-long" });
  assert.equal(long.changed, false);
  assert.equal(long.documentJson, source,
    "unchanged geometry preserves source JSON identity");
  const shortAgain = projectActiveTabsAutoHeight(source, { tabs: "tabs-short" });
  assert.equal(shortAgain.documentJson, short.documentJson,
    "repeated tab projection is deterministic, with no accumulated drift");

  const nestedTabs = tabs("nested-tabs", "inner", 2, 30);
  const nestedSource = documentWithChildren([
    { widgetId: "box", widgetName: "Box", type: "CONTAINER_WIDGET", version: 1,
      parentId: "0", topRow: 10, bottomRow: 60,
      leftColumn: 2, rightColumn: 26, dynamicHeight: "AUTO_HEIGHT",
      minDynamicHeight: 10, maxDynamicHeight: 9000, borderWidth: 1,
      children: [{ widgetId: "inner", widgetName: "Inner",
        type: "CANVAS_WIDGET", version: 1, parentId: "box",
        topRow: 0, bottomRow: 50, leftColumn: 0, rightColumn: 64,
        children: [nestedTabs,
          { widgetId: "inner-below", widgetName: "InnerBelow", type: "TEXT_WIDGET",
            version: 1, parentId: "inner", topRow: 32, bottomRow: 38,
            leftColumn: 2, rightColumn: 22, text: "Within box" }],
      }],
    },
    { widgetId: "root-below", widgetName: "RootBelow", type: "TEXT_WIDGET",
      version: 1, parentId: "0", topRow: 62, bottomRow: 68,
      leftColumn: 2, rightColumn: 22, text: "Below box" },
  ]);
  const nested = projectActiveTabsAutoHeight(nestedSource, {});
  const root = JSON.parse(nested.documentJson).layout.dsl;
  assert.deepEqual([
    find(root, "nested-tabs").bottomRow,
    find(root, "inner-below").topRow,
    find(root, "box").bottomRow,
    find(root, "inner").bottomRow,
    find(root, "root-below").topRow,
  ], [17, 19, 37, 27, 39],
  "selected tab height reflows its siblings, ancestor Container, and root siblings");
  assert.deepEqual(JSON.parse(nestedSource).layout.dsl.children[0].children[0].children[0], nestedTabs,
    "nested authored tab remains unchanged");

  const modalSource = documentWithChildren([
    { widgetId: "modal", widgetName: "Modal", type: "MODAL_WIDGET", version: 2,
      parentId: "0", topRow: 5, bottomRow: 37, leftColumn: 2, rightColumn: 26,
      dynamicHeight: "AUTO_HEIGHT", minDynamicHeight: 24, maxDynamicHeight: 9000,
      detachFromLayout: true, height: 320, minHeight: 320,
      children: [{ widgetId: "modal-canvas", widgetName: "ModalCanvas",
        type: "CANVAS_WIDGET", version: 1, parentId: "modal",
        topRow: 0, bottomRow: 32, minHeight: 320,
        leftColumn: 0, rightColumn: 64,
        children: [tabs("modal-tabs", "modal-canvas", 2, 30)] }],
    },
    { widgetId: "modal-root-sibling", widgetName: "RootSibling",
      type: "TEXT_WIDGET", version: 1, parentId: "0",
      topRow: 10, bottomRow: 16, leftColumn: 2, rightColumn: 22, text: "Static" },
  ]);
  const modalProjection = projectActiveTabsAutoHeight(modalSource, {});
  const modalRoot = JSON.parse(modalProjection.documentJson).layout.dsl;
  assert.equal(find(modalRoot, "modal-tabs").bottomRow, 17);
  assert.equal(find(modalRoot, "modal").height, 240,
    "a short selected tab shrinks the detached Modal panel to its minimum");
  assert.equal(find(modalRoot, "modal-canvas").bottomRow, 24);
  assert.equal(find(modalRoot, "modal-root-sibling").topRow, 10,
    "detached Modal height never reflows root siblings");
  assert.equal(find(JSON.parse(modalSource).layout.dsl, "modal").height, 320,
    "selected-tab Modal height stays a transient projection");

  console.log("Active Tabs auto-height projection contract passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
