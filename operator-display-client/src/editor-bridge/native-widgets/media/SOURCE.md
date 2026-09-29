# Fixed media widget source slice

These components adapt Appsmith's Fixed media widget views from the checked-in
Community Edition client. The source files reviewed before the port are:

- `app/client/src/widgets/DocumentViewerWidget/widget/index.tsx`
- `app/client/src/widgets/DocumentViewerWidget/component/index.tsx`
- `app/client/src/widgets/DocumentViewerWidget/component/DocViewer.tsx`
- `app/client/src/widgets/DocumentViewerWidget/component/XlsxViewer.tsx`
- `app/client/src/widgets/DocumentViewerWidget/constants.ts`
- `app/client/src/widgets/AudioWidget/widget/index.tsx` and `component/index.tsx`
- `app/client/src/widgets/VideoWidget/widget/index.tsx` and `component/index.tsx`
- The `react-documents` viewer URL builder used by Appsmith's document component.

`NativeDocumentViewerView` keeps Appsmith's extension selection and Dropbox raw,
OneDrive embed, and Microsoft Office embed URL paths. Native PDF and text URLs,
plus base64 PDF/text, use a browser frame. The isolated client does not include
Appsmith's `mammoth`, `xlsx`, or `react-documents` dependencies. Base64 DOCX/XLSX
shows an explicit unavailable state. Office URLs require a public HTTPS source
because the Microsoft viewer must fetch the file itself. Server access controls,
embed headers, and browser PDF support can still prevent a document from showing.

`NativeAudioView` and `NativeVideoView` preserve the source's visible player
controls, URL, autoplay setting, video autoplay muting, video frame styles, and
play/pause/end callback points for direct browser-supported media URLs. Appsmith
uses `react-player` to handle providers such as YouTube. That provider layer is
not in this isolated client, so these native elements do not claim provider
parity. Their transient `data-play-state` follows Appsmith's four states, but
the product's Redux meta tree and action executor are not connected here.

The source Fixed defaults for integration are Document Viewer 24 columns by 40
rows, Audio 28 by 4, and Video 24 by 28. Appsmith uses external sample media
URLs; the caller decides whether to seed those URLs in this product.

Run `node src/editor-bridge/native-widgets/media/media.contract.test.cjs`
from `operator-display-client` to check URL routing, source filtering, and
rendered media contracts.
