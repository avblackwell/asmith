import React, { useEffect, useRef, useState } from "react";
import { Button, Tab, TabPanel, Tabs, TabsList, Text } from "@appsmith/ads";
import type { AppsmithWidgetDsl } from "../../../document";
import type { ChartTheme } from "../chart/basicChartOptions";
import { AppsmithBuilderCodeEditor, type BuilderEditorMode } from "./AppsmithBuilderCodeEditor";
import { sourceUpdatePatch, eventReferences } from "./builderModel";
import { resolveCustomModel, resolveCustomSrcDoc, type CustomSrcDoc } from "./customWidgetModel";
import { NativeCustomWidgetView } from "./NativeCustomWidgetView";
import "./appsmithCustomWidgetBuilder.css";

export interface AppsmithCustomWidgetBuilderProps {
  widget: AppsmithWidgetDsl;
  theme?: ChartTheme;
  disabled?: boolean;
  onBatchUpdateProperties: (patch: { srcDoc: CustomSrcDoc;
    uncompiledSrcDoc: CustomSrcDoc }) => void;
  onClose?: () => void;
}

interface DebuggerLog { type: "error" | "warn" | "info" | "log"; message: string }

const EDITOR_TABS: Array<{ key: keyof CustomSrcDoc; title: string;
  mode: BuilderEditorMode }> = [
  { key: "html", title: "HTML", mode: "htmlmixed" },
  { key: "css", title: "Style", mode: "css" },
  { key: "js", title: "JS", mode: "javascript" },
];
const TAB_STORAGE_KEY = "custom-widget-layout-tabs-state";
const REFERENCE_STORAGE_KEY = "custom-widget-builder-context-state-is-reference-open";

function storedTab(): string {
  const tab = window.localStorage.getItem(TAB_STORAGE_KEY);
  return EDITOR_TABS.some((entry) => entry.title === tab) ? tab! : "HTML";
}

function storedReference(): boolean {
  const value = window.localStorage.getItem(REFERENCE_STORAGE_KEY);
  return value === null ? true : value === "true";
}

