/* Run from operator-display-client: node src/features/theme-editor/resetWidgetStyles.contract.test.cjs */
const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");

async function load(entry) {
  const built = await esbuild.build({
    entryPoints: [entry], bundle: true, format: "cjs", platform: "node",
    loader: { ".png": "dataurl", ".css": "empty", ".scss": "empty",
      ".less": "empty", ".woff": "dataurl", ".woff2": "dataurl" },
    plugins: [{ name: "svg-stub", setup(build) {
      build.onLoad({ filter: /\.svg$/ }, () => ({
        contents: 'export const ReactComponent = () => null; export default "";',
        loader: "js",
      }));
    } }],
    write: false, logLevel: "silent",
  });
  const module = { exports: {} };
  new Function("module", "exports", "require", built.outputFiles[0].text)(
    module, module.exports, require);
  return module.exports;
}

async function main() {
  const [reset, resolver, documents, editor] = await Promise.all([
    load(path.join(__dirname, "resetWidgetStyles.ts")),
    load(path.join(__dirname, "resolveThemeBinding.ts")),
    load(path.resolve(__dirname, "../../document/index.ts")),
    load(path.resolve(__dirname, "../../editor-bridge/editable-store/index.ts")),
  ]);
  const root = { widgetId: "0", widgetName: "MainContainer", type: "CANVAS_WIDGET", children: [
    { widgetId: "button", widgetName: "Button1", type: "BUTTON_WIDGET",
      buttonColor: "red", borderRadius: "10px", boxShadow: "large", text: "Keep" },
    { widgetId: "group", widgetName: "ButtonGroup1", type: "BUTTON_GROUP_WIDGET",
      borderRadius: "10px", groupButtons: {
        groupButton1: { buttonColor: "pink", label: "Keep" },
      } },
    { widgetId: "table", widgetName: "Table1", type: "TABLE_WIDGET",
      childStylesheet: { button: {
        buttonColor: "{{appsmith.theme.colors.primaryColor}}", boxShadow: "none",
      } }, primaryColumns: { action: { columnType: "button", buttonColor: "pink",
        boxShadow: "large" } } },
    { widgetId: "json", widgetName: "JSONForm1", type: "JSON_FORM_WIDGET",
      borderRadius: "100px", boxShadow: "large",
      submitButtonStyles: { buttonColor: "pink", buttonVariant: "PRIMARY" },
      resetButtonStyles: { buttonColor: "pink", buttonVariant: "SECONDARY" },
      schema: { __root_schema__: { fieldType: "Object", children: {
        name: { fieldType: "Text Input", accentColor: "pink", borderRadius: "100px",
          boxShadow: "large", children: {} },
      } } } },
  ] };
  const before = structuredClone(root);
  const patches = reset.getThemeStyleResetPatches(root);
  assert.deepEqual(root, before, "collecting patches does not mutate the DSL");
  const patch = (id) => patches.find((value) => value.widgetId === id)?.updates.modify;
  assert.deepEqual(patch("button"), {
    buttonColor: "{{appsmith.theme.colors.primaryColor}}",
    borderRadius: "{{appsmith.theme.borderRadius.appBorderRadius}}",
  });
  assert.equal(patch("group")["groupButtons.groupButton1.buttonColor"],
    "{{appsmith.theme.colors.primaryColor}}");
  assert.equal(patch("table")["primaryColumns.action.buttonColor"],
    "{{Table1.sanitizedTableData.map((currentRow) => ( (appsmith.theme.colors.primaryColor)))}}");
  assert.equal(patch("table")["primaryColumns.action.boxShadow"],
    '{{Table1.sanitizedTableData.map((currentRow) => ( "none"))}}',
    "Appsmith also resets literal table child styles");
  assert.equal(patch("json")["schema.__root_schema__.children.name.accentColor"],
    "{{((sourceData, formData, fieldState) => ((appsmith.theme.colors.primaryColor)))(JSONForm1.sourceData, JSONForm1.formData, JSONForm1.fieldState)}}");
  assert.equal(patch("json")["schema.__root_schema__.children.name.boxShadow"], undefined);
  assert.equal(patch("json")["submitButtonStyles.buttonColor"],
    "{{appsmith.theme.colors.primaryColor}}");

  const blank = documents.createBlankDashboardDocument("theme-reset-contract");
  const title = blank.layout.dsl.children[0];
  title.fontFamily = "Comic Sans MS";
  title.borderRadius = "12px";
  title.textColor = "#123456";
  const sourceJson = JSON.stringify(blank);
  const resetDocument = reset.resetWidgetStylesInDocument(sourceJson);
  assert.deepEqual(resetDocument.changedWidgetIds, [title.widgetId]);
  const resetTitle = JSON.parse(resetDocument.documentJson).layout.dsl.children[0];
  assert.equal(resetTitle.fontFamily, "{{appsmith.theme.fontFamily.appFont}}");
  assert.equal(resetTitle.borderRadius, "{{appsmith.theme.borderRadius.appBorderRadius}}");
  assert.equal(resetTitle.textColor, "#123456");
  assert.deepEqual(reset.resetWidgetStylesInDocument(resetDocument.documentJson).changedWidgetIds, []);

  const store = editor.createEditableWorkbenchStore(blank);
  try {
    store.dispatch(editor.resetEditorWidgetStyles());
    assert.equal(store.getState().dirty, true);
    assert.equal(store.getState().past.length, 1, "one reset is one undo step");
    assert.equal(editor.selectEditorDocument(store.getState()).layout.dsl.children[0].fontFamily,
      "{{appsmith.theme.fontFamily.appFont}}");
    store.dispatch(editor.undoEditorChange());
    assert.equal(store.getState().dirty, false);
    assert.equal(editor.selectEditorDocument(store.getState()).layout.dsl.children[0].fontFamily,
      "Comic Sans MS");
  } finally { store.dispose(); }

  const theme = blank.theme.properties;
  const authored = { widgetId: "example", widgetName: "Example", type: "BUTTON_GROUP_WIDGET",
    version: 1, topRow: 0, bottomRow: 4, leftColumn: 0, rightColumn: 4,
    buttonColor: "{{appsmith.theme.colors.primaryColor}}",
    borderRadius: "12px", onClick: "{{Actions.run()}}",
    groupButtons: { one: { buttonColor: "{{appsmith.theme.colors.primaryColor}}",
      label: "Keep" } }, children: [] };
  const rendered = resolver.resolveThemeBindingsInWidget(authored, theme);
  assert.equal(rendered.buttonColor, theme.colors.primaryColor);
  assert.equal(rendered.groupButtons.one.buttonColor, theme.colors.primaryColor);
  assert.equal(rendered.borderRadius, "12px");
  assert.equal(rendered.onClick, "{{Actions.run()}}");
  assert.equal(authored.buttonColor, "{{appsmith.theme.colors.primaryColor}}",
    "render resolution does not alter the authored DSL");
  assert.equal(rendered.children, authored.children);
  assert.equal(resolver.resolveThemeBinding("{{appsmith.theme.colors.unknown}}", theme),
    "{{appsmith.theme.colors.unknown}}");
  const tableStyles = { widgetId: "table", widgetName: "Table1", type: "TABLE_WIDGET",
    primaryColumns: { action: {
      buttonColor: patch("table")["primaryColumns.action.buttonColor"],
      boxShadow: patch("table")["primaryColumns.action.boxShadow"],
    } }, children: [] };
  const renderedTable = resolver.resolveThemeBindingsInWidget(tableStyles, theme);
  assert.equal(renderedTable.primaryColumns.action.buttonColor, theme.colors.primaryColor);
  assert.equal(renderedTable.primaryColumns.action.boxShadow, "none");
  assert.equal(tableStyles.primaryColumns.action.buttonColor,
    patch("table")["primaryColumns.action.buttonColor"],
    "table theme resolution leaves the authored column binding intact");
  const formStyles = { widgetId: "json", widgetName: "JSONForm1", type: "JSON_FORM_WIDGET",
    schema: { __root_schema__: { fieldType: "Object", children: { name: {
      accentColor: patch("json")["schema.__root_schema__.children.name.accentColor"],
    } } } }, children: [] };
  const renderedForm = resolver.resolveThemeBindingsInWidget(formStyles, theme);
  assert.equal(renderedForm.schema.__root_schema__.children.name.accentColor,
    theme.colors.primaryColor);
  assert.equal(formStyles.schema.__root_schema__.children.name.accentColor,
    patch("json")["schema.__root_schema__.children.name.accentColor"]);

  console.log("Appsmith Fixed theme style reset and binding contracts passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
