import { prisma } from "../db/prisma";
import { logger } from "../logger";
import { COVERAGE_ZONE_IDS } from "./zones.config";

const CACHE_MS = 60_000;
const DEFAULT_CITY = "london";

const VALID_CITY_IDS = new Set<string>(COVERAGE_ZONE_IDS);

let cache: { cities: string[]; at: number } | null = null;

export function normalizeCityId(raw: string): string | null {
  const id = raw.trim().toLowerCase();
  if (!id || !VALID_CITY_IDS.has(id)) return null;
  return id;
}

export function invalidateActiveMonitoredCitiesCache(): void {
  cache = null;
}

/**
 * Distinct cities selected by users with notifications enabled:
 * - UserPreference.notificationsEnabled
 * - active Stripe subscriptions
 * - active SMS opt-ins
 *
 * Cached ~60s so pollers do not query Postgres every tick.
 */
export async function getActiveMonitoredCities(): Promise<string[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    return [...cache.cities];
  }

  try {
    const [prefs, subs, sms] = await Promise.all([
      prisma.userPreference.findMany({
        where: { notificationsEnabled: true },
        select: { selectedCity: true },
      }),
      prisma.subscription.findMany({
        where: { status: "active" },
        select: { selectedCity: true },
      }),
      prisma.smsSubscriber.findMany({
        where: { active: true },
        select: { selectedCity: true },
      }),
    ]);

    const cities = new Set<string>();
    for (const row of [...prefs, ...subs, ...sms]) {
      const id = normalizeCityId(row.selectedCity);
      if (id) cities.add(id);
    }

    const list = cities.size > 0 ? [...cities].sort() : [DEFAULT_CITY];
    cache = { cities: list, at: now };
    return [...list];
  } catch (error) {
    logger.warn("Failed to load active monitored cities — defaulting to London", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [DEFAULT_CITY];
  }
}
