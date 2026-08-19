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
    logger.info("[WAZE API] starting BlocksInside Waze scraper", {
      wazeApi: Boolean(config.wazeApiKey),
      twilio: Boolean(config.twilioAccountSid && config.twilioAuthToken),
      publicUrl: config.publicUrl,
      filter: '["ACCIDENT"]',
      box: `${config.wazeBottomLeft} .. ${config.wazeTopRight}`,
    });
    if (!config.wazeApiKey) {
      logger.warn("WAZEAPI_KEY is unset — BlocksInside poll will be skipped");
    }
    if (!config.twilioAccountSid || !config.twilioAuthToken) {
      logger.warn("Twilio credentials unset — SMS alerts will not send until configured");
    }
    this.waze.start();
    logger.info("[FIRE SCANNER] starting London Fire listener");
    this.radio.start();
    logger.info("Data aggregator engine running (BlocksInside + fire dispatch)");
  }

  stop(): void {
    this.waze.stop();
    this.googleMaps.stop();
    this.radio.stop();
    logger.info("Data aggregator engine stopped");
  }
}
