import React, { useState } from "react";
import ReactDOM from "react-dom";
import type { AppsmithWidgetDsl } from "../../../document";
import { NativeCustomWidgetView } from "./NativeCustomWidgetView";

const customSource = {
  html: '<div id="root"><strong id="value"></strong><button id="update">Update</button><button id="event">Event</button><span id="dimensions"></span><span id="theme"></span></div>',
  css: "body { font-family: system-ui; } #root { padding: 8px; } button { margin: 4px; }",
  js: `appsmith.onReady(() => {
    window.__mountCount = (window.__mountCount || 0) + 1;
    const render = () => {
      document.getElementById("value").textContent = String(appsmith.model.count);
      document.getElementById("dimensions").textContent = String(appsmith.ui.width);
      document.getElementById("theme").textContent = String(appsmith.theme.primaryColor);
    };
    appsmith.onModelChange(render);
    appsmith.onUiChange(render);
    appsmith.onThemeChange(render);
    document.getElementById("update").addEventListener("click", () => {
      appsmith.updateModel({ count: appsmith.model.count + 1 });
    });
    document.getElementById("event").addEventListener("click", () => {
      appsmith.triggerEvent("onPing", { source: "iframe" });
    });
  });`,
};

const baseWidget: AppsmithWidgetDsl = {
  widgetId: "custom-1", widgetName: "Custom1", type: "CUSTOM_WIDGET",
  version: 1, topRow: 0, bottomRow: 30, leftColumn: 0, rightColumn: 23,
  defaultModel: '{"count":1}', srcDoc: customSource,
  onPing: "{{showAlert('ping')}}", events: ["onPing"],
  dynamicHeight: "FIXED", borderWidth: "1", borderColor: "#d0d0d0",
};
const autoWidget: AppsmithWidgetDsl = {
  ...baseWidget, widgetId: "custom-auto", widgetName: "CustomAuto",
  dynamicHeight: "AUTO_HEIGHT", srcDoc: {
    html: '<div id="height-content"></div>',
    css: 'body { margin: 0; } #height-content { height: 180px; }',
    js: 'appsmith.onReady(() => {});',
  },
};

function Harness(): React.ReactElement {
  const [meta, setMeta] = useState<Record<string, unknown>>({});
  const [event, setEvent] = useState("");
  const [selected, setSelected] = useState(false);
  const [count, setCount] = useState(1);
  const [width, setWidth] = useState(400);
  const [color, setColor] = useState("#1266dd");
  const widget = { ...baseWidget, defaultModel: JSON.stringify({ count }) };
  return <>
    <div data-testid="custom-host" style={{ width, height: 300 }}>
      <NativeCustomWidgetView
        dimensions={{ width, height: 300 }}
        isSelected={selected}
        meta={meta}
        mode="editor"
        onMetaChange={(patch) => setMeta((old) => ({ ...old, ...patch }))}
        onTriggerEvent={(name, context) => setEvent(`${name}:${String(context.source)}`)}
        theme={{ primaryColor: color }}
        widget={widget}
      />
    </div>
    <div data-testid="custom-auto-host" style={{ width: 400, height: 300 }}>
      <NativeCustomWidgetView dimensions={{ width: 400, height: 300 }}
        isSelected mode="editor" widget={autoWidget} />
    </div>
    <button id="select-widget" onClick={() => setSelected(true)}>Select</button>
    <button id="change-default" onClick={() => setCount(5)}>Change default</button>
    <button id="change-width" onClick={() => setWidth(500)}>Change width</button>
    <button id="change-theme" onClick={() => setColor("#cc2200")}>Change theme</button>
    <output data-testid="meta">{JSON.stringify(meta)}</output>
    <output data-testid="event">{event}</output>
  </>;
}

ReactDOM.render(<Harness />, document.getElementById("root"));
