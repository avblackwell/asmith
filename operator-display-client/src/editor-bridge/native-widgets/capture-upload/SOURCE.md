# Capture and upload widget port

This folder ports the four Community Edition Fixed palette widgets that use browser file and media capabilities. The authored defaults, sizes, property names, and transient metadata keys come from the Appsmith widget classes. Browser capture uses the same underlying packages as Appsmith.

| Widget | Appsmith source | Browser package and state |
| --- | --- | --- |
| File Picker V2 | `app/client/src/widgets/FilePickerWidgetV2/widget/index.tsx`, `component/index.tsx`, `widget/FileParser.ts`, `widget/index.styled.tsx` | Uppy Core/Dashboard, public Companion source plugins, `selectedFiles`/`isDirty`; `FileParser.ts` is copied with only its import redirected |
| Audio Recorder | `app/client/src/widgets/AudioRecorderWidget/widget/index.tsx`, `component/index.tsx` | `react-media-recorder`, `react-timer-hook`, source SVG icons, recorder/player statuses, `blobURL`/`dataURL`/`rawBinary`/`isDirty` |
| Camera | `app/client/src/widgets/CameraWidget/widget/index.tsx`, `component/index.tsx`, `constants.ts` | `react-webcam`, `react-full-screen`, `MediaRecorder`, source capture statuses and image/video metadata |
| Code Scanner | `app/client/src/widgets/CodeScannerWidget/widget/index.tsx`, `component/index.tsx`, `widget/propertyConfig/*`, `constants.ts` | `react-qr-barcode-scanner`, `react-modal`, `react-page-visibility`, `react-device-detect`; `value` meta |

`model.ts` holds the literal Fixed defaults and metadata templates. `FileParser.ts` and `getVideoConstraints.ts` are copies of the Appsmith helpers with only the parser import redirected. `propertyConfig.ts` maps source controls to the local property pane's supported control types. The four source thumbnails should be copied directly to the workbench palette during integration.

## Integration contract

Import `NativeCaptureUploadView`, `isCaptureUploadWidget`, `captureUploadDefaults`, `captureUploadMetaDefaults`, and `CAPTURE_UPLOAD_PROPERTY_CONTROLS` from `./capture-upload`. Render `NativeCaptureUploadView` for its four types, passing the DSL widget, transient per-widget Redux meta, `editor`, theme colors, and an `onMetaChange` that merges the partial update into Redux meta without editing the authored document. `onEvent(name)` is the future product action boundary. The controls use browser-local media/file data and do not call the Java backend.

The Fixed source sizes are File Picker `4 × 16`, Audio Recorder `7 × 16`, Camera `33 × 25`, and Code Scanner `33 × 25` rows/columns. Add these four types to the product addable union and property pane map, using `captureUploadDefaults(type)` for authored fields. Keep `selectedFiles`, recording URLs, scan `value`, and capture status in transient meta. Appsmith's `files` and `isValid` are derived from `selectedFiles`; consumers should project them from meta when binding support is added.

## Known differences and external requirements

- The local property pane has no multiselect dropdown or `ICON_SELECT`; `allowedFileTypes` uses its JSON array editor, and Code Scanner icon selection is not exposed. Camera and Scanner device menus use native selectors in place of Appsmith's Blueprint popovers. The camera/audio control layout is source-derived but is not a verbatim copy of Appsmith's full component styling.
- Appsmith's `createBlobUrl` hands blob identifiers to its evaluator and action runtime. This standalone client keeps browser object URLs in `rawBinary` and Base64 data URLs in `dataURL`; the product action contract must decide how to pass actual binary blobs to an upload endpoint. These values are transient and must not be saved in a dashboard document.
- Appsmith's `ACTION_SELECTOR` handlers (`onFilesSelected`, `onRecordingStart`, `onRecordingComplete`, `onImageSave`, `onRecordingStop`, `onVideoSave`, `onCodeDetected`) require a product-owned action schema and execution path. `onEvent` reports the trigger name; it does not execute a backend request.
- File Picker's Google Drive, URL, and OneDrive plugins use Appsmith's public `https://companion.uppy.io` endpoint. Cloud selection requires access to that endpoint. Direct local file selection needs no backend. Browser camera/microphone permission requires a secure context; `localhost` is allowed by browsers.
- The Code Scanner modal and camera stream were browser tested using a fake device, but decoding a real QR/barcode and cloud file selection were not verified. A live deployment and a physical device remain useful for those checks.

## Focused verification

From `operator-display-client`, with its Vite dev server running on port 3004:

```powershell
node src/editor-bridge/native-widgets/capture-upload/capture-upload.browser.test.cjs
./node_modules/.bin/tsc --noEmit
node scripts/check-boundary.cjs
```

The Chrome test covers Uppy local file parsing and upload callback, retention across a picker remount, audio recording metadata, camera still/video metadata and save states, and the Code Scanner click-to-scan modal. It runs Chrome with fake camera and microphone devices.
