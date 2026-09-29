# Fixed Modal autoheight source map

Appsmith's `MODAL_WIDGET` is detached from its parent Fixed canvas. The
ordinary `FixedLayoutWidgetComponent` measurement wrapper deliberately skips
detached widgets (`app/client/src/layoutSystems/fixedlayout/common/widgetComponent/FixedLayoutWidgetComponent.tsx`). Its **child Text** still uses the normal measurement wrapper. The autoheight sagas process that Text's row change in the Modal's child canvas, then handle the Modal as a detached parent:

- `app/client/src/sagas/autoHeightSagas/helpers.ts:getMinHeightBasedOnChildren` ignores detached children and finds the bottommost occupied row in the Modal canvas.
- `app/client/src/sagas/autoHeightSagas/widgets.ts` adds `CANVAS_EXTENSION_OFFSET` (two rows), applies the Modal minimum and maximum, and writes `height` and `minHeight` in **pixels** and `bottomRow` for the detached Modal. The main canvas sibling reflow omits the Modal.
- `app/client/src/sagas/autoHeightSagas/containers.ts` performs the same calculation on page load.
- `app/client/src/utils/WidgetSizeUtils.ts:getCanvasBottomRow` explicitly reads `Modal.height` when determining its child canvas size.
- `app/client/src/layoutSystems/fixedlayout/editor/FixedLayoutEditorModalOnion.tsx` disables vertical drag resizing while autoheight is enabled. `app/client/src/utils/WidgetFeatures.ts` offers Modal only **Auto Height** and **Fixed** modes.
- `app/client/src/utils/autoHeight/mutateDOM.ts` adjusts the Blueprint overlay content directly during a measurement update, ahead of the Redux render. Our overlay has a different DOM structure, so this cannot be copied verbatim.

The isolated `modalAutoHeight.ts` mirrors the detached height calculation for
the local DSL. It updates `Modal.height`, `Modal.minHeight`, and row bounds, and
keeps the nested canvas minimum and row bounds in sync. It leaves root and
sibling geometry unchanged. Local bounds use `topRow + heightRows` because a
new Modal can be dropped at a nonzero top row; Appsmith's detached saga writes
`bottomRow = heightRows` assuming its own Modal coordinate convention.

## Integrated document behavior

`editable-store/autoHeightDocument.ts` calls `recomputeModalAutoHeight`
after descendant measurement reflow and after the generic Container/Tabs
recompute. The latter is already used for document load, layout edits, and
clipboard paste. The store contract in `auto-height.contract.test.cjs`
covers load normalization, child Text growth and shrink, nested canvas sync,
unchanged root siblings, and no new undo entries.

The Modal property pane now offers Appsmith's **Auto Height** and **Fixed**
choices. The existing Redux height-mode command accepts Modal and reuses
`WidgetFeatures.updateMinMaxDynamicHeight`; switching to Auto recomputes from
its child canvas. Fixed pixel height edits synchronize Modal row bounds and
the child canvas. The optional limited mode is deliberately absent from the
Modal dropdown, matching Appsmith. Imported DSL already carrying that mode
still respects paired limit updates, as the store contract verifies.

## Dedicated Modal edge resize

Appsmith renders a separate `FixedLayoutEditorModalOnion` around the detached
Modal. It uses `ModalResizableLayer` and `ModalResizable` from
`app/client/src/layoutSystems/common/resizer`, with four symmetric side
handles, one-pixel pointer snapping, a 100-pixel minimum and a 95%-of-main-
canvas width cap, independent of the editor viewport width. Left/right remain active in Auto Height; top/bottom are
enabled only in Fixed height. `ModalSagas.ts:resizeModalSaga` persists pixel
width/height and synchronizes the Modal's child canvas height.

`NativeModalResizable.tsx` carries that interaction and Appsmith handle CSS
into the extracted editor. `modalResizeModel.ts` handles pixel limits and child
canvas row conversion. The `resizeEditorModal` Redux/saga command updates the
detached Modal DSL, nested canvas bounds, undo history and local save. It does
not reflow root siblings. Editor measurement updates queue during a gesture
and flush when resizing ends. A handle release over the backdrop keeps the
Modal selected; a separate backdrop press closes it.

Appsmith's Blueprint overlay content is positioned outside flex sizing. The
extracted overlay uses flex centering, so its editor wrapper and viewer panel
set `flex: 0 0 auto`; otherwise a narrow editor viewport silently shrinks a
Modal below its width capped against the selected main-canvas preset.

`modal-resize.contract.test.cjs` covers the geometry, Auto Height gate,
child-canvas bounds, undo and invalid canvas ID. `scripts/verify-browser.cjs`
checks both horizontal directions, a narrow editor viewport, Fixed vertical
resize, Auto Height's vertical gate, child drop/save, and backdrop origin
behavior. The browser flow also
checks Text growth and shrink inside the open Modal. Default Close/Confirm
buttons remain static until the product action contract exists.
