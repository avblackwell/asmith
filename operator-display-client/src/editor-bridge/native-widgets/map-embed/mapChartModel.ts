import {
  dataSetForAfrica,
  dataSetForAsia,
  dataSetForEurope,
  dataSetForNorthAmerica,
  dataSetForOceania,
  dataSetForSouthAmerica,
  dataSetForUSA,
  dataSetForWorld,
  dataSetForWorldWithAntarctica,
  MapTypes,
} from "./mapChartConstants";
import type { MapColorObject } from "./mapChartConstants";

export type MapRange = Pick<MapColorObject, "minValue" | "maxValue" | "code"> &
  Partial<Pick<MapColorObject, "displayValue" | "alpha">>;

export const MAP_TYPES = Object.values(MapTypes);

export const MAP_DATA_SETS: Record<MapTypes, Array<{ id: string; value: string }>> = {
  [MapTypes.WORLD]: dataSetForWorld,
  [MapTypes.WORLD_WITH_ANTARCTICA]: dataSetForWorldWithAntarctica,
  [MapTypes.EUROPE]: dataSetForEurope,
  [MapTypes.NORTH_AMERICA]: dataSetForNorthAmerica,
  [MapTypes.SOURTH_AMERICA]: dataSetForSouthAmerica,
  [MapTypes.ASIA]: dataSetForAsia,
  [MapTypes.OCEANIA]: dataSetForOceania,
  [MapTypes.AFRICA]: dataSetForAfrica,
  [MapTypes.USA]: dataSetForUSA,
};

export const DEFAULT_MAP_COLOR_RANGE: MapRange[] = [
  { minValue: 0.5, maxValue: 1.0, code: "#FFD74D" },
  { minValue: 1.0, maxValue: 2.0, code: "#FB8C00" },
  { minValue: 2.0, maxValue: 3.0, code: "#E65100" },
];

export function isMapType(value: unknown): value is MapTypes {
  return typeof value === "string" && MAP_TYPES.some((type) => type === value);
}

export function mapChartData(value: unknown, mapType: MapTypes): Array<{ id: string; value: number }> {
  const source = Array.isArray(value) ? value : MAP_DATA_SETS[mapType];
  return source.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const candidate = entry as Record<string, unknown>;
    const id = typeof candidate.id === "string" ? candidate.id : "";
    const number = Number(candidate.value);
    return id && Number.isFinite(number) ? [{ id, value: number }] : [];
  });
}

export function mapChartColorRange(value: unknown): MapRange[] {
  const source = Array.isArray(value) ? value : DEFAULT_MAP_COLOR_RANGE;
  return source.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const candidate = entry as Record<string, unknown>;
    const minValue = Number(candidate.minValue);
    const maxValue = Number(candidate.maxValue);
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || typeof candidate.code !== "string") return [];
    if (!/^#[a-f\d]{6}$/i.test(candidate.code)) return [];
    const alpha = candidate.alpha === undefined ? 100 : Number(candidate.alpha);
    return [{
      minValue,
      maxValue,
      code: candidate.code,
      ...(typeof candidate.displayValue === "string" ? { displayValue: candidate.displayValue } : {}),
      ...(candidate.alpha !== undefined ? { alpha: Number.isFinite(alpha) ? Math.max(0, Math.min(100, alpha)) : 100 } : {}),
    }];
  });
}

/** Appsmith's mapType property update hook resets data to that map's sample dataset. */
export function mapTypeUpdates(mapType: MapTypes) {
  return [
    { propertyPath: "mapType", propertyValue: mapType },
    { propertyPath: "data", propertyValue: MAP_DATA_SETS[mapType].map((entry) => ({ ...entry })) },
  ];
}

export function getMapChartDefaults() {
  return {
    rows: 32,
    columns: 24,
    widgetName: "MapChart",
    version: 1,
    mapType: MapTypes.WORLD,
    mapTitle: "Global Population",
    showLabels: true,
    data: MAP_DATA_SETS[MapTypes.WORLD].map((entry) => ({ ...entry })),
    colorRange: DEFAULT_MAP_COLOR_RANGE.map((entry) => ({ ...entry })),
    responsiveBehavior: "fill",
    flexVerticalAlignment: "start",
    minWidth: 450,
  };
}
