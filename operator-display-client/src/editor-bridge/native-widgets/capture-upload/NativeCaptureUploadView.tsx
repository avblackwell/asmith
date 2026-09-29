import React from "react";
import type { AppsmithWidgetDsl } from "../../../document";
import { NativeFilePickerView } from "./NativeFilePickerView";
import type { SelectedFile } from "./NativeFilePickerView";
import { NativeAudioRecorderView } from "./NativeAudioRecorderView";
import type { AudioRecorderMeta } from "./NativeAudioRecorderView";
import { NativeCameraView } from "./NativeCameraView";
import type { CameraMeta } from "./NativeCameraView";
import { NativeCodeScannerView } from "./NativeCodeScannerView";

export interface NativeCaptureUploadViewProps {
  widget: AppsmithWidgetDsl;
  meta?: Record<string, unknown>;
  editor?: boolean;
  themePrimaryColor?: string;
  themeBorderRadius?: string;
  onMetaChange?: (meta: Record<string, unknown>) => void;
  onEvent?: (name: string) => void;
}

export function NativeCaptureUploadView(props: NativeCaptureUploadViewProps): React.ReactElement | null {
  const common = { widget: props.widget, editor: props.editor,
    themePrimaryColor: props.themePrimaryColor, themeBorderRadius: props.themeBorderRadius };
  switch (props.widget.type) {
    case "FILE_PICKER_WIDGET_V2": return <NativeFilePickerView {...common}
      selectedFiles={props.meta?.selectedFiles as SelectedFile[] | undefined}
      onMetaChange={props.onMetaChange}
      onFilesSelected={() => props.onEvent?.("onFilesSelected")} />;
    case "AUDIO_RECORDER_WIDGET": return <NativeAudioRecorderView {...common}
      meta={props.meta as Partial<AudioRecorderMeta>}
      onMetaChange={props.onMetaChange}
      onRecordingStart={() => props.onEvent?.("onRecordingStart")}
      onRecordingComplete={() => props.onEvent?.("onRecordingComplete")} />;
    case "CAMERA_WIDGET": return <NativeCameraView {...common}
      meta={props.meta as Partial<CameraMeta>}
      onMetaChange={props.onMetaChange}
      onImageCapture={() => props.onEvent?.("onImageCapture")}
      onImageSave={() => props.onEvent?.("onImageSave")}
      onRecordingStart={() => props.onEvent?.("onRecordingStart")}
      onRecordingStop={() => props.onEvent?.("onRecordingStop")}
      onVideoSave={() => props.onEvent?.("onVideoSave")} />;
    case "CODE_SCANNER_WIDGET": return <NativeCodeScannerView {...common}
      onMetaChange={props.onMetaChange}
      onCodeDetected={() => props.onEvent?.("onCodeDetected")} />;
    default: return null;
  }
}
