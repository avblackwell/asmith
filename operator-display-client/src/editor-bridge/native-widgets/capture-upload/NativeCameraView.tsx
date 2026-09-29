import React from "react";
import Webcam from "react-webcam";
import { FullScreen, useFullScreenHandle } from "react-full-screen";
import { Button, Icon } from "@blueprintjs/core";
import { isMobile } from "react-device-detect";
import type { AppsmithWidgetDsl } from "../../../document";
import { CameraModeTypes, MediaCaptureStatusTypes } from "./model";
import { ReactComponent as CameraOfflineIcon } from "./icons/camera-offline.svg";
import { getVideoConstraints } from "./getVideoConstraints";
import "./captureUpload.css";

export interface CameraMeta {
  image: string | null;
  imageBlobURL?: string;
  imageDataURL?: string;
  imageRawBinary?: string;
  mediaCaptureStatus: MediaCaptureStatusTypes;
  videoBlobURL?: string;
  videoDataURL?: string;
  videoRawBinary?: string;
  isDirty: boolean;
}

export interface NativeCameraViewProps {
  widget: AppsmithWidgetDsl;
  meta?: Partial<CameraMeta>;
  editor?: boolean;
  themeBorderRadius?: string;
  onMetaChange?: (meta: Partial<CameraMeta>) => void;
  onImageCapture?: () => void;
  onImageSave?: () => void;
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
  onVideoSave?: () => void;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() && !value.includes("{{") ? value : fallback;
}
function asDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}
function blobFromDataURL(dataURL: string): Blob {
  const [prefix, encoded] = dataURL.split(",");
  const type = prefix.match(/data:([^;]+)/)?.[1] || "image/webp";
  const bytes = atob(encoded);
  const array = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index++) array[index] = bytes.charCodeAt(index);
  return new Blob([array], { type });
}
function supportedVideoMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const videoTypes = ["webm", "ogg", "mp4", "x-matroska"];
  const codecs = ["should-not-be-supported", "vp9", "vp9.0", "vp8", "vp8.0",
    "avc1", "av1", "h265", "h.265", "h264", "h.264", "opus", "pcm",
    "aac", "mpeg", "mp4a"];
  for (const type of videoTypes) {
    const base = `video/${type}`;
    if (MediaRecorder.isTypeSupported(base)) return base;
    for (const codec of codecs) {
      if (MediaRecorder.isTypeSupported(`${base};codecs=${codec}`)) return `${base};codecs=${codec}`;
      if (MediaRecorder.isTypeSupported(`${base};codecs=${codec.toUpperCase()}`))
        return `${base};codecs=${codec.toUpperCase()}`;
    }
  }
  return undefined;
}

