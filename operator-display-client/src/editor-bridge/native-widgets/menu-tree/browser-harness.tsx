import React, { useState } from "react";
import ReactDOM from "react-dom";
import type { AppsmithWidgetDsl } from "../../../document";
import { NativeMenuTreeView } from "./NativeMenuTreeView";
import { MENU_TREE_DEFAULTS } from "./menuTreeModel";

function Host({ id, type, overrides, editor = false }: {
  id: string; type: keyof typeof MENU_TREE_DEFAULTS;
  overrides?: Record<string, unknown>; editor?: boolean;
}) {
  const [meta, setMeta] = useState<Record<string, unknown>>({});
  const [action, setAction] = useState("");
  const widget = {
    widgetId: id, widgetName: id, type, version: 1,
    topRow: 0, bottomRow: 7, leftColumn: 0, rightColumn: 20,
    ...MENU_TREE_DEFAULTS[type], ...overrides,
  } as AppsmithWidgetDsl;
  return <div data-testid={`${id}-host`} style={{ width: 320, minHeight: 85, marginBottom: 25 }}>
    <NativeMenuTreeView editor={editor} height={70} meta={meta}
      onAction={(source, context) => setAction(JSON.stringify({ source, context }))}
      onMetaChange={(patch) => setMeta((current) => ({ ...current, ...patch }))}
      themePrimaryColor="#2255aa" widget={widget} width={320} />
    <pre data-testid={`${id}-meta`}>{JSON.stringify(meta)}</pre>
    <pre data-testid={`${id}-action`}>{action}</pre>
  </div>;
}

ReactDOM.render(<>
  <Host id="menu" type="MENU_BUTTON_WIDGET" overrides={{
    menuItems: {
      later: { id: "later", index: 2, label: "Later", isVisible: true, onClick: "runLater" },
      hidden: { id: "hidden", index: 1, label: "Hidden", isVisible: false },
      first: { id: "first", index: 0, label: "First", isVisible: true, onClick: "runFirst" },
    },
  }} />
  <Host id="single" type="SINGLE_SELECT_TREE_WIDGET" />
  <Host id="multi" type="MULTI_SELECT_TREE_WIDGET" />
  <Host id="disabled" type="SINGLE_SELECT_TREE_WIDGET" overrides={{ isDisabled: true }} />
  <Host editor id="editor" type="MULTI_SELECT_TREE_WIDGET" />
</>, document.getElementById("root"));
