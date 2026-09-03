import { logger } from "../logger";

const SUMMARY_INTERVAL_MS = 3 * 60_000;

type ProviderKey = "waze" | "google_maps";

interface ProviderCycleStats {
  ok: number;
  fail: number;
  cities: string[];
}

const lastCycle: Record<ProviderKey, ProviderCycleStats> = {
  waze: { ok: 0, fail: 0, cities: [] },
  google_maps: { ok: 0, fail: 0, cities: [] },
};

let lastSummaryAt = 0;
let summaryTimer: NodeJS.Timeout | null = null;

/** Record one city's result for the latest poll cycle (logs stay quiet). */
export function noteDemandPollResult(
  provider: ProviderKey,
  cityId: string,
  ok: boolean,
): void {
  const stats = lastCycle[provider];
  if (!stats.cities.includes(cityId)) stats.cities.push(cityId);
  if (ok) stats.ok += 1;
  else stats.fail += 1;
  ensureSummaryTimer();
}

/** Snapshot demanded cities after Prisma resolve (before per-city runs). */
export function noteDemandCycleCities(provider: ProviderKey, cities: string[]): void {
  lastCycle[provider] = {
    ok: 0,
    fail: 0,
    cities: [...cities].sort(),
  };
  ensureSummaryTimer();
}

function ensureSummaryTimer(): void {
  if (summaryTimer) return;
  summaryTimer = setInterval(() => {
    maybeLogDemandSummary(true);
  }, SUMMARY_INTERVAL_MS);
  summaryTimer.unref();
}

/** Compact multi-city line — info every ~3 minutes (or force). */
export function maybeLogDemandSummary(force = false): void {
  const now = Date.now();
  if (!force && now - lastSummaryAt < SUMMARY_INTERVAL_MS) return;
  lastSummaryAt = now;

  const waze = lastCycle.waze;
  const gmaps = lastCycle.google_maps;
  const demand = [...new Set([...waze.cities, ...gmaps.cities])].sort();

  logger.info(
    `[city-demand] demand=[${demand.join(",") || "none"}] ` +
      `waze_ok=${waze.ok} waze_fail=${waze.fail} ` +
      `gmaps_ok=${gmaps.ok} gmaps_fail=${gmaps.fail}`,
  );
}
