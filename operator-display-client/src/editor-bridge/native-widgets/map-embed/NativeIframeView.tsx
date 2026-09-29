import React, { useEffect, useRef, useState } from "react";
import type { AppsmithWidgetDsl } from "../../../document";

export interface NativeIframeViewProps {
  widget: AppsmithWidgetDsl;
  mode?: "editor" | "viewer";
  isSelected?: boolean;
  onURLChanged?: (source: string) => void;
  onSrcDocChanged?: (srcDoc?: string) => void;
  onMessageReceived?: (message: MessageEvent) => void;
}

/** Appsmith SAFE_URL's safe protocol subset for an embeddable browser page. */
export function safeIframeSource(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const source = value.trim();
  if (!source || /\{\{[\s\S]*?\}\}/.test(source) || /[\u0000-\u001f]/.test(source)) return undefined;
  if (/^https?:\/\//i.test(source)) return source;
  if (/^[a-z][a-z\d+.-]*:/i.test(source) || source.startsWith("//")) return undefined;
  if (!source.startsWith("/") && !source.startsWith("./") && !source.startsWith("../")) return undefined;
  if (/^\/(?:api|v1|rts)(?:\/|$)/i.test(source)) return undefined;
  return source;
}

function borderColor(color: unknown, opacity: unknown): string {
  const candidate = typeof color === "string" && /^#[\da-f]{6}$/i.test(color) ? color : "#e0dede";
  const alpha = typeof opacity === "number" && Number.isFinite(opacity) && opacity > 0
    ? Math.max(0, Math.min(100, opacity)) / 100 : 1;
  const red = parseInt(candidate.slice(1, 3), 16);
  const green = parseInt(candidate.slice(3, 5), 16);
  const blue = parseInt(candidate.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function NativeIframeView({
  widget, mode = "viewer", isSelected = false, onURLChanged, onSrcDocChanged, onMessageReceived,
}: NativeIframeViewProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const isFirstURLRender = useRef(true);
  const isFirstSrcDocRender = useRef(true);
  const [message, setMessage] = useState("");
  const source = safeIframeSource(widget.source);
  const srcDoc = typeof widget.srcDoc === "string" && widget.srcDoc ? widget.srcDoc : undefined;
  const title = typeof widget.title === "string" ? widget.title : widget.widgetName;

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const frameWindow = frameRef.current?.contentWindow || frameRef.current?.contentDocument?.defaultView;
      if (event.source !== frameWindow) return;
      onMessageReceived?.(event);
    };
    window.addEventListener("message", handler, false);
    return () => window.removeEventListener("message", handler, false);
  }, [onMessageReceived]);

  useEffect(() => {
    if (isFirstURLRender.current) { isFirstURLRender.current = false; return; }
    onURLChanged?.(source || "");
    setMessage(source || srcDoc ? "" : "Valid source URL is required");
  }, [source]);

  useEffect(() => {
    if (isFirstSrcDocRender.current) { isFirstSrcDocRender.current = false; return; }
    onSrcDocChanged?.(srcDoc);
    setMessage(srcDoc || source ? "" : "At least either of source URL or srcDoc is required");
  }, [srcDoc]);

  const width = typeof widget.borderWidth === "number" && Number.isFinite(widget.borderWidth)
    ? Math.max(0, widget.borderWidth) : 1;
  const frameStyle: React.CSSProperties = {
    width: "100%", height: "100%", borderStyle: "solid", borderWidth: width,
    borderColor: borderColor(widget.borderColor, widget.borderOpacity),
    borderRadius: typeof widget.borderRadius === "string" ? widget.borderRadius : undefined,
    boxShadow: typeof widget.boxShadow === "string" ? widget.boxShadow : undefined,
  };

  return <div data-native-widget="iframe" style={{ position: "relative", display: "flex", alignItems: "center",
    justifyContent: "center", height: "100%", width: "100%", fontWeight: "bold" }}>
    {message ? <span role="status">{message}</span> : source || srcDoc ? <iframe
      allow="camera; microphone"
      id={`iframe-${widget.widgetName}`}
      ref={frameRef}
      sandbox={srcDoc ? "allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-scripts allow-top-navigation-by-user-activation" : undefined}
      src={source}
      srcDoc={srcDoc}
      title={title}
      style={frameStyle}
    /> : <span role="status">Valid source URL is required</span>}
    {mode === "editor" && !isSelected && <div data-iframe-editor-overlay="true"
      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />}
  </div>;
}
