import React from "react";
import ReactDOM from "react-dom";
import { NativeIframeView, NativeMapChartView, NativeMapView } from "./index";
import { getMapChartDefaults, mapTypeUpdates } from "./mapChartModel";
import { MapTypes } from "./mapChartConstants";
import type { AppsmithWidgetDsl } from "../../../document";

const base = (type: string): AppsmithWidgetDsl => ({ widgetId: type, widgetName: type, type, version: 1,
  topRow: 0, bottomRow: 32, leftColumn: 0, rightColumn: 24 });

function Harness() {
  const [mapChart, setMapChart] = React.useState<AppsmithWidgetDsl>({ ...base("MAP_CHART_WIDGET"), ...getMapChartDefaults() });
  const [messages, setMessages] = React.useState<string[]>([]);
  const [srcDoc, setSrcDoc] = React.useState('<script>parent.postMessage("ready from iframe", "*")</script><p>Embedded content</p>');
  const iframe = { ...base("IFRAME_WIDGET"), source: "", srcDoc, title: "Embedded" };
  return <main style={{ fontFamily: "Arial, sans-serif", padding: 20 }}>
    <div data-testid="map-chart-host" style={{ width: 620, height: 380, position: "relative" }}>
      <NativeMapChartView widget={mapChart} />
    </div>
    <button type="button" onClick={() => setMapChart((current) => {
      const updates = mapTypeUpdates(MapTypes.USA);
      return { ...current, mapType: MapTypes.USA, data: updates[1].propertyValue };
    })}>USA map</button>
    <div data-testid="iframe-host" style={{ width: 300, height: 180 }}>
      <NativeIframeView widget={iframe} mode="editor" onMessageReceived={(event) =>
        setMessages((current) => [...current, String(event.data)])} />
    </div>
    <button type="button" onClick={() => setSrcDoc("<p>Updated iframe</p>")}>Update iframe</button>
    <output data-testid="messages">{messages.join("|")}</output>
    <div data-testid="missing-key-host" style={{ width: 320, height: 200 }}>
      <NativeMapView widget={base("MAP_WIDGET")} />
    </div>
  </main>;
}

ReactDOM.render(<Harness />, document.getElementById("root"));
