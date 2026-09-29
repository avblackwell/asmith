import { customAlphabet } from "nanoid";

export interface ChartPoint {
  x: string | number;
  y: number;
}

export interface ChartSeries {
  seriesName: string;
  data: ChartPoint[];
  color?: string;
}

export type ChartSeriesMap = Record<string, ChartSeries>;

const createId = customAlphabet("1234567890abcdefghijklmnopqrstuvwxyz", 10);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The local renderer consumes evaluated point arrays, not Appsmith code-editor text. */
export function parseChartPoints(input: string): ChartPoint[] {
  let candidate: unknown;
  try {
    candidate = JSON.parse(input);
  } catch {
    throw new Error("Series data must be valid JSON.");
  }
  if (!Array.isArray(candidate)) {
    throw new Error("Series data must be a JSON array of { x, y } points.");
  }
  return candidate.map((point, index) => {
    if (!isRecord(point) ||
      !(typeof point.x === "string" || (typeof point.x === "number" && Number.isFinite(point.x))) ||
      typeof point.y !== "number" || !Number.isFinite(point.y)) {
      throw new Error(`Point ${index + 1} needs an x label and a finite numeric y value.`);
    }
    return { x: point.x, y: point.y };
  });
}

/** Accept a static Appsmith chart map, including legacy JSON string series data. */
export function normalizeChartData(value: unknown): ChartSeriesMap | null {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) return null;
  const result = Object.create(null) as ChartSeriesMap;
  for (const [id, entry] of Object.entries(value)) {
    if (!isRecord(entry) || typeof entry.seriesName !== "string") return null;
    const rawData = typeof entry.data === "string"
      ? (() => {
        try { return JSON.parse(entry.data); } catch { return null; }
      })()
      : entry.data;
    if (!Array.isArray(rawData)) return null;
    let data: ChartPoint[];
    try {
      data = parseChartPoints(JSON.stringify(rawData));
    } catch {
      return null;
    }
    const series: ChartSeries = { seriesName: entry.seriesName, data };
    if (typeof entry.color === "string") series.color = entry.color;
    result[id] = series;
  }
  return result;
}

export function nextSeriesId(series: ChartSeriesMap): string {
  let id = createId();
  while (Object.hasOwn(series, id)) id = createId();
  return id;
}

/** Build an own-property map so keys from imported Appsmith data stay intact. */
export function copySeriesMap(series: ChartSeriesMap): ChartSeriesMap {
  return Object.fromEntries(Object.entries(series).map(([id, entry]) => [
    id,
    {
      seriesName: entry.seriesName,
      data: entry.data.map((point) => ({ x: point.x, y: point.y })),
      ...(entry.color === undefined ? {} : { color: entry.color }),
    },
  ]));
}
