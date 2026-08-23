import type { IncidentSource } from "../types";

/** Standard OSM raster tiles — no API key, widely mirrored. */
const OSM_TILE_BASE = "https://tile.openstreetmap.org";
const TILE_SIZE = 256;

export const MAP_THUMB_WIDTH = 300;
export const MAP_THUMB_HEIGHT = 150;

export interface OsmMapThumbnailLayout {
  src: string;
  imgSize: number;
  offsetLeft: number;
  offsetTop: number;
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
 * Build a single-tile OSM thumbnail layout: one 256px tile scaled and offset
 * so incident coordinates sit under the center pin (300×150 viewport).
 */
export function buildOsmMapThumbnail(
  lat: number,
  lng: number,
  width = MAP_THUMB_WIDTH,
  height = MAP_THUMB_HEIGHT,
  zoom = 15,
): OsmMapThumbnailLayout {
  const { tileX, tileY, pixelX, pixelY } = latLngToTilePixel(lat, lng, zoom);
  const src = `${OSM_TILE_BASE}/${zoom}/${tileX}/${tileY}.png`;
  const scale = Math.max(width / TILE_SIZE, height / TILE_SIZE);
  const imgSize = TILE_SIZE * scale;
  return {
    src,
    imgSize,
    offsetLeft: width / 2 - pixelX * scale,
    offsetTop: height / 2 - pixelY * scale,
  };
}

export function showTrafficMapThumbnail(source: IncidentSource): boolean {
  return source === "waze" || source === "google_maps";
}
