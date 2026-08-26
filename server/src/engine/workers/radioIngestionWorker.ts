import { logger } from "../../logger";
import { IncidentStore } from "../../store/incidentStore";
import { reconcileRadioOrchestrator, stopRadioOrchestrator } from "./radioOrchestrator";

const REFRESH_MS = 60_000;

export class RadioIngestionWorker {
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(private readonly store: IncidentStore) {}

  start(): void {
    logger.info("Fire dispatch radio orchestrator starting (user-monitored cities)");
    void reconcileRadioOrchestrator(this.store).catch((error) => {
      logger.warn("Fire dispatch initial reconcile failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    this.refreshTimer = setInterval(() => {
      void reconcileRadioOrchestrator(this.store).catch((error) => {
        logger.warn("Fire dispatch monitored-city refresh failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, REFRESH_MS);
    this.refreshTimer.unref();
  }

  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    stopRadioOrchestrator();
  }
}
