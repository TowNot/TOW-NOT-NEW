import { config } from "../config";
import { logger } from "../logger";
import { GoogleMapsTrafficPoller } from "./pollers/googleMapsPoller";
import { WazeTrafficPoller } from "./pollers/wazePoller";
import { RadioIngestionWorker } from "./workers/radioIngestionWorker";

export class DataAggregatorEngine {
  constructor(
    private readonly waze: WazeTrafficPoller,
    private readonly googleMaps: GoogleMapsTrafficPoller,
    private readonly radio: RadioIngestionWorker,
  ) {}

  start(): void {
    logger.info("[WAZE API] starting BlocksInside + CAVSN Waze scrapers", {
      wazeApi: Boolean(config.wazeApiKey),
      rapidApi: Boolean(config.rapidApiKey),
      twilio: Boolean(config.twilioAccountSid && config.twilioAuthToken),
      publicUrl: config.publicUrl,
    });
    if (!config.rapidApiKey) {
      logger.warn("RAPIDAPI_KEY is unset — CAVSN poll will be skipped");
    } else {
      logger.info(
        "[WAZE API] CAVSN upstream timeout protection active — BlocksInside acting as primary feed",
      );
    }
    if (!config.twilioAccountSid || !config.twilioAuthToken) {
      logger.warn("Twilio credentials unset — SMS alerts will not send until configured");
    }
    this.waze.start();
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
