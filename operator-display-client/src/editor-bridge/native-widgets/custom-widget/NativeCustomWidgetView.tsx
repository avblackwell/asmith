import React, { useEffect, useMemo, useRef, useState } from "react";
import type { AppsmithWidgetDsl } from "../../../document";
import type { ChartTheme } from "../chart/basicChartOptions";
import { WidgetStyleContainer } from "../text-container/WidgetStyleContainer";
import { createHtmlTemplate } from "./createHtmlTemplate";
import {
  CUSTOM_WIDGET_SANDBOX, isRecord, resolveCustomModel, resolveCustomSrcDoc,
} from "./customWidgetModel";

// Literal event names from Appsmith CustomWidget/component/customWidgetscript.js.
export const CUSTOM_WIDGET_EVENTS = {
  READY: "CUSTOM_WIDGET_READY",
  READY_ACK: "CUSTOM_WIDGET_READY_ACK",
  UPDATE_MODEL: "CUSTOM_WIDGET_UPDATE_MODEL",
  TRIGGER_EVENT: "CUSTOM_WIDGET_TRIGGER_EVENT",
  MODEL_CHANGE: "CUSTOM_WIDGET_MODEL_CHANGE",
  UI_CHANGE: "CUSTOM_WIDGET_UI_CHANGE",
  MESSAGE_RECEIVED_ACK: "CUSTOM_WIDGET_MESSAGE_RECEIVED_ACK",
  CONSOLE_EVENT: "CUSTOM_WIDGET_CONSOLE_EVENT",
  THEME_UPDATE: "CUSTOM_WIDGET_THEME_UPDATE",
  UPDATE_HEIGHT: "CUSTOM_WIDGET_UPDATE_HEIGHT",
} as const;

export interface NativeCustomWidgetViewProps {
  widget: AppsmithWidgetDsl;
  dimensions: { width: number; height: number };
  meta?: Record<string, unknown>;
  theme?: ChartTheme;
  mode?: "editor" | "viewer" | "builder";
  isSelected?: boolean;
  onMetaChange?: (properties: Record<string, unknown>) => void;
  onTriggerEvent?: (eventName: string, contextObj: Record<string, unknown>) => void;
  onHeightChange?: (paddedHeightPx: number) => void;
  onConsole?: (type: string, args: unknown) => void;
}

const WIDGET_PADDING = 4; // Appsmith WidgetConstants: 10px grid row × 0.4.

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && !value.includes("{{") ? value : fallback;
}

function numericBorderWidth(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 1;
}

