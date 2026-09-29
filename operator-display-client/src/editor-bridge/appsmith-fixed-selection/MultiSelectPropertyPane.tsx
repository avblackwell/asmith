import { Button, Text } from "@appsmith/ads";
import React from "react";
import "./multiSelectPropertyPane.css";

export interface MultiSelectPropertyPaneProps {
  selectedWidgets: readonly { widgetId: string; widgetName: string }[];
  /** Adapter for Appsmith's SelectionRequestType.One + focusWidget. */
  onSelectWidget: (widgetId: string) => void;
}

/** Source: app/client/src/pages/Editor/MultiSelectPropertyPane/index.tsx. */
export function AppsmithMultiSelectPropertyPane({
  selectedWidgets, onSelectWidget,
}: MultiSelectPropertyPaneProps): React.ReactElement {
  return (
    <div className="relative space-y-3 appsmith-multi-select-property-pane">
      <div className="px-3 py-3">
        <Text kind="heading-s" renderAs="h3">Multiple selected</Text>
      </div>
      <div className="px-3 space-y-3 t--layout-control-wrapper">
        <Text kind="action-m" renderAs="p">Select a widget to see it's properties</Text>
        <div className="flex flex-col space-y-3 t-multi-widget-property-pane">
          {selectedWidgets.map((widget) => (
            <Button
              className={`py-1 t-multi-widget-button-${widget.widgetId}`}
              key={widget.widgetId}
              kind="secondary"
              onClick={() => onSelectWidget(widget.widgetId)}
              size="md"
            >
              {widget.widgetName}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
