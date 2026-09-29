# Appsmith fixed-layout reflow core

`index.ts`, `reflowHelpers.ts`, `reflowTypes.ts`, and `reflowUtils.ts` are copied
from `app/client/src/reflow` in this repository (Apache-2.0). The algorithm
remains Appsmith's pure occupied-space and collision-tree implementation.

For this client, the Appsmith-wide imports for `OccupiedSpace`, `Rect`, and
`areIntersecting` were replaced by local equivalents in `geometry.ts`. The one
`GridDefaults.DEFAULT_GRID_COLUMNS` reference was changed to the supplied
`gridProps.maxGridColumns`, so nested canvases use their actual width. The
Redux hook, drag arenas, and preview timing are not copied. Our document
planner calls this core once per proposed fixed-layout edit and checks final
bounds and overlap before applying the result to the DSL.
