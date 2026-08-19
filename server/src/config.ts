import "dotenv/config";

const PRODUCTION_PUBLIC_URL = "https://tow-notserver-production.up.railway.app";

function resolveClientOrigin(): string {
  if (process.env.CLIENT_ORIGIN) return process.env.CLIENT_ORIGIN;
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  return "http://localhost:5173";
}

/** Absolute origin for push deep-links — never localhost on mobile devices. */
function resolvePublicUrl(): string {
  const explicit = process.env.PUBLIC_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  const client = process.env.CLIENT_ORIGIN?.trim();
  if (client && !/localhost|127\.0\.0\.1/i.test(client)) {
    return client.replace(/\/$/, "");
  }
  return PRODUCTION_PUBLIC_URL;
}

const progressierAppId = process.env.PROGRESSIER_APP_ID ?? "Bv9Rb1Vm5PkATyh6w0wG";

/**
 * Progressier issues a per-app push endpoint (dashboard → API Docs → Send
 * notifications programmatically). Any other route answers 403 "Method not
 * allowed", so PROGRESSIER_PUSH_URL takes precedence over the derived default.
 */
function resolveProgressierPushUrl(): string {
  const configured = process.env.PROGRESSIER_PUSH_URL?.trim();
  if (configured) return configured;
  return `https://progressier.app/${progressierAppId}/send`;
}

function resolvePort(): number {
  const raw = Number(process.env.PORT);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 8080;
}

export const config = {
  port: resolvePort(),
  host: process.env.HOST?.trim() || "0.0.0.0",
  clientOrigin: resolveClientOrigin(),
  publicUrl: resolvePublicUrl(),
  // BlocksInside (api.wazeapi.com) Waze poll. 10s cadence; ignore a leftover
  // 60s RapidAPI quota env so Railway deploys at 10s without a dashboard edit.
  // inFlight skip plus an 8s abort keep hung calls from stacking.
  pollIntervalMs: (() => {
    const raw = Number(process.env.POLL_INTERVAL_MS ?? 10_000);
    if (!Number.isFinite(raw) || raw <= 0 || raw >= 60_000) return 10_000;
    return raw;
  })(),
  incidentTtlMs: Number(process.env.INCIDENT_TTL_MS ?? 3 * 60 * 60 * 1000),
  radioHlsUrl: process.env.RADIO_HLS_URL ?? "",
  progressierApiKey: process.env.PROGRESSIER_API_KEY ?? "",
  progressierAppId,
  progressierPushUrl: resolveProgressierPushUrl(),
  // AlertNav 512×512 from the Progressier manifest; override with PUSH_ICON_URL.
  pushIconUrl:
    process.env.PUSH_ICON_URL?.trim() ||
    "https://oouxkyuexvzylckxeeks.supabase.co/storage/v1/object/public/pgsstoragebucket/Box8ybh6oF1k8MfNQjxX/YUEjbFcDfJDaWOI.png",
  rapidApiKey: process.env.RAPIDAPI_KEY ?? "",
  wazeApiKey:
    process.env.WAZEAPI_KEY?.trim() ||
    "wz_live_XZDbg-TNpEJGfpAVcOfkeeV6ed0AtCp-",
  wazeApiCountry: process.env.WAZEAPI_COUNTRY?.trim() || "usa",
  wazeBottomLeft: process.env.WAZE_BOTTOM_LEFT?.trim() || "42.8949, -81.3683",
  wazeTopRight: process.env.WAZE_TOP_RIGHT?.trim() || "43.0749, -81.1223",
  apifyApiToken: process.env.APIFY_API_TOKEN ?? "",
  deepgramApiKey: process.env.DEEPGRAM_API_KEY ?? "",
  residentialProxyUrl: process.env.RESIDENTIAL_PROXY_URL ?? "",
  // Downtown London, ON (same pin the fire-dispatch geocoder uses). A 15 km
  // radius covers Western campus, the 401, and Hyde Park without overflowing
  // RapidAPI's ~200-alert cap the way a 20 km box did.
  londonLat: Number(process.env.LONDON_LAT ?? 42.9849),
  londonLng: Number(process.env.LONDON_LNG ?? -81.2453),
  pollRadiusKm: Number(process.env.POLL_RADIUS_KM ?? 15),
  logLevel: (process.env.LOG_LEVEL ?? "info") as "debug" | "info" | "warn" | "error",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID?.trim() || "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN?.trim() || "",
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER?.trim() || "+12494025882",
} as const;
