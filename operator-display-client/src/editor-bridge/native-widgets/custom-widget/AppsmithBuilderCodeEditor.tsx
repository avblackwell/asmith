import React, { useEffect, useRef } from "react";
import CodeMirror from "codemirror";
import "codemirror/lib/codemirror.css";
import "codemirror/theme/duotone-light.css";
import "codemirror/addon/edit/matchbrackets";
import "codemirror/addon/edit/closebrackets";
import "codemirror/addon/display/placeholder";
import "codemirror/addon/display/autorefresh";
import "codemirror/addon/fold/brace-fold";
import "codemirror/addon/fold/foldgutter";
import "codemirror/addon/fold/foldgutter.css";
import "codemirror/addon/comment/comment";
import "codemirror/mode/css/css";
import "codemirror/mode/javascript/javascript";
import "codemirror/mode/htmlmixed/htmlmixed";
import "./appsmithBuilderCodeEditor.css";

export type BuilderEditorMode = "htmlmixed" | "css" | "javascript";

export interface AppsmithBuilderCodeEditorProps {
  mode: BuilderEditorMode;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  height?: number | string;
  testId?: string;
}

// Appsmith CodeEditor/index.tsx componentDidMount options used by
// CustomWidgetBuilder's HTML, Style, and JS tabs. Their source passes
// ignoreBinding, ignoreAutoComplete, ignoreSlashCommand, and hideEvaluatedValue.
export function AppsmithBuilderCodeEditor({
  mode, value, onChange, disabled = false, placeholder = "", height = "100%", testId,
}: AppsmithBuilderCodeEditorProps): React.ReactElement {
  const target = useRef<HTMLDivElement>(null);
  const editor = useRef<CodeMirror.Editor | null>(null);
  const callback = useRef(onChange);
  callback.current = onChange;

  useEffect(() => {
    if (!target.current) return;
    const options: CodeMirror.EditorConfiguration = {
      autoRefresh: true,
      mode,
      theme: "duotone-light",
      viewportMargin: 10,
      tabSize: 2,
      autoCloseBrackets: true,
      indentWithTabs: true,
      lineWrapping: true,
      lineNumbers: true,
      addModeClass: true,
      matchBrackets: false,
      scrollbarStyle: "native",
      placeholder,
      foldGutter: true,
      gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
      readOnly: disabled,
      value,
      tabindex: -1,
      extraKeys: {
        "Ctrl-S": autoIndentCode,
        "Cmd-S": autoIndentCode,
        "Shift-Alt-F": autoIndentCode,
        "Shift-Cmd-P": autoIndentCode,
        "Shift-Ctrl-I": autoIndentCode,
        "Ctrl-/": "toggleComment",
        "Cmd-/": "toggleComment",
        "Ctrl-D": () => undefined,
        "Cmd-D": () => undefined,
      },
    };
    const cm = CodeMirror(target.current, options);
    editor.current = cm;
    cm.setSize("100%", height);
    const beforeChange = (_instance: CodeMirror.Editor,
      change: CodeMirror.EditorChangeCancellable) => {
      if (change.origin !== "paste" || !change.update) return;
      change.update(undefined, undefined, change.text.map((line) =>
        line.replace(/[‘’]/g, "'").replace(/[“”]/g, '"')));
    };
    const handleChange = () => callback.current(cm.getValue());
    let currentLine: number | null = null;
    const cursorActivity = () => {
      const line = cm.getCursor().line;
      cm.setOption("matchBrackets", mode === "javascript");
      if (currentLine !== null) {
        cm.removeLineClass(currentLine, "background", "CodeMirror-activeline-background");
      }
      cm.addLineClass(line, "background", "CodeMirror-activeline-background");
      currentLine = line;
    };
    const blur = () => {
      cm.setOption("matchBrackets", false);
      if (currentLine !== null) {
        cm.removeLineClass(currentLine, "background", "CodeMirror-activeline-background");
        currentLine = null;
      }
    };
    cm.on("beforeChange", beforeChange);
    cm.on("change", handleChange);
    cm.on("cursorActivity", cursorActivity);
    cm.on("blur", blur);
    const observer = new ResizeObserver(() => cm.refresh());
    observer.observe(target.current);
    return () => {
      observer.disconnect();
      cm.off("beforeChange", beforeChange);
      cm.off("change", handleChange);
      cm.off("cursorActivity", cursorActivity);
      cm.off("blur", blur);
      target.current?.replaceChildren();
      editor.current = null;
    };
  }, [mode]);

  useEffect(() => {
    const cm = editor.current;
    if (cm && cm.getValue() !== value) {
      cm.setValue(value);
      cm.clearHistory();
    }
  }, [value]);

  useEffect(() => {
    editor.current?.setOption("readOnly", disabled);
  }, [disabled]);

  useEffect(() => {
    editor.current?.setSize("100%", height);
  }, [height]);

  return <div className="od-custom-code-editor" data-testid={testId}
    ref={target} style={{ height }} />;
}

// Appsmith CodeEditor/utils/autoIndentUtils.ts.
function autoIndentCode(cm: CodeMirror.Editor): void {
  cm.eachLine((line) => {
    const number = cm.getLineNumber(line);
    if (number !== null) cm.indentLine(number, "smart");
  });
  window.setTimeout(() => cm.refresh(), 0);
}
