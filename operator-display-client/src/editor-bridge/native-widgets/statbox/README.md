# Fixed Statbox source slice

`createStatboxWidgetBlueprint` materializes the Fixed branch of Appsmith's
`STATBOX_WIDGET` default blueprint as one nested dashboard DSL subtree. Source:

- `app/client/src/widgets/StatboxWidget/widget/index.tsx`: `getDefaults()`
  supplies 22 × 14 grid default size, white surface, gray border, one canvas,
  three Text children, and one IconButton child. Its `MODIFY_PROPS` operation
  returns no updates for Fixed layout. `getPropertyPaneContentConfig()` and
  `getPropertyPaneStyleConfig()` are the property controls to carry forward.
- `app/client/src/widgets/ContainerWidget/widget/index.tsx` and
  `app/client/src/widgets/ContainerWidget/component/index.tsx`: Statbox inherits
  Container's nested canvas rendering and surface styling.
- `app/client/src/sagas/WidgetBlueprintSagas.ts` and
  `app/client/src/sagas/WidgetAdditionSagas.ts`: create child widget IDs and
  names, expand the blueprint, and size the child canvas from the parent.
- `app/client/src/utils/WidgetFeatures.ts`: canvas widgets default to
  `AUTO_HEIGHT`, a 10-row minimum, and scrollable contents.
- `app/client/src/widgets/TextWidget/widget/index.tsx` and
  `app/client/src/widgets/IconButtonWidget/widget/index.tsx`: supply inherited
  child defaults and theme properties.
- `app/client/src/widgets/IconButtonWidget/component/index.tsx` and
  `app/client/src/assets/icons/blueprintjs/20px/arrow-top-right.svg`: supply
  the centered button sizing, shape, and default arrow icon path used by the
  local static icon surface.

Appsmith generates the child canvas width and height in pixels. The local
Fixed canvas document uses a 64-column logical child canvas; the existing
renderer computes its pixel frame from the outer Statbox. The four children
keep Appsmith's source blueprint positions and sizes on that grid. The editor
allocates unique IDs and names, then adds the returned subtree through one
Redux/saga document edit. No Appsmith event action is attached to the default icon.

The palette, Statbox property pane, nested Fixed canvas drop target, and
Container-style auto-height reflow are wired through the shared editor. The
default arrow uses `NativeStatboxIconButtonView`, a static source-style
surface. It deliberately has no click action. The broader IconButton property
pane and runtime action contract remain separate work, as do Appsmith loading
animations.

Run `node src/editor-bridge/native-widgets/statbox/statbox.contract.test.cjs`
from `operator-display-client` to check the blueprint, document, and icon
render contract. Run `node src/editor-bridge/editable-store/statbox.contract.test.cjs`
for the Redux/saga add, auto-height, property, and undo contract.
