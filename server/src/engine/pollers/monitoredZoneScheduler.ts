import { logger } from "../../logger";
import type { ZoneSchedulerHandle } from "./staggeredZoneScheduler";
import {
  startStaggeredZoneSchedulers,
  ZONE_SCHEDULER_STAGGER_MS,
} from "./staggeredZoneScheduler";

export type { ZoneSchedulerHandle };
export { ZONE_SCHEDULER_STAGGER_MS };

const REFRESH_MS = 60_000;

/**
 * Starts one timer per monitored zone and refreshes the zone list every ~60s
 * from Postgres user selections (cached in getActiveMonitoredCities).
 */
export function startMonitoredZoneScheduler<T extends { id: string }>(opts: {
  label: string;
  intervalMs: number;
  resolveZones: () => Promise<T[]>;
  run: (zone: T) => Promise<void>;
}): ZoneSchedulerHandle {
  let scheduler: ZoneSchedulerHandle | null = null;
  let lastKey = "";
  let refreshTimer: NodeJS.Timeout | null = null;

  const reconcile = async (): Promise<void> => {
    const zones = await opts.resolveZones();
    const key = zones.map((zone) => zone.id).sort().join(",");
    if (key === lastKey && scheduler) return;

    lastKey = key;
    scheduler?.stop();

    if (zones.length === 0) {
      logger.info(`${opts.label} monitored scheduler idle — no active cities`);
      return;
    }

    logger.info(`${opts.label} monitored scheduler zones`, {
      cities: zones.map((zone) => zone.id),
    });

    scheduler = startStaggeredZoneSchedulers({
      label: opts.label,
      zones,
      intervalMs: opts.intervalMs,
      zoneId: (zone) => zone.id,
      run: opts.run,
    });
  };

  void reconcile().catch((error) => {
    logger.warn(`${opts.label} initial monitored scheduler reconcile failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  refreshTimer = setInterval(() => {
    void reconcile().catch((error) => {
      logger.warn(`${opts.label} monitored scheduler refresh failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, REFRESH_MS);
  refreshTimer.unref();

  return {
    stop() {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
      scheduler?.stop();
      scheduler = null;
      lastKey = "";
    },
  };
}
