import React, { useEffect, useState } from "react";
import type { AppsmithWidgetDsl } from "../../../document";
import type { ChartTheme } from "../chart/basicChartOptions";
import { AppsmithCustomWidgetBuilder } from "./AppsmithCustomWidgetBuilder";
import { CUSTOM_WIDGET_BUILDER_EVENTS } from "./builderModel";
import { isRecord, resolveCustomSrcDoc, type CustomSrcDoc } from "./customWidgetModel";

interface BuilderPayload {
  widget: AppsmithWidgetDsl;
  theme: ChartTheme;
}

function themeFromPayload(value: unknown): ChartTheme {
  if (!isRecord(value)) return {};
  const colors = isRecord(value.colors) ? value.colors : {};
  const radius = isRecord(value.borderRadius) ? value.borderRadius : {};
  const shadow = isRecord(value.boxShadow) ? value.boxShadow : {};
  const font = isRecord(value.fontFamily) ? value.fontFamily : {};
  return {
    primaryColor: typeof colors.primaryColor === "string" ? colors.primaryColor : undefined,
    appBorderRadius: typeof radius.appBorderRadius === "string"
      ? radius.appBorderRadius : undefined,
    appBoxShadow: typeof shadow.appBoxShadow === "string"
      ? shadow.appBoxShadow : undefined,
    fontFamily: typeof font.appFont === "string" ? font.appFont : undefined,
  };
}

// Appsmith CustomWidgetEditSourceButtonControl.getPayload +
// CustomWidgetBuilder/useCustomBuilder READY_ACK/RESUME payload.
function widgetFromPayload(data: Record<string, unknown>,
  previous?: AppsmithWidgetDsl): BuilderPayload {
  const source = resolveCustomSrcDoc(data.srcDoc ?? previous?.srcDoc);
  const uncompiled = resolveCustomSrcDoc(data.uncompiledSrcDoc ??
    previous?.uncompiledSrcDoc ?? source);
  const eventValues = isRecord(data.events) ? data.events : {};
  const events = Object.keys(eventValues);
  const eventProperties = Object.fromEntries(events.map((name) =>
    [name, typeof eventValues[name] === "string" ? eventValues[name] : ""]));
  return {
    widget: {
      widgetId: typeof data.widgetId === "string" ? data.widgetId :
        previous?.widgetId || "custom-preview",
      widgetName: typeof data.name === "string" ? data.name :
        previous?.widgetName || "Custom",
      type: "CUSTOM_WIDGET", version: 1,
      topRow: 0, bottomRow: 30, leftColumn: 0, rightColumn: 23,
      defaultModel: JSON.stringify(isRecord(data.model) ? data.model : {}),
      srcDoc: { ...source }, uncompiledSrcDoc: { ...uncompiled },
      dynamicHeight: "FIXED", events,
      ...eventProperties,
    },
    theme: themeFromPayload(data.theme),
  };
}

export function AppsmithCustomWidgetBuilderBridge(): React.ReactElement {
  const [payload, setPayload] = useState<BuilderPayload | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const [sourceEpoch, setSourceEpoch] = useState(0);

  useEffect(() => {
    const opener = window.opener;
    if (!opener) { setConnectionLost(true); return; }
    let connected = false;
    const receive = (event: MessageEvent) => {
      if (event.source !== opener || !isRecord(event.data)) return;
      switch (event.data.type) {
        case CUSTOM_WIDGET_BUILDER_EVENTS.READY_ACK:
        case CUSTOM_WIDGET_BUILDER_EVENTS.RESUME:
          connected = true;
          setPayload((old) => widgetFromPayload(event.data, old?.widget));
          setSourceEpoch((old) => old + 1);
          setConnectionLost(false);
          break;
        case CUSTOM_WIDGET_BUILDER_EVENTS.UPDATE_REFERENCES:
          setPayload((old) => old ? {
            widget: {
              ...old.widget,
              widgetName: typeof event.data.name === "string"
                ? event.data.name : old.widget.widgetName,
              defaultModel: JSON.stringify(isRecord(event.data.model)
                ? event.data.model : {}),
              events: isRecord(event.data.events)
                ? Object.keys(event.data.events) : old.widget.events,
              ...(isRecord(event.data.events) ? event.data.events : {}),
            },
            theme: themeFromPayload(event.data.theme),
          } : old);
          break;
        case CUSTOM_WIDGET_BUILDER_EVENTS.PAUSE:
          setConnectionLost(true);
          break;
      }
    };
    const beforeUnload = () => opener.postMessage({
      type: CUSTOM_WIDGET_BUILDER_EVENTS.DISCONNECTED,
    }, "*");
    window.addEventListener("message", receive);
    window.addEventListener("beforeunload", beforeUnload);
    opener.postMessage({ type: CUSTOM_WIDGET_BUILDER_EVENTS.READY }, "*");
    const timeout = window.setTimeout(() => {
      if (!connected) setConnectionLost(true);
    }, 4000);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", receive);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

  if (!payload) return <div role="status">{connectionLost
    ? "Connection to the workbench was lost" : "Loading Custom Widget Builder…"}</div>;

  return <AppsmithCustomWidgetBuilder
    disabled={connectionLost}
    key={`${payload.widget.widgetId}:${sourceEpoch}`}
    onBatchUpdateProperties={(patch: { srcDoc: CustomSrcDoc;
      uncompiledSrcDoc: CustomSrcDoc }) => window.opener?.postMessage({
      type: CUSTOM_WIDGET_BUILDER_EVENTS.UPDATE_SRCDOC,
      srcDoc: patch.srcDoc,
      uncompiledSrcDoc: patch.uncompiledSrcDoc,
    }, "*")}
    onClose={() => { window.opener?.focus(); window.close(); }}
    theme={payload.theme}
    widget={payload.widget}
  />;
}
