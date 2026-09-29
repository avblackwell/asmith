import type { AppsmithWidgetDsl } from "../../../document";
import { EChartsConfigurationBuilder } from "./EChartsConfigurationBuilder";
import { EChartsDatasetBuilder } from "./EChartsDatasetBuilder";
import { isBasicEChart, parseLabelOrientation } from "./helpers";
import type { AllChartData, ChartComponentProps, ChartDataPoint } from "./types";

export interface ChartDimensions {
  width: number;
  height: number;
}

export interface ChartTheme {
  fontFamily?: string;
  primaryColor?: string;
  backgroundColor?: string;
  appBorderRadius?: string;
  appBoxShadow?: string;
}

export type BasicChartResult =
  | { status: "ready"; options: Record<string, unknown> }
  | { status: "empty" | "invalid" | "unsupported"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readChartData(value: unknown): AllChartData | null {
  if (!isRecord(value)) return null;
  const chartData: AllChartData = Object.create(null);

  for (const [seriesId, candidate] of Object.entries(value)) {
    if (!isRecord(candidate) || !Array.isArray(candidate.data)) return null;
    const points: ChartDataPoint[] = [];

    for (const point of candidate.data) {
      if (!isRecord(point)) return null;
      if (
        !(typeof point.x === "string" || typeof point.x === "number") ||
        !(typeof point.y === "string" || typeof point.y === "number")
      ) return null;
      points.push({ x: point.x, y: point.y });
    }

    chartData[seriesId] = {
      data: points,
      seriesName: typeof candidate.seriesName === "string"
        ? candidate.seriesName
        : undefined,
      color: typeof candidate.color === "string" ? candidate.color : undefined,
    };
  }

  return chartData;
}

/**
 * The read-only basic ECharts branch of Appsmith's ChartWidget.
 * It consumes already resolved DSL values. It does not evaluate {{...}}
 * expressions or attach onDataPointClick actions.
 */
export function buildBasicChartOptions(
  widget: AppsmithWidgetDsl,
  dimensions: ChartDimensions,
  theme: ChartTheme = {},
): BasicChartResult {
  if (!isBasicEChart(widget.chartType)) {
    return {
      status: "unsupported",
      message: "This chart type is not available in the read-only workbench.",
    };
  }

  const chartData = readChartData(widget.chartData);
  if (!chartData) return { status: "invalid", message: "Invalid chart data" };

  // Appsmith's emptyChartData checks only the first series for pie charts.
  const series = Object.values(chartData);
  const visibleSeries = widget.chartType === "PIE_CHART"
    ? series.slice(0, 1)
    : series;
  if (!visibleSeries.some((entry) => entry.data.length > 0)) {
    return { status: "empty", message: "No chart data to display" };
  }

  // ChartWidget passes no font family to its component for System Default.
  const selectedFontFamily = stringOr(widget.fontFamily, theme.fontFamily ?? "System Default");

  const props: ChartComponentProps = {
    allowScroll: widget.allowScroll === true,
    chartData,
    chartName: stringOr(widget.chartName, ""),
    chartType: widget.chartType,
    xAxisName: stringOr(widget.xAxisName, ""),
    yAxisName: stringOr(widget.yAxisName, ""),
    borderRadius: stringOr(widget.borderRadius, "0"),
    primaryColor: stringOr(
      widget.accentColor,
      stringOr(widget.primaryColor, theme.primaryColor ?? "#553DE9"),
    ),
    showDataPointLabel: widget.showDataPointLabel === true,
    setAdaptiveYMin: widget.setAdaptiveYMin === true,
    labelOrientation: parseLabelOrientation(widget.labelOrientation),
    // ECharts writes this value into SVG text; include a browser fallback
    // when the saved theme names a font unavailable on this host.
    fontFamily: selectedFontFamily === "System Default"
      ? "" : `${selectedFontFamily}, Arial, sans-serif`,
    dimensions: {
      componentWidth: dimensions.width,
      componentHeight: dimensions.height,
    },
  };

  try {
    const datasetBuilder = new EChartsDatasetBuilder(props.chartType, chartData);
    const dataset = datasetBuilder.datasetFromData();
    const options = {
      ...new EChartsConfigurationBuilder().prepareEChartConfig(
        props,
        datasetBuilder.filteredChartData,
        datasetBuilder.longestDataLabels(),
      ),
      dataset,
    };
    return { status: "ready", options };
  } catch {
    return { status: "invalid", message: "Invalid chart data" };
  }
}
