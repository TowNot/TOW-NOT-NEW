import { logger } from "../logger";
import { getCoverageZone } from "./zones.config";
import {
  coverageZoneToGoogleMapsCity,
  type GoogleMapsCity,
} from "./googleMaps/openWebNinjaGoogleMapsScraper";

export interface CityDemandScrapers {
  pollWazeZone: (zone: { id: string; name: string }) => Promise<unknown>;
  pollGoogleMapsCity: (city: GoogleMapsCity) => Promise<unknown>;
}

let scrapers: CityDemandScrapers | null = null;

/** Wire pollers from boot (index.ts) so PUT /api/user/city can cold-start. */
export function registerCityDemandScrapers(next: CityDemandScrapers): void {
  scrapers = next;
}

/**
 * One-off Waze + Google Maps scrape when the first user profile selects a city.
 * Does not wait for the next background interval.
 */
export async function coldStartCityScrape(cityId: string): Promise<void> {
  const zone = getCoverageZone(cityId);
  if (!zone) {
    logger.warn("Cold-start scrape skipped — unknown city", { cityId });
    return;
  }
  if (!scrapers) {
    logger.warn("Cold-start scrape skipped — scrapers not registered yet", {
      cityId: zone.id,
    });
    return;
  }

  logger.info("Cold-start scrape for newly demanded city", {
    cityId: zone.id,
    name: zone.name,
  });

  const gmapsCity = coverageZoneToGoogleMapsCity(zone);
  const results = await Promise.allSettled([
    scrapers.pollWazeZone({ id: zone.id, name: zone.name }),
    scrapers.pollGoogleMapsCity(gmapsCity),
  ]);

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      logger.warn("Cold-start scrape leg failed", {
        cityId: zone.id,
        leg: index === 0 ? "waze" : "google_maps",
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      });
    }
  });
}
