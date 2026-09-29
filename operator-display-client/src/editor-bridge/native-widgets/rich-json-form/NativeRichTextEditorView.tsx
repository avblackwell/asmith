import React, { useLayoutEffect, useRef, useState } from "react";
import { Alignment } from "@blueprintjs/core";
import type { AppsmithWidgetDsl } from "../../../document";
import { richTextEditorValue } from "./richTextModel";

// Appsmith RichTextEditorWidget/widget/index.tsx lazy-loads the TinyMCE graph.
const AppsmithRichTextEditor = React.lazy(() => import("./AppsmithRichTextEditor"));

export interface NativeRichTextEditorViewProps {
  widget: AppsmithWidgetDsl;
  meta?: Record<string, unknown>;
  editor?: boolean;
  themeBorderRadius?: string;
  themeBoxShadow?: string;
  onMetaChange?: (patch: Record<string, unknown>) => void;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

/** TinyMCE component is Appsmith's component with only imports/label/theme adapted. */
export function NativeRichTextEditorView(props: NativeRichTextEditorViewProps): React.ReactElement {
  const { widget, meta = {}, editor = false } = props;
  const frameRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => setWidth(frame.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  const textValue = text(meta.text, text(widget.defaultText));
  const required = widget.isRequired === true;
  const radius = text(widget.borderRadius);
  const shadow = text(widget.boxShadow);
  const rows = Number(widget.bottomRow) - Number(widget.topRow);
  const componentHeight = rows * 10;
  const columns = Number(widget.rightColumn) - Number(widget.leftColumn);
  const sideLabelWidth = width && columns > 0 ? width * Number(widget.labelWidth ?? 5) / columns : undefined;
  return <div ref={frameRef} style={{ height: "100%", width: "100%" }}><React.Suspense
    fallback={<div className="bp3-skeleton" style={{ height: "100%", width: "100%" }} />}>
    <AppsmithRichTextEditor
    borderRadius={radius && !radius.includes("{{") ? radius : props.themeBorderRadius || "0px"}
    boxShadow={shadow && !shadow.includes("{{") ? shadow : props.themeBoxShadow || "none"}
    compactMode={componentHeight <= 40}
    isDisabled={editor || widget.isDisabled === true}
    isDynamicHeightEnabled={widget.dynamicHeight === "AUTO_HEIGHT" || widget.dynamicHeight === "AUTO_HEIGHT_WITH_LIMITS"}
    isMarkdown={widget.inputType === "markdown"}
    isToolbarHidden={widget.isToolbarHidden === true}
    isValid={!required || textValue.length > 0}
    isVisible={widget.isVisible !== false}
    labelAlignment={widget.labelAlignment === "RIGHT" ? Alignment.RIGHT : Alignment.LEFT}
    labelPosition={widget.labelPosition === "Left" || widget.labelPosition === "Auto" ? widget.labelPosition : "Top"}
    labelStyle={text(widget.labelStyle)}
    labelText={text(widget.labelText, "Label")}
    labelTextColor={text(widget.labelTextColor) || undefined}
    labelTextSize={text(widget.labelTextSize) || undefined}
    labelTooltip={text(widget.labelTooltip) || undefined}
    labelWidth={sideLabelWidth}
    onValueChange={(text) => props.onMetaChange?.({ text, isDirty: true })}
    placeholder={text(widget.placeholder) || undefined}
    value={richTextEditorValue(textValue, widget.inputType)}
    widgetId={widget.widgetId}
    />
  </React.Suspense></div>;
}
