import {
  buildOsmMapThumbnail,
  MAP_THUMB_HEIGHT,
  MAP_THUMB_WIDTH,
} from "../lib/osmStaticMap";

interface IncidentMapThumbnailProps {
  lat: number;
  lng: number;
}

/** Non-interactive OSM static map — lazy tile imgs only, no map JS libraries. */
export function IncidentMapThumbnail({ lat, lng }: IncidentMapThumbnailProps) {
  const map = buildOsmMapThumbnail(lat, lng);

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-md border border-line"
      style={{ width: MAP_THUMB_WIDTH, height: MAP_THUMB_HEIGHT }}
    >
      <div
        className="absolute grid grid-cols-2 grid-rows-2 will-change-transform"
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
            className="block h-full w-full"
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
