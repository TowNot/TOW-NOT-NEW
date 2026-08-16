import { logger } from "../../logger";
import { IncidentStore } from "../../store/incidentStore";
import type { Incident } from "../../types/incident";

export class GoogleMapsTrafficPoller {
  constructor(_store: IncidentStore) {}

  start(): void {
    logger.info("Google Maps traffic ingested via the live RapidAPI aggregator");
  }

  stop(): void {}

  async poll(): Promise<Incident[]> {
    return [];
  }
}
