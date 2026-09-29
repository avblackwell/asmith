# Appsmith DSL runtime mirror

These 97 files are copied byte-for-byte from `app/client/packages/dsl/src` in
this repository. The runtime closure contains 95 files selected from an
esbuild metafile and two type-only files needed by TypeScript. It includes
the versioned migrations, transform functions, and the migration 12 widget
config snapshot. Tests, build configuration, and `node_modules` are excluded.

The source is licensed under the repository's Apache License 2.0. The five
external runtime packages are declared in `operator-display-client/package.json`.

From `operator-display-client`, run `node scripts/extract-dsl-runtime.cjs` to
verify every selected file and reject unselected code in this mirror. Use
`node scripts/extract-dsl-runtime.cjs --copy` only when intentionally syncing
an upstream DSL change, then rerun `node scripts/canvas-payload.parity.test.cjs`.
