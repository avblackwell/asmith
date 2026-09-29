import React from "react";
import ReactDOM from "react-dom";
import { NativeContainerView, NativeTextView, OverflowTypes } from "./index";

ReactDOM.render(
  <>
    <div style={{ width: 400, height: 160 }}>
      <NativeContainerView
      backgroundColor="#f3f4f5"
      borderColor="#7a7b7c"
      borderWidth={1}
      layoutSystemType="FIXED"
      shouldScrollContents
      widgetId="container-1"
    >
      <div style={{ width: 390, height: 120 }}>
        <NativeTextView
          fontSize="HEADING2"
          fontStyle="BOLD"
          overflow={OverflowTypes.SCROLL}
          text={'<strong>Motor speed</strong> <a href="status.example">Details</a>'}
          textColor="#123456"
          widgetId="text-1"
        />
      </div>
      </NativeContainerView>
    </div>
    <div style={{ width: 400, height: 35 }}>
      <NativeTextView
        overflow={OverflowTypes.NONE}
        text="Open https://example.org/status for details"
        widgetId="auto-link"
      />
    </div>
    <div style={{ width: 200, height: 35 }}>
      <NativeTextView
        overflow={OverflowTypes.TRUNCATE}
        text={"First line\nSecond line\nThird line\nFourth line\nFifth line"}
        widgetId="truncated"
      />
    </div>
  </>,
  document.getElementById("root"),
);
