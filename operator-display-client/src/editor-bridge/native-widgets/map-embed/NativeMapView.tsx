import React, { useEffect, useRef, useState } from "react";
import type { AppsmithWidgetDsl } from "../../../document";
import MapComponent from "./google-map";
import { DEFAULT_MAP_CENTER, mapCenter, mapMarkers } from "./mapEmbedModel";
import type { MapCenter, MapMarker, MapMeta } from "./mapEmbedModel";

export interface NativeMapViewProps {
  widget: AppsmithWidgetDsl;
  /** Appsmith injects the instance's browser Google Maps key, rather than storing it in the widget DSL. */
  apiKey?: string;
  meta?: MapMeta;
  onMetaChange?: (key: keyof MapMeta, value: MapMeta[keyof MapMeta]) => void;
  onMarkerClick?: (marker: MapMarker) => void;
  onCreateMarker?: (marker: MapMarker) => void;
}

/** Appsmith MapWidget defaults/meta forwarding around its Google Maps component. */
export function NativeMapView({ widget, apiKey, meta, onMetaChange, onMarkerClick, onCreateMarker }: NativeMapViewProps) {
  const [localMeta, setLocalMeta] = useState<MapMeta>({});
  const authoredCenter = mapCenter(widget.mapCenter) ?? DEFAULT_MAP_CENTER;
  const authorCenterKey = `${authoredCenter.lat}:${authoredCenter.long}`;
  const previousAuthorCenter = useRef(authorCenterKey);
  const effectiveMeta = { ...localMeta, ...meta };
  const center = effectiveMeta.center ?? authoredCenter;
  const markers = effectiveMeta.markers ?? mapMarkers(widget.defaultMarkers);
  const selectedMarker = effectiveMeta.selectedMarker;
  const key = typeof apiKey === "string" ? apiKey.trim() : "";

  const updateMeta = (property: keyof MapMeta, value: MapMeta[keyof MapMeta]) => {
    setLocalMeta((current) => ({ ...current, [property]: value }));
    onMetaChange?.(property, value);
  };

  useEffect(() => {
    if (previousAuthorCenter.current === authorCenterKey) return;
    previousAuthorCenter.current = authorCenterKey;
    updateMeta("center", authoredCenter);
    updateMeta("selectedMarker", undefined);
  }, [authorCenterKey]);

  if (!key) return <div data-native-widget="map" data-map-state="missing-key" style={{
    backgroundColor: "white", height: "100%", width: "100%", overflow: "auto", textAlign: "center",
    display: "flex", flexDirection: "column", border: "1px solid #e0dede",
    borderRadius: typeof widget.borderRadius === "string" ? widget.borderRadius : undefined,
    boxShadow: typeof widget.boxShadow === "string" ? widget.boxShadow : undefined,
  }}>
    <h1 style={{ marginTop: "15%", marginBottom: "10%", color: "#7c7c7c" }}>Map Widget disabled</h1>
    <p style={{ color: "#0a0b0e" }}>Map widget requires a Google Maps API key</p>
    <p style={{ color: "#0a0b0e" }}>See our <a
      href="https://docs.appsmith.com/getting-started/setup/instance-configuration/google-maps"
      rel="noopener noreferrer" target="_blank">documentation</a> to configure API keys</p>
  </div>;

  return <div data-native-widget="map" data-map-state="ready" style={{ height: "100%", width: "100%" }}>
    <MapComponent
      allowClustering={widget.allowClustering === true}
      allowZoom={widget.allowZoom !== false}
      apiKey={key}
      borderRadius={typeof widget.borderRadius === "string" ? widget.borderRadius : "0"}
      boxShadow={typeof widget.boxShadow === "string" ? widget.boxShadow : undefined}
      center={center}
      clickedMarkerCentered={widget.isClickedMarkerCentered !== false}
      enableCreateMarker={widget.enableCreateMarker === true}
      enableDrag={() => undefined}
      enableMapTypeControl={widget.enableMapTypeControl === true}
      enablePickLocation={widget.enablePickLocation !== false}
      enableSearch={widget.enableSearch !== false}
      isDisabled={widget.isDisabled === true}
      isVisible={widget.isVisible !== false}
      markers={markers}
      saveMarker={(lat, long) => {
        const created = mapCenter({ lat, long });
        if (!created) return;
        const marker = { ...created, title: "" };
        updateMeta("markers", [...markers, marker]);
        updateMeta("selectedMarker", marker);
        onCreateMarker?.(marker);
      }}
      selectMarker={(lat, long, title) => {
        const marker = mapCenter({ lat, long, title });
        if (!marker) return;
        updateMeta("selectedMarker", marker);
        onMarkerClick?.(marker);
      }}
      selectedMarker={selectedMarker}
      unselectMarker={() => updateMeta("selectedMarker", undefined)}
      updateCenter={(lat, long) => {
        const next: MapCenter | undefined = mapCenter({ lat, long });
        if (next) {
          updateMeta("center", next);
          updateMeta("selectedMarker", undefined);
        }
      }}
      updateMarker={(lat, long, index) => {
        const next = mapCenter({ lat, long });
        if (!next) return;
        updateMeta("markers", markers.map((marker, current) => current === index ? next : marker));
      }}
      widgetId={widget.widgetId}
      zoomLevel={typeof widget.zoomLevel === "number" && Number.isFinite(widget.zoomLevel) ? widget.zoomLevel : 50}
    />
  </div>;
}
