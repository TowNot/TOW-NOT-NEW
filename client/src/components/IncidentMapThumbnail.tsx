import { useMemo } from "react";
import {
  buildGoogleStaticMapUrl,
  resolveGoogleMapsApiKey,
} from "../lib/googleMapsStatic";

interface IncidentMapThumbnailProps {
  lat: number;
  lng: number;
  /** Optional Google Maps zoom from the incident; clamped for card previews. */
  zoom?: number | null;
}

/**
 * Incident card map preview — Google Static Maps only.
 * Legacy OSM tile collages and scraper map images are not used.
 */
export function IncidentMapThumbnail({ lat, lng, zoom }: IncidentMapThumbnailProps) {
  const apiKey = useMemo(() => resolveGoogleMapsApiKey(), []);
  const googleSrc = useMemo(
    () => (apiKey ? buildGoogleStaticMapUrl(lat, lng, apiKey, { zoom }) : null),
    [apiKey, lat, lng, zoom],
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
