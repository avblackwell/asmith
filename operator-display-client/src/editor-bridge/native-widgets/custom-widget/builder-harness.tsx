import React, { useState } from "react";
import ReactDOM from "react-dom";
import type { AppsmithWidgetDsl } from "../../../document";
import { AppsmithCustomWidgetBuilder } from "./AppsmithCustomWidgetBuilder";

const code = {
  html: '<p id="marker">Original</p>',
  css: "#marker { color: rgb(0, 0, 255); }",
  js: 'appsmith.onReady(() => { document.getElementById("marker").textContent = appsmith.model.message; });',
};
const widget: AppsmithWidgetDsl = {
  widgetId: "builder-custom", widgetName: "Custom1", type: "CUSTOM_WIDGET",
  version: 1, topRow: 0, bottomRow: 30, leftColumn: 0, rightColumn: 23,
  defaultModel: '{"message":"Original model"}',
  srcDoc: code, uncompiledSrcDoc: code, dynamicHeight: "FIXED",
  events: [],
};

function Harness(): React.ReactElement {
  const [patch, setPatch] = useState<Record<string, unknown>>({});
  return <>
    <div style={{ height: "calc(100vh - 40px)" }}>
      <AppsmithCustomWidgetBuilder widget={widget} theme={{ primaryColor: "#1266dd" }}
        onBatchUpdateProperties={setPatch} />
    </div>
    <output data-testid="builder-patch">{JSON.stringify(patch)}</output>
  </>;
}

ReactDOM.render(<Harness />, document.getElementById("root"));
