import { LabelOrientation } from "./types";
import type { ChartType } from "./types";

/** Source: Appsmith ChartWidget/component/helpers.ts, read-only layout helpers. */
export const labelKeyForChart = (
  axisName: "xAxis" | "yAxis",
  chartType: ChartType,
): "x" | "y" => {
  if (axisName === "xAxis") return chartType === "BAR_CHART" ? "y" : "x";
  return chartType === "BAR_CHART" ? "x" : "y";
};

export const getTextWidth = (value: string, font: string): number => {
  if (typeof document === "undefined") return 0;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return 0;
  context.font = font;
  return context.measureText(value).width;
};

export const isBasicEChart = (value: unknown): value is ChartType =>
  value === "AREA_CHART" ||
  value === "PIE_CHART" ||
  value === "LINE_CHART" ||
  value === "BAR_CHART" ||
  value === "COLUMN_CHART";

export const parseLabelOrientation = (value: unknown): LabelOrientation => {
  switch (value) {
    case LabelOrientation.SLANT:
    case LabelOrientation.ROTATE:
    case LabelOrientation.STAGGER:
      return value;
    default:
      return LabelOrientation.AUTO;
  }
};
