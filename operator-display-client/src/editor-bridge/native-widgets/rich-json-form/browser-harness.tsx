import React, { useState } from "react";
import ReactDOM from "react-dom";
import type { AppsmithWidgetDsl } from "../../../document";
import { NativeRichTextEditorView } from "./NativeRichTextEditorView";
import { NativeJsonFormView } from "./NativeJsonFormView";
import { generateJsonFormSchema } from "./jsonFormModel";

const source = { name: "Ada", age: 31, active: true, address: { city: "London" },
  awards: [{ title: "Fellow" }] };
const schema = generateJsonFormSchema(source);
schema.__root_schema__.children.name.isRequired = true;

const jsonWidget = { widgetId: "json-1", widgetName: "JSONForm1", type: "JSON_FORM_WIDGET", version: 1,
  topRow: 0, bottomRow: 41, leftColumn: 0, rightColumn: 25, sourceData: source,
  schema, autoGenerateForm: true, title: "Person", fixedFooter: false,
  scrollContents: false, showReset: true, disabledWhenInvalid: true,
  dynamicHeight: "AUTO_HEIGHT" } as AppsmithWidgetDsl;
const richWidget = { widgetId: "rich-1", widgetName: "RichTextEditor1", type: "RICH_TEXT_EDITOR_WIDGET",
  version: 1, topRow: 0, bottomRow: 20, leftColumn: 0, rightColumn: 24,
  defaultText: "Hello <b>world</b>", inputType: "html", labelText: "Notes",
  labelPosition: "Top", isDisabled: false } as AppsmithWidgetDsl;

function Harness(): React.ReactElement {
  const [richMeta, setRichMeta] = useState<Record<string, unknown>>({});
  const [jsonMeta, setJsonMeta] = useState<Record<string, unknown>>({});
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(null);
  return <>
    <div data-testid="rich-host" style={{ width: 550, height: 310 }}>
      <NativeRichTextEditorView meta={richMeta}
        onMetaChange={(patch) => setRichMeta((old) => ({ ...old, ...patch }))}
        widget={richWidget} />
    </div>
    <div data-testid="json-host" style={{ width: 480, height: 450 }}>
      <NativeJsonFormView meta={jsonMeta}
        onMetaChange={(patch) => setJsonMeta((old) => ({ ...old, ...patch }))}
        onSubmit={setSubmitted} widget={jsonWidget} />
    </div>
    <output data-testid="rich-meta">{JSON.stringify(richMeta)}</output>
    <output data-testid="json-meta">{JSON.stringify(jsonMeta)}</output>
    <output data-testid="submitted">{JSON.stringify(submitted)}</output>
  </>;
}

ReactDOM.render(<Harness />, document.getElementById("root"));
