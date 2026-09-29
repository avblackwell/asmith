import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import {
  TransientWidgetOverlay,
  TransientWidgetOverlayProvider,
  applyTransientWidgetProps,
  useTransientWidgetUpdates,
} from "./TransientWidgetOverlay";

describe("transient native widget props", () => {
  it("replaces text and nested chart points without mutating the saved props", () => {
    const textProps = { widgetId: "value", text: "— rpm" };
    const chartProps = {
      widgetId: "history",
      chartData: {
        speedSeries: {
          seriesName: "Speed",
          data: [],
        },
      },
    };
    const points = [{ x: "2026-09-28T00:00:00.000Z", y: 900 }];
    const textUpdate = {
      widgetId: "value",
      propertyPath: "text",
      value: "900 rpm",
    };
    const chartUpdate = {
      widgetId: "history",
      propertyPath: "chartData.speedSeries.data",
      value: points,
    };

    const renderedText = applyTransientWidgetProps(textProps, [textUpdate]);
    const renderedChart = applyTransientWidgetProps(chartProps, [chartUpdate]);

    expect(renderedText.text).toBe("900 rpm");
    expect(renderedChart.chartData.speedSeries.data).toEqual(points);
    expect(textProps.text).toBe("— rpm");
    expect(chartProps.chartData.speedSeries.data).toEqual([]);
    expect(renderedChart.chartData.speedSeries).not.toBe(
      chartProps.chartData.speedSeries,
    );
    expect(applyTransientWidgetProps(textProps, [])).toBe(textProps);
  });

  it("notifies only affected widgets and clears values when Run stops", () => {
    const overlay = new TransientWidgetOverlay();
    const valueChanged = jest.fn();
    const otherChanged = jest.fn();
    const unsubscribe = overlay.subscribe("value", valueChanged);

    overlay.subscribe("other", otherChanged);
    overlay.apply([
      { widgetId: "value", propertyPath: "text", value: "900 rpm" },
    ]);

    expect(valueChanged).toHaveBeenCalledTimes(1);
    expect(otherChanged).not.toHaveBeenCalled();
    expect(overlay.getWidgetUpdates("value")).toEqual([
      { widgetId: "value", propertyPath: "text", value: "900 rpm" },
    ]);

    overlay.clear();

    expect(overlay.getWidgetUpdates("value")).toEqual([]);
    expect(valueChanged).toHaveBeenCalledTimes(2);
    unsubscribe();
    overlay.apply([
      { widgetId: "value", propertyPath: "text", value: "901 rpm" },
    ]);
    expect(valueChanged).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid frame without applying any of its values", () => {
    const overlay = new TransientWidgetOverlay();

    expect(() =>
      overlay.apply([
        { widgetId: "value", propertyPath: "text", value: "900 rpm" },
        {
          widgetId: "value",
          propertyPath: "__proto__.changed",
          value: "bad",
        },
      ]),
    ).toThrow("Invalid widget property path");
    expect(overlay.getWidgetUpdates("value")).toEqual([]);
  });

  it("reactively supplies values to a widget under the scoped provider", () => {
    const overlay = new TransientWidgetOverlay();
    const snapshots: string[] = [];

    function Probe() {
      const updates = useTransientWidgetUpdates("value");
      const props = applyTransientWidgetProps(
        { widgetId: "value", text: "— rpm" },
        updates,
      );

      snapshots.push(props.text);

      return <span>{props.text}</span>;
    }

    let renderer: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <TransientWidgetOverlayProvider overlay={overlay}>
          <Probe />
        </TransientWidgetOverlayProvider>,
      );
    });

    expect(snapshots[snapshots.length - 1]).toBe("— rpm");

    act(() => {
      overlay.apply([
        { widgetId: "value", propertyPath: "text", value: "900 rpm" },
      ]);
    });

    expect(snapshots[snapshots.length - 1]).toBe("900 rpm");

    act(() => overlay.clear());

    expect(snapshots[snapshots.length - 1]).toBe("— rpm");
    act(() => renderer.unmount());
  });
});
