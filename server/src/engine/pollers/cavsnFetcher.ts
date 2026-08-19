import { config } from "../../config";
import { logger } from "../../logger";

/** RapidAPI listing: Waze API | Waze Scraper (CAVSN). */
export const CAVSN_RAPIDAPI_HOST = "waze-api-waze-scraper.p.rapidapi.com";
/** Primary alerts endpoint (not BlocksInside — separate host, path, and params). */
export const CAVSN_ALERTS_PATH = "/waze/alerts-and-jams";
/** Lightweight health probe — answers quickly when the subscription is active. */
export const CAVSN_HEALTH_PATH = "/getHealth";

const CAVSN_TIMEOUT_MS = 12_000;
const CAVSN_HEALTH_TIMEOUT_MS = 5_000;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cavsnHeaders(): Record<string, string> {
  const apiKey = config.rapidApiKey.trim();
  if (!apiKey) throw new Error("RAPIDAPI_KEY is not configured");
  return {
    Accept: "application/json",
    "x-rapidapi-host": CAVSN_RAPIDAPI_HOST,
    "x-rapidapi-key": apiKey,
  };
}

/** CAVSN payload shapes: { data: { alerts } }, { data: [...] }, or { alerts }. */
export function extractCavsnAlertRows(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    return parsed.filter(isPlainRecord);
  }
  if (!isPlainRecord(parsed)) return [];

  const data = parsed["data"];
  if (Array.isArray(data)) return data.filter(isPlainRecord);
  if (isPlainRecord(data)) {
    if (Array.isArray(data["alerts"])) return data["alerts"].filter(isPlainRecord);
    const nested = data["alerts_and_jams"];
    if (isPlainRecord(nested) && Array.isArray(nested["alerts"])) {
      return nested["alerts"].filter(isPlainRecord);
    }
  }
  if (Array.isArray(parsed["alerts"])) return parsed["alerts"].filter(isPlainRecord);
  return [];
}

function normalizeCoordPair(raw: string): string {
  const [lat, lng] = raw.split(",").map((part) => part.trim());
  if (!lat || !lng) throw new Error(`Invalid coordinate pair: ${raw}`);
  return `${lat},${lng}`;
}

function logCavsnFailure(
  label: string,
  url: string,
  started: number,
  detail: string,
): void {
  console.error(`[cavsn] ${label} url=${url} latencyMs=${Date.now() - started} ${detail}`);
}

/**
 * Independent CAVSN fetch — never shares BlocksInside's api.wazeapi.com URL,
 * X-API-Key header, or hyphenated query params.
 */
export async function fetchCavsnRaw(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<{ rawAlerts: Record<string, unknown>[]; rawBody: string; parsed: unknown }> {
  const radius = String(Math.min(Math.max(radiusKm, 1), 12));
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    radius,
    radius_units: "KM",
    max_alerts: "200",
    max_jams: "0",
  });
  const url = `https://${CAVSN_RAPIDAPI_HOST}${CAVSN_ALERTS_PATH}?${params.toString()}`;
  const started = Date.now();

  try {
    const res = await fetch(url, {
      headers: cavsnHeaders(),
      signal: AbortSignal.timeout(CAVSN_TIMEOUT_MS),
    });
    const rawBody = await res.text();

    if (!res.ok) {
      logCavsnFailure(
        `RapidAPI HTTP ${res.status} ${res.statusText}`,
        url,
        started,
        `body=${rawBody.slice(0, 800)}`,
      );
      throw new Error(`cavsn responded with status ${res.status}: ${rawBody.slice(0, 200)}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody) as unknown;
    } catch {
      logCavsnFailure("malformed JSON", url, started, `sample=${rawBody.slice(0, 800)}`);
      throw new Error("cavsn returned malformed JSON");
    }

    const rawAlerts = extractCavsnAlertRows(parsed);
    logger.debug(
      `[CAVSN] HTTP ${res.status} alerts=${rawAlerts.length} bytes=${rawBody.length} latencyMs=${Date.now() - started}`,
    );
    return { rawAlerts, rawBody, parsed };
  } catch (err) {
    if (
      !(err instanceof Error) ||
      !/responded with status|malformed JSON/.test(err.message)
    ) {
      logCavsnFailure(
        "network error",
        url,
        started,
        `error=${err instanceof Error ? err.message : String(err)}`,
      );
    }
    throw err;
  }
}

/** One-shot subscription probe logged at startup — fails fast, never blocks polling. */
export async function probeCavsnHealth(): Promise<void> {
  if (!config.rapidApiKey.trim()) return;
  const url = `https://${CAVSN_RAPIDAPI_HOST}${CAVSN_HEALTH_PATH}`;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: cavsnHeaders(),
      signal: AbortSignal.timeout(CAVSN_HEALTH_TIMEOUT_MS),
    });
    const body = await res.text();
    if (res.ok) {
      logger.info(`[CAVSN] getHealth OK latencyMs=${Date.now() - started} body=${body.slice(0, 200)}`);
      return;
    }
    console.error(
      `[cavsn] getHealth HTTP ${res.status} ${res.statusText} latencyMs=${Date.now() - started} body=${body.slice(0, 500)}`,
    );
  } catch (err) {
    console.error(
      `[cavsn] getHealth failed latencyMs=${Date.now() - started}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Bbox fallback using the tuned London env box (underscore params — CAVSN/RapidAPI style). */
export async function fetchCavsnRawByBox(): Promise<{
  rawAlerts: Record<string, unknown>[];
  rawBody: string;
  parsed: unknown;
}> {
  const params = new URLSearchParams({
    bottom_left: normalizeCoordPair(config.wazeBottomLeft),
    top_right: normalizeCoordPair(config.wazeTopRight),
    max_alerts: "200",
    max_jams: "0",
  });
  const url = `https://${CAVSN_RAPIDAPI_HOST}${CAVSN_ALERTS_PATH}?${params.toString()}`;
  const started = Date.now();

  const res = await fetch(url, {
    headers: cavsnHeaders(),
    signal: AbortSignal.timeout(CAVSN_TIMEOUT_MS),
  });
  const rawBody = await res.text();
  if (!res.ok) {
    logCavsnFailure(
      `bbox RapidAPI HTTP ${res.status} ${res.statusText}`,
      url,
      started,
      `body=${rawBody.slice(0, 800)}`,
    );
    throw new Error(`cavsn bbox responded with status ${res.status}`);
  }
  const parsed = JSON.parse(rawBody) as unknown;
  return { rawAlerts: extractCavsnAlertRows(parsed), rawBody, parsed };
}
