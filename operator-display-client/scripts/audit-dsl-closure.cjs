/* Read-only esbuild metafile probe for Appsmith's shared DSL runtime closure. */
const path = require("node:path");
const { createRequire } = require("node:module");

const repositoryRoot = path.resolve(__dirname, "../..");
const clientRoot = path.join(repositoryRoot, "app/client");
const fromClient = createRequire(path.join(clientRoot, "package.json"));
const esbuild = fromClient("esbuild");
const packageRoot = path.join(clientRoot, "packages/dsl/src");

async function main() {
  const entry = path.join(packageRoot, "index.ts");
  const build = await esbuild.build({
    entryPoints: [entry],
    absWorkingDir: clientRoot,
    bundle: true,
    format: "esm",
    platform: "browser",
    metafile: true,
    write: false,
    logLevel: "silent",
  });
  const inputs = Object.keys(build.metafile.inputs).sort();
  const dsl = inputs.filter((file) => file.startsWith("packages/dsl/src/"));
  const nodeModules = inputs.filter((file) => file.startsWith("node_modules/"));
  const otherSource = inputs.filter(
    (file) => !file.startsWith("packages/dsl/src/") && !file.startsWith("node_modules/"),
  );
  const externalSpecifiers = inputs.flatMap((file) =>
    build.metafile.inputs[file].imports
      .filter((dependency) => dependency.external)
      .map((dependency) => dependency.path),
  );

  process.stdout.write(
    `${JSON.stringify({
      entry: "packages/dsl/src/index.ts",
      packageFiles: dsl.length,
      packageSources: dsl,
      nodeModuleFiles: nodeModules.length,
      nodeModuleRoots: [...new Set(nodeModules.map((file) => {
        const segments = file.split("/");
        return segments[1]?.startsWith("@")
          ? `${segments[1]}/${segments[2]}`
          : segments[1];
      }))].sort(),
      otherSource,
      externalSpecifiers: [...new Set(externalSpecifiers)].sort(),
      outputBytes: build.outputFiles.reduce((sum, file) => sum + file.contents.length, 0),
    })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
