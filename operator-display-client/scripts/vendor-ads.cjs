/**
 * Select the Appsmith ADS source files imported by Operator Display.
 * This is a maintenance tool; the checked-in vendor package is sufficient
 * to install and build this client without the surrounding Appsmith checkout.
 */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const sourceRoot = path.resolve(__dirname, "../../app/client/packages/design-system/ads/src");
const vendorRoot = path.resolve(__dirname, "../vendor/ads/src");
const entrySources = [
  "__theme__/default/index.css",
  "Button/index.ts",
  "Icon/index.ts",
  "Input/index.ts",
  "SearchInput/index.ts",
  "Select/index.ts",
  "SegmentedControl/index.ts",
  "Spinner/index.ts",
  "Tab/index.ts",
  "Table/index.ts",
  "Tag/index.ts",
  "Text/index.ts",
  "Templates/IDEHeader/IDEHeader.tsx",
  "Templates/IDEHeader/IDEHeaderTitle.tsx",
];
const extensions = ["", ".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".svg", ".png", ".woff", ".woff2"];
const seen = new Set();
const externals = new Set();

function insideSource(file) {
  const relative = path.relative(sourceRoot, file);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`ADS dependency escaped the source package: ${file}`);
  }

  return relative.replace(/\\/g, "/");
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) {
    if (!specifier.startsWith("data:") && !specifier.startsWith("http:")) {
      externals.add(specifier);
    }

    return null;
  }

  const clean = specifier.split("?")[0].split("#")[0];
  const base = path.resolve(path.dirname(fromFile), clean);

  for (const extension of extensions) {
    const candidate = `${base}${extension}`;

    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      insideSource(candidate);

      return candidate;
    }
  }

  for (const extension of extensions.slice(1)) {
    const candidate = path.join(base, `index${extension}`);

    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      insideSource(candidate);

      return candidate;
    }
  }

  throw new Error(`Unresolved ADS import ${specifier} in ${insideSource(fromFile)}`);
}

function sourceImports(file, content) {
  if (file.endsWith(".css")) {
    const matches = [];
    const importPattern = /@import\s+(?:url\()?\s*["']?([^"')\s;]+)/g;
    const urlPattern = /url\(\s*["']?([^"')]+)/g;

    for (const match of content.matchAll(importPattern)) matches.push(match[1]);
    for (const match of content.matchAll(urlPattern)) matches.push(match[1]);

    return [...new Set(matches.map((specifier) =>
      specifier.startsWith(".") || specifier.startsWith("/") ||
      specifier.startsWith("data:") || specifier.startsWith("http:")
        ? specifier
        : `./${specifier}`))];
  }

  if (!/\.[jt]sx?$/.test(file)) return [];

  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const imports = [];

  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    }

    if (ts.isCallExpression(node) && node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      imports.push(node.arguments[0].text);
    }

    ts.forEachChild(node, visit);
  }

  visit(source);

  return imports;
}

function trace(file) {
  const relative = insideSource(file);

  if (seen.has(relative)) return;
  seen.add(relative);

  const content = fs.readFileSync(file, "utf8");

  for (const specifier of sourceImports(file, content)) {
    const dependency = resolveImport(file, specifier);

    if (dependency) trace(dependency);
  }
}

for (const entry of entrySources) trace(path.join(sourceRoot, entry));

const files = [...seen].sort();
const packages = [...externals]
  .map((specifier) => specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0])
  .filter((specifier) => !specifier.startsWith("node:"))
  .sort();
const uniquePackages = [...new Set(packages)];
const manifest = require("../vendor/ads/package.json");
const undeclared = uniquePackages.filter((name) =>
  !manifest.dependencies?.[name] && !manifest.peerDependencies?.[name]);

if (undeclared.length > 0) {
  throw new Error(`Undeclared ADS runtime packages: ${undeclared.join(", ")}`);
}

if (process.argv.includes("--sync")) {
  for (const relative of files) {
    const destination = path.join(vendorRoot, relative);

    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, relative), destination);

    // The isolated client uses the published styled-components typings. The
    // upstream xstyled StyleGenerator is runtime-compatible but typed wider.
    if (relative === "Box/Box.styles.tsx") {
      const source = fs.readFileSync(destination, "utf8");

      fs.writeFileSync(
        destination,
        source.replace("  ${customSystem}", "  ${customSystem as any}"),
      );
    }
  }
}

console.log(`${files.length} ADS source files; ${uniquePackages.length} external packages`);
console.log(`External packages: ${uniquePackages.join(", ")}`);

if (process.argv.includes("--files")) {
  for (const file of files) console.log(file);
}
