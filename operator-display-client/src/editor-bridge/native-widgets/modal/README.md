# Fixed Modal source slice

This package materializes Appsmith's Fixed `MODAL_WIDGET` blueprint and its
isolated overlay/render geometry. Source map:

- `app/client/src/widgets/ModalWidget/widget/index.tsx`:
  `getDefaults()` supplies the 24-row Modal, its nested `CANVAS_WIDGET`, and
  close icon, title, Close button, and Confirm button. `getModalVisibility()`
  includes selected-widget ancestry. `getStylesheetConfig()` supplies the theme
  border-radius binding and no shadow.
- `app/client/src/utils/WidgetFeatures.ts`: active canvas dynamic-height
  defaults (`AUTO_HEIGHT`, minimum 24 rows, maximum 9000 rows).
- `app/client/src/widgets/ModalWidget/component/useModalWidth.ts` and
  `app/client/src/constants/WidgetConstants.tsx`: Modal width is capped at
  95% of `ui.mainCanvas.width`; widget padding is 4 pixels per side.
- `app/client/src/widgets/ModalWidget/component/index.tsx`: the nested canvas
  receives modal width plus 8 pixels, modal minimum height, and `canExtend`
  from `shouldScrollContents`; the wrapper and content own background, radius,
  and scrolling.
- `app/client/src/layoutSystems/common/modalOverlay/ModalOverlayLayer.tsx`
  and `layoutSystems/fixedlayout/{editor,viewer}/*ModalOnion.tsx`: fixed
  overlay, backdrop, outside-click/Escape close paths, and edit/view height
  limits.

`createModalWidgetBlueprint(options)` returns a complete nested DSL subtree.
`addWidgetToDocument` allocates and checks all six IDs and names, then the
existing Redux/saga command inserts it as one undoable edit. The nested
`CANVAS_WIDGET` accepts Fixed widgets through the usual palette/drop path.
Structural DSL bounds keep its 64-column grid valid; `modalRenderMetrics()`
calculates its runtime pixel width. `NativeModalView` receives the active
`ui.mainCanvas.width`, renders the nested canvas, and sends dismissal requests
through `setEditorModalOpen`. Appsmith's two visibility inputs stay separate:
selection of the Modal or a descendant reveals it in the editor, and an
explicit transient Redux meta value can open or close it without changing the
saved DSL. Selection does not write the meta value. Closing clears selected
ancestry, matching `ModalWidget.closeModal`.

The editor overlay is bounded to `.od-workbench__viewport`, leaving the
palette and property pane interactive. Appsmith's `ModalOverlayLayer` uses its
own IDE sidebar offset; the extracted shell has a separate property pane too.
The editor panel omits `aria-modal` because the surrounding controls remain
available. The viewer panel retains `aria-modal`.

Appsmith's blueprint adds `{{closeModal(...)}}` `onClick` strings to the close
icon and Close button. They are deliberately omitted. The document currently
rejects event handler strings, and there is no product action contract to
open a modal, close it from its children, execute Confirm, or run `onClose`.
The view requests dismissal for Escape or backdrop clicks. The default
Button/IconButton children render as static visual surfaces; they do not run
`closeModal` or Confirm. The editor exposes Appsmith's non-action Modal
property controls, Auto/Fixed height mode, and a pixel height field in Fixed
mode. Detached Modal autoheight document updates follow child Text reflow; see
`MODAL_AUTOHEIGHT.md`. Appsmith uses a dedicated `ModalResizableLayer` for
drag resizing; that overlay and loading animation behavior are not yet ported.
These are explicit parity gaps, not event handlers silently approximated by
the local editor.

Run `node src/editor-bridge/native-widgets/modal/modal.contract.test.cjs` from
`operator-display-client` for the blueprint, document validation, width,
visibility, and read-only render contracts.
Run `node src/editor-bridge/editable-store/modal.contract.test.cjs` for the
palette, nested canvas, property, undo, and transient visibility contract.
