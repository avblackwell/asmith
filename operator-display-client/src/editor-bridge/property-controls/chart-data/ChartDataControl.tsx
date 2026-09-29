import React, { useEffect, useRef, useState } from "react";
import { Button, Input, Text } from "@appsmith/ads";
import {
  copySeriesMap,
  nextSeriesId,
  normalizeChartData,
  parseChartPoints,
  type ChartSeries,
  type ChartSeriesMap,
} from "./chartDataModel";
import "./chartDataControl.css";

export interface ChartDataControlProps {
  value: unknown;
  onChange: (value: Record<string, unknown>) => void;
  onError: (message: string | null) => void;
  renderSeriesBinding?: (seriesId: string, index: number) => React.ReactNode;
}

interface SeriesEditorProps {
  id: string;
  index: number;
  series: ChartSeries;
  canDelete: boolean;
  onUpdate: (id: string, patch: Partial<ChartSeries>) => void;
  onDelete: (id: string) => void;
  onError: (message: string | null) => void;
  renderSeriesBinding?: (seriesId: string, index: number) => React.ReactNode;
}

function SeriesEditor({
  id,
  index,
  series,
  canDelete,
  onUpdate,
  onDelete,
  onError,
  renderSeriesBinding,
}: SeriesEditorProps): React.ReactElement {
  const [nameDraft, setNameDraft] = useState(series.seriesName);
  const [colorDraft, setColorDraft] = useState(series.color ?? "");
  const savedDataText = JSON.stringify(series.data, null, 2);
  const [dataDraft, setDataDraft] = useState(savedDataText);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => setNameDraft(series.seriesName), [series.seriesName]);
  useEffect(() => setColorDraft(series.color ?? ""), [series.color]);
  useEffect(() => {
    setDataDraft(savedDataText);
    setDataError(null);
  }, [savedDataText]);

  const title = series.seriesName.trim() || `Series ${index + 1}`;

  const commitName = () => {
    if (nameDraft === series.seriesName) return;
    onError(null);
    onUpdate(id, { seriesName: nameDraft });
  };

  const commitColor = () => {
    const color = colorDraft.trim();
    if (color === (series.color ?? "")) return;
    if (color && typeof CSS !== "undefined" && !CSS.supports("color", color)) {
      onError(`Color for ${title} must be a valid CSS color.`);
      return;
    }
    onError(null);
    onUpdate(id, { color });
  };

  const commitData = () => {
    if (dataDraft === savedDataText) {
      setDataError(null);
      return;
    }
    try {
      const data = parseChartPoints(dataDraft);
      setDataError(null);
      onError(null);
      onUpdate(id, { data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid series data.";
      setDataError(message);
      onError(message);
    }
  };

  return (
    <section aria-label={title} className="od-chart-data__series">
      <div className="od-chart-data__series-header">
        <Text kind="heading-xs" renderAs="h4">{title}</Text>
        {canDelete && (
          <Button
            aria-label={`Delete ${title}`}
            isIconButton
            kind="tertiary"
            onClick={() => onDelete(id)}
            size="sm"
            startIcon="delete-bin-line"
            type="button"
          />
        )}
      </div>
      <Input
        label={`Series ${index + 1} name`}
        onBlur={commitName}
        onChange={setNameDraft}
        placeholder="Series name"
        value={nameDraft}
      />
      <Input
        label={`Series ${index + 1} color`}
        onBlur={commitColor}
        onChange={setColorDraft}
        placeholder="#553DE9"
        value={colorDraft}
      />
      <Input
        className="od-chart-data__json-input"
        description="Static JSON array with x labels and numeric y values."
        errorMessage={dataError ?? undefined}
        isValid={!dataError}
        label={`Series ${index + 1} data`}
        onBlur={commitData}
        onChange={(text) => {
          setDataDraft(text);
          if (dataError) {
            setDataError(null);
            onError(null);
          }
        }}
        renderAs="textarea"
        value={dataDraft}
      />
      {renderSeriesBinding?.(id, index)}
    </section>
  );
}

/** Static Appsmith CHART_DATA editor: series map in, one immutable map per edit out. */
export function ChartDataControl({ value, onChange, onError, renderSeriesBinding }: ChartDataControlProps): React.ReactElement {
  const series = normalizeChartData(value);
  const latest = useRef<ChartSeriesMap | null>(series);
  const lastValue = useRef(value);
  if (lastValue.current !== value) {
    lastValue.current = value;
    latest.current = series;
  }

  const emit = (next: ChartSeriesMap) => {
    latest.current = next;
    onError(null);
    onChange(next);
  };

  const updateSeries = (id: string, patch: Partial<ChartSeries>) => {
    const current = latest.current;
    if (!current || !Object.hasOwn(current, id)) return;
    const next = copySeriesMap(current);
    next[id] = { ...next[id], ...patch };
    if (patch.color === "") delete next[id].color;
    emit(next);
  };

  const deleteSeries = (id: string) => {
    const current = latest.current;
    if (!current || Object.keys(current).length <= 1) return;
    const next = copySeriesMap(current);
    delete next[id];
    emit(next);
  };

  const addSeries = () => {
    const current = latest.current;
    if (!current) return;
    const next = copySeriesMap(current);
    next[nextSeriesId(next)] = {
      seriesName: "",
      data: [{ x: "label", y: 50 }],
    };
    emit(next);
  };

  if (!series) {
    return (
      <p className="od-chart-data__unavailable" role="status">
        Chart series data must be a static map before it can be edited here.
      </p>
    );
  }

  const entries = Object.entries(series);
  return (
    <div className="od-chart-data" data-testid="chart-data-control">
      {entries.length === 0 && <p className="od-chart-data__empty">No chart series yet.</p>}
      {entries.map(([id, entry], index) => (
        <SeriesEditor
          canDelete={entries.length > 1}
          id={id}
          index={index}
          key={id}
          onDelete={deleteSeries}
          onError={onError}
          onUpdate={updateSeries}
          renderSeriesBinding={renderSeriesBinding}
          series={entry}
        />
      ))}
      <Button kind="tertiary" onClick={addSeries} size="sm" startIcon="add-line" type="button">
        Add series
      </Button>
    </div>
  );
}
