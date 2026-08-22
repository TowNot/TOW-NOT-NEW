import { logger } from "../../logger";
import { IncidentStore } from "../../store/incidentStore";
import {
  attachFireIncidentStore,
  startLondonFireListener,
  stopLondonFireListener,
} from "./londonFireListener";

export class RadioIngestionWorker {
  constructor(private readonly store: IncidentStore) {}

  start(): void {
    attachFireIncidentStore(this.store);
    logger.info("London Fire dispatch listener starting");
    startLondonFireListener();
  }

  stop(): void {
    stopLondonFireListener();
  }
}
