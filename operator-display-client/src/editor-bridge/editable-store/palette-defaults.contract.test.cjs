/* Run from operator-display-client: node src/editor-bridge/editable-store/palette-defaults.contract.test.cjs */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const appsmithRoot = path.resolve(__dirname, "../../../../app/client/src");
const localRoot = path.resolve(__dirname, "../..");

function parse(relativePath, root = localRoot) {
  const fileName = path.join(root, relativePath);
  return ts.createSourceFile(fileName, fs.readFileSync(fileName, "utf8"),
    ts.ScriptTarget.Latest, true);
}

function property(object, name) {
  assert.ok(ts.isObjectLiteralExpression(object), `${name}: expected object`);
  return object.properties.find((entry) =>
    ts.isPropertyAssignment(entry) && entry.name.getText(object.getSourceFile()) === name);
}

function literalNumber(node, label) {
  assert.ok(node && ts.isNumericLiteral(node), `${label}: expected numeric literal`);
  return Number(node.text);
}

function literalString(node, label) {
  assert.ok(node && ts.isStringLiteral(node), `${label}: expected string literal`);
  return node.text;
}

function variable(source, name) {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(source) === name) return declaration.initializer;
    }
  }
  assert.fail(`${source.fileName}: ${name} not found`);
}

function appsmithFixedCards() {
  const source = parse("pages/Editor/WidgetSidebar/tests/UIEntitySidebar.fixture.ts", appsmithRoot);
  const cards = variable(source, "cards");
  assert.ok(ts.isArrayLiteralExpression(cards), "Appsmith Fixed sidebar fixture has cards");
  const sizes = new Map();
  for (const card of cards.elements) {
    if (!ts.isObjectLiteralExpression(card)) continue;
    const type = property(card, "type")?.initializer;
    if (!type || !ts.isStringLiteral(type) || type.text === "BUILDING_BLOCK") continue;
    sizes.set(type.text, {
      width: literalNumber(property(card, "columns")?.initializer, `${type.text} columns`),
      height: literalNumber(property(card, "rows")?.initializer, `${type.text} rows`),
    });
  }
  return sizes;
}

function appsmithAutoHeightPaletteTypes() {
  const source = parse("pages/Editor/WidgetSidebar/tests/UIEntitySidebar.fixture.ts", appsmithRoot);
  const cards = variable(source, "cards");
  const types = [];
  for (const card of cards.elements) {
    if (!ts.isObjectLiteralExpression(card)) continue;
    const type = property(card, "type")?.initializer;
    if (!type || !ts.isStringLiteral(type) || type.text === "BUILDING_BLOCK") continue;
    if (property(card, "isDynamicHeight")?.initializer.kind === ts.SyntaxKind.TrueKeyword) {
      types.push(type.text);
    }
  }
  // Current Card source has an active feature with WidgetFeatures' Auto default.
  return [...types, "CARD_WIDGET"].sort();
}

function localAutoHeightPaletteTypes() {
  const source = parse("editor-bridge/editable-canvas/EditableCanvas.tsx");
  const value = variable(source, "AUTO_HEIGHT_PALETTE_TYPES");
  assert.ok(ts.isNewExpression(value), "local Auto Height palette uses a Set");
  const members = value.arguments?.[0];
  assert.ok(ts.isArrayLiteralExpression(members), "Auto Height palette Set has literals");
  return members.elements.map((node) => literalString(node, "Auto Height palette type")).sort();
}

function cardSourceSize() {
  // Card was added to the checked-in widget source after the sidebar test fixture.
  const source = parse("widgets/CardWidget/widget/index.tsx", appsmithRoot);
  const cardClass = source.statements.find((statement) =>
    ts.isClassDeclaration(statement) && statement.name?.text === "CardWidget");
  assert.ok(cardClass, "Appsmith CardWidget class exists");
  const defaults = cardClass.members.find((member) =>
    ts.isMethodDeclaration(member) && member.name.getText(source) === "getDefaults");
  assert.ok(defaults, "Appsmith CardWidget.getDefaults exists");
  const returnStatement = defaults.body.statements.find(ts.isReturnStatement);
  const object = returnStatement?.expression;
  return {
    width: literalNumber(property(object, "columns")?.initializer, "CardWidget columns"),
    height: literalNumber(property(object, "rows")?.initializer, "CardWidget rows"),
  };
}

