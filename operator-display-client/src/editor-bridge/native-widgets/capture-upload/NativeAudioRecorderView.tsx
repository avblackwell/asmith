import React from "react";
import { useReactMediaRecorder } from "react-media-recorder";
import { useStopwatch } from "react-timer-hook";
import type { AppsmithWidgetDsl } from "../../../document";
import { ReactComponent as RecorderDefaultIcon } from "./icons/recorder_default.svg";
import { ReactComponent as RecorderRecordingIcon } from "./icons/recorder_recording.svg";
import { ReactComponent as RecorderPauseIcon } from "./icons/recorder_pause.svg";
import { ReactComponent as RecorderCompleteIcon } from "./icons/recorder_complete.svg";
import { ReactComponent as RecorderNoPermissionIcon } from "./icons/recorder_no_permission.svg";
import "./captureUpload.css";

export enum RecorderStatusTypes {
  PERMISSION_PROMPT = "PERMISSION_PROMPT", PERMISSION_DENIED = "PERMISSION_DENIED",
  DEFAULT = "DEFAULT", RECORDING = "RECORDING", PAUSE = "PAUSE",
  COMPLETE = "COMPLETE", SAVED = "SAVED",
}

export enum PlayerStatusTypes {
  DEFAULT = "DEFAULT", PLAY = "PLAY", PAUSE = "PAUSE",
}

export interface AudioRecorderMeta {
  blobURL?: string | null;
  dataURL?: string;
  rawBinary?: string;
  isDirty: boolean;
}

export interface NativeAudioRecorderViewProps {
  widget: AppsmithWidgetDsl;
  meta?: Partial<AudioRecorderMeta>;
  editor?: boolean;
  themePrimaryColor?: string;
  themeBorderRadius?: string;
  onMetaChange?: (meta: Partial<AudioRecorderMeta>) => void;
  onRecordingStart?: () => void;
  onRecordingComplete?: () => void;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() && !value.includes("{{") ? value : fallback;
}
function formatTime(days: number, hours: number, minutes: number, seconds: number): string {
  const digit = (value: number) => String(value).padStart(2, "0");
  return `${days ? `${digit(days)}:` : ""}${hours ? `${digit(hours)}:` : ""}${digit(minutes)}:${digit(seconds)}`;
}
function renderRecorderIcon(status: RecorderStatusTypes, denied: boolean) {
  if (denied) return <RecorderNoPermissionIcon />;
  if (status === RecorderStatusTypes.RECORDING) return <RecorderRecordingIcon />;
  if (status === RecorderStatusTypes.PAUSE) return <RecorderPauseIcon />;
  if (status === RecorderStatusTypes.COMPLETE) return <RecorderCompleteIcon />;
  return <RecorderDefaultIcon />;
}
function asDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}

