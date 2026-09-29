# Fixed Tabs source slice

This package materializes Appsmith's Fixed `TABS_WIDGET` blueprint and renders
the active tab's canvas without an Appsmith API, evaluator, or application
store. It is source-mapped to:

- `app/client/src/widgets/TabsWidget/widget/index.tsx`: defaults, the two
  `CANVAS_WIDGET` blueprint children, `tabsObj` ID wiring, visible-tab order,
  default-tab fallback, selected-widget ancestry, and the 4-row header offset.
- `app/client/src/widgets/TabsWidget/component/index.tsx` and
  `component/PageTabs.tsx`: 40px strip, horizontally scrolling tabs, underline,
  scroll arrows, and active-child presentation.
- `app/client/src/utils/WidgetFeatures.ts`: active dynamic-height defaults for
  a canvas-owning widget.
- `app/client/src/components/propertyControls/TabControl.tsx`: ordered tab
  cards, editable labels, visibility, add/delete, and drag reorder.
- `app/client/src/components/propertyControls/DraggableListCard.tsx` and
  `StyledControls.tsx`: the 45px input card, overlaid drag icon, settings and
  delete actions, and duplicate-label border.
- `app/client/src/pages/Editor/PropertyPane/PanelPropertiesEditor.tsx` and
  `app/client/src/widgets/TabsWidget/widget/index.tsx`: tab settings panel and
  its Visible switch.
- `app/client/packages/design-system/ads-old/src/DraggableList/index.tsx`:
  Appsmith's spring and gesture list behavior.

`createTabsWidgetBlueprint` takes IDs and names allocated by the caller and
returns one complete DSL subtree. The caller must check those four IDs/names
against the whole document before insertion and commit the returned subtree
through the existing Redux/saga document command. The builder links each
`tabsObj` entry to its child canvas as Appsmith's blueprint operation does.

`NativeTabsView` accepts migrated `tabsObj` and `renderCanvas(activeCanvasId)`.
It renders one active canvas at a time. `NativeReadOnlyCanvas` supplies the real
nested Fixed canvas, passes selected-widget ancestry in editor mode, and shares
transient tab selection with `EditableCanvas`. The active child canvas is the
drop target; the tab strip is excluded. The viewer can select tabs without
changing the document. `TABS_INPUT` in the property pane uses atomic document
commands for add, delete, rename, reorder, and visibility; its child canvas
metadata and bindings are changed in the same transaction. These commands
participate in undo/redo, while choosing a tab does not.

The `TABS_INPUT` data model and operations follow Appsmith `TabControl`. The
property presentation now uses the vendored Appsmith ADS `Button`, `Icon`,
`Input`, and `Tag` components. Its 45px cards and CSS positioning mirror
`DraggableListCard` and `StyledControls`; the settings action opens the tab's
Visible switch as Appsmith's `panelConfig` does. `onTabEdit` routes all writes
to the same atomic document transactions. Because the older Appsmith spring
list pulls in `react-spring`, `react-use-gesture`, and `lodash-es`, which are
outside the isolated client dependency graph, reorder still uses native
drag/drop. The handle also supports Alt+Up and Alt+Down for keyboard reorder.
The nested settings view is local to this control instead of replacing the
whole property pane. These are the remaining `TABS_INPUT` visual/interaction
differences from Appsmith.

Appsmith's auto-height saga sizes Tabs from the **active** canvas after a tab
switch. The authored editor document still sizes from the tallest tab so a
hidden tall canvas cannot be clipped when the document is saved. The pure
`projectActiveTabsAutoHeight` helper derives selected-tab geometry from that
source, using Appsmith's existing auto-height dependency tree and reflow
algorithm. It returns a view-only JSON projection and an identity flag; the
source document remains the Redux save/undo/dirty basis. Its contract checks
shorter and taller tabs, overlapping siblings, unrelated columns, nested
Container propagation, and source identity. The workbench must pass this
projection to its renderer/planner to complete active-tab sizing in the UI.

The Appsmith `onTabSelected` action is not exposed: the dashboard document
currently rejects event actions and has no product action contract. Other
Appsmith canvas-owning widgets, including List and Modal, require their own
rendering/runtime contracts before they can enter the supported palette.

Run `node src/editor-bridge/native-widgets/tabs/tabs.contract.test.cjs` from
`operator-display-client` for the blueprint, selection, and render contract.
Run `node src/editor-bridge/editable-store/tabs.contract.test.cjs` for the
editor, property config, transient selection, and auto-height contract.
Run `node src/editor-bridge/native-widgets/tabs/activeTabAutoHeight.contract.test.cjs`
for the transient selected-tab geometry contract.
