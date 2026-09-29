// Extract only theme-bound stylesheet defaults from Appsmith's Fixed widgets.
// Run with --check to verify the checked-in copy after an Appsmith source update.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const widgetsRoot = path.resolve(__dirname, "../../app/client/src/widgets");
const outputPath = path.resolve(
  __dirname,
  "../src/features/theme-editor/appsmithStylesheetBindings.json",
);

function walkFiles(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const candidate = path.join(folder, entry.name);
    if (entry.isDirectory()) return walkFiles(candidate);
    return entry.name === "index.tsx" ? [candidate] : [];
  });
}

function propertyName(name, source) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  throw new Error(`Unexpected stylesheet key: ${name.getText(source)}`);
}

function sourceValue(expression, source) {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return Object.fromEntries(expression.properties.map((property) => {
      if (!ts.isPropertyAssignment(property)) {
        throw new Error(`Unexpected stylesheet member: ${property.getText(source)}`);
      }
      return [propertyName(property.name, source), sourceValue(property.initializer, source)];
    }));
  }
  throw new Error(`Unexpected stylesheet value: ${expression.getText(source)}`);
}

function themeBindings(value) {
  if (typeof value === "string") {
    return /^\{\{appsmith\.theme\.[a-zA-Z0-9_.]+\}\}$/.test(value) ? value : undefined;
  }
  const entries = Object.entries(value)
    .map(([key, entry]) => [key, themeBindings(entry)])
    .filter(([, entry]) => entry !== undefined);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function stylesheetFor(file) {
  const sourceText = fs.readFileSync(file, "utf8");
  if (!sourceText.includes("static getStylesheetConfig")) return null;
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let widgetType;
  let stylesheet;
  function visit(node) {
    if (ts.isClassDeclaration(node)) {
      for (const member of node.members) {
        if (ts.isPropertyDeclaration(member) && member.name?.getText(source) === "type") {
          if (!member.initializer || !ts.isStringLiteral(member.initializer)) {
            throw new Error(`Unexpected widget type in ${file}`);
          }
          widgetType = member.initializer.text;
        }
        if (ts.isMethodDeclaration(member) && member.name?.getText(source) === "getStylesheetConfig") {
          const statement = member.body?.statements.find(ts.isReturnStatement);
          if (!statement?.expression) throw new Error(`Missing stylesheet in ${file}`);
          stylesheet = sourceValue(statement.expression, source);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!stylesheet) return null;
  if (!widgetType) throw new Error(`Missing widget type in ${file}`);
  return [widgetType, themeBindings(stylesheet)];
}

const stylesheets = Object.fromEntries(
  walkFiles(widgetsRoot)
    .filter((file) => !file.includes(`${path.sep}wds${path.sep}`))
    .map(stylesheetFor)
    .filter((entry) => entry && entry[1])
    .sort(([a], [b]) => a.localeCompare(b)),
);
const generated = `${JSON.stringify(stylesheets, null, 2)}\n`;

if (process.argv.includes("--check")) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== generated) {
    throw new Error("Appsmith theme binding copy is out of date; regenerate it.");
  }
  console.log(`Appsmith theme binding copy matches ${Object.keys(stylesheets).length} Fixed widget configs.`);
} else {
  fs.writeFileSync(outputPath, generated);
  console.log(`Copied bindings for ${Object.keys(stylesheets).length} Fixed widget configs.`);
}
