import { MAP_THUMB_HEIGHT, MAP_THUMB_WIDTH } from "./osmStaticMap";

/**
 * Resolve Google Static Maps API key.
 * Vite only embeds `VITE_*` at build time; Railway often sets
 * `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` or `GOOGLE_MAPS_API_KEY` — Express injects
 * those into `window.__GOOGLE_MAPS_API_KEY__` at serve time (same pattern as Clerk).
 */
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

/**
 * Single Static Maps request — size matches the card thumb (no `scale` param)
 * so payloads stay small and load fast while scrolling.
 */
export function buildGoogleStaticMapUrl(
  lat: number,
  lng: number,
  apiKey: string,
  width = MAP_THUMB_WIDTH,
  height = MAP_THUMB_HEIGHT,
  zoom = 14,
): string {
  const center = `${lat},${lng}`;
  const size = `${width}x${height}`;
  const marker = `color:red|${center}`;
  const params = new URLSearchParams({
    center,
    zoom: String(zoom),
    size,
    markers: marker,
    key: apiKey,
  });
  // Intentionally omit `scale` (defaults to 1) for minimal bandwidth.
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}
