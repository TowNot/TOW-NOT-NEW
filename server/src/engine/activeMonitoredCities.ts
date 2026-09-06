import { prisma } from "../db/prisma";
import { logger } from "../logger";
import { COVERAGE_ZONE_IDS } from "./zones.config";

const DEFAULT_CITY = "london";

/** Catalog ids keyed by lowercase — preserves camelCase (e.g. torontoCore). */
const CANONICAL_CITY_BY_LOWER = new Map<string, string>(
  COVERAGE_ZONE_IDS.map((id) => [id.toLowerCase(), id]),
);

export function normalizeCityId(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return CANONICAL_CITY_BY_LOWER.get(key) ?? null;
}

/** @deprecated No in-memory city cache — kept as a no-op for existing call sites. */
export function invalidateActiveMonitoredCitiesCache(): void {
  // Intentionally empty: scrapers re-query Prisma at the start of every cycle.
}

/**
 * Distinct `selectedCity` values from user profiles (Prisma).
 * Called at the start of every Waze / Google Maps poll cycle — never cached.
 * Cities with zero profile rows are omitted so scrapers skip them.
 */
export async function getActiveMonitoredCities(): Promise<string[]> {
  try {
    const rows = await prisma.userPreference.findMany({
      select: { selectedCity: true },
      distinct: ["selectedCity"],
    });

    const cities = new Set<string>();
    for (const row of rows) {
      const id = normalizeCityId(row.selectedCity);
      if (id) cities.add(id);
    }

    return [...cities].sort();
  } catch (error) {
    logger.warn("Failed to load active monitored cities from Prisma — falling back to London", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [DEFAULT_CITY];
  }
}

/** How many user profiles currently have this city selected (fresh Prisma read). */
export async function countUsersSelectingCity(cityId: string): Promise<number> {
  const id = normalizeCityId(cityId);
  if (!id) return 0;
  try {
    return await prisma.userPreference.count({
      where: { selectedCity: id },
    });
  } catch (error) {
    logger.warn("Failed to count users for city", {
      cityId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}
