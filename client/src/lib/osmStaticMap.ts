import type { IncidentSource } from "../types";

/** OpenStreetMap.de static map — free, no API key, img-friendly. */
const OSM_STATIC_MAP_ENDPOINT = "https://staticmap.openstreetmap.de/staticmap.php";

export const MAP_THUMB_WIDTH = 300;
export const MAP_THUMB_HEIGHT = 150;

export function buildOsmStaticMapUrl(
  lat: number,
  lng: number,
  width = MAP_THUMB_WIDTH,
  height = MAP_THUMB_HEIGHT,
  zoom = 15,
): string {
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: String(zoom),
    size: `${width}x${height}`,
    maptype: "mapnik",
    markers: `${lat},${lng},red-pushpin`,
  });
  return `${OSM_STATIC_MAP_ENDPOINT}?${params.toString()}`;
}

export function showTrafficMapThumbnail(source: IncidentSource): boolean {
  return source === "waze" || source === "google_maps";
}
