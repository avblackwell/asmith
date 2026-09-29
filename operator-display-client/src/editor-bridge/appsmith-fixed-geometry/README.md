# Appsmith Fixed canvas geometry adapter

This adapter computes Appsmith's editor and viewer canvas geometry from the
local dashboard DSL. The saved DSL remains unchanged. Both the workbench and
published viewer use `canvasPayloadForDocument` and the compat store, so the
same source calculations serve both.

## Source mapping

- `fixedRootCanvasMetrics`: Appsmith
  `WidgetSizeUtils.getCanvasBottomRow` on `INIT_CANVAS_LAYOUT`,
  `computeMainContainerWidget`, `withWidgetProps` root render branches, and
  `WidgetPropsUtils.getCanvasSnapRows`. For the blank document's title at row
  7 and minHeight 1200px, normalized root is 380px; editor render bottom is
  1200px and its drop target is 1190px; viewer render bottom is 430px and its
  canvas wrapper is 420px.
- `fixedCanvasChildFrame`: `WidgetOperationUtils.getSnappedGrid` and
  `PositionedContainer`. The root has `(width - 12) / 64` columns; nested
  CANVAS_WIDGETs have `(width - 20) / 64`; `noPad` uses `(width - 8) / 64`.
  Child widget x/y starts at `+6px` in both normal canvases, or `+0px` for
  `noPad`, then uses grid columns and 10px rows. Appsmith's positioned widget
  wrapper also has 4px internal padding.
- `fixedInnerCanvasFrame`: `ContainerWidget.renderChildWidget` and
  `CanvasViewerWrapper`/`DropTargetComponent`. A Container overrides its inner
  canvas width and height from its own component dimensions before rendering.
  The inner canvas wrapper subtracts one 10px row.
- `normalizedInnerCanvasBottomRow`: supported Container branch of
  `WidgetSizeUtils.getCanvasBottomRow`; used when a Container scrolls.

`NativeReadOnlyCanvas` now uses these dimensions and padding for the rendered
tree. `compat-store.selectFixedRootCanvasMetrics` exposes root render data
without overwriting the saved DSL or the flattened canvas widgets consumed by
the in-progress edit commands.

## Remaining edit-side substitutions

`EditableCanvas` must derive `canvasTarget.columnSpace` with
`getFixedCanvasSnapGrid(canvas element width, { isMainCanvas: id === rootId,
noPad: canvas.noPad === true })`. The nested inner canvas is still a
CANVAS_WIDGET, so do **not** set `isContainerWidget: true`. `rowSpace` for
children is always 10px. Convert pointer to grid by subtracting the same
child widget placement offset (`6px`, or `0px` for noPad) from local x/y.

Use `selectFixedRootCanvasMetrics` to get Appsmith's root editor drop-target
height and snap rows. `EditableCanvas` currently divides `root.minHeight` by
stored `root.bottomRow`, so it assumes the latter is a count of visible rows;
Appsmith instead derives pixel-valued render props through the INIT reducer
and `withWidgetProps`. The saved blank DSL's `bottomRow: 120` and
`minHeight: 1200` are not themselves proof that its root is malformed; the
integration document copied from `app/client/src/integration/document` has
the same pair. Appsmith's live flattened state recomputes the root on INIT,
and edit commits can persist pixel-valued bottomRow values. Keep source
normalization in the adapter and apply source update arithmetic at the edit
command boundary. Do not multiply every stored root bottomRow by 10.

Tests:

```text
node src/editor-bridge/appsmith-fixed-geometry/fixedCanvasGeometry.contract.test.cjs
node src/editor-bridge/appsmith-fixed-autoheight/autoHeightRules.contract.test.cjs
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
```