/** Appsmith CameraWidget's Webcam/MediaRecorder capture and status flow. */
export function NativeCameraView(props: NativeCameraViewProps): React.ReactElement {
  const { widget } = props;
  const mode = widget.mode === CameraModeTypes.VIDEO ? CameraModeTypes.VIDEO : CameraModeTypes.CAMERA;
  const webcamRef = React.useRef<Webcam>(null);
  const recorderRef = React.useRef<MediaRecorder>();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const fullScreenHandle = useFullScreenHandle();
  const [videoInputs, setVideoInputs] = React.useState<MediaDeviceInfo[]>([]);
  const [audioInputs, setAudioInputs] = React.useState<MediaDeviceInfo[]>([]);
  const [videoConstraints, setVideoConstraints] = React.useState<MediaTrackConstraints>(() =>
    isMobile ? { height: 720, width: 1280,
      facingMode: { ideal: text(widget.defaultCamera, "environment") } } : {});
  const [audioConstraints, setAudioConstraints] = React.useState<MediaTrackConstraints>({});
  const [image, setImage] = React.useState<string | null>(null);
  const [videoURL, setVideoURL] = React.useState<string>();
  const [status, setStatus] = React.useState<MediaCaptureStatusTypes>(
    mode === CameraModeTypes.CAMERA ? MediaCaptureStatusTypes.IMAGE_DEFAULT : MediaCaptureStatusTypes.VIDEO_DEFAULT);
  const [error, setError] = React.useState("");
  const [audioMuted, setAudioMuted] = React.useState(false);
  const [videoMuted, setVideoMuted] = React.useState(false);
  const videoURLRef = React.useRef<string>();
  const imageURLRef = React.useRef<string>();

  const setCaptureStatus = (next: MediaCaptureStatusTypes) => {
    setStatus(next);
    props.onMetaChange?.({ mediaCaptureStatus: next });
  };
  const clearImage = () => {
    if (imageURLRef.current) URL.revokeObjectURL(imageURLRef.current);
    imageURLRef.current = undefined;
    setImage(null);
    props.onMetaChange?.({ image: null, imageBlobURL: undefined,
      imageDataURL: undefined, imageRawBinary: undefined });
  };
  const clearVideo = () => {
    if (videoURLRef.current) URL.revokeObjectURL(videoURLRef.current);
    videoURLRef.current = undefined;
    setVideoURL(undefined);
    props.onMetaChange?.({ videoBlobURL: undefined, videoDataURL: undefined,
      videoRawBinary: undefined });
  };

  React.useEffect(() => {
    clearImage(); clearVideo();
    setCaptureStatus(mode === CameraModeTypes.CAMERA
      ? MediaCaptureStatusTypes.IMAGE_DEFAULT : MediaCaptureStatusTypes.VIDEO_DEFAULT);
    return () => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    };
  }, [mode]);
  React.useEffect(() => () => {
    if (imageURLRef.current) URL.revokeObjectURL(imageURLRef.current);
    if (videoURLRef.current) URL.revokeObjectURL(videoURLRef.current);
  }, []);
  React.useEffect(() => {
    const stream = webcamRef.current?.stream;
    stream?.getAudioTracks().forEach((track) => { track.enabled = !audioMuted; });
    stream?.getVideoTracks().forEach((track) => { track.enabled = !videoMuted; });
  }, [audioMuted, videoMuted]);

  const updateDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setVideoInputs(devices.filter(({ kind }) => kind === "videoinput"));
      setAudioInputs(devices.filter(({ kind }) => kind === "audioinput"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Camera unavailable");
    }
  };
  const captureImage = () => {
    const capturedImage = webcamRef.current?.getScreenshot();
    if (!capturedImage) return;
    clearImage();
    const blob = blobFromDataURL(capturedImage);
    const blobURL = URL.createObjectURL(blob);
    imageURLRef.current = blobURL;
    setImage(capturedImage);
    setCaptureStatus(MediaCaptureStatusTypes.IMAGE_CAPTURED);
    props.onMetaChange?.({ image: capturedImage, imageBlobURL: blobURL,
      imageDataURL: capturedImage, imageRawBinary: blobURL, isDirty: true });
    props.onImageCapture?.();
  };
  const startRecording = () => {
    const stream = webcamRef.current?.stream;
    if (!stream || typeof MediaRecorder === "undefined") return;
    const mimeType = supportedVideoMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    recorder.addEventListener("dataavailable", async ({ data }) => {
      if (!data.size) return;
      clearVideo();
      const blobURL = URL.createObjectURL(data);
      videoURLRef.current = blobURL;
      setVideoURL(blobURL);
      try {
        const videoDataURL = await asDataURL(data);
        props.onMetaChange?.({ videoBlobURL: blobURL, videoDataURL,
          videoRawBinary: blobURL, isDirty: true });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not read recording");
      }
      props.onRecordingStop?.();
    });
    recorder.start();
    setCaptureStatus(MediaCaptureStatusTypes.VIDEO_RECORDING);
    props.onMetaChange?.({ isDirty: true });
    props.onRecordingStart?.();
  };
  const stopRecording = () => {
    recorderRef.current?.stop();
    setCaptureStatus(MediaCaptureStatusTypes.VIDEO_CAPTURED);
  };
  const discardVideo = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    videoRef.current?.pause();
    clearVideo();
    setCaptureStatus(MediaCaptureStatusTypes.VIDEO_DEFAULT);
  };
  const playVideo = (saved: boolean) => {
    void videoRef.current?.play();
    setCaptureStatus(saved ? MediaCaptureStatusTypes.VIDEO_PLAYING_AFTER_SAVE
      : MediaCaptureStatusTypes.VIDEO_PLAYING);
  };
  const pauseVideo = (saved: boolean) => {
    videoRef.current?.pause();
    setCaptureStatus(saved ? MediaCaptureStatusTypes.VIDEO_PAUSED_AFTER_SAVE
      : MediaCaptureStatusTypes.VIDEO_PAUSED);
  };
  const button = (title: string, icon: string, action: () => void, intent?: "primary") =>
    <Button type="button" title={title} icon={<Icon icon={icon as any} iconSize={20} />}
      intent={intent} onClick={action} />;
  const saved = status === MediaCaptureStatusTypes.VIDEO_SAVED ||
    status === MediaCaptureStatusTypes.VIDEO_PLAYING_AFTER_SAVE ||
    status === MediaCaptureStatusTypes.VIDEO_PAUSED_AFTER_SAVE;
  const playing = status === MediaCaptureStatusTypes.VIDEO_PLAYING ||
    status === MediaCaptureStatusTypes.VIDEO_PLAYING_AFTER_SAVE;
  const hasVideo = status !== MediaCaptureStatusTypes.VIDEO_DEFAULT &&
    status !== MediaCaptureStatusTypes.VIDEO_RECORDING && !!videoURL;
  const hasImage = status === MediaCaptureStatusTypes.IMAGE_CAPTURED ||
    status === MediaCaptureStatusTypes.IMAGE_SAVED;

  return <div className="od-capture-camera" data-native-widget="camera"
    data-capture-status={status} onClick={(event) => event.stopPropagation()}
    style={{ borderRadius: text(widget.borderRadius, props.themeBorderRadius || "0.375rem"),
      boxShadow: text(widget.boxShadow, "none") }}>
    <FullScreen handle={fullScreenHandle}>
      {error ? <div className="od-capture-disabled"><CameraOfflineIcon /> {error}</div> : null}
      {widget.isDisabled === true && <div className="od-capture-disabled"><CameraOfflineIcon /></div>}
      <Webcam ref={webcamRef} audio muted audioConstraints={audioConstraints}
        forceScreenshotSourceSize={isMobile ? true : undefined}
        mirrored={widget.isMirrored !== false} screenshotQuality={1}
        videoConstraints={videoConstraints}
        onUserMedia={() => { void updateDevices(); }}
        onUserMediaError={(cause) => setError(typeof cause === "string" ? cause : cause.message)} />
      {hasImage && image && <img src={image} alt="Captured" />}
      {hasVideo && <video ref={videoRef} src={videoURL} muted={audioMuted}
        onEnded={() => setCaptureStatus(saved ? MediaCaptureStatusTypes.VIDEO_SAVED
          : MediaCaptureStatusTypes.VIDEO_CAPTURED)} />}
      <div className="od-capture-camera-controls">
        <select aria-label="Camera input" value={String(videoConstraints.deviceId || "")}
          onFocus={() => { void updateDevices(); }}
          onChange={(event) => setVideoConstraints(getVideoConstraints(
            videoConstraints, isMobile, "", event.target.value))}>
          <option value="">Default camera</option>
          {videoInputs.map((device) => <option key={device.deviceId} value={device.deviceId}>
            {device.label || device.deviceId}</option>)}
        </select>
        {mode === CameraModeTypes.VIDEO && <select aria-label="Microphone input"
          value={String(audioConstraints.deviceId || "")}
          onFocus={() => { void updateDevices(); }}
          onChange={(event) => setAudioConstraints({ deviceId: event.target.value })}>
          <option value="">Default microphone</option>
          {audioInputs.map((device) => <option key={device.deviceId} value={device.deviceId}>
            {device.label || device.deviceId}</option>)}
        </select>}
        {mode === CameraModeTypes.VIDEO && button(audioMuted ? "Unmute microphone" : "Mute microphone",
          audioMuted ? "volume-up" : "volume-off", () => setAudioMuted(!audioMuted))}
        {button(videoMuted ? "Enable camera" : "Disable camera", "video", () => setVideoMuted(!videoMuted))}
        {mode === CameraModeTypes.CAMERA && status === MediaCaptureStatusTypes.IMAGE_DEFAULT &&
          button("Capture image", "full-circle", captureImage)}
        {mode === CameraModeTypes.CAMERA && status === MediaCaptureStatusTypes.IMAGE_CAPTURED && <>
          {button("Save image", "tick", () => {
            setCaptureStatus(MediaCaptureStatusTypes.IMAGE_SAVED); props.onImageSave?.();
          }, "primary")}
          {button("Discard image", "cross", () => {
            clearImage(); setCaptureStatus(MediaCaptureStatusTypes.IMAGE_DEFAULT);
          })}</>}
        {mode === CameraModeTypes.CAMERA && status === MediaCaptureStatusTypes.IMAGE_SAVED &&
          button("Retake", "refresh", () => { clearImage();
            setCaptureStatus(MediaCaptureStatusTypes.IMAGE_DEFAULT); })}
        {mode === CameraModeTypes.VIDEO && status === MediaCaptureStatusTypes.VIDEO_DEFAULT &&
          button("Start recording", "full-circle", startRecording)}
        {mode === CameraModeTypes.VIDEO && status === MediaCaptureStatusTypes.VIDEO_RECORDING && <>
          {button("Stop recording", "stop", stopRecording)}
          {button("Discard recording", "cross", discardVideo)}</>}
        {mode === CameraModeTypes.VIDEO && hasVideo && !saved && <>
          {button("Save video", "tick", () => {
            setCaptureStatus(MediaCaptureStatusTypes.VIDEO_SAVED); props.onVideoSave?.();
          }, "primary")}
          {button(playing ? "Pause video" : "Play video", playing ? "pause" : "play",
            () => playing ? pauseVideo(false) : playVideo(false))}
          {button("Discard recording", "cross", discardVideo)}</>}
        {mode === CameraModeTypes.VIDEO && hasVideo && saved && <>
          {button(playing ? "Pause video" : "Play video", playing ? "pause" : "play",
            () => playing ? pauseVideo(true) : playVideo(true))}
          {button("Record again", "refresh", discardVideo)}</>}
        {button(fullScreenHandle.active ? "Exit fullscreen" : "Fullscreen", "fullscreen",
          () => { void (fullScreenHandle.active ? fullScreenHandle.exit() : fullScreenHandle.enter()); })}
      </div>
    </FullScreen>
  </div>;
}
