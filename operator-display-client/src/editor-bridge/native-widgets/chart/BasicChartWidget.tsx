import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { init, use } from "echarts/core";
import type { EChartsType } from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  DataZoomComponent,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { AppsmithWidgetDsl } from "../../../document";
import { buildBasicChartOptions } from "./basicChartOptions";
import type { ChartDimensions, ChartTheme } from "./basicChartOptions";

use([
  BarChart,
  LineChart,
  PieChart,
  DataZoomComponent,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  SVGRenderer,
]);

export interface BasicChartWidgetProps {
  widget: AppsmithWidgetDsl;
  theme?: ChartTheme;
  dimensions?: ChartDimensions;
}

/** Read-only Appsmith basic ChartWidget rendering with the native option builders. */
export function BasicChartWidget({ widget, theme, dimensions: providedDimensions }: BasicChartWidgetProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const chartHostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const [measuredDimensions, setMeasuredDimensions] = useState({ width: 0, height: 0 });
  const [renderError, setRenderError] = useState(false);

  useLayoutEffect(() => {
    if (providedDimensions) return;
    const element = shellRef.current;
    if (!element) return;

    const measure = () => {
      const bounds = element.getBoundingClientRect();
      setMeasuredDimensions((current) => {
        const width = Math.max(0, Math.round(bounds.width));
        const height = Math.max(0, Math.round(bounds.height));
        return current.width === width && current.height === height
          ? current
          : { width, height };
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [providedDimensions]);

  const dimensions = providedDimensions ?? measuredDimensions;

  const result = useMemo(
    () => buildBasicChartOptions(widget, dimensions, theme),
    [widget, dimensions, theme],
  );

  useEffect(() => {
    if (result.status !== "ready" || !chartHostRef.current) return;
    const chart = init(chartHostRef.current, undefined, {
      renderer: "svg",
      width: dimensions.width,
      height: dimensions.height,
    });
    chartRef.current = chart;
    return () => {
      chartRef.current = null;
      chart.dispose();
    };
    // The host is replaced only when the chart changes to/from a fallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.status]);

  useEffect(() => {
    if (result.status !== "ready" || !chartRef.current) return;
    try {
      chartRef.current.setOption(result.options, true);
      chartRef.current.resize({ width: dimensions.width, height: dimensions.height });
      setRenderError(false);
    } catch {
      setRenderError(true);
    }
  }, [result, dimensions]);

  const borderRadius = typeof widget.borderRadius === "string"
    ? widget.borderRadius
    : theme?.appBorderRadius ?? "0";
  const boxShadow = typeof widget.boxShadow === "string"
    ? widget.boxShadow
    : theme?.appBoxShadow ?? "none";
  const fallback = result.status === "ready" ? null : result.message;

  return (
    <div
      data-testid="native-basic-chart-widget"
      ref={shellRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: "var(--ads-v2-color-bg, #fff)",
        borderRadius,
        boxShadow,
      }}
    >
      {fallback ? (
        <div
          key="chart-fallback"
          style={{
            alignItems: "center",
            display: "flex",
            height: "100%",
            justifyContent: "center",
            padding: 12,
            textAlign: "center",
          }}
        >
          {fallback}
        </div>
      ) : (
        <>
          <div
            aria-label={typeof widget.chartName === "string" ? widget.chartName : widget.widgetName}
            data-testid="native-basic-chart"
            key="chart-host"
            ref={chartHostRef}
            role="img"
            style={{ width: "100%", height: "100%" }}
          />
          {renderError && (
            <div style={{ position: "absolute", inset: 0, background: "#fff" }}>
              Unable to render chart
            </div>
          )}
        </>
      )}
    </div>
  );
}
