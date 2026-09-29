/** Small read-only slice of Appsmith ChartWidget/constants.ts and ChartComponentProps. */
export type ChartType =
  | "LINE_CHART"
  | "BAR_CHART"
  | "PIE_CHART"
  | "COLUMN_CHART"
  | "AREA_CHART"
  | "SCATTER_CHART"
  | "CUSTOM_ECHART"
  | "CUSTOM_FUSION_CHART";

export interface ChartDataPoint {
  x: number | string;
  y: number | string;
}

export interface ChartData {
  seriesName?: string;
  data: ChartDataPoint[];
  color?: string;
}

export interface AllChartData {
  [key: string]: ChartData;
}

export interface LongestLabelParams {
  x: string;
  y: string;
}

export enum LabelOrientation {
  AUTO = "auto",
  SLANT = "slant",
  ROTATE = "rotate",
  STAGGER = "stagger",
}

export const XAxisCategory = "Category";
export const Colors = {
  DOVE_GRAY2: "#716e6e",
  THUNDER: "#231F20",
};
export const messages = {
  Undefined: "Series",
  EmptyData: "No chart data to display",
};

export interface ChartComponentProps {
  allowScroll: boolean;
  chartData: AllChartData;
  chartName: string;
  chartType: ChartType;
  xAxisName: string;
  yAxisName: string;
  borderRadius: string;
  primaryColor?: string;
  showDataPointLabel: boolean;
  setAdaptiveYMin: boolean;
  labelOrientation?: LabelOrientation;
  fontFamily: string;
  dimensions: {
    componentWidth: number;
    componentHeight: number;
  };
}
