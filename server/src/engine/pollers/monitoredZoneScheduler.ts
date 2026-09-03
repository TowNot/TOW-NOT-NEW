import { logger } from "../../logger";
import {
  maybeLogDemandSummary,
  noteDemandCycleCities,
  noteDemandPollResult,
} from "../cityDemandSummary";

export interface ZoneSchedulerHandle {
  stop(): void;
}

/** Delay between cities within one poll cycle so APIs are not burst together. */
export const ZONE_SCHEDULER_STAGGER_MS = 175;

type DemandProvider = "waze" | "google_maps";

function providerForLabel(label: string): DemandProvider | null {
  const lower = label.toLowerCase();
  if (lower.includes("waze")) return "waze";
  if (lower.includes("google")) return "google_maps";
  return null;
}

/**
 * Single interval that, at the start of every cycle:
 * 1. Resolves demanded zones (fresh Prisma selectedCity query via resolveZones)
 * 2. Runs the scraper only for those cities
 * 3. Skips entirely when the list is empty (zero-user cities sleep)
 */
export function startMonitoredZoneScheduler<T extends { id: string }>(opts: {
  label: string;
  intervalMs: number;
  resolveZones: () => Promise<T[]>;
  run: (zone: T) => Promise<void>;
}): ZoneSchedulerHandle {
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let cycleInFlight = false;
  const provider = providerForLabel(opts.label);

  const tick = async (): Promise<void> => {
    if (stopped || cycleInFlight) {
      if (cycleInFlight) {
        logger.debug(`${opts.label} poll skipped: previous cycle still running`);
      }
      return;
    }

    cycleInFlight = true;
    try {
      const zones = await opts.resolveZones();
      if (provider) {
        noteDemandCycleCities(
          provider,
          zones.map((zone) => zone.id),
        );
      }

      if (zones.length === 0) {
        logger.debug(`${opts.label} cycle idle — no cities with user profiles`);
        maybeLogDemandSummary();
        return;
      }

      logger.debug(`${opts.label} cycle cities from Prisma`, {
        cities: zones.map((zone) => zone.id),
      });

      for (let i = 0; i < zones.length; i++) {
        if (stopped) return;
        const zone = zones[i]!;
        if (i > 0) {
          await sleep(ZONE_SCHEDULER_STAGGER_MS);
        }
        try {
          await opts.run(zone);
        } catch (error) {
          if (provider) noteDemandPollResult(provider, zone.id, false);
          logger.warn(`${opts.label} zone cycle failed (isolated)`, {
            zone: zone.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      maybeLogDemandSummary();
    } catch (error) {
      logger.warn(`${opts.label} monitored cycle failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      cycleInFlight = false;
    }
  };

  void tick();
  timer = setInterval(() => {
    void tick();
  }, opts.intervalMs);
  timer.unref();

  return {
    stop() {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref();
  });
}
