const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { ServerStyleSheet } = require("styled-components");
const ts = require("typescript");

function loadTypeScript(mod, filename) {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText, filename);
}
require.extensions[".ts"] = loadTypeScript;
require.extensions[".tsx"] = loadTypeScript;

const {
  NativeTableView,
  getClientTableRows,
  getTableCellValue,
  getTableColumns,
  getTableDisplayText,
  getTablePageSize,
  inferStaticColumnType,
  normalizeStaticTableData,
} = require(path.join(__dirname, "index.ts"));

function render(widget, mode = "editor", width = 320, height = 300) {
  const sheet = new ServerStyleSheet();
  try {
    const markup = renderToStaticMarkup(sheet.collectStyles(
      React.createElement(NativeTableView, { widget, mode, width, height }),
    ));
    return { markup, styles: sheet.getStyleTags() };
  } finally {
    sheet.seal();
  }
}

const rows = normalizeStaticTableData([
  { name: "Ada", score: 8, secret: "alpha" },
  { name: "Bob", score: 2, secret: "beta", later: "yes" },
]);
assert.deepEqual(normalizeStaticTableData('[{"id":1}]'), [{ id: 1 }]);
assert.deepEqual(normalizeStaticTableData("{{Query1.data}}"), []);
assert.deepEqual(normalizeStaticTableData("{}"), []);
assert.equal(inferStaticColumnType([{ mixed: null }, { mixed: true }], "mixed"), "checkbox");
assert.equal(inferStaticColumnType([{ mixed: 5 }], "mixed"), "number");
assert.equal(inferStaticColumnType([{ mixed: "<b>hi</b>" }], "mixed"), "html");

const base = {
  widgetId: "table-1",
  widgetName: "Tasks",
  type: "TABLE_WIDGET_V2",
  tableData: rows,
  primaryColumns: {
    name: { id: "name", alias: "name", label: "Person", isVisible: true, columnType: "text" },
    score: { id: "score", alias: "score", label: "Score", isVisible: true, columnType: "number" },
    secret: { id: "secret", alias: "secret", label: "Secret", isVisible: false },
  },
  columnWidthMap: { name: 80, score: 90 },
  columnOrder: ["score", "name", "secret", "score"],
};

const viewerColumns = getTableColumns(base, rows, 300, "viewer");
assert.deepEqual(viewerColumns.map((column) => column.id), ["score", "name"]);
assert.equal(viewerColumns[0].width, 90);
assert.equal(viewerColumns[1].width, 210); // getColumnsPureFn fills the last column.
assert.deepEqual(getTableColumns(base, rows, 300, "editor").map((column) => column.id), ["score", "name", "secret"]);
assert.deepEqual(getTableColumns({ ...base, columnOrder: ["name"] }, rows, 300, "viewer").map((column) => column.id), ["name"]);

const legacy = { ...base, type: "TABLE_WIDGET", columnSizeMap: { name: 125 }, columnOrder: ["score"] };
assert.deepEqual(getTableColumns(legacy, rows, 300, "viewer").map((column) => column.id), ["score", "name", "later"]);
assert.equal(getTableColumns(legacy, rows, 300, "viewer")[1].width, 125);
assert.equal(getTablePageSize(base, 300, 20), 6); // V2 0.3-row threshold.
assert.equal(getTablePageSize(legacy, 170, 20), 3); // Legacy's ceil at default 40px row.
assert.equal(getTablePageSize({ ...base, pageSize: 3 }, 300, 20), 3);
assert.equal(getTablePageSize({ ...base, defaultPageSize: 3 }, 300, 20), 6);

const computed = getTableColumns({
  ...base,
  columnOrder: ["name", "status"],
  primaryColumns: {
    name: { id: "name", alias: "name", label: "Name", computedValue: '["Grace","Lin"]' },
    status: { id: "status", alias: "status", isDerived: true, columnType: "select",
      selectOptions: [{ label: "Running", value: "run" }], computedValue: ["run", "stop"] },
  },
}, rows, 300, "viewer");
assert.equal(getTableCellValue(rows[0], computed[0], 0), "Grace");
assert.equal(getTableDisplayText(rows[0], computed[1], 0), "Running");
assert.equal(getTableDisplayText(rows[1], computed[1], 1), "stop");

const searched = getClientTableRows(rows, viewerColumns, "Ada", undefined);
assert.deepEqual(searched.map((item) => item.originalIndex), [0]);
assert.deepEqual(getClientTableRows(rows, viewerColumns, "beta", undefined), []); // hidden column excluded.
assert.deepEqual(getClientTableRows(rows, viewerColumns, "", { column: "score", order: "asc" })
  .map((item) => item.originalIndex), [1, 0]);
assert.deepEqual(getClientTableRows(rows, viewerColumns, "", { column: "score", order: "desc" })
  .map((item) => item.originalIndex), [0, 1]);

const view = render(base);
assert.match(view.markup, /data-testid="native-table-table-1"/);
assert.match(view.markup, /data-table-kind="TABLE_WIDGET_V2"/);
assert.match(view.markup, /Person/);
assert.match(view.markup, /data-hidden-column="true"/);
assert.match(view.markup, /2 Records/);
assert.match(view.markup, /data-table-row="0"/);
assert.match(view.markup, /data-table-empty-row="true"/);
assert.match(view.styles, /height:40px/);
const viewer = render(base, "viewer");
assert.doesNotMatch(viewer.markup, /data-hidden-column="true"/);
assert.doesNotMatch(viewer.markup, /Secret/);

const htmlTable = render({ ...base, primaryColumns: {
  content: { id: "content", alias: "content", columnType: "html", isVisible: true },
  go: { id: "go", alias: "go", columnType: "button", isVisible: true },
}, columnOrder: ["content", "go"], tableData: [{ content: '<strong>Safe</strong><script>alert(1)</script>', go: "Open" }] });
assert.match(htmlTable.markup, /title="Safe alert\(1\)"/);
assert.doesNotMatch(htmlTable.markup, /<script/);
assert.match(htmlTable.markup, /<button[^>]*disabled/);

const empty = render({ widgetId: "new-table", type: "TABLE_WIDGET_V2", tableData: "", primaryColumns: {} });
assert.match(empty.markup, /Connect your data or use sample data to display table/);
assert.doesNotMatch(render({ widgetId: "new-table", type: "TABLE_WIDGET_V2", tableData: "", primaryColumns: {} }, "viewer").markup,
  /Connect your data or use sample data/);

console.log("TableV2 and legacy Table read-only contract passed");
