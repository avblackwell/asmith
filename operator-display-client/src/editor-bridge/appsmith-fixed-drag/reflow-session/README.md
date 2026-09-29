# Appsmith fixed reflow session

`AppsmithReflowSession` is the stateful calculation inside Appsmith's
`app/client/src/utils/hooks/useReflow.ts`, expressed without that hook's Redux
dispatch or React lifecycle. It calls the copied pure
`editable-store/appsmith-reflow` algorithm. In particular, it retains
`prevPositions`, `prevCollidingSpaces`, `prevMovementMap`, and
`prevSecondOrderCollisionMap` for the whole drag; Appsmith supplies all four
back to the next `reflow` call. It also preserves the source hook's delayed
drop-target latch and reuses the state captured before a blocked sample for
the delayed `reflow(..., true, true)` call.

## Source mapping

- `useReflow.ts:85-130`: initialize/reset history when a drag starts or ends.
- `useReflow.ts:146-196`: build `PrevReflowState`, call `reflow`, and store the
  next history. `sample()` is the matching method.
- `useReflow.ts:200-268`: skip container reflow until a stationary 500 ms
  timeout, then try again and hold that state during the same collision.
  `activateContainerReflow()` is the timeout's calculation; the existing
  `ContainerReflowGate` owns the clock.
- `reflowHookUtils.ts:67-101`: bottom-row calculation copied here so the
  standalone client does not import Appsmith's reducer types.
- `canvasDraggingUtils.ts:getBlocksToDraw`: original positions are the
  selected direct-child widget spaces, or one zero-origin synthetic rectangle
  for a palette widget. All selected blocks are sampled together.

`begin()` must run when a drag starts on a canvas. On an existing-widget
drag, pass every selected direct-child rectangle in `originalPositions` and
exclude all selected widget IDs from `occupiedSpaces`. For a palette widget,
pass one synthetic zero-origin rectangle. `sample()` should be called only
when snapped rectangles change. A canvas switch needs another `begin()`;
`reset()` ends the drag. A sample or delayed callback from the wrong canvas
clears history and throws so stale positions cannot affect another canvas.

`EditableCanvas` owns one session ref and passes every changed snapped
rectangle through it. It projects the returned movement map with
`reflowedGridRects`, validates the complete result with
`previewCommittedLayoutChange` or `previewCommittedGroupMove`, and sends that
same plan through the Redux commit action on pointer drop. Keyboard edits
continue to use their ordinary commands. Single-widget, palette, group, and
resize previews share this path; resize handles preserve the previous valid
rectangle on an axis that Appsmith marks at its movement limit.

The scroll loop follows `useCanvasDragToScroll` and `getScrollByPixels`: it
uses a 20px edge threshold, 40px smooth steps, and a repeat timer based on
edge distance. Scroll events resample the last pointer so the snapped
rectangle changes while the physical pointer remains still.

The source hook dispatches animated reflow actions and invokes a timeout
callback with its previous movement map, while the new movement map goes to
Redux. This adapter returns the new movement map directly for our existing
preview/commit path. It does not own animation, pointer scrolling, or the
500 ms clock.

Run the focused contract from `operator-display-client`:

```sh
node src/editor-bridge/appsmith-fixed-drag/reflow-session/contract.test.cjs
```
