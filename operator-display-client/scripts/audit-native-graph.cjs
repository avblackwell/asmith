/*
 * Read-only import graph probe for the Appsmith editor extraction.
 * Run: node scripts/audit-native-graph.cjs
 * No source is copied or loaded into the Operator Display runtime.
 */
const fs = require("fs");
const path = require("path");

const repositoryRoot = path.resolve(__dirname, "../..");
const clientRoot = path.join(repositoryRoot, "app/client");
const sourceRoot = path.join(clientRoot, "src");
const ts = require(path.join(clientRoot, "node_modules/typescript"));
const configFile = ts.readConfigFile(path.join(clientRoot, "tsconfig.json"), ts.sys.readFile);

if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));

const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, clientRoot);
const options = parsed.options;
const cache = new Map();
const resolvedCache = new Map();
const edgeCache = new Map();

function resolve(specifier, importer) {
  const key = `${importer}\0${specifier}`;

  if (resolvedCache.has(key)) return resolvedCache.get(key);

  const resolved = ts.resolveModuleName(specifier, importer, options, ts.sys)
    .resolvedModule?.resolvedFileName;
  const normalized = resolved ? path.normalize(resolved) : null;

  resolvedCache.set(key, normalized);

  return normalized;
}

function importsFor(file) {
  if (cache.has(file)) return cache.get(file);

  const content = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const imports = [];

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier;

      if (specifier && ts.isStringLiteral(specifier)) {
        let typeOnly = false;

        if (ts.isImportDeclaration(node)) {
          const clause = node.importClause;

          typeOnly = Boolean(clause?.isTypeOnly);
          if (
            clause &&
            !clause.name &&
            clause.namedBindings &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.length > 0 &&
            clause.namedBindings.elements.every((member) => member.isTypeOnly)
          ) {
            typeOnly = true;
          }
        } else if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          typeOnly =
            node.exportClause.elements.length > 0 &&
            node.exportClause.elements.every((member) => member.isTypeOnly);
        } else {
          typeOnly = Boolean(node.isTypeOnly);
        }

        if (!typeOnly) imports.push(specifier.text);
      }
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      imports.push(node.arguments[0].text);
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  cache.set(file, imports);

  return imports;
}

function inAppsmithSource(file) {
  return file && file.startsWith(sourceRoot + path.sep);
}

function relative(file) {
  return path.relative(sourceRoot, file).replaceAll(path.sep, "/");
}

