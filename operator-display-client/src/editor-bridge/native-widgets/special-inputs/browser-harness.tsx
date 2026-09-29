import React, { useState } from "react";
import ReactDOM from "react-dom";
import type { AppsmithWidgetDsl } from "../../../document";
import { NativeSpecialInputView } from "./NativeSpecialInputView";

function widget(type: string, id: string, overrides: Record<string, unknown>): AppsmithWidgetDsl {
  return { widgetId: id, widgetName: id, type, version: type === "DATE_PICKER_WIDGET2" ? 2 : 1,
    topRow: 0, bottomRow: 7, leftColumn: 0, rightColumn: 20,
    ...overrides } as AppsmithWidgetDsl;
}

function Harness(): React.ReactElement {
  const [dateMeta, setDateMeta] = useState<Record<string, unknown>>({});
  const [phoneMeta, setPhoneMeta] = useState<Record<string, unknown>>({});
  const [currencyMeta, setCurrencyMeta] = useState<Record<string, unknown>>({});
  const [editorMeta, setEditorMeta] = useState<Record<string, unknown>>({});
  return <>
    <div data-testid="date-host" style={{ width: 300, height: 80 }}>
      <NativeSpecialInputView
        meta={dateMeta}
        onMetaChange={(patch) => setDateMeta((old) => ({ ...old, ...patch }))}
        themePrimaryColor="#2255aa"
        widget={widget("DATE_PICKER_WIDGET2", "date-1", {
          label: "Start date", labelPosition: "Top", dateFormat: "YYYY-MM-DD",
          defaultDate: "2025-06-15T12:00:00.000Z",
          minDate: "2025-01-01T00:00:00.000Z",
          maxDate: "2025-12-31T23:59:59.000Z", timePrecision: "None",
          closeOnSelection: true, shortcuts: false, firstDayOfWeek: 0,
        })}
      />
    </div>
    <div data-testid="phone-host" style={{ width: 300, height: 80 }}>
      <NativeSpecialInputView
        meta={phoneMeta}
        onMetaChange={(patch) => setPhoneMeta((old) => ({ ...old, ...patch }))}
        themePrimaryColor="#2255aa"
        widget={widget("PHONE_INPUT_WIDGET", "phone-1", {
          label: "Phone", labelPosition: "Top", defaultText: "",
          defaultDialCode: "+1", allowDialCodeChange: true,
          allowFormatting: true, placeholderText: "(000) 000-0000",
        })}
      />
    </div>
    <div data-testid="currency-host" style={{ width: 300, height: 80 }}>
      <NativeSpecialInputView
        meta={currencyMeta}
        onMetaChange={(patch) => setCurrencyMeta((old) => ({ ...old, ...patch }))}
        themePrimaryColor="#2255aa"
        widget={widget("CURRENCY_INPUT_WIDGET", "currency-1", {
          label: "Amount", labelPosition: "Top", defaultText: "100.50",
          defaultCurrencyCode: "INR", allowCurrencyChange: true,
          decimals: 2, showStepArrows: false,
        })}
      />
    </div>
    <div data-testid="editor-phone-host" style={{ width: 300, height: 80 }}>
      <NativeSpecialInputView
        editor
        meta={editorMeta}
        onMetaChange={(patch) => setEditorMeta((old) => ({ ...old, ...patch }))}
        widget={widget("PHONE_INPUT_WIDGET", "phone-editor", {
          label: "Editor", labelPosition: "Top", defaultText: "2025550123",
          defaultDialCode: "+1", allowDialCodeChange: true, allowFormatting: true,
        })}
      />
    </div>
    <output data-testid="date-meta">{JSON.stringify(dateMeta)}</output>
    <output data-testid="phone-meta">{JSON.stringify(phoneMeta)}</output>
    <output data-testid="currency-meta">{JSON.stringify(currencyMeta)}</output>
    <output data-testid="editor-meta">{JSON.stringify(editorMeta)}</output>
  </>;
}

ReactDOM.render(<Harness />, document.getElementById("art-board"));