function localDimensions() {
  const source = parse("editor-bridge/editable-store/editDocument.ts");
  const dimensions = variable(source, "DIMENSIONS");
  assert.ok(ts.isObjectLiteralExpression(dimensions), "local DIMENSIONS map exists");
  return new Map(dimensions.properties.map((entry) => {
    assert.ok(ts.isPropertyAssignment(entry), "DIMENSIONS has ordinary entries");
    const type = entry.name.getText(source);
    return [type, {
      width: literalNumber(property(entry.initializer, "width")?.initializer, `${type} width`),
      height: literalNumber(property(entry.initializer, "height")?.initializer, `${type} height`),
    }];
  }));
}

function localAddableTypes() {
  const source = parse("editor-bridge/editable-store/editDocument.ts");
  const alias = source.statements.find((statement) =>
    ts.isTypeAliasDeclaration(statement) && statement.name.text === "AddableWidgetType");
  assert.ok(alias && ts.isUnionTypeNode(alias.type), "AddableWidgetType union exists");
  return new Set(alias.type.types.map((type) => {
    assert.ok(ts.isLiteralTypeNode(type), "AddableWidgetType uses literal types");
    return literalString(type.literal, "AddableWidgetType member");
  }));
}

function localPalette() {
  const source = parse("features/workbench/WorkbenchPage.tsx");
  const declared = variable(source, "PALETTE_GROUPS");
  const groups = ts.isAsExpression(declared) ? declared.expression : declared;
  assert.ok(ts.isArrayLiteralExpression(groups), "PALETTE_GROUPS array exists");
  const types = [];
  for (const group of groups.elements) {
    const widgets = property(group, "widgets")?.initializer;
    assert.ok(ts.isArrayLiteralExpression(widgets), "palette group has widgets");
    for (const widget of widgets.elements) {
      types.push(literalString(property(widget, "type")?.initializer,
        "palette widget type"));
    }
  }
  const thumbnailMap = variable(source, "PALETTE_THUMBNAILS");
  assert.ok(ts.isObjectLiteralExpression(thumbnailMap), "PALETTE_THUMBNAILS map exists");
  const thumbnails = thumbnailMap.properties.map((entry) => entry.name.getText(source));
  return { types, thumbnails };
}

function localPropertyRegistry() {
  const source = parse("editor-bridge/property-controls/config/index.ts");
  const registry = variable(source, "PROPERTY_CONTROLS");
  assert.ok(ts.isObjectLiteralExpression(registry), "PROPERTY_CONTROLS map exists");
  return registry.properties.map((entry) => entry.name.getText(source));
}

const expected = appsmithFixedCards();
expected.set("CARD_WIDGET", cardSourceSize());
const actual = localDimensions();
const addable = localAddableTypes();
const palette = localPalette();

assert.deepEqual([...actual.keys()].sort(), [...expected.keys()].sort(),
  "local Fixed palette dimensions cover Appsmith's source types");
assert.deepEqual([...addable].sort(), [...expected.keys()].sort(),
  "local add command accepts every Fixed palette widget");
assert.deepEqual(palette.types.sort(), [...expected.keys()].sort(),
  "workbench palette exposes every Fixed widget once");
assert.deepEqual(palette.thumbnails.sort(), [...expected.keys()].sort(),
  "workbench palette has every Fixed widget thumbnail");
assert.deepEqual(localPropertyRegistry().sort(), [...expected.keys()].sort(),
  "property pane registers every Fixed widget");
assert.deepEqual(localAutoHeightPaletteTypes(), appsmithAutoHeightPaletteTypes(),
  "Fixed palette drag identifies each Appsmith default Auto Height widget");
for (const [type, size] of expected) {
  assert.deepEqual(actual.get(type), size, `${type} matches Appsmith Fixed size`);
}
console.log(`Fixed palette defaults match Appsmith: ${expected.size} widgets`);
