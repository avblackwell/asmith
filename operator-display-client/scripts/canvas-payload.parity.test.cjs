/* Compare the API-free adapter with Appsmith's current source functions. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const repositoryRoot = path.resolve(__dirname, "../..");
const clientRoot = path.join(repositoryRoot, "app/client");
const fromClient = createRequire(path.join(clientRoot, "package.json"));
const esbuild = fromClient("esbuild");
const ts = fromClient("typescript");

async function loadPackage(entry) {
  const build = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
    logLevel: "silent",
    absWorkingDir: clientRoot,
    alias: {
      lodash: path.join(clientRoot, "node_modules/lodash"),
      loglevel: path.join(clientRoot, "node_modules/loglevel"),
      "micro-memoize": path.join(clientRoot, "node_modules/micro-memoize"),
      nanoid: path.join(clientRoot, "node_modules/nanoid"),
      normalizr: path.join(clientRoot, "node_modules/normalizr"),
    },
  });
  const loaded = { exports: {} };

  new Function("module", "exports", "require", build.outputFiles[0].text)(
    loaded,
    loaded.exports,
    fromClient,
  );

  return loaded.exports;
}

function sourceFunction(file, name, dependencies) {
  const source = fs.readFileSync(file, "utf8");
  const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  let initializer;

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      initializer = node.initializer?.getText(syntax);
    }

    ts.forEachChild(node, visit);
  }

  visit(syntax);
  assert.ok(initializer, `Missing ${name} in ${file}`);
  const compiled = ts.transpileModule(
    `const ${name} = ${initializer};\nreturn ${name};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;

  return new Function(...Object.keys(dependencies), compiled)(
    ...Object.values(dependencies),
  );
}

function responseFor(document) {
  return {
    responseMeta: { status: 200, success: true },
    data: {
      id: "standalone-page",
      baseId: "standalone-page",
      name: document.name,
      slug: "standalone",
      applicationId: "standalone-dashboard",
      lastUpdatedTime: Date.now(),
      layouts: [{
        id: "standalone-layout",
        dsl: document.layout.dsl,
        layoutOnLoadActions: [],
        layoutActions: [],
      }],
    },
  };
}

async function main() {
  const originalDsl = await loadPackage(
    path.join(clientRoot, "packages/dsl/src/index.ts"),
  );
  const product = await loadPackage(
    path.join(repositoryRoot, "operator-display-client/src/editor-bridge/canvasPayload.ts"),
  );
  const documents = await loadPackage(
    path.join(repositoryRoot, "operator-display-client/src/document/index.ts"),
  );
  const extractCurrentDSL = sourceFunction(
    path.join(clientRoot, "src/utils/WidgetPropsUtils.tsx"),
    "extractCurrentDSL",
    { migrateDSL: originalDsl.migrateDSL, defaultDSL: null },
  );
  const getCanvasWidgetsPayload = sourceFunction(
    path.join(clientRoot, "src/ce/sagas/PageSagas.tsx"),
    "getCanvasWidgetsPayload",
    {
      extractCurrentDSL,
      flattenDSL: originalDsl.flattenDSL,
      MAIN_CONTAINER_WIDGET_ID: "0",
    },
  );
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const base = documents.exampleDashboardDocument;
  const fixtures = [
    ["current-94", 94],
    ["sample-89", 89],
    ["older-88", 88],
    ["older-12", 12],
    ["oldest-1", 1],
  ];

  for (const [label, version] of fixtures) {
    const document = clone(base);

    document.layout.dsl.version = version;
    document.compatibility.widgetDslVersion = version;

    const expected = await getCanvasWidgetsPayload(responseFor(clone(document)));
    const productInput = clone(document);
    const actual = await product.canvasPayloadForDocument(productInput);

    assert.deepEqual(actual, expected, `Canvas payload mismatch for ${label}`);
    assert.deepEqual(productInput, document, `${label}: adapter mutated its input`);
    assert.equal(actual.dsl.version, originalDsl.LATEST_DSL_VERSION, label);
    assert.ok(actual.widgets["0"], `${label}: root widget was not flattened`);
  }

  await assert.rejects(
    product.canvasPayloadForDocument({ assetKind: "dashboard" }),
    /schemaVersion/,
  );

  process.stdout.write(
    `Canvas payload matches PageSagas source for ${fixtures.map(([name]) => name).join(", ")}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
