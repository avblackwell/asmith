import React from "react";
import ReactDOM from "react-dom";
import type { AppsmithWidgetDsl } from "../../../document";
import { NativeCaptureUploadView, captureUploadDefaults } from "./index";
import type { CaptureUploadWidgetType } from "./model";

function widget(type: CaptureUploadWidgetType, extra: Record<string, unknown> = {}): AppsmithWidgetDsl {
  return { ...captureUploadDefaults(type), ...extra, type, widgetId: type,
    widgetName: type, version: 1, topRow: 0, bottomRow: 10,
    leftColumn: 0, rightColumn: 20 } as AppsmithWidgetDsl;
}

function Harness(): React.ReactElement {
  const [fileMeta, setFileMeta] = React.useState<Record<string, unknown>>({});
  const [fileEvents, setFileEvents] = React.useState(0);
  const [fileMount, setFileMount] = React.useState(0);
  const [audioMeta, setAudioMeta] = React.useState<Record<string, unknown>>({});
  const [cameraMeta, setCameraMeta] = React.useState<Record<string, unknown>>({});
  const [videoMeta, setVideoMeta] = React.useState<Record<string, unknown>>({});
  const [scannerMeta, setScannerMeta] = React.useState<Record<string, unknown>>({});
  return <main style={{ fontFamily: "Arial", padding: 12 }}>
    <section data-testid="file-host" style={{ width: 240, height: 40 }}>
      <NativeCaptureUploadView key={fileMount}
        widget={widget("FILE_PICKER_WIDGET_V2", { fileDataType: "Text" })}
        meta={fileMeta} onMetaChange={(update) => setFileMeta((before) => ({ ...before, ...update }))}
        onEvent={(event) => { if (event === "onFilesSelected") setFileEvents((count) => count + 1); }} />
    </section>
    <output data-testid="file-count">{Array.isArray(fileMeta.selectedFiles) ? fileMeta.selectedFiles.length : 0}</output>
    <output data-testid="file-data">{Array.isArray(fileMeta.selectedFiles)
      ? String((fileMeta.selectedFiles[0] as { data?: unknown } | undefined)?.data ?? "") : ""}</output>
    <output data-testid="file-events">{fileEvents}</output>
    <button type="button" onClick={() => setFileMount((value) => value + 1)}>Remount picker</button>
    <section data-testid="audio-host" style={{ width: 320, height: 80 }}>
      <NativeCaptureUploadView widget={widget("AUDIO_RECORDER_WIDGET")}
        meta={audioMeta} onMetaChange={(update) => setAudioMeta((before) => ({ ...before, ...update }))} />
    </section>
    <output data-testid="audio-dirty">{String(audioMeta.isDirty === true)}</output>
    <output data-testid="audio-data">{String(typeof audioMeta.dataURL === "string")}</output>
    <section data-testid="camera-host" style={{ width: 360, height: 350 }}>
      <NativeCaptureUploadView widget={widget("CAMERA_WIDGET")}
        meta={cameraMeta} onMetaChange={(update) => setCameraMeta((before) => ({ ...before, ...update }))} />
    </section>
    <output data-testid="camera-image">{String(typeof cameraMeta.imageDataURL === "string")}</output>
    <section data-testid="video-host" style={{ width: 360, height: 350 }}>
      <NativeCaptureUploadView widget={widget("CAMERA_WIDGET", { mode: "VIDEO" })}
        meta={videoMeta} onMetaChange={(update) => setVideoMeta((before) => ({ ...before, ...update }))} />
    </section>
    <output data-testid="video-data">{String(typeof videoMeta.videoDataURL === "string")}</output>
    <section data-testid="scanner-host" style={{ width: 230, height: 45 }}>
      <NativeCaptureUploadView widget={widget("CODE_SCANNER_WIDGET", { scannerLayout: "CLICK_TO_SCAN" })}
        meta={scannerMeta} onMetaChange={(update) => setScannerMeta((before) => ({ ...before, ...update }))} />
    </section>
  </main>;
}

ReactDOM.render(<Harness />, document.getElementById("root"));
