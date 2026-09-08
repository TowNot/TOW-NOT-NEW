import { fireDispatchDisplayLabel } from "./fireDispatchLabel";

/** Desk / push label for OpenWebNinja-sourced Google Maps incidents. */
export function formatOpenWebNinjaGoogleMapsLabel(
  _zoom?: number | null,
  _rawType?: string | null,
): string {
  return "Google Maps";
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
