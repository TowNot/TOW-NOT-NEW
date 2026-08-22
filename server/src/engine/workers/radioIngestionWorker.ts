import { IncidentStore } from "../../store/incidentStore";
import { startRadioOrchestrator, stopRadioOrchestrator } from "./radioOrchestrator";

export class RadioIngestionWorker {
  constructor(private readonly store: IncidentStore) {}

  start(): void {
    startRadioOrchestrator(this.store);
  }

  stop(): void {
    stopRadioOrchestrator();
  }
}
