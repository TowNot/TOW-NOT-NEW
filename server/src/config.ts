import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 8080),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 30_000),
  incidentTtlMs: Number(process.env.INCIDENT_TTL_MS ?? 3 * 60 * 60 * 1000),
  radioHlsUrl: process.env.RADIO_HLS_URL ?? "",
  progressierApiKey: process.env.PROGRESSIER_API_KEY ?? "",
  logLevel: (process.env.LOG_LEVEL ?? "info") as "debug" | "info" | "warn" | "error",
} as const;
