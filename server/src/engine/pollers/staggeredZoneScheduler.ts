import { logger } from "../../logger";

/** Delay between independent zone timer starts so cities do not burst the API together. */
export const ZONE_SCHEDULER_STAGGER_MS = 175;

export interface ZoneSchedulerHandle {
  stop(): void;
}

/**
 * One dedicated interval per zone, staggered at boot. Each tick is isolated:
 * a timeout or empty response in one city cannot block another city's timer.
 */
export function startStaggeredZoneSchedulers<T>(opts: {
  label: string;
  zones: T[];
  intervalMs: number;
  zoneId: (zone: T) => string;
  run: (zone: T) => Promise<void>;
}): ZoneSchedulerHandle {
  const timers: NodeJS.Timeout[] = [];
  const inFlight = new Set<string>();

  opts.zones.forEach((zone, index) => {
    const id = opts.zoneId(zone);
    const bootDelayMs = index * ZONE_SCHEDULER_STAGGER_MS;

    const tick = () => {
      if (inFlight.has(id)) {
        logger.debug(`${opts.label} poll skipped: previous pass still running`, { zone: id });
        return;
      }
      inFlight.add(id);
      void (async () => {
        try {
          await opts.run(zone);
        } catch (error) {
          logger.warn(`${opts.label} zone cycle failed (isolated)`, {
            zone: id,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          inFlight.delete(id);
        }
      })();
    };

    const boot = setTimeout(() => {
      tick();
      const timer = setInterval(tick, opts.intervalMs);
      timer.unref();
      timers.push(timer);
    }, bootDelayMs);
    boot.unref();
    timers.push(boot);
  });

  return {
    stop() {
      for (const timer of timers) clearTimeout(timer);
      timers.length = 0;
      inFlight.clear();
    },
  };
}
