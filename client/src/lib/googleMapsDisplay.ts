import { fireDispatchDisplayLabel } from "./fireDispatchLabel";

/** Provider attribution for OpenWebNinja-sourced Google Maps incidents. */
export function formatOpenWebNinjaGoogleMapsLabel(
  zoom?: number | null,
  rawType?: string | null,
): string {
  const type = rawType?.trim();
  if (zoom != null && type) return `OpenWebNinja (Zoom ${zoom} - ${type}) · Google Maps`;
  if (zoom != null) return `OpenWebNinja (Zoom ${zoom}) · Google Maps`;
  if (type) return `OpenWebNinja (${type}) · Google Maps`;
  return "OpenWebNinja · Google Maps";
}

export function formatGoogleMapsProviderAttribution(
  provider?: string,
  googleMapsZoom?: number | null,
  rawType?: string | null,
): string | null {
  if (!provider) return null;
  if (provider === "openwebninja_google_maps") {
    return formatOpenWebNinjaGoogleMapsLabel(googleMapsZoom, rawType);
  }
  if (provider === "blocksinside") return "BlocksInside";
  if (/^[a-zA-Z]+_fire_dispatch/.test(provider)) {
    return fireDispatchDisplayLabel(provider);
  }
  const ems = provider.match(/^([a-zA-Z]+)_ems$/);
  if (ems) return `EMS · ${ems[1]}`;
  return provider;
}
