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
    console.log("[WAZE API] starting CAVSN Waze scraper");
    this.waze.start();
    // Google Maps RapidAPI scraper is paused for the live test — Fire + CAVSN only.
    console.log("[FIRE SCANNER] starting London Fire listener");
    this.radio.start();
    logger.info("Data aggregator engine running (fire dispatch + CAVSN)");
  }

  stop(): void {
    this.waze.stop();
    this.googleMaps.stop();
    this.radio.stop();
    logger.info("Data aggregator engine stopped");
  }
}
