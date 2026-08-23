import {
  buildOsmStaticMapUrl,
  MAP_THUMB_HEIGHT,
  MAP_THUMB_WIDTH,
} from "../lib/osmStaticMap";

interface IncidentMapThumbnailProps {
  lat: number;
  lng: number;
}

/** Non-interactive OSM static map — lazy img only, no map JS libraries. */
export function IncidentMapThumbnail({ lat, lng }: IncidentMapThumbnailProps) {
  const src = buildOsmStaticMapUrl(lat, lng);

  return (
    <div
      className="relative h-[150px] w-full max-w-[300px] shrink-0 overflow-hidden rounded-md border border-line bg-gray-100"
      style={{ aspectRatio: `${MAP_THUMB_WIDTH} / ${MAP_THUMB_HEIGHT}` }}
    >
      <img
        src={src}
        alt=""
        width={MAP_THUMB_WIDTH}
        height={MAP_THUMB_HEIGHT}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-600 shadow-sm"
        aria-hidden="true"
      />
    </div>
  );
}
