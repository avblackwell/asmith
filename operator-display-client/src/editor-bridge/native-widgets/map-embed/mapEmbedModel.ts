export interface MapMarker {
  lat: number;
  long: number;
  title?: string;
  description?: string;
  color?: string;
}

export interface MapCenter { lat: number; long: number; title?: string }

export interface MapMeta {
  center?: MapCenter;
  markers?: MapMarker[];
  selectedMarker?: MapMarker;
}

export const DEFAULT_MAP_CENTER: MapCenter = { lat: 40.7128, long: -74.006 };
export const DEFAULT_MAP_MARKER: MapMarker = { ...DEFAULT_MAP_CENTER, title: "New York" };

export function mapCenter(value: unknown): MapCenter | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.lat !== "number" || !Number.isFinite(candidate.lat) ||
    candidate.lat < -90 || candidate.lat > 90 || typeof candidate.long !== "number" ||
    !Number.isFinite(candidate.long) || candidate.long < -180 || candidate.long > 180) return undefined;
  return { lat: candidate.lat, long: candidate.long,
    ...(typeof candidate.title === "string" ? { title: candidate.title } : {}) };
}

export function mapMarkers(value: unknown): MapMarker[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const center = mapCenter(item);
    if (!center) return [];
    const candidate = item as Record<string, unknown>;
    return [{ ...center,
      ...(typeof candidate.description === "string" ? { description: candidate.description } : {}),
      ...(typeof candidate.color === "string" ? { color: candidate.color } : {}),
    }];
  });
}

export function getIframeDefaults() {
  return {
    source: "https://www.example.com",
    borderOpacity: 100,
    borderWidth: 1,
    rows: 32,
    columns: 24,
    widgetName: "Iframe",
    version: 1,
    animateLoading: true,
    isVisible: true,
    responsiveBehavior: "fill",
    flexVerticalAlignment: "start",
  };
}

export function getMapDefaults() {
  return {
    rows: 40,
    columns: 24,
    isDisabled: false,
    isVisible: true,
    widgetName: "Map",
    enableSearch: true,
    zoomLevel: 50,
    enablePickLocation: true,
    allowZoom: true,
    mapCenter: { ...DEFAULT_MAP_CENTER },
    defaultMarkers: [{ ...DEFAULT_MAP_MARKER }],
    isClickedMarkerCentered: true,
    version: 1,
    animateLoading: true,
    responsiveBehavior: "fill",
    minWidth: 450,
    flexVerticalAlignment: "start",
    enableMapTypeControl: false,
  };
}
