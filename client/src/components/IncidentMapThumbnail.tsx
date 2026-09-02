import { useMemo } from "react";
import {
  buildGoogleStaticMapUrl,
  resolveGoogleMapsApiKey,
} from "../lib/googleMapsStatic";

interface IncidentMapThumbnailProps {
  lat: number;
  lng: number;
}

/**
 * Incident card map preview — Google Static Maps only.
 * Uses a fixed card zoom; poller metadata (googleMapsZoom) is not used here.
 */
export function IncidentMapThumbnail({ lat, lng }: IncidentMapThumbnailProps) {
  const apiKey = useMemo(() => resolveGoogleMapsApiKey(), []);
  const googleSrc = useMemo(
    () => (apiKey ? buildGoogleStaticMapUrl(lat, lng, apiKey) : null),
    [apiKey, lat, lng],
  );

  if (!googleSrc) {
    return (
      <div
        className="incident-map-thumb relative aspect-[2/1] w-full shrink-0 overflow-hidden rounded-md border border-line bg-ink sm:max-w-[18.75rem]"
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="incident-map-thumb relative aspect-[2/1] w-full shrink-0 overflow-hidden rounded-md border border-line bg-ink sm:max-w-[18.75rem]">
      <img
        src={googleSrc}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}
