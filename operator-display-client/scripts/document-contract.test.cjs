/* Verify the extracted document package still matches its source contract. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const repositoryRoot = path.resolve(__dirname, "../..");
const clientRoot = path.join(repositoryRoot, "app/client");
const fromClient = createRequire(path.join(clientRoot, "package.json"));
const esbuild = fromClient("esbuild");

async function loadPackage(entry) {
  const bundle = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
  });
  const loaded = { exports: {} };

  new Function("module", "exports", bundle.outputFiles[0].text)(
    loaded,
    loaded.exports,
  );

  return loaded.exports;
}

async function main() {
  const original = await loadPackage(
    path.join(clientRoot, "src/integration/document/index.ts"),
  );
  const extracted = await loadPackage(
    path.join(repositoryRoot, "operator-display-client/src/document/index.ts"),
  );
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const fixture = clone(original.exampleDashboardDocument);
  const documentId = "00000000-0000-4000-8000-000000000001";
  const invalid = clone(fixture);

  invalid.layout.dsl.children[0].widgetId = invalid.layout.dsl.widgetId;
  let originalError;

  try {
    original.parseDashboardDocument(invalid);
  } catch (error) {
    originalError = error;
  }

  assert.ok(originalError, "The source parser must reject the invalid fixture");

  assert.deepEqual(
    extracted.parseDashboardDocument(fixture),
    original.parseDashboardDocument(fixture),
  );
  assert.deepEqual(
    extracted.createBlankDashboardDocument(documentId),
    original.createBlankDashboardDocument(documentId),
  );
  assert.equal(
    extracted.serializeDashboardDocument(fixture),
    original.serializeDashboardDocument(fixture),
  );
  assert.throws(
    () => extracted.parseDashboardDocument(invalid),
    { name: originalError.name, message: originalError.message },
  );
  assert.equal(
    fs.readFileSync(
      path.join(repositoryRoot, "operator-display-client/src/document/dashboard.schema.v1.json"),
      "utf8",
    ),
    fs.readFileSync(
      path.join(clientRoot, "src/integration/document/dashboard.schema.v1.json"),
      "utf8",
    ),
  );

  process.stdout.write("Extracted document contract matches source\n");
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
