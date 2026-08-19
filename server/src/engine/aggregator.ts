import { GoogleMapsTrafficPoller } from "./pollers/googleMapsPoller";
import { WazeTrafficPoller } from "./pollers/wazePoller";
import { RadioIngestionWorker } from "./workers/radioIngestionWorker";
import { logger } from "../logger";

export class DataAggregatorEngine {
  constructor(
    private readonly waze: WazeTrafficPoller,
    private readonly googleMaps: GoogleMapsTrafficPoller,
    private readonly radio: RadioIngestionWorker,
  ) {}

  start(): void {
    logger.info("[WAZE API] starting BlocksInside + CAVSN Waze scrapers");
    this.waze.start();
    // Google Maps / CAVSN RapidAPI scrapers are paused — Fire + BlocksInside only.
    logger.info("[FIRE SCANNER] starting London Fire listener");
    this.radio.start();
    logger.info("Data aggregator engine running (BlocksInside + CAVSN + fire dispatch)");
  }

  stop(): void {
    this.waze.stop();
    this.googleMaps.stop();
    this.radio.stop();
    logger.info("Data aggregator engine stopped");
  }
}