function category(file) {
  if (!inAppsmithSource(file)) return "package/asset";

  const name = relative(file);

  if (/^(?:api|ce\/api|ee\/api)\//.test(name)) return "api";
  if (/^(?:ce\/|ee\/)?reducers\//.test(name)) return "reducers";
  if (/^(?:ce\/|ee\/)?sagas\//.test(name)) return "sagas";
  if (/^(?:ce\/|ee\/)?widgets\//.test(name)) return "widgets";
  if (name.startsWith("layoutSystems/")) return "layoutSystems";
  if (name.startsWith("integration/")) return "integration";
  if (name.startsWith("pages/")) return "pages";
  if (/^(?:ce\/|ee\/)?selectors\//.test(name)) return "selectors";
  if (name.startsWith("utils/") || name.startsWith("ee/utils/")) return "utils";
  if (name === "store.ts") return "globalStore";

  return "other source";
}

function edgesFor(file) {
  if (edgeCache.has(file)) return edgeCache.get(file);

  const edges = importsFor(file).map((specifier) => ({
    specifier,
    target: resolve(specifier, file),
  }));

  edgeCache.set(file, edges);

  return edges;
}

function componentsFor(adjacency) {
  let nextIndex = 0;
  const indices = new Map();
  const low = new Map();
  const stack = [];
  const inStack = new Set();
  const components = [];

  function visit(file) {
    indices.set(file, nextIndex);
    low.set(file, nextIndex);
    nextIndex += 1;
    stack.push(file);
    inStack.add(file);

    for (const target of adjacency.get(file) ?? []) {
      if (!adjacency.has(target)) continue;

      if (!indices.has(target)) {
        visit(target);
        low.set(file, Math.min(low.get(file), low.get(target)));
      } else if (inStack.has(target)) {
        low.set(file, Math.min(low.get(file), indices.get(target)));
      }
    }

    if (low.get(file) === indices.get(file)) {
      const component = [];
      let member;

      do {
        member = stack.pop();
        inStack.delete(member);
        component.push(member);
      } while (member !== file);

      components.push(component);
    }
  }

  for (const file of adjacency.keys()) {
    if (!indices.has(file)) visit(file);
  }

  return components;
}

function collect(entry) {
  const root = path.join(sourceRoot, entry);

  if (!fs.existsSync(root)) {
    throw new Error(`No Appsmith source file: ${entry}`);
  }
  const queue = [root];
  const visited = new Set();
  const parent = new Map();
  const external = new Set();
  const unresolved = new Set();
  const adjacency = new Map();

  while (queue.length) {
    const file = queue.shift();

    if (visited.has(file)) continue;
    visited.add(file);

    if (visited.size > 15000) throw new Error(`Graph too large for ${entry}`);

    const sourceTargets = [];

    for (const { specifier, target } of edgesFor(file)) {

      if (inAppsmithSource(target)) {
        sourceTargets.push(target);
        if (!parent.has(target)) parent.set(target, file);
        if (!visited.has(target)) queue.push(target);
      } else if (target) {
        external.add(specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/"));
      } else if (!/\.(?:css|scss|svg|png|jpe?g|gif|woff2?|json)$/.test(specifier)) {
        unresolved.add(specifier);
      }
    }

    adjacency.set(file, sourceTargets);
  }

  const files = [...visited].map(relative);
  const backend = files.filter((file) =>
    /^(?:api|ce\/api|ee\/api)\//.test(file),
  );
  const counters = {
    reducers: files.filter((file) => /^(?:ce\/|ee\/)?reducers\//.test(file)).length,
    sagas: files.filter((file) => /^(?:ce\/|ee\/)?sagas\//.test(file)).length,
    widgets: files.filter((file) => /^(?:ce\/|ee\/)?widgets\//.test(file)).length,
    layoutSystems: files.filter((file) => file.startsWith("layoutSystems/")).length,
    api: backend.length,
  };

  const nearestBackend = backend
    .map((relativeName) => {
      const target = path.join(sourceRoot, relativeName);
      const chain = [target];

      while (chain[0] !== root && parent.has(chain[0])) {
        chain.unshift(parent.get(chain[0]));
      }

      return chain.map(relative);
    })
    .sort((a, b) => a.length - b.length)[0];

  const firstLevelBuckets = {};

  for (const { target } of edgesFor(root)) {
    const bucket = category(target);

    firstLevelBuckets[bucket] = (firstLevelBuckets[bucket] ?? 0) + 1;
  }

  const backendEdges = [];

  for (const [from, targets] of adjacency) {
    for (const to of targets) {
      if (category(to) === "api") {
        backendEdges.push([relative(from), relative(to)]);
      }
    }
  }

  const components = componentsFor(adjacency).sort((a, b) => b.length - a.length);
  const largest = components[0] ?? [];
  const rootComponent = components.find((component) => component.includes(root)) ?? [];

  return {
    entry,
    sourceFiles: visited.size,
    counters,
    firstLevelBuckets,
    externalPackages: external.size,
    unresolvedBareImports: [...unresolved].sort().slice(0, 12),
    backendEdgeCount: backendEdges.length,
    backendEdgeExamples: backendEdges.slice(0, 8),
    stronglyConnectedComponents: components.length,
    largestComponentSize: largest.length,
    largestComponentExamples: largest.slice(0, 8).map(relative),
    rootComponentSize: rootComponent.length,
    nearestBackendPath: nearestBackend ?? null,
  };
}

const defaultEntries = [
  "store.ts",
  "pages/Editor/Canvas.tsx",
  "pages/Editor/PropertyPane/index.tsx",
  "sagas/WidgetOperationSagas.tsx",
  "sagas/CanvasSagas/DraggingCanvasSagas.ts",
  "sagas/EvaluationsSaga.ts",
  "utils/editor/EditorUtils.ts",
  "widgets/index.ts",
  "integration/standalone/index.tsx",
];
const entries = process.argv.length > 2 ? process.argv.slice(2) : defaultEntries;

for (const entry of entries) {
  process.stdout.write(`${JSON.stringify(collect(entry))}\n`);
}
