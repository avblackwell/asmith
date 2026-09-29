# Image and Divider read-only presentation

The standalone client adapts the presentation behavior of Appsmith's
`app/client/src/widgets/ImageWidget` and `DividerWidget` (Apache-2.0) from this
repository. The Appsmith widget classes and their Redux, action, editor, and
backend imports are deliberately outside this boundary. The shared
`NativeReadOnlyCanvas` passes hydrated fixed-layout DSL properties to these
components.

`NativeImageView` displays `image`, falls back to `defaultImage` when the first
source fails, and maps `cover`, `contain`, and Appsmith's `auto` fit to native
image styling. It retains border radius and shadow. Sources are limited to
HTTP(S), same-origin relative paths, and `data:image` URLs. External images use
`referrerPolicy="no-referrer"`. Unresolved `{{...}}` image properties show an
explicit unavailable state; they are never sent to the browser as URLs.
Same-origin `/api`, `/v1`, and `/rts` image paths are refused so a saved
dashboard cannot trigger Appsmith backend requests through an image element.
Zoom, rotation, download, click actions, and Appsmith's loading animation are
not implemented in the read-only viewer.

`NativeDividerView` retains horizontal/vertical orientation, solid/dashed/
dotted stroke, color, thickness, and dot/arrow end caps. It is exposed as an
accessible separator. The component renders no editor controls or actions.

The local contract check is
`node src/editor-bridge/native-widgets/static-display/static-display.contract.test.cjs`.
