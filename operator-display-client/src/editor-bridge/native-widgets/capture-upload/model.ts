/** Literal Fixed defaults and transient metadata from the four Appsmith widget classes. */
export type CaptureUploadWidgetType =
  | "FILE_PICKER_WIDGET_V2"
  | "AUDIO_RECORDER_WIDGET"
  | "CAMERA_WIDGET"
  | "CODE_SCANNER_WIDGET";

export const CAPTURE_UPLOAD_WIDGET_TYPES: readonly CaptureUploadWidgetType[] = [
  "FILE_PICKER_WIDGET_V2", "AUDIO_RECORDER_WIDGET", "CAMERA_WIDGET", "CODE_SCANNER_WIDGET",
];

export function isCaptureUploadWidget(type: string): type is CaptureUploadWidgetType {
  return (CAPTURE_UPLOAD_WIDGET_TYPES as readonly string[]).includes(type);
}

export enum FileDataTypes {
  Base64 = "Base64", Text = "Text", Binary = "Binary", Array = "Array",
}

export enum CameraModeTypes {
  CAMERA = "CAMERA", VIDEO = "VIDEO",
}

export enum MediaCaptureStatusTypes {
  IMAGE_DEFAULT = "IMAGE_DEFAULT", IMAGE_CAPTURED = "IMAGE_CAPTURED",
  IMAGE_SAVED = "IMAGE_SAVED", VIDEO_DEFAULT = "VIDEO_DEFAULT",
  VIDEO_RECORDING = "VIDEO_RECORDING", VIDEO_CAPTURED = "VIDEO_CAPTURED",
  VIDEO_PLAYING = "VIDEO_PLAYING", VIDEO_PAUSED = "VIDEO_PAUSED",
  VIDEO_SAVED = "VIDEO_SAVED", VIDEO_PLAYING_AFTER_SAVE = "VIDEO_PLAYING_AFTER_SAVE",
  VIDEO_PAUSED_AFTER_SAVE = "VIDEO_PAUSED_AFTER_SAVE",
}

export enum ScannerLayout {
  ALWAYS_ON = "ALWAYS_ON", CLICK_TO_SCAN = "CLICK_TO_SCAN",
}

export const CAPTURE_UPLOAD_DEFAULTS: Record<CaptureUploadWidgetType, Record<string, unknown>> = {
  FILE_PICKER_WIDGET_V2: {
    rows: 4, columns: 16, files: [], selectedFiles: [], allowedFileTypes: [],
    label: "Select Files", maxNumFiles: 1, maxFileSize: 5,
    fileDataType: FileDataTypes.Base64, dynamicTyping: true,
    widgetName: "FilePicker", isDefaultClickDisabled: true, version: 1,
    isRequired: false, isDisabled: false, animateLoading: true,
    responsiveBehavior: "hug", minWidth: 120,
  },
  AUDIO_RECORDER_WIDGET: {
    iconColor: "white", isDisabled: false, isVisible: true,
    rows: 7, columns: 16, widgetName: "AudioRecorder", version: 1,
    animateLoading: true, responsiveBehavior: "fill", minWidth: 450,
  },
  CAMERA_WIDGET: {
    widgetName: "Camera", rows: 33, columns: 25, mode: CameraModeTypes.CAMERA,
    isDisabled: false, isVisible: true, isMirrored: true, version: 1,
    responsiveBehavior: "hug", flexVerticalAlignment: "start",
  },
  CODE_SCANNER_WIDGET: {
    rows: 33, label: "Scan a QR/Barcode", columns: 25,
    widgetName: "CodeScanner", isDefaultClickDisabled: true,
    scannerLayout: ScannerLayout.ALWAYS_ON, version: 1,
    isRequired: false, isDisabled: false, animateLoading: true,
    placement: "CENTER", responsiveBehavior: "fill", flexVerticalAlignment: "start",
  },
};

export const CAPTURE_UPLOAD_META_DEFAULTS: Record<CaptureUploadWidgetType, Record<string, unknown>> = {
  FILE_PICKER_WIDGET_V2: { selectedFiles: [], uploadedFileData: {}, isDirty: false },
  AUDIO_RECORDER_WIDGET: {
    blobURL: undefined, dataURL: undefined, rawBinary: undefined, isDirty: false,
  },
  CAMERA_WIDGET: {
    image: null, imageBlobURL: undefined, imageDataURL: undefined,
    imageRawBinary: undefined, mediaCaptureStatus: MediaCaptureStatusTypes.IMAGE_DEFAULT,
    videoBlobURL: undefined, videoDataURL: undefined, videoRawBinary: undefined,
    isDirty: false,
  },
  CODE_SCANNER_WIDGET: { value: undefined },
};

export function captureUploadDefaults(type: CaptureUploadWidgetType): Record<string, unknown> {
  const defaults = { ...CAPTURE_UPLOAD_DEFAULTS[type] };
  return type === "FILE_PICKER_WIDGET_V2"
    ? { ...defaults, files: [], selectedFiles: [], allowedFileTypes: [] } : defaults;
}

export function captureUploadMetaDefaults(type: CaptureUploadWidgetType): Record<string, unknown> {
  const defaults = { ...CAPTURE_UPLOAD_META_DEFAULTS[type] };
  return type === "FILE_PICKER_WIDGET_V2"
    ? { ...defaults, selectedFiles: [], uploadedFileData: {} } : defaults;
}
