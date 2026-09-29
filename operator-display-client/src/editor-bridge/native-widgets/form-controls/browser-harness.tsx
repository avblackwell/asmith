import React, { useState } from "react";
import ReactDOM from "react-dom";
import type { AppsmithWidgetDsl } from "../../../document";
import { NativeFormWidgetView } from "./NativeFormWidgetView";

function widget(type: string, id: string, overrides: Record<string, unknown>): AppsmithWidgetDsl {
  return {
    widgetId: id, widgetName: id, type, version: 1,
    topRow: 0, bottomRow: 4, leftColumn: 0, rightColumn: 12,
    ...overrides,
  } as AppsmithWidgetDsl;
}

function Harness(): React.ReactElement {
  const [checkboxValue, setCheckboxValue] = useState(false);
  const [switchValue, setSwitchValue] = useState(true);
  const [editorValue, setEditorValue] = useState(false);
  const [inputValue, setInputValue] = useState("Live text");
  const [numberValue, setNumberValue] = useState("4");
  const [passwordValue, setPasswordValue] = useState("hidden");
  const [multilineValue, setMultilineValue] = useState("First line\nSecond line");
  const [autoMultilineValue, setAutoMultilineValue] = useState("One\nTwo\nThree\nFour\nFive\nSix\nSeven\nEight");
  const [radioValue, setRadioValue] = useState<number>(1);
  const [radioRightValue, setRadioRightValue] = useState("N");
  return <>
    <div data-testid="checkbox-host" style={{ width: 240, height: 40 }}>
      <NativeFormWidgetView
        onValueChange={(value) => setCheckboxValue(Boolean(value))}
        themePrimaryColor="#2255aa"
        value={checkboxValue}
        widget={widget("CHECKBOX_WIDGET", "checkbox-1", {
          label: "Accept terms", labelPosition: "Left", defaultCheckedState: true,
          isRequired: true,
        })}
      />
    </div>
    <div data-testid="switch-host" style={{ width: 240, height: 40 }}>
      <NativeFormWidgetView
        onValueChange={(value) => setSwitchValue(Boolean(value))}
        themePrimaryColor="#2255aa"
        value={switchValue}
        widget={widget("SWITCH_WIDGET", "switch-1", {
          label: "Enable motor", labelPosition: "Right", defaultSwitchState: false,
        })}
      />
    </div>
    <div data-testid="editor-host" style={{ width: 240, height: 40 }}>
      <NativeFormWidgetView
        editor
        onValueChange={(value) => setEditorValue(Boolean(value))}
        value={editorValue}
        widget={widget("CHECKBOX_WIDGET", "checkbox-editor", {
          label: "Editor checkbox", labelPosition: "Right", defaultCheckedState: false,
        })}
      />
    </div>
    <div data-testid="input-host" style={{ width: 300, height: 70 }}>
      <NativeFormWidgetView
        onValueChange={(value) => setInputValue(String(value))}
        themePrimaryColor="#2255aa"
        value={inputValue}
        widget={widget("INPUT_WIDGET_V2", "input-1", {
          label: "Name", labelPosition: "Top", defaultText: "Saved text",
          inputType: "TEXT", placeholderText: "Enter name",
        })}
      />
    </div>
    <div data-testid="number-host" style={{ width: 300, height: 70 }}>
      <NativeFormWidgetView
        onValueChange={(value) => setNumberValue(String(value))}
        themePrimaryColor="#2255aa"
        value={numberValue}
        widget={widget("INPUT_WIDGET_V2", "number-1", {
          label: "Count", labelPosition: "Top", defaultText: "1",
          inputType: "NUMBER", showStepArrows: true, minNum: 0, maxNum: 5,
        })}
      />
    </div>
    <div data-testid="password-host" style={{ width: 300, height: 70 }}>
      <NativeFormWidgetView
        onValueChange={(value) => setPasswordValue(String(value))}
        value={passwordValue}
        widget={widget("INPUT_WIDGET_V2", "password-1", {
          label: "Secret", labelPosition: "Top", inputType: "PASSWORD",
        })}
      />
    </div>
    <div data-testid="multiline-host" style={{ width: 300, height: 120 }}>
      <NativeFormWidgetView
        onValueChange={(value) => setMultilineValue(String(value))}
        value={multilineValue}
        widget={widget("INPUT_WIDGET_V2", "multiline-1", {
          label: "Notes", labelPosition: "Top", inputType: "MULTI_LINE_TEXT",
        })}
      />
    </div>
    <div data-testid="auto-multiline-host" style={{ width: 300, height: 70 }}>
      <NativeFormWidgetView
        onValueChange={(value) => setAutoMultilineValue(String(value))}
        value={autoMultilineValue}
        widget={widget("INPUT_WIDGET_V2", "auto-multiline-1", {
          label: "Auto notes", labelPosition: "Top", inputType: "MULTI_LINE_TEXT",
          dynamicHeight: "AUTO_HEIGHT",
        })}
      />
    </div>
    <div data-testid="radio-host" style={{ width: 300, height: 60 }}>
      <NativeFormWidgetView
        onValueChange={(value) => setRadioValue(Number(value))}
        themePrimaryColor="#2255aa"
        value={radioValue}
        widget={widget("RADIO_GROUP_WIDGET", "radio-1", {
          label: "Rate", labelPosition: "Top", defaultOptionValue: 2,
          options: [{ label: "One", value: 1 }, { label: "Two", value: 2 }],
          isInline: true,
        })}
      />
    </div>
    <div data-testid="radio-right-host" style={{ width: 300, height: 60 }}>
      <NativeFormWidgetView
        onValueChange={(value) => setRadioRightValue(String(value))}
        value={radioRightValue}
        widget={widget("RADIO_GROUP_WIDGET", "radio-right-1", {
          label: "Mode", labelPosition: "Top", alignment: "RIGHT",
          options: [{ label: "Yes", value: "Y" }, { label: "No", value: "N" }],
          isInline: false,
        })}
      />
    </div>
  </>;
}

ReactDOM.render(<Harness />, document.getElementById("root"));
