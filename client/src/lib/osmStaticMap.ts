import type { IncidentSource } from "../types";

/** Standard OSM raster tiles — no API key, widely mirrored. */
const OSM_TILE_BASE = "https://tile.openstreetmap.org";
const TILE_SIZE = 256;

export const MAP_THUMB_WIDTH = 300;
export const MAP_THUMB_HEIGHT = 150;

export interface OsmMapThumbnailLayout {
  src: string;
  /** object-position percentages — pins lat/lng under the center marker. */
  objectPosition: string;
}

function latLngToTilePixel(
  lat: number,
  lng: number,
  zoom: number,
): { tileX: number; tileY: number; pixelX: number; pixelY: number } {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** zoom;
  const x = ((lng + 180) / 360) * n;
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const tileX = Math.floor(x);
  const tileY = Math.floor(y);
  return {
    tileX,
    tileY,
    pixelX: (x - tileX) * TILE_SIZE,
    pixelY: (y - tileY) * TILE_SIZE,
  };
}

/**
 * Single OSM tile URL + object-position so coordinates sit under the center
 * pin while object-fit: cover fills the 300×150 viewport (no grey gaps).
 */
export function buildOsmMapThumbnail(
  lat: number,
  lng: number,
  _width = MAP_THUMB_WIDTH,
  _height = MAP_THUMB_HEIGHT,
  zoom = 15,
): OsmMapThumbnailLayout {
  const { tileX, tileY, pixelX, pixelY } = latLngToTilePixel(lat, lng, zoom);
  const src = `${OSM_TILE_BASE}/${zoom}/${tileX}/${tileY}.png`;
  const objectPosition = `${((pixelX / TILE_SIZE) * 100).toFixed(2)}% ${((pixelY / TILE_SIZE) * 100).toFixed(2)}%`;
  return { src, objectPosition };
}

export function showTrafficMapThumbnail(source: IncidentSource): boolean {
  return source === "waze" || source === "google_maps";
}
