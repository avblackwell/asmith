# Appsmith Fixed selection port

These modules isolate the Fixed editor's selection presentation and geometry so
the workbench can connect them to its own Redux store and command sagas.

| Local module | Appsmith source | Adaptation |
| --- | --- | --- |
| `selectionGeometry.ts` | `sagas/CanvasSagas/SelectionCanvasSagas.ts`, `sagas/WidgetSelectUtils.ts`, `utils/helpers.tsx`, `utils/boxHelpers.ts` | Occupied spaces, selected IDs, and canvas spacing arrive as arguments rather than Appsmith selectors. The grid snap, strict rectangle intersection, direct-sibling scope, Ctrl/Cmd toggle, and Shift sibling range logic follow the source. |
| `CanvasSelectionMarquee.tsx` | `layoutSystems/fixedlayout/editor/FixedLayoutCanvasArenas/CanvasSelectionArena.tsx`, `layoutSystems/common/canvasArenas/StickyCanvasArena.tsx` | The same Canvas2D dashed outline and translucent fill; the backing bitmap is clipped to visible scroll/viewport bounds as in StickyCanvasArena. |
| `WidgetsMultiSelectBox.tsx` | `layoutSystems/fixedlayout/common/widgetGrouping/WidgetsMultiSelectBox.tsx` | The dashed four-edge box, dimensions, drag-start payload, and visible-area action rail are ported. Copy, cut, delete, group, and focus are callback adapters. |
| `MultiSelectPropertyPane.tsx` | `pages/Editor/MultiSelectPropertyPane/index.tsx` | Same ADS heading, instruction, widget buttons, and test classes; selection/focus is a callback. |
| `commands/index.ts` | `layoutSystems/common/utils/canvasDraggingUtils.ts`, `layoutSystems/fixedlayout/editor/FixedLayoutCanvasArenas/hooks/useBlocksToBeDraggedOnCanvas.ts`, `sagas/CanvasSagas/DraggingCanvasSagas.ts`, `sagas/WidgetDeletionSagas.ts`, `sagas/WidgetOperationSagas.tsx`, `sagas/WidgetOperationUtils.ts`, `sagas/PasteWidgetUtils/index.ts` | Pure atomic commands for group move, delete, copy/cut/paste, and group into a Container, plus Appsmith paste target selection. Selected blocks share the copied Appsmith multi-block `reflow` core; command return values can feed one Redux undo entry. |
| `commands/clipboardStorage.ts` | `utils/storage.ts` (`saveCopiedWidgets`/`getCopiedWidgets`), `sagas/WidgetOperationSagas.tsx` (`createSelectedWidgetsCopy`, `pasteWidgetSaga`) | One asynchronous IndexedDB clipboard entry is shared by the deployment and account across drafts and workbench mounts. Appsmith uses a global localforage `CopiedWidget` entry; the account/deployment key is the product's ownership boundary. |

Appsmith's `CanvasSelectionArena` also owns mouse listeners, drag-to-scroll,
and selection that begins outside the canvas. The marquee here is the painted
layer; `EditableCanvas` supplies empty-canvas mouse events, the 150 ms
selection update, drag-to-scroll, and the outer editor entry path from
`WidgetEditorContentWrapper`. An outer drag starts on the workbench viewport;
the root marquee begins when that held pointer enters the canvas. Its start
position is clamped two pixels inside the canvas by `outsideSelection.ts`, as
in `CanvasSelectionArena`. Appsmith permits an ordinary marquee on the
root canvas and requires Ctrl/Cmd on a nested draggable canvas. `selectWidgetsInArea`
requires `snapToNextColumn` for upward drags and `snapToNextRow` for leftward
drags, matching the source's action names.

Direct widget clicks use `pushPopWidgetSelection` for Ctrl/Cmd and
`shiftSelectWidgets` for Shift. The Shift function preserves Appsmith's
selected-ID insertion order, which can differ from visual sibling order. The
workbench retains the last selected widget ID as its range anchor.

`tabOrder.ts` ports Appsmith's `sanitizeTabOrder` and the editor renders
`TabOrderBadge`'s 18px blue badge when Alt+T is enabled. The editor badge is
hidden in view mode, while valid values remain on each widget's
`data-tab-order` attribute. This overlay does not implement Appsmith's custom
runtime tab traversal; it only displays the explicit order. `WidgetChrome`
uses `WidgetNameLayer`/`SettingsControl`'s red name badge and warning icon for
positive evaluation-error counts supplied by the workbench. The static canvas
store does not evaluate arbitrary Appsmith JavaScript, so the count covers
only errors from the product's supported binding evaluation.

The original multi-selection menu's hover descriptions use
`@appsmith/ads-old` Tooltip/Blueprint, which is not installed in the product
client. This port uses native titles until that UI dependency is ported. The
four commands are callback adapters to `commands/index.ts`; the workbench
supplies the Redux/saga and clipboard lifecycle.

