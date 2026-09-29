import React, { useEffect, useRef, useState } from "react";
import { Status, Wrapper } from "@googlemaps/react-wrapper";
import type { JsonValue } from "../../../document/types";
import { mapCenter } from "./mapEmbedModel";

interface LocationSearchControlProps {
  value: unknown;
  onChange: (value: JsonValue) => void;
  onError: (message: string | null) => void;
}

/** Appsmith LocationSearchControl's Places SearchBox and clear-location update. */
function MapScriptWrapper({ value, onChange, onError }: LocationSearchControlProps) {
  const input = useRef<HTMLInputElement>(null);
  const location = mapCenter(value);
  const [title, setTitle] = useState(location?.title ?? "");

  useEffect(() => setTitle(location?.title ?? ""), [location?.title]);
  useEffect(() => {
    if (!input.current || !window.google?.maps?.places) return;
    const searchBox = new window.google.maps.places.SearchBox(input.current);
    const listener = searchBox.addListener("places_changed", () => {
      const place = searchBox.getPlaces()?.[0];
      const coordinates = place?.geometry?.location;
      if (!coordinates) return;
      onError(null);
      onChange({ lat: coordinates.lat(), long: coordinates.lng(),
        title: place.formatted_address ?? "" });
    });
    return () => listener.remove();
  }, [onChange, onError]);

  return <div data-standalone-searchbox="">
    <input aria-label="Initial location" onChange={(event) => {
      const next = event.target.value;
      setTitle(next);
      if (next === "") {
        onError(null);
        onChange({ lat: -34.397, long: 150.644, title: "" });
      }
    }} placeholder="Enter location" ref={input} tabIndex={-1} type="text" value={title} />
  </div>;
}

export function LocationSearchControl(props: LocationSearchControlProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return <input aria-label="Initial location" disabled
    placeholder="Google Maps API key required" type="text"
    value={mapCenter(props.value)?.title ?? ""} />;
  return <Wrapper apiKey={apiKey} libraries={["geometry", "drawing", "places"]}
    render={(status) => status === Status.LOADING ? <span>Loading...</span> :
      status === Status.FAILURE ? <span>Error in the component</span> :
        <span>Component loaded....</span>}>
    <MapScriptWrapper {...props} />
  </Wrapper>;
}
