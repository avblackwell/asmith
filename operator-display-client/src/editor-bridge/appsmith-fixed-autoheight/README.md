# Appsmith Fixed auto-height port

The files here isolate Appsmith Fixed layout auto-height behavior from its editor
Redux selectors and Java persistence actions. The source is the checked-in
`app/client/src` tree. No Appsmith backend is imported.

## Source map

| Extracted module | Appsmith source |
| --- | --- |
| `autoHeightRules.ts` | `widgets/WidgetUtils.ts` (`isAutoHeightEnabledForWidget*`, min/max, `shouldUpdateWidgetHeightAutomatically`), `layoutSystems/fixedlayout/common/autoHeightOverlay/hooks.ts` (paired min/max drag), `layoutSystems/fixedlayout/common/autoHeightOverlay/utils.ts` (snapping), `layoutSystems/fixedlayout/common/autoHeight/AutoHeightContainer.tsx` (content padding), `layoutSystems/common/dropTarget/DropTargetUtils.ts` (canvas row extension) |
| `AutoHeightOverlay.tsx` | `layoutSystems/fixedlayout/common/autoHeightOverlay/{AutoHeightOverlay,AutoHeightLimitHandleGroup,constants}.tsx`, its `ui/*` styled components, and `AutoHeightOverlayLayer.tsx` |
| `AutoHeightContainer.tsx` | `layoutSystems/fixedlayout/common/autoHeight/{AutoHeightContainer,AutoHeightContainerWrapper}.tsx` |

Appsmith uses `react-use-gesture` for the pink handles. That library is not in
the extracted client's package. The overlay keeps Appsmith's CSS, row snapping,
coupled min/max motion, active labels, and batch commit, with pointer event
ownership isolated to this component. If the full Appsmith dependency is later
included, the gesture binder can be swapped without changing the editor
callback or geometry.

## Integrated Fixed editor path

- New Text and Container widgets use Appsmith's `AUTO_HEIGHT` feature defaults:
  4 and 10 minimum rows respectively, and a 9000-row maximum. Grouping also
  creates an auto-height Container, as Appsmith's widget factory does. Legacy
  widgets without `dynamicHeight` retain Fixed behavior, matching migration 068.
- The property pane exposes Fixed, Auto Height, and Auto Height with limits.
  Mode updates and paired min/max updates each form one undoable document
  command. The selected widget's pink limit overlay is mounted only for the
  limits mode and is hidden during drag and multi-selection.
- `NativeReadOnlyCanvas` wraps editor Text content in
  `AppsmithAutoHeightContainer`. Its `ResizeObserver` supplies padded and
  10px-snapped pixels to `measureEditorWidgetHeight`. The workbench retains the
  mounted canvas and compatibility Redux store through ordinary DSL edits, as
  Appsmith retains its editor widget tree. Measurement still waits for the
  first observer reading on initial mount or draft switch instead of sending
  an initial zero-height update. After each payload projection, the wrapper
  retries a pending measured height so a sibling's document update cannot
  discard its first reading while the canvas is briefly input-disabled. The
  observer reconnects when the limits mode changes the measured DOM element
  inside the still-mounted Text widget.
- The editor store queues measurements during drag, then applies them without
  adding undo entries. Its `appsmith-auto-height/` directory copies Appsmith's
  pure dependency-tree and reflow functions with local imports. The DSL adapter
  clamps min/max, moves vertically dependent siblings, grows auto-height
  Container ancestors from their child canvases, and updates the root. Explicit
  auto-height Containers are also checked when a draft first mounts. Container
  height follows inner child geometry; Containers are not DOM-measured as Text is.
- Root and nested canvas geometry already use Appsmith's 64-column grid,
  root/nested padding, and +8/+2 extension offsets. Stored root `bottomRow`
  remains separate from the hydrated pixel height and `minHeight`.

## Validation

- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`
- `node src/editor-bridge/appsmith-fixed-autoheight/autoHeightRules.contract.test.cjs`
- `node src/editor-bridge/editable-store/appsmith-auto-height/source-parity.contract.test.cjs`
- `node src/editor-bridge/editable-store/auto-height.contract.test.cjs`
- `node scripts/verify-browser.cjs` after the production build

Only Text and Container have an enabled auto-height feature among the current
six-widget palette. Imported List, Tabs, and other Appsmith widget types need
their own widget contracts before their auto-height paths can run here.
