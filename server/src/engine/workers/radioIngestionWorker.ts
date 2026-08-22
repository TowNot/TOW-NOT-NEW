import { logger } from "../../logger";
import { IncidentStore } from "../../store/incidentStore";
import { startRadioOrchestrator, stopRadioOrchestrator } from "./radioOrchestrator";

export class RadioIngestionWorker {
  constructor(private readonly store: IncidentStore) {}

  start(): void {
    logger.info("Fire dispatch radio orchestrator starting");
    startRadioOrchestrator(this.store);
  }

  stop(): void {
    stopRadioOrchestrator();
  }
}
