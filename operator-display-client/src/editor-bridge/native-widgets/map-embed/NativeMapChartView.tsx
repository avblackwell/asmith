import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { AppsmithWidgetDsl } from "../../../document";
import countryDetails from "./countryDetails";
import { MapTypes } from "./mapChartConstants";
import { getChartOption, loadMapGenerator } from "./mapChartOptions";
import { isMapType, mapChartColorRange, mapChartData } from "./mapChartModel";

export interface MapDataPoint {
  value: number;
  label: string;
  shortLabel: string;
  originalId: string;
  id: string;
}

export interface NativeMapChartViewProps {
  widget: AppsmithWidgetDsl;
  dimensions?: { width: number; height: number };
  onDataPointClick?: (point: MapDataPoint) => void;
}

/** The Appsmith MapChart ECharts SVG view, fed by the product's saved DSL. */
export function NativeMapChartView({ widget, dimensions: providedDimensions, onDataPointClick }: NativeMapChartViewProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [measured, setMeasured] = useState({ width: 0, height: 0 });
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const loadMap = useMemo(loadMapGenerator, []);
  const mapType = isMapType(widget.mapType) ? widget.mapType : MapTypes.WORLD;
  const data = useMemo(() => mapChartData(widget.data, mapType), [widget.data, mapType]);
  const colorRange = useMemo(() => mapChartColorRange(widget.colorRange), [widget.colorRange]);
  const width = providedDimensions?.width ?? measured.width;
  const height = providedDimensions?.height ?? measured.height;
  const caption = typeof widget.mapTitle === "string" ? widget.mapTitle : "";
  const showLabels = widget.showLabels !== false;
  const fontFamily = typeof widget.fontFamily === "string" && widget.fontFamily !== "System Default"
    ? widget.fontFamily : "";

  useLayoutEffect(() => {
    if (providedDimensions || !shellRef.current) return;
    const shell = shellRef.current;
    const measure = () => {
      const bounds = shell.getBoundingClientRect();
      setMeasured((current) => {
        const next = { width: Math.max(0, Math.round(bounds.width)), height: Math.max(0, Math.round(bounds.height)) };
        return current.width === next.width && current.height === next.height ? current : next;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [providedDimensions]);

  useEffect(() => {
    if (!hostRef.current || width <= 0 || height <= 0 || chartRef.current) return;
    const chart = echarts.init(hostRef.current, undefined, { renderer: "svg", width, height });
    chartRef.current = chart;
    return () => {
      chartRef.current = null;
      chart.dispose();
    };
  }, [width > 0, height > 0]);

  useEffect(() => {
    let active = true;
    setMapReady(false);
    setLoadError(false);
    loadMap(mapType).then(() => {
      if (active) setMapReady(true);
    }).catch(() => {
      if (active) setLoadError(true);
    });
    return () => { active = false; };
  }, [loadMap, mapType]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !mapReady || width <= 0 || height <= 0) return;
    const pieces = colorRange.map((color) => ({
      min: color.minValue,
      max: color.maxValue,
      color: color.code,
      colorAlpha: (color.alpha ?? 100) / 100,
      label: color.displayValue,
    }));
    try {
      chart.setOption(getChartOption(caption, showLabels, pieces,
        data.map((entry) => ({ name: entry.id, value: entry.value })),
        mapType, height, width, fontFamily), true);
      chart.resize({ width, height });
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [caption, colorRange, data, fontFamily, height, mapReady, mapType, showLabels, width]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const handler = (event: echarts.ECElementEvent) => {
      const point = event.data as { name?: string; value?: number | string } | undefined;
      const id = point?.name;
      if (!id) return;
      const detail = countryDetails[mapType][id];
      if (!detail) return;
      onDataPointClick?.({
        value: Number(point?.value),
        label: detail.label,
        shortLabel: detail.short_label,
        originalId: id,
        id: id.toLowerCase(),
      });
    };
    chart.on("click", "series", handler);
    return () => { chart.off("click", handler); };
  }, [mapReady, mapType, onDataPointClick]);

  return <div
    data-native-widget="map-chart"
    data-testid="t--map-chart-container"
    ref={shellRef}
    style={{ display: "flex", height: "100%", width: "100%", background: "white", overflow: "hidden", position: "relative",
      borderRadius: typeof widget.borderRadius === "string" ? widget.borderRadius : undefined,
      boxShadow: typeof widget.boxShadow === "string" ? widget.boxShadow : undefined }}
    onClick={(event) => event.stopPropagation()}
  >
    <div ref={hostRef} role="img" aria-label={caption || "Map chart"} style={{ width: "100%", height: "100%" }} />
    {loadError && <span role="status" style={statusStyle}>Map chart unavailable</span>}
    {!mapReady && !loadError && <span role="status" style={statusStyle}>Loading map chart</span>}
  </div>;
}

const statusStyle: React.CSSProperties = {
  alignItems: "center", background: "white", color: "#4c5664", display: "flex", fontSize: 14,
  justifyContent: "center", position: "absolute", inset: 0,
};