/** Appsmith's useReactMediaRecorder + useStopwatch state machine with its status labels. */
export function NativeAudioRecorderView(props: NativeAudioRecorderViewProps): React.ReactElement {
  const { widget } = props;
  const [recorderStatus, setRecorderStatus] = React.useState(RecorderStatusTypes.PERMISSION_PROMPT);
  const [playerStatus, setPlayerStatus] = React.useState(PlayerStatusTypes.DEFAULT);
  const [statusMessage, setStatusMessage] = React.useState("Press to get permission");
  const [permissionDenied, setPermissionDenied] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState("");
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const { days, hours, minutes, seconds, start, pause, reset } = useStopwatch({ autoStart: false });
  const { error, mediaBlobUrl, clearBlobUrl, pauseRecording, resumeRecording,
    startRecording, stopRecording } = useReactMediaRecorder({
    onStop: async (blobURL: string, blob: Blob) => {
      try {
        const dataURL = await asDataURL(blob);
        // Appsmith's createBlobUrl returns a runtime blob id for rawBinary.
        // This standalone client retains the browser blob URL until its action contract exists.
        props.onMetaChange?.({ blobURL, dataURL, rawBinary: blobURL, isDirty: true });
        props.onRecordingComplete?.();
      } catch (cause) {
        setErrorMessage(cause instanceof Error ? cause.message : "Could not read recording");
      }
    },
  });

  React.useEffect(() => {
    if (error === "permission_denied") {
      setPermissionDenied(true);
      setRecorderStatus(RecorderStatusTypes.PERMISSION_DENIED);
      setStatusMessage("Permission denied");
    }
  }, [error]);

  React.useEffect(() => {
    if (audioRef.current) {
      if (playerStatus === PlayerStatusTypes.PLAY) void audioRef.current.play();
      else audioRef.current.pause();
    }
  }, [playerStatus, mediaBlobUrl]);

  const resetRecorder = () => {
    clearBlobUrl();
    audioRef.current?.pause();
    reset(0, false);
    setPlayerStatus(PlayerStatusTypes.DEFAULT);
    setRecorderStatus(RecorderStatusTypes.DEFAULT);
    setStatusMessage("Press to start recording");
    props.onMetaChange?.({ blobURL: undefined, dataURL: undefined,
      rawBinary: undefined, isDirty: true });
  };

  const handlePermissionPrompt = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setPermissionDenied(false);
      setRecorderStatus(RecorderStatusTypes.DEFAULT);
      setStatusMessage("Press to start recording");
    } catch (cause) {
      setPermissionDenied(true);
      setRecorderStatus(RecorderStatusTypes.PERMISSION_DENIED);
      setStatusMessage("Permission denied");
      setErrorMessage(cause instanceof Error ? cause.message : "Permission denied");
    }
  };

  const handleRecorderClick = () => {
    if (props.editor || widget.isDisabled === true) return;
    switch (recorderStatus) {
      case RecorderStatusTypes.DEFAULT:
        void startRecording(); start();
        setRecorderStatus(RecorderStatusTypes.RECORDING);
        setStatusMessage("Recording...");
        props.onMetaChange?.({ blobURL: null, dataURL: undefined,
          rawBinary: undefined, isDirty: true });
        props.onRecordingStart?.();
        break;
      case RecorderStatusTypes.RECORDING:
        pauseRecording(); pause(); setRecorderStatus(RecorderStatusTypes.PAUSE);
        setStatusMessage("Recording paused");
        break;
      case RecorderStatusTypes.PAUSE:
        resumeRecording(); start(); setRecorderStatus(RecorderStatusTypes.RECORDING);
        setStatusMessage("Recording...");
        break;
      case RecorderStatusTypes.COMPLETE:
        setRecorderStatus(RecorderStatusTypes.SAVED);
        setStatusMessage("Recording saved");
        break;
      case RecorderStatusTypes.SAVED:
        resetRecorder();
        break;
      default:
        void handlePermissionPrompt();
    }
  };

  const stop = () => {
    stopRecording(); pause();
    setRecorderStatus(RecorderStatusTypes.COMPLETE);
    setStatusMessage("Recording complete");
  };
  const source = mediaBlobUrl || props.meta?.blobURL || undefined;
  const active = recorderStatus === RecorderStatusTypes.RECORDING || recorderStatus === RecorderStatusTypes.PAUSE;
  const complete = recorderStatus === RecorderStatusTypes.COMPLETE || recorderStatus === RecorderStatusTypes.SAVED;

  return <div className="od-capture-audio" data-native-widget="audio-recorder">
    <button type="button" className="od-capture-audio-main" onClick={handleRecorderClick}
      disabled={widget.isDisabled === true || permissionDenied}
      title={errorMessage || statusMessage}
      style={{
        color: text(widget.iconColor, "white"),
        background: text(widget.accentColor, props.themePrimaryColor || "#03b365"),
        borderRadius: text(widget.borderRadius, props.themeBorderRadius || "0.375rem"),
        boxShadow: text(widget.boxShadow, "none"),
      }}>
      {renderRecorderIcon(recorderStatus, permissionDenied)}
    </button>
    <div className="od-capture-audio-right">
      <div className="od-capture-audio-status">{statusMessage}</div>
      {permissionDenied ? <a href="https://support.google.com/chrome/answer/2693767"
        target="_blank" rel="noreferrer">Know more</a> :
        <div className="od-capture-audio-controls">
          <span>{formatTime(days, hours, minutes, seconds)}</span>
          {active && <button type="button" title="stop" onClick={stop}>■</button>}
          {complete && <button type="button" title={playerStatus === PlayerStatusTypes.PLAY ? "pause" : "play"}
            onClick={() => setPlayerStatus(playerStatus === PlayerStatusTypes.PLAY
              ? PlayerStatusTypes.PAUSE : PlayerStatusTypes.PLAY)}>
            {playerStatus === PlayerStatusTypes.PLAY ? "Ⅱ" : "▶"}
          </button>}
          {(active || complete) && recorderStatus !== RecorderStatusTypes.SAVED &&
            <button type="button" title="discard" onClick={resetRecorder}>×</button>}
        </div>}
    </div>
    <audio ref={audioRef} src={source} onEnded={() => setPlayerStatus(PlayerStatusTypes.DEFAULT)} />
  </div>;
}
