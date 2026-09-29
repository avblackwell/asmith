# Appsmith Fixed canvas width presets

This module ports Appsmith's canvas size control for the independent workbench.
The five options, their order, icons, names, width ranges, and `resolveCanvasWidth`
algorithm come from the checked-in Appsmith client:

| Local file | Appsmith source |
| --- | --- |
| `widthPresets.ts` | `src/pages/Editor/MainContainerWidthToggles.tsx`, `src/constants/WidgetConstants.tsx`, `src/pages/hooks/utils/resolveCanvasWidth.ts` |
| `MainContainerWidthToggles.tsx` | `src/pages/Editor/MainContainerWidthToggles.tsx` |
| `vendor/ads/src/SegmentedControl/*` | `packages/design-system/ads/src/SegmentedControl/*` |

Appsmith stores the selected `appLayout.type` on the application, separately
from the root widget DSL. A `ResizeObserver` in
`useCanvasWidthAutoResize.ts` resolves the available pane width and dispatches
the resulting pixel width to the canvas store. The local document stores the
selected preset in its compatibility configuration. The editor then resolves
the actual width from its pane size; it does not infer a preset from a pixel
width because Fluid and the bounded presets may produce the same value.
`updateCanvasWidth` stores each measured width in the mounted compatibility
Redux store. Root widget geometry, editable canvas hit targets, and drag visuals
read that transient width. A viewport resize leaves the saved DSL unchanged.

The isolated ADS package lacks `rc-tooltip`, so the icon labels use the native
`title` attribute in place of Appsmith's tooltip wrapper. The SegmentedControl
and its styling are copied unchanged from Appsmith ADS.

Run the width rules contract with
`node src/editor-bridge/appsmith-fixed-width/widthPresets.contract.test.cjs`.
