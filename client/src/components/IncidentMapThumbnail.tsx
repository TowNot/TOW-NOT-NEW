import { useMemo, useState } from "react";
import {
  buildGoogleStaticMapUrl,
  resolveGoogleMapsApiKey,
} from "../lib/googleMapsStatic";
import {
  buildOsmMapThumbnail,
  MAP_THUMB_HEIGHT,
  MAP_THUMB_WIDTH,
} from "../lib/osmStaticMap";

interface IncidentMapThumbnailProps {
  lat: number;
  lng: number;
}

/**
 * Incident card map: Google Static Maps when a key is available (one lightweight
 * img, lazy-loaded). Falls back to the existing OSM tile collage on missing key
 * or load error.
 */
export function IncidentMapThumbnail({ lat, lng }: IncidentMapThumbnailProps) {
  const apiKey = useMemo(() => resolveGoogleMapsApiKey(), []);
  const googleSrc = useMemo(
    () => (apiKey ? buildGoogleStaticMapUrl(lat, lng, apiKey) : null),
    [apiKey, lat, lng],
  );
  const [useOsmFallback, setUseOsmFallback] = useState(!googleSrc);

  if (!useOsmFallback && googleSrc) {
    return (
      <div
        className="relative aspect-video w-[300px] max-w-full shrink-0 overflow-hidden rounded-md border border-line bg-ink"
        style={{ width: MAP_THUMB_WIDTH, height: MAP_THUMB_HEIGHT }}
      >
        <img
          src={googleSrc}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full object-cover"
          onError={() => setUseOsmFallback(true)}
        />
      </div>
    );
  }

  return <OsmMapThumbnailFallback lat={lat} lng={lng} />;
}

function OsmMapThumbnailFallback({ lat, lng }: IncidentMapThumbnailProps) {
  const map = buildOsmMapThumbnail(lat, lng);

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-md border border-line bg-ink"
      style={{ width: MAP_THUMB_WIDTH, height: MAP_THUMB_HEIGHT }}
    >
      <div
        className="absolute grid grid-cols-2 grid-rows-2"
        style={{
          width: map.gridPixelSize,
          height: map.gridPixelSize,
          left: map.offsetLeft,
          top: map.offsetTop,
        }}
      >
        {map.tiles.map((tile) => (
          <img
            key={tile.src}
            src={tile.src}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className="block h-full w-full object-cover"
          />
        ))}
      </div>
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-600 shadow-sm"
        aria-hidden="true"
      />
    </div>
  );
}