## Multi-widget commands

`previewGroupMove` and `moveSelectedWidgets` translate every selected block by
one grid delta, exclude all selected blocks from the obstacle list, invoke the
same copied Appsmith `reflow` function with an array of blocks, and apply all
reflowed positions in one document change. `deleteSelectedWidgets` removes
selected DSL subtrees and their Cyflex bindings/dependency records atomically.
`copySelectedWidgets`, `cutSelectedWidgets`, and `pasteSelectedWidgets` carry
DSL subtrees with bindings and dependencies, remap IDs on paste, and select
the new roots. Pasted widget names use `WidgetOperationSagas`'s
`getNextWidgetName`/`AppsmithUtils.getNextEntityName` rule: a copied `Text1`
becomes `Text1Copy`, then `Text1Copy1` on the next paste. The local name set
contains widgets; Appsmith also reserves names in its evaluator tree, which
this frontend does not have. `groupSelectedWidgets` follows Appsmith's bounding box,
two-extra-rows Container, inner Canvas, 64-column child scaling, and downward
neighbor reflow; selected widget IDs remain stable inside the new Container.

`resolveFixedPasteTarget(documentJson, clipboard, selectedWidgetIds,
{ gridPosition? })` follows `getParentWidgetIdForPasting` and
`getNewPositionsBasedOnSelectedWidgets`. One or more selected non-layout
widgets paste centered below their selected bounds with Appsmith's one-row
padding and selected-space collision adjustment. A single selected Container
pastes into its first child Canvas. With no selected-widget placement and no
grid point, the helper preserves the copied group's left column and picks the
next row after the destination canvas's bottommost direct child. The optional
grid point is supplied by the host after it converts mouse pixels using the
destination canvas's snapped grid; the helper applies Appsmith's occupied
space and horizontal edge rules to it.

Command placement uses Appsmith `getSnappedGrid`: 64 columns, 10px rows, a
12px deduction from the rendered root width and a 20px deduction from a
nested canvas's rendered Container width. A non-scrolling nested canvas uses
its Container's height minus one row as its drop bound. A scrolling Container
can extend toward 9000 rows. The root DSL `bottomRow` is normalized from its
attached children in **pixels** after each bulk command; `minHeight` is not
derived from `bottomRow`.

The product's nested canvas DSL measures its own width in logical columns,
while the Appsmith grouping saga writes a pixel width and uses a separate
grid calculation. Grouping therefore stores the inner canvas as 64 logical
columns with the source's `widthPerColumn`/`percentageIncrease` child
transform; this preserves the source's stored child geometry while allowing
the local Fixed planner to edit it. The inner canvas height uses the product's
row spacing to fit within the outer Container. Its drag snap grid still uses
the source's nested 20px deduction, which can differ slightly from the stored
child spacing as it does in Appsmith.

Group move and paste can target a different canvas in the same draft. Appsmith
resnaps all blocks to that canvas's grid; the local command updates each
widget's parent, grid spacing, and nested spacing in one document change.

The ordinary Appsmith `WidgetOperationSagas` paste leaves expression strings
unchanged for the product's supported Text, Chart, Container, Image, Divider,
and Progress widgets. It only rewrites selected Table, Select/MultiSelect,
List, and Modal properties. Its generic dynamic-path replacement helpers in
`PasteWidgetUtils` are invoked for *building block addition*, not ordinary
widget paste, so they are intentionally absent here. The separate
`integration/components/insertCopiedComponent` helper rewrites some copied
component expressions with a limited tokenizer; it is not the ordinary
Appsmith widget clipboard path and cannot safely parse arbitrary JavaScript.

Appsmith's clipboard has no document-ID gate; its paste gate checks Fixed vs
Anvil layouts. The local clipboard likewise supports pasting across Fixed
drafts. It carries Cyflex variable declarations used by copied bindings.
Paste reuses an identical destination declaration, adds a missing one, or
renames a conflicting copied key (`speedCopy`, then a numeric suffix) and
remaps its binding. Existing destination declarations remain unchanged.
Copied expressions referring to widgets outside the selection are still
verbatim and can be unresolved in a different draft, as with ordinary
Appsmith paste.

Current command limits: Appsmith's copy/cut and bulk
delete sagas have mixed-protected-widget edge cases that can delete content
after a failed copy or skip a remaining selected widget. The local commands
reject protected selections atomically. Appsmith stores its clipboard through
localforage; the workbench now persists through
`IndexedDbFixedWidgetClipboardStore`. Scoped stores load that entry on each
paste, so a new editor mount can paste a copy from another draft. A workbench
without a `clipboardScope` or saved `draftScope` keeps its clipboard in memory
until Save As establishes an owner. Authenticated unsaved workbenches should
pass `clipboardScope` when they mount for persistence before first save.
