# Appsmith Fixed Iframe, Map, and Map Chart source slice

Read before porting:

- `app/client/src/widgets/IframeWidget/widget/index.tsx`, `component/index.tsx`, `constants.ts`, and `app/client/src/utils/validation/getIsSafeURL.ts`
- `app/client/src/widgets/MapWidget/widget/index.tsx`, `component/{index,Map,Marker,Markers,Clusterer,SearchBox,PickMyLocation}.tsx`, `constants.ts`, and the source `pick-location-selected.svg`
- `app/client/src/widgets/MapChartWidget/widget/index.tsx`, `component/{index,utilities,countryDetails,types}.ts(x)`, `constants.ts`, and all nine `app/client/public/static/maps/*.json` assets

The map chart uses Appsmith's ECharts SVG map option builder, projection offsets, country/region labels, color ranges, click data shape, and exact local GeoJSON. The GeoJSON assets were copied byte for byte to `operator-display-client/public/static/maps`. Their source total is about 23 MB. The property `mapType` must apply Appsmith's update hook: setting `mapType` also replaces `data` with that map's default data set (`mapTypeUpdates`). A chart does not need a Google API key.

The Google Map widget uses Appsmith's `@googlemaps/react-wrapper`, marker/clusterer, place search, pick my location, Google map type control, center, and marker components. `NativeMapView` wraps those components with Appsmith's defaults and transient meta (`center`, `markers`, `selectedMarker`). Appsmith injects `googleMapsApiKey` from instance configuration; it is not saved in the widget DSL. The caller must supply a browser Google Maps API key through `apiKey`. Without one, the widget shows Appsmith's disabled state. A live keyed Google Maps interaction was not verified because no development key or deployment exists. The copied `Map.tsx` forwards `clickedMarkerCentered` and `selectedMarker` to marker components; the Appsmith source declares these props but omits the forwarding.

The iframe preserves Appsmith's source/srcDoc choice, editor overlay, border fields, `srcDoc` sandbox flags, and message source check. `safeIframeSource` applies the safe URL intent to browser embeddable HTTP(S) and local paths; unresolved binding text, script protocols, and local API routes are ignored. Appsmith's action selectors (`onURLChanged`, `onSrcDocChanged`, `onMessageReceived`, `onMarkerClick`, `onCreateMarker`, `onDataPointClick`) are represented by callback boundaries. This isolated port does not execute saved Appsmith action strings. The caller can send `onMessageReceived` data and map/map-chart selection to the product meta store.

Appsmith Fixed defaults for central integration:

| Widget | Geometry | Source defaults |
| --- | --- | --- |
| `IFRAME_WIDGET` | 32 rows × 24 columns | source `https://www.example.com`, borderWidth 1, borderOpacity 100, animateLoading and visible true |
| `MAP_WIDGET` | 40 rows × 24 columns | NYC center and marker, zoomLevel 50, search/pick location on, clicked marker centering on, map types off |
| `MAP_CHART_WIDGET` | 32 rows × 24 columns | WORLD map, Global Population title, showLabels true, source sample data and three source color ranges |

Appsmith content/style controls are in each source widget's `getPropertyPaneContentConfig` and `getPropertyPaneStyleConfig`. Iframe: source, srcDoc, title, animateLoading, visible, border color/width/opacity/radius, shadow. Map: mapCenter, defaultMarkers, zoomLevel, visible, animateLoading, pick location, clicked marker centering, clustering, search, map types, create marker, radius, shadow. Map Chart: mapType, data, mapTitle, visible, showLabels, colorRange, radius, shadow. Event action selectors require the product action schema before they can be exposed as functional controls.

Run from `operator-display-client`:

```text
node src/editor-bridge/native-widgets/map-embed/map-embed.contract.test.cjs
node src/editor-bridge/native-widgets/map-embed/map-embed.browser.test.cjs
```

The browser test expects the local Vite server at `http://127.0.0.1:3004`.
