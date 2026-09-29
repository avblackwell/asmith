# Appsmith Fixed auto-height tree

`constants.ts`, `helpers.ts`, and `reflow.ts` are copied from
`app/client/src/utils/autoHeight/` without algorithm changes. `generateTree.ts`
is copied from the same directory with only its imports redirected to the
local `appsmith-reflow/geometry.ts` equivalent of Appsmith's `boxHelpers` and
a local copy of `utils/helpers.pushToArray`. The source's geometry uses the
same strict edge-intersection test.

`../autoHeightDocument.ts` adapts authored nested DSL widgets into Appsmith's
`NodeSpace` map per canvas, then calls these source functions. It applies the
result to the local document and propagates Container height upward without
importing Appsmith's backend or normalized Redux tree.

Run `node src/editor-bridge/editable-store/appsmith-auto-height/source-parity.contract.test.cjs`
for edge intersection, preserved originals, and shrink around a blocking box.
