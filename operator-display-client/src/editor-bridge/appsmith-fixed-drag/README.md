# Appsmith fixed-layout drag presentation

`DragVisuals.tsx` ports the visual rules from these Appsmith client sources:

- `app/client/src/layoutSystems/common/dropTarget/DragLayerComponent.tsx`: the active drop target's dotted grid, 1 px points, 6 px container padding, and column spacing formula.
- `app/client/src/layoutSystems/fixedlayout/editor/FixedLayoutCanvasArenas/hooks/useRenderBlocksOnCanvas.ts`: Canvas2D blue/red fills and snapped 3 px dashed outlines.
- `app/client/src/layoutSystems/common/canvasArenas/StickyCanvasArena.tsx`: a backing canvas sized to the visible part of a scrollable arena, scaled for the device pixel ratio.
- `app/client/src/constants/WidgetConstants.tsx` and `app/client/src/constants/Colors.tsx`: 64 columns, 10 px default row height, container padding, and the `#E0DEDE` grid color.

The component takes geometry and validity as props because the product editor uses its own Redux/saga document commands and the Appsmith reflow core already copied into `../editable-store/appsmith-reflow/`. The active canvas frame is positioned relative to the editor host. Each block's pixel coordinates are relative to that frame before the 6 px container padding is added. The grid and preview accept no pointer events. The original Appsmith components fetch those inputs from Appsmith-specific selectors and contexts; this component does not import them.

Only the presentation primitives are ported here. Drag start, destination selection, collision/reflow, and commit remain the responsibility of the caller.

`WidgetChrome.tsx` adapts the name badge, selection boundary, and eight resize hit areas from `app/client/src/layoutSystems/common/widgetName/` and `app/client/src/layoutSystems/common/resizer/ResizeStyledComponents.tsx`. The buttons preserve the product editor's keyboard controls, while the measurements, placement, and colors follow Appsmith's fixed editor.

`thumbnails/` contains exact copies of the ten supported palette widget thumbnails from `app/client/src/widgets/{TextWidget,ChartWidget,ContainerWidget,ImageWidget,DividerWidget,ProgressWidget,TabsWidget,ModalWidget,ListWidgetV2,StatboxWidget}/thumbnail.svg`. `WorkbenchPage.tsx` renders them with Appsmith's widget-card sizing and hover styles.
