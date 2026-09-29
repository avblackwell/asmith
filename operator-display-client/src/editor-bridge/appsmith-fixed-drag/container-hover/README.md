# Fixed layout container collision timing

Source behavior:

- `app/client/src/layoutSystems/fixedlayout/editor/FixedLayoutCanvasArenas/hooks/useCanvasDragging.ts` lines 257–278 activates a canvas on its first arena mouseover/move. There is no hover delay for entry into a nested canvas.
- The same hook only calls `reflowSpaces` when the dragged block's snapped rectangle changes (lines 299–340). It calls with `shouldSkipContainerReflow=true`.
- `app/client/src/utils/hooks/useReflow.ts` lines 203–259 first previews without moving a colliding drop target, then sets a **500 ms** timer. A new snapped reflow clears the previous timer. The delayed run enables drop-target reflow only if the movement is valid. The permission remains latched while a drop target is still colliding, and clears after the drag leaves all drop targets (lines 261–269).
- `app/client/src/reflow/reflowUtils.ts` lines 2140–2216 registers that timer on a dragged rectangle's overlap with an occupied drop target. `checkIsDropTarget` reads each widget config's `isCanvas` flag; supported Container, Statbox, Tabs, and Modal widgets set it. Detached Modals are excluded from occupied spaces before the gate runs. It is a collision condition, not a pointer-hover condition.

`ContainerReflowGate` ports the timer/latch lifecycle without Appsmith's Redux state. `sample({ canvasId, target, occupied }, onTimeout)` returns whether the product's preview planner may reflow a drop target. Pass the dragged widget's snapped grid rectangle and the occupied siblings in that canvas, excluding the dragged widget. While pending, call the planner with `shouldReflowDropTarget=false`; when `onTimeout` fires, try a plan with `shouldReflowDropTarget=true` and return whether that plan is valid. Use the same successful plan to repaint the preview. Call `reset()` when the drag ends or is cancelled.

This module only supplies Appsmith's timing. The editable canvas and planner must call it to change behavior. It must not be used to delay the nested arena itself.
