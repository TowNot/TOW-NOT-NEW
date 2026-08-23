import type { IncidentSource } from "../types";

/** Standard OSM raster tiles — no API key, widely mirrored. */
const OSM_TILE_BASE = "https://tile.openstreetmap.org";
const TILE_SIZE = 256;
const GRID_TILES = 2;

export const MAP_THUMB_WIDTH = 300;
export const MAP_THUMB_HEIGHT = 150;

export interface OsmMapTile {
  src: string;
}

export interface OsmMapThumbnailLayout {
  tiles: OsmMapTile[];
  gridPixelSize: number;
  offsetLeft: number;
  offsetTop: number;
}

function latLngToWorldPixel(
  lat: number,
  lng: number,
  zoom: number,
): { worldX: number; worldY: number } {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** zoom;
  return {
    worldX: ((lng + 180) / 360) * n * TILE_SIZE,
    worldY:
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      n *
      TILE_SIZE,
  };
}

/**
 * 2×2 OSM tile grid centered on coordinates, scaled to cover 300×150 with no
 * empty margins. Keeps lat/lng under the UI center pin.
 */
export function buildOsmMapThumbnail(
  lat: number,
  lng: number,
  width = MAP_THUMB_WIDTH,
  height = MAP_THUMB_HEIGHT,
  zoom = 15,
): OsmMapThumbnailLayout {
  const { worldX, worldY } = latLngToWorldPixel(lat, lng, zoom);
  const gridSize = TILE_SIZE * GRID_TILES;
  const startTileX = Math.floor((worldX - gridSize / 2) / TILE_SIZE);
  const startTileY = Math.floor((worldY - gridSize / 2) / TILE_SIZE);
  const pointX = worldX - startTileX * TILE_SIZE;
  const pointY = worldY - startTileY * TILE_SIZE;

  const tiles: OsmMapTile[] = [];
  for (let row = 0; row < GRID_TILES; row++) {
    for (let col = 0; col < GRID_TILES; col++) {
      tiles.push({
        src: `${OSM_TILE_BASE}/${zoom}/${startTileX + col}/${startTileY + row}.png`,
      });
    }
  }

  const scale = Math.max(width / gridSize, height / gridSize);
  const gridPixelSize = gridSize * scale;

  return {
    tiles,
    gridPixelSize,
    offsetLeft: width / 2 - pointX * scale,
    offsetTop: height / 2 - pointY * scale,
  };
}

export function showTrafficMapThumbnail(source: IncidentSource): boolean {
  return source === "waze" || source === "google_maps";
}
