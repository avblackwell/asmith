import React, { useState } from "react";
import ReactDOM from "react-dom";
import type { AppsmithWidgetDsl } from "../../../document";
import { NativeChoiceWidgetView } from "./NativeChoiceWidgetView";
import type { ChoiceMeta } from "./choiceModel";

function widget(type: string, id: string, overrides: Record<string, unknown>): AppsmithWidgetDsl {
  return { widgetId: id, widgetName: id, type, version: 1,
    topRow: 0, bottomRow: 7, leftColumn: 0, rightColumn: 20,
    ...overrides } as AppsmithWidgetDsl;
}

function Host({ id, type, overrides }: { id: string; type: string; overrides: Record<string, unknown> }) {
  const [meta, setMeta] = useState<ChoiceMeta>({});
  return <div data-testid={`${id}-host`} style={{ width: 320, minHeight: 85, marginBottom: 20 }}>
    <NativeChoiceWidgetView meta={meta} onMetaChange={(properties) => setMeta((current) => ({ ...current, ...properties }))}
      themePrimaryColor="#2255aa" widget={widget(type, id, overrides)} />
    <pre data-testid={`${id}-meta`}>{JSON.stringify(meta)}</pre>
  </div>;
}

function Harness() {
  return <>
    <Host id="select" overrides={{ labelText: "Color", labelPosition: "Top", sourceData: [
      { name: "Blue", code: "BLUE" }, { name: "Green", code: "GREEN" }, { name: "Red", code: "RED" },
    ], optionLabel: "name", optionValue: "code", defaultOptionValue: "GREEN", isFilterable: true }} type="SELECT_WIDGET" />
    <Host id="multi" overrides={{ labelText: "Colors", labelPosition: "Top", sourceData: [
      { name: "Blue", code: "BLUE" }, { name: "Green", code: "GREEN" }, { name: "Red", code: "RED" },
    ], optionLabel: "name", optionValue: "code", defaultOptionValue: ["GREEN", "RED"],
    allowSelectAll: true, isFilterable: true }} type="MULTI_SELECT_WIDGET_V2" />
    <Host id="checkbox" overrides={{ labelText: "Flags", labelPosition: "Top", isInline: true,
      options: [{ label: "Blue", value: "BLUE" }, { label: "Green", value: "GREEN" }],
      defaultSelectedValues: ["BLUE"], isSelectAll: true }} type="CHECKBOX_GROUP_WIDGET" />
    <Host id="switch" overrides={{ labelText: "Motors", labelPosition: "Top", isInline: false,
      alignment: "RIGHT", options: [{ label: "A", value: "A" }, { label: "B", value: "B" }],
      defaultSelectedValues: ["A"] }} type="SWITCH_GROUP_WIDGET" />
    <Host id="disabled" overrides={{ labelText: "Locked", isDisabled: true,
      sourceData: [{ name: "Blue", code: "BLUE" }], optionLabel: "name", optionValue: "code",
      defaultOptionValue: "BLUE" }} type="SELECT_WIDGET" />
  </>;
}

ReactDOM.render(<Harness />, document.getElementById("root"));
