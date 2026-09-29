/*
 * Copy only the graph-reachable Appsmith @shared/dsl runtime files.
 * Run with --copy to update the product-owned mirror; otherwise verify parity.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");

const repositoryRoot = path.resolve(__dirname, "../..");
const clientRoot = path.join(repositoryRoot, "app/client");
const sourceRoot = path.join(clientRoot, "packages/dsl/src");
const destinationRoot = path.join(repositoryRoot, "operator-display-client/src/editor-bridge/dsl");
const fromClient = createRequire(path.join(clientRoot, "package.json"));
const esbuild = fromClient("esbuild");
const shouldCopy = process.argv.includes("--copy");

function hash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function main() {
  const build = await esbuild.build({
    entryPoints: [path.join(sourceRoot, "index.ts")],
    absWorkingDir: clientRoot,
    bundle: true,
    format: "esm",
    platform: "browser",
    metafile: true,
    write: false,
    logLevel: "silent",
  });
  const entries = [...new Set([
    ...Object.keys(build.metafile.inputs).filter((file) =>
      file.startsWith("packages/dsl/src/"),
    ),
    // Esbuild erases type-only imports from its runtime metafile.
    "packages/dsl/src/migrate/types.ts",
    "packages/dsl/src/transform/types.ts",
  ])].sort();

  if (entries.length < 92 || entries.length > 112) {
    throw new Error(`Unexpected DSL runtime closure of ${entries.length} files`);
  }

  const mismatches = [];
  const selected = new Set(
    entries.map((entry) => entry.slice("packages/dsl/src/".length).replaceAll("\\", "/")),
  );

  function assertNoUnselectedFiles(directory) {
    if (!fs.existsSync(directory)) return;

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        assertNoUnselectedFiles(file);
      } else if (/\.(?:tsx?|json)$/.test(entry.name)) {
        const relative = path.relative(destinationRoot, file).replaceAll(path.sep, "/");

        if (!selected.has(relative)) {
          throw new Error(`Unselected file in DSL mirror: ${relative}`);
        }
      }
    }
  }

  assertNoUnselectedFiles(destinationRoot);

  for (const entry of entries) {
    const relative = entry.slice("packages/dsl/src/".length);
    const source = path.resolve(sourceRoot, relative);
    const destination = path.resolve(destinationRoot, relative);

    if (
      !source.startsWith(sourceRoot + path.sep) ||
      !destination.startsWith(destinationRoot + path.sep)
    ) {
      throw new Error(`Out-of-root DSL path: ${entry}`);
    }

    const original = fs.readFileSync(source);
    const existing = fs.existsSync(destination) ? fs.readFileSync(destination) : null;

    if (!existing || hash(existing) !== hash(original)) {
      mismatches.push(relative);
      if (shouldCopy) {
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(source, destination);
      }
    }
  }

  if (mismatches.length && !shouldCopy) {
    throw new Error(
      `${mismatches.length} DSL runtime files are missing or differ; run with --copy. First: ${mismatches.slice(0, 5).join(", ")}`,
    );
  }

  process.stdout.write(
    `${shouldCopy ? "Copied" : "Verified"} ${entries.length} exact DSL runtime files; ${mismatches.length} changed.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
