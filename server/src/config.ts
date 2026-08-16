import "dotenv/config";

function resolveClientOrigin(): string {
  if (process.env.CLIENT_ORIGIN) return process.env.CLIENT_ORIGIN;
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  return "http://localhost:5173";
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  clientOrigin: resolveClientOrigin(),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 30_000),
  incidentTtlMs: Number(process.env.INCIDENT_TTL_MS ?? 3 * 60 * 60 * 1000),
  radioHlsUrl: process.env.RADIO_HLS_URL ?? "",
  progressierApiKey: process.env.PROGRESSIER_API_KEY ?? "",
  pushIconUrl: process.env.PUSH_ICON_URL ?? "",
  rapidApiKey: process.env.RAPIDAPI_KEY ?? "",
  apifyApiToken: process.env.APIFY_API_TOKEN ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "",
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "",
  residentialProxyUrl: process.env.RESIDENTIAL_PROXY_URL ?? "",
  londonLat: Number(process.env.LONDON_LAT ?? 42.9837),
  londonLng: Number(process.env.LONDON_LNG ?? -81.2497),
  pollRadiusKm: Number(process.env.POLL_RADIUS_KM ?? 20),
  logLevel: (process.env.LOG_LEVEL ?? "info") as "debug" | "info" | "warn" | "error",
} as const;