export function NativeCustomWidgetView({
  widget, dimensions, meta, theme: outerTheme, mode = "viewer", isSelected = false,
  onMetaChange, onTriggerEvent, onHeightChange, onConsole,
}: NativeCustomWidgetViewProps): React.ReactElement {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [isIframeReady, setIsIframeReady] = useState(false);
  const [height, setHeight] = useState(Math.max(1, dimensions.height - WIDGET_PADDING * 2));
  const width = Math.max(1, dimensions.width - WIDGET_PADDING * 2);
  const autoHeight = widget.isFlexChild !== true &&
    (widget.dynamicHeight === "AUTO_HEIGHT" || widget.dynamicHeight === "AUTO_HEIGHT_WITH_LIMITS");
  const minHeight = widget.dynamicHeight === "AUTO_HEIGHT_WITH_LIMITS"
    ? Math.max(0, Number(widget.minDynamicHeight ?? 4) || 0) * 10 : 0;
  const model = useMemo(() => resolveCustomModel(widget, meta),
    [widget.model, widget.defaultModel, meta?.model]);
  const source = resolveCustomSrcDoc(widget.srcDoc);
  const srcDoc = useMemo(() => createHtmlTemplate(source, Boolean(onConsole)),
    [source.html, source.css, source.js, Boolean(onConsole)]);
  const theme = useMemo(() => {
    const authored = isRecord(widget.theme) ? widget.theme : undefined;
    const colors = isRecord(authored?.colors) ? authored.colors : undefined;
    const radius = isRecord(authored?.borderRadius) ? authored.borderRadius : undefined;
    const shadow = isRecord(authored?.boxShadow) ? authored.boxShadow : undefined;
    const fonts = isRecord(authored?.fontFamily) ? authored.fontFamily : undefined;
    return {
      ...colors,
      primaryColor: stringOr(colors?.primaryColor, outerTheme?.primaryColor || "#03b365"),
      backgroundColor: stringOr(colors?.backgroundColor, "#fff"),
      borderRadius: stringOr(radius?.appBorderRadius, outerTheme?.appBorderRadius || "0px"),
      boxShadow: stringOr(shadow?.appBoxShadow, outerTheme?.appBoxShadow || "none"),
      fontFamily: stringOr(fonts?.appFont, outerTheme?.fontFamily || "system-ui"),
    };
  }, [widget.theme, outerTheme?.primaryColor, outerTheme?.appBorderRadius,
    outerTheme?.appBoxShadow, outerTheme?.fontFamily]);
  const renderMode = mode === "editor" ? "EDITOR" :
    mode === "builder" ? "BUILDER" : "DEPLOYED";

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const iframeWindow = iframe.current?.contentWindow ||
        iframe.current?.contentDocument?.defaultView;
      if (event.source !== iframeWindow || !isRecord(event.data)) return;
      // Appsmith acknowledges every message so the iframe's ordered queue can
      // advance, including unhandled message types.
      iframe.current?.contentWindow?.postMessage({
        type: CUSTOM_WIDGET_EVENTS.MESSAGE_RECEIVED_ACK,
        key: event.data.key,
        success: true,
      }, "*");
      switch (event.data.type) {
        case CUSTOM_WIDGET_EVENTS.READY:
          setIsIframeReady(true);
          iframe.current?.contentWindow?.postMessage({
            type: CUSTOM_WIDGET_EVENTS.READY_ACK,
            model,
            ui: { width, height },
            mode: renderMode,
            theme,
          }, "*");
          break;
        case CUSTOM_WIDGET_EVENTS.UPDATE_MODEL:
          if (isRecord(event.data.data)) {
            onMetaChange?.({ model: { ...model, ...event.data.data } });
          }
          break;
        case CUSTOM_WIDGET_EVENTS.TRIGGER_EVENT:
          if (isRecord(event.data.data)) {
            const name = event.data.data.eventName;
            if (typeof name === "string" && Object.prototype.hasOwnProperty.call(widget, name)) {
              onTriggerEvent?.(name, isRecord(event.data.data.contextObj)
                ? event.data.data.contextObj : {});
            }
          }
          break;
        case CUSTOM_WIDGET_EVENTS.UPDATE_HEIGHT:
          if (isRecord(event.data.data)) {
            const measured = event.data.data.height;
            if (typeof measured === "number" && Number.isFinite(measured) && measured > 0 &&
              renderMode !== "BUILDER" && widget.dynamicHeight !== undefined &&
              widget.dynamicHeight !== "FIXED") {
              iframe.current?.style.setProperty("height", `${measured}px`);
              setHeight(measured);
              onHeightChange?.(measured + WIDGET_PADDING * 2);
            }
          }
          break;
        case CUSTOM_WIDGET_EVENTS.CONSOLE_EVENT:
          if (isRecord(event.data.data) && typeof event.data.data.type === "string") {
            onConsole?.(event.data.data.type, event.data.data.args);
          }
          break;
      }
    };
    window.addEventListener("message", handler, false);
    return () => window.removeEventListener("message", handler, false);
  }, [model, width, height, renderMode, theme, widget, onMetaChange,
    onTriggerEvent, onHeightChange, onConsole]);

  useEffect(() => {
    if (iframe.current?.contentWindow && isIframeReady) {
      iframe.current.contentWindow.postMessage({
        type: CUSTOM_WIDGET_EVENTS.MODEL_CHANGE, model,
      }, "*");
    }
  }, [model, isIframeReady]);

  useEffect(() => {
    if (iframe.current?.contentWindow && isIframeReady) {
      iframe.current.contentWindow.postMessage({
        type: CUSTOM_WIDGET_EVENTS.UI_CHANGE, ui: { width, height },
      }, "*");
    }
  }, [width, height, isIframeReady]);

  useEffect(() => {
    if (iframe.current?.contentWindow && isIframeReady) {
      iframe.current.contentWindow.postMessage({
        type: CUSTOM_WIDGET_EVENTS.THEME_UPDATE, theme,
      }, "*");
    }
  }, [theme, isIframeReady]);

  useEffect(() => {
    if (widget.dynamicHeight === "FIXED" || widget.dynamicHeight === undefined) {
      const fixed = Math.max(1, dimensions.height - WIDGET_PADDING * 2);
      iframe.current?.style.setProperty("height", `${fixed}px`);
      setHeight(fixed);
    }
  }, [widget.dynamicHeight, dimensions.height]);

  useEffect(() => {
    setLoading(true);
    setIsIframeReady(false);
  }, [srcDoc]);

  return <div data-native-widget="custom" data-testid={`native-custom-${widget.widgetId}`}
    className={loading ? "bp3-skeleton" : undefined}
    style={{ height: autoHeight ? "auto" : "100%", position: "relative", width: "100%" }}>
    {mode === "editor" && !isSelected && <div data-testid="iframe-overlay"
      style={{ position: "absolute", inset: 0, zIndex: 1 }} />}
    <WidgetStyleContainer
      backgroundColor={stringOr(widget.backgroundColor, "#FFFFFF")}
      borderColor={stringOr(widget.borderColor, "#E0DEDE")}
      borderRadius={stringOr(widget.borderRadius, theme.borderRadius)}
      borderWidth={numericBorderWidth(widget.borderWidth)}
      boxShadow={stringOr(widget.boxShadow, theme.boxShadow)}
      widgetId={widget.widgetId}>
      <iframe
        loading="lazy"
        onLoad={() => setLoading(false)}
        ref={iframe}
        sandbox={CUSTOM_WIDGET_SANDBOX}
        srcDoc={srcDoc}
        style={{ border: 0, height, minHeight, width }}
        title={widget.widgetName}
      />
    </WidgetStyleContainer>
  </div>;
}
