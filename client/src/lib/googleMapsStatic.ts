/**
 * Google Static Maps URLs for incident card previews.
 * Vite only embeds `VITE_*` at build time; Railway often sets
 * `GOOGLE_MAPS_API_KEY` — Express injects that into `window.__GOOGLE_MAPS_API_KEY__`.
 */

import type { IncidentSource } from "../types";

/** Request size for Static Maps (2:1). CSS scales the img responsively. */
export const MAP_THUMB_WIDTH = 600;
export const MAP_THUMB_HEIGHT = 300;

const DEFAULT_PREVIEW_ZOOM = 14;
const MIN_PREVIEW_ZOOM = 12;
const MAX_PREVIEW_ZOOM = 16;

export function resolveGoogleMapsApiKey(): string {
  const fromVite =
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ||
    import.meta.env.VITE_NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    "";
  if (fromVite) return fromVite;

  if (typeof window !== "undefined") {
    const fromWindow = window.__GOOGLE_MAPS_API_KEY__?.trim() ?? "";
    if (fromWindow) return fromWindow;
  }

  return "";
}

export function showTrafficMapThumbnail(source: IncidentSource): boolean {
  return source === "waze" || source === "google_maps";
}

function clampPreviewZoom(zoom?: number | null): number {
  if (typeof zoom !== "number" || !Number.isFinite(zoom)) return DEFAULT_PREVIEW_ZOOM;
  return Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, Math.round(zoom)));
}

/**
 * Single Static Maps request — always the preview source of truth for cards.
 * No OSM tiles, no scraper-provided map images.
 */
export function buildGoogleStaticMapUrl(
  lat: number,
  lng: number,
  apiKey: string,
  options?: {
    width?: number;
    height?: number;
    zoom?: number | null;
  },
): string {
  const width = options?.width ?? MAP_THUMB_WIDTH;
  const height = options?.height ?? MAP_THUMB_HEIGHT;
  const zoom = clampPreviewZoom(options?.zoom);
  const center = `${lat},${lng}`;
  const size = `${width}x${height}`;
  const marker = `color:red|${center}`;
  const params = new URLSearchParams({
    center,
    zoom: String(zoom),
    size,
    maptype: "roadmap",
    markers: marker,
    key: apiKey,
  });
  // Intentionally omit `scale` (defaults to 1) for predictable card sizing.
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}
