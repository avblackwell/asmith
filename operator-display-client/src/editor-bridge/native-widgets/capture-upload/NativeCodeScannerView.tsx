import React from "react";
import Modal from "react-modal";
import BarcodeScannerComponent from "react-qr-barcode-scanner";
import { isMobile } from "react-device-detect";
import { usePageVisibility } from "react-page-visibility";
import { Button, Icon } from "@blueprintjs/core";
import type { AppsmithWidgetDsl } from "../../../document";
import { ScannerLayout } from "./model";
import { ReactComponent as CameraOfflineIcon } from "./icons/camera-offline.svg";
import { ReactComponent as FlipImageIcon } from "./icons/flip.svg";
import { getVideoConstraints } from "./getVideoConstraints";
import "./captureUpload.css";

export interface NativeCodeScannerViewProps {
  widget: AppsmithWidgetDsl;
  editor?: boolean;
  themePrimaryColor?: string;
  themeBorderRadius?: string;
  onMetaChange?: (meta: { value: string }) => void;
  onCodeDetected?: (value: string) => void;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() && !value.includes("{{") ? value : fallback;
}

/** Appsmith CodeScannerWidget's visible-tab camera gate and scan layouts. */
export function NativeCodeScannerView(props: NativeCodeScannerViewProps): React.ReactElement {
  const { widget } = props;
  const layout = widget.scannerLayout === ScannerLayout.CLICK_TO_SCAN
    ? ScannerLayout.CLICK_TO_SCAN : ScannerLayout.ALWAYS_ON;
  const [modalIsOpen, setModalIsOpen] = React.useState(false);
  const [videoInputs, setVideoInputs] = React.useState<MediaDeviceInfo[]>([]);
  const [error, setError] = React.useState("");
  const [mirrored, setMirrored] = React.useState(false);
  const [videoConstraints, setVideoConstraints] = React.useState<MediaTrackConstraints>(
    isMobile ? { facingMode: { ideal: text(widget.defaultCamera, "environment") } } : {});
  const isTabActive = usePageVisibility();

  const updateDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setVideoInputs(devices.filter(({ kind }) => kind === "videoinput"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Camera unavailable");
    }
  };
  const handleResult = (cause: unknown, result?: unknown) => {
    const codeData = (result as { text?: string } | undefined)?.text;
    if (codeData) {
      setModalIsOpen(false);
      props.onMetaChange?.({ value: codeData });
      props.onCodeDetected?.(codeData);
    }
    if (cause) console.debug(cause);
  };
  const scanner = <div className={`od-capture-scanner ${mirrored ? "od-mirror" : ""}`}
    data-native-widget="code-scanner" data-scanner-layout={layout}
    style={{ borderRadius: text(widget.borderRadius, props.themeBorderRadius || "0.375rem"),
      boxShadow: layout === ScannerLayout.ALWAYS_ON ? text(widget.boxShadow, "none") : "none" }}>
    {error ? <div className="od-capture-disabled"><CameraOfflineIcon /> {error}</div> : null}
    {widget.isDisabled === true ? <div className="od-capture-disabled"><CameraOfflineIcon /></div> :
      isTabActive && (layout === ScannerLayout.ALWAYS_ON || modalIsOpen) &&
      <BarcodeScannerComponent delay={1000} key={JSON.stringify(videoConstraints)}
        onError={(cause: string | DOMException) => setError(typeof cause === "string" ? cause : cause.message)}
        onUpdate={handleResult} videoConstraints={videoConstraints} />}
    <div className="od-capture-scanner-controls">
      <Button type="button" minimal icon={<FlipImageIcon />} title="Mirror camera"
        onClick={() => setMirrored(!mirrored)} />
      <select aria-label="Camera input" value={String(videoConstraints.deviceId || "")}
        onFocus={() => { void updateDevices(); }}
        onChange={(event) => setVideoConstraints(getVideoConstraints(
          videoConstraints, isMobile, "", event.target.value))}>
        <option value="">Default camera</option>
        {videoInputs.map((device) => <option key={device.deviceId} value={device.deviceId}>
          {device.label || device.deviceId}</option>)}
      </select>
    </div>
  </div>;

  return <div style={{ width: "100%", height: "100%" }}
    onClick={(event) => event.stopPropagation()}>
    {layout === ScannerLayout.ALWAYS_ON ? scanner : <>
      <button type="button" disabled={widget.isDisabled === true}
        title={text(widget.tooltip, "") || undefined}
        onClick={() => { if (!props.editor) setModalIsOpen(true); }}
        style={{ width: "100%", height: "100%", border: "none",
          borderRadius: text(widget.borderRadius, props.themeBorderRadius || "0.375rem"),
          boxShadow: text(widget.boxShadow, "none"),
          background: text(widget.buttonColor, props.themePrimaryColor || "#03b365"),
          color: "white", cursor: "pointer" }}>
        {widget.iconName && widget.iconAlign !== "right" && <Icon icon={widget.iconName as any} />}
        {text(widget.label, "Scan a QR/Barcode")}
        {widget.iconName && widget.iconAlign === "right" && <Icon icon={widget.iconName as any} />}
      </button>
      <Modal isOpen={modalIsOpen} onRequestClose={() => setModalIsOpen(false)}
        className="od-capture-scanner-modal" overlayClassName="od-capture-scanner-overlay">
        {scanner}
        <button type="button" aria-label="Close scanner" onClick={() => setModalIsOpen(false)}
          style={{ position: "absolute", top: -36, right: 0, width: 32, height: 32,
            border: "none", background: "white", cursor: "pointer" }}>×</button>
      </Modal>
    </>}
  </div>;
}
