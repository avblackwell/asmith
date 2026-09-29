const fs = require("fs");
const path = require("path");

const sourceRoot = path.resolve(__dirname, "../src");
const prohibitedBareRoots = /^(?:actions|api|ce|ee|entities|layoutSystems|pages|sagas|selectors|store|widgets)(?:\/|$)/;
const prohibitedExact = new Set(["@shared/dsl", "@shared/ast"]);
const violations = [];
let filesChecked = 0;

function checkFile(file) {
  const source = fs.readFileSync(file, "utf8");

  filesChecked += 1;

  if (/\bDefaultRootState\b/.test(source)) {
    violations.push(`${file}: Appsmith DefaultRootState reference`);
  }

  if (/\/(?:api\/v1|v1\/layouts)\b/.test(source)) {
    violations.push(`${file}: Appsmith API route reference`);
  }

  for (const match of source.matchAll(/\b(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
    const name = match[1];

    if (name.startsWith(".")) continue;

    const sagaOutsideEditor = name.startsWith("redux-saga") &&
      !file.includes(`${path.sep}editor-bridge${path.sep}editable-store${path.sep}`);

    if (prohibitedBareRoots.test(name) || prohibitedExact.has(name) || sagaOutsideEditor) {
      violations.push(`${file}: prohibited import ${name}`);
    }
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);

    if (entry.isDirectory()) walk(file);
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) checkFile(file);
  }
}

walk(sourceRoot);

if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Import boundary passed: ${filesChecked} source files`);
}
