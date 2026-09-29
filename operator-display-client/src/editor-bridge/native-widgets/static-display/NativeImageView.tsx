import React, { useEffect, useState } from "react";
import type { CSSProperties } from "react";

export interface NativeImageViewProps {
  widgetName: string;
  image?: string;
  defaultImage?: string;
  objectFit?: string;
  borderRadius?: string;
  boxShadow?: string;
  maxZoomLevel?: number;
  enableRotation?: boolean;
  enableDownload?: boolean;
}

/** Only image schemes accepted by the Appsmith property can enter the DOM. */
export function safeImageSource(candidate: unknown): string | undefined {
  if (typeof candidate !== "string") return undefined;
  const source = candidate.trim();
  if (!source || /\{\{[\s\S]*?\}\}/.test(source) || /[\u0000-\u001f]/.test(source)) {
    return undefined;
  }

  if (/^data:image\//i.test(source)) return source;
  if (/^[a-z][a-z\d+.-]*:/i.test(source) || /^[\\/]{2}/.test(source)) {
    if (!/^https?:\/\//i.test(source)) return undefined;
  }

  try {
    const base = new URL(typeof window === "undefined"
      ? "https://read-only-image.invalid/base/"
      : window.location.href);
    const parsed = new URL(source, base);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    if (!/^https?:\/\//i.test(source) && parsed.origin !== base.origin) return undefined;
    // Images from a saved dashboard must not reintroduce Appsmith API calls.
    if (parsed.origin === base.origin && /^\/(?:api|v1|rts)(?:\/|$)/.test(parsed.pathname)) {
      return undefined;
    }

    return source;
  } catch {
    return undefined;
  }
}

export function NativeImageView({
  widgetName,
  image,
  defaultImage,
  objectFit = "cover",
  borderRadius = "0",
  boxShadow = "none",
  maxZoomLevel = 1,
  enableRotation = false,
  enableDownload = false,
}: NativeImageViewProps): React.ReactElement {
  const primary = safeImageSource(image);
  const fallback = safeImageSource(defaultImage);
  const [failed, setFailed] = useState<readonly string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => { setFailed([]); setZoom(1); setRotation(0); }, [primary, fallback]);

  const source = [primary, fallback].find(
    (candidate): candidate is string => Boolean(candidate && !failed.includes(candidate)),
  );
  const fit: CSSProperties["objectFit"] = objectFit === "contain"
    ? "contain"
    : objectFit === "auto" ? "none" : "cover";
  const zoomLimit = Number.isFinite(maxZoomLevel) ? Math.max(1, maxZoomLevel) : 1;
  const canZoom = zoomLimit > 1;

  return (
    <div
      className="od-native-image"
      data-native-widget="image"
      data-image-source={source === primary ? "image" : source ? "default" : "unavailable"}
      style={{ borderRadius, boxShadow }}
    >
      {source ? (
        <img
          alt={widgetName}
          data-testid="native-image"
          onError={() => setFailed((previous) => [...previous, source])}
          referrerPolicy="no-referrer"
          src={source}
          style={{ objectFit: fit, transform: `scale(${zoom}) rotate(${rotation}deg)` }}
        />
      ) : (
        <div className="od-native-image__error" role="status">Image unavailable</div>
      )}
      {source && (canZoom || enableRotation || enableDownload) && (
        <div className="od-native-image__tools" onClick={(event) => event.stopPropagation()}>
          {canZoom && <>
            <button
              aria-label="Zoom out image"
              disabled={zoom <= 1}
              onClick={() => setZoom((current) => Math.max(1, current / 2))}
              type="button"
            >−</button>
            <span aria-label="Image zoom">{zoom}×</span>
            <button
              aria-label="Zoom in image"
              disabled={zoom >= zoomLimit}
              onClick={() => setZoom((current) => Math.min(zoomLimit, current * 2))}
              type="button"
            >+</button>
          </>}
          {enableRotation && <button
            aria-label="Rotate image"
            onClick={() => setRotation((current) => (current + 90) % 360)}
            type="button"
          >↻</button>}
          {enableDownload && <a aria-label="Download image" download href={source} onClick={(event) => event.stopPropagation()}>↓</a>}
        </div>
      )}
    </div>
  );
}