export function AppsmithCustomWidgetBuilder({
  widget, theme, disabled = false, onBatchUpdateProperties, onClose,
}: AppsmithCustomWidgetBuilderProps): React.ReactElement {
  const [uncompiled, setUncompiled] = useState<CustomSrcDoc>(() =>
    resolveCustomSrcDoc(widget.uncompiledSrcDoc ?? widget.srcDoc));
  const [compiled, setCompiled] = useState<CustomSrcDoc>(() =>
    resolveCustomSrcDoc(widget.srcDoc));
  const [tab, setTab] = useState(storedTab);
  const [referencesOpen, setReferencesOpen] = useState(storedReference);
  const [debuggerLogs, setDebuggerLogs] = useState<DebuggerLog[]>([]);
  const [previewMeta, setPreviewMeta] = useState<Record<string, unknown>>({});
  const [previewWidth, setPreviewWidth] = useState(300);
  const [previewHeight, setPreviewHeight] = useState(500);
  const [editorWidth, setEditorWidth] = useState(() =>
    Math.max(660, window.innerWidth * 0.5));
  const previewRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; width: number } | null>(null);
  const model = resolveCustomModel(widget, previewMeta);
  const eventMap = eventReferences(widget);

  useEffect(() => {
    setUncompiled(resolveCustomSrcDoc(widget.uncompiledSrcDoc ?? widget.srcDoc));
    setCompiled(resolveCustomSrcDoc(widget.srcDoc));
    setPreviewMeta({});
    setDebuggerLogs([]);
  }, [widget.widgetId]);

  useEffect(() => {
    const target = previewRef.current;
    if (!target) return;
    const update = () => {
      const rect = target.getBoundingClientRect();
      // Appsmith Preview/index.tsx passes clientWidth + 8, because the Fixed
      // Custom component subtracts 8px of WidgetConstants padding.
      setPreviewWidth(Math.max(1, rect.width + 8));
      setPreviewHeight(Math.max(1, rect.height));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!dragRef.current || !shellRef.current) return;
      const shellWidth = shellRef.current.getBoundingClientRect().width;
      const next = dragRef.current.width + event.clientX - dragRef.current.x;
      setEditorWidth(Math.min(Math.max(660, next), Math.max(660, shellWidth - 300)));
    };
    const end = () => {
      dragRef.current = null;
      document.body.classList.remove("cursor-ew-resize");
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", end);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", end);
    };
  }, []);

  const appendLog = (type: DebuggerLog["type"], message: string) => {
    setDebuggerLogs((old) => [...old, { type, message }]);
  };

  const updateSource = (part: keyof CustomSrcDoc, value: string) => {
    if (disabled) return;
    const next = { ...uncompiled, [part]: value };
    const result = sourceUpdatePatch(next);
    setUncompiled(next);
    setCompiled(result.code);
    setDebuggerLogs([
      ...result.errors.map((entry) => ({ type: "error" as const, message: entry.message })),
      ...result.warnings.map((entry) => ({ type: "warn" as const, message: entry.message })),
    ]);
    onBatchUpdateProperties(result.patch);
  };

  const previewWidget: AppsmithWidgetDsl = { ...widget, srcDoc: { ...compiled } };

  return <div className="od-custom-builder" data-testid="custom-widget-builder">
    <header className="od-custom-builder__header">
      <Text kind="heading-xs">Custom Widget Builder</Text>
      <Button kind="tertiary" onClick={onClose} size="md">Close</Button>
    </header>
    <div className="od-custom-builder__content" ref={shellRef}>
      <section className="od-custom-builder__preview" ref={previewRef}
        style={{ width: `calc(100% - ${editorWidth}px)` }}>
        <NativeCustomWidgetView
          dimensions={{ width: previewWidth, height: previewHeight }}
          meta={previewMeta}
          mode="builder"
          onConsole={(type, args) => appendLog(type === "warn" ? "warn" :
            type === "error" ? "error" : "log", JSON.stringify(args))}
          onMetaChange={(patch) => {
            setPreviewMeta((old) => ({ ...old, ...patch }));
            appendLog("info", `Model updated: ${JSON.stringify(patch.model)}`);
          }}
          onTriggerEvent={(name, context) =>
            appendLog("info", `Event fired: ${name} ${JSON.stringify(context)}`)}
          theme={theme}
          widget={previewWidget}
        />
        <div className="od-custom-builder__debugger" data-testid="custom-builder-debugger">
          <div className="od-custom-builder__debugger-title">Debugger
            <Button kind="tertiary" onClick={() => setDebuggerLogs([])} size="sm">Clear</Button>
          </div>
          {debuggerLogs.length === 0 ? <span>No logs</span> :
            debuggerLogs.map((entry, index) => <div data-log-type={entry.type}
              key={`${index}-${entry.message}`}>{entry.message}</div>)}
        </div>
      </section>
      <div className="od-custom-builder__resizer" data-testid="custom-builder-resizer"
        onMouseDown={(event) => {
          dragRef.current = { x: event.clientX, width: editorWidth };
          document.getSelection()?.removeAllRanges();
          document.body.classList.add("cursor-ew-resize");
        }} />
      <section className="od-custom-builder__editor" style={{ width: editorWidth }}>
        <div className="od-custom-builder__editor-heading">
          <Text>{widget.widgetName}</Text>
          <Button kind="tertiary" onClick={() => {
            const next = !referencesOpen;
            setReferencesOpen(next);
            window.localStorage.setItem(REFERENCE_STORAGE_KEY, String(next));
          }} size="sm">References</Button>
        </div>
        <div className="od-custom-builder__editor-body">
          <Tabs onValueChange={(value) => window.setTimeout(() => {
            setTab(value);
            window.localStorage.setItem(TAB_STORAGE_KEY, value);
          })} value={tab}>
            <TabsList className="od-custom-builder__tabs-list">
              {EDITOR_TABS.map((entry) => <Tab key={entry.key} value={entry.title}>
                {entry.title}</Tab>)}
            </TabsList>
            {EDITOR_TABS.map((entry) => <TabPanel className="od-custom-builder__tab-panel"
              forceMount key={entry.key} value={entry.title}>
              <AppsmithBuilderCodeEditor
                disabled={disabled}
                mode={entry.mode}
                onChange={(value) => updateSource(entry.key, value)}
                testId={`custom-builder-${entry.key}-editor`}
                value={uncompiled[entry.key]}
              />
            </TabPanel>)}
          </Tabs>
          {referencesOpen && <aside className="od-custom-builder__references"
            data-testid="custom-builder-references">
            <Text kind="heading-xs">References</Text>
            <Text>Live Model</Text>
            <pre>{JSON.stringify(model, null, 2)}</pre>
            <Text>Events</Text>
            {Object.entries(eventMap).length === 0 ? <span>No events</span> :
              Object.entries(eventMap).map(([name, action]) =>
                <details key={name}><summary>{name}</summary>
                  <code>{action || "No action"}</code></details>)}
          </aside>}
        </div>
      </section>
    </div>
    {disabled && <div className="od-custom-builder__connection-lost"
      role="status">Connection to the workbench was lost</div>}
  </div>;
}
