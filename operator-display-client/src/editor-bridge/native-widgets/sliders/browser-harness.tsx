import React from "react";
import ReactDOM from "react-dom";
import { NativeRateView, NativeNumberSliderView, NativeRangeSliderView, NativeCategorySliderView } from "./index";

function Harness(): React.ReactElement {
  const [numberDefault, setNumberDefault] = React.useState(10);
  const [controlledValue, setControlledValue] = React.useState(20);
  const [events, setEvents] = React.useState<string[]>([]);
  const record = (message: string) => setEvents((previous) => [...previous, message]);
  return <div style={{ fontFamily: "Arial, sans-serif", width: 500, padding: 20 }}>
    <section data-testid="rate-host" style={{ height: 65 }}>
      <NativeRateView isAllowHalf onMetaChange={({ rate }) => record(`rate:${rate}`)} />
    </section>
    <section data-testid="number-host" style={{ height: 110 }}>
      <NativeNumberSliderView defaultValue={numberDefault} onChangeEnd={(value) => record(`number:${value}`)} />
    </section>
    <button onClick={() => setNumberDefault(20)} type="button">Reset number default</button>
    <section data-testid="range-host" style={{ height: 110 }}>
      <NativeRangeSliderView onStartChange={(value) => record(`start:${value}`)} onEndChange={(value) => record(`end:${value}`)} />
    </section>
    <section data-testid="category-host" style={{ height: 110 }}>
      <NativeCategorySliderView onChangeEnd={(value) => record(`category:${value}`)} />
    </section>
    <section data-testid="disabled-host" style={{ height: 110 }}>
      <NativeNumberSliderView isDisabled showMarksLabel={false} />
    </section>
    <section data-testid="controlled-host" style={{ height: 110 }}>
      <NativeNumberSliderView value={controlledValue} onMetaChange={({ value }) => setControlledValue(value)} />
    </section>
    <output data-testid="controlled-value">{controlledValue}</output>
    <output data-testid="events">{events.join("|")}</output>
  </div>;
}

ReactDOM.render(<Harness />, document.getElementById("root"));
