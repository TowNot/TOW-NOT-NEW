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
    logger.info("[WAZE API] starting BlocksInside 4-tile Waze scraper", {
      wazeApi: Boolean(config.wazeApiKey),
      twilio: Boolean(config.twilioAccountSid && config.twilioAuthToken),
      publicUrl: config.publicUrl,
      filter: '["ACCIDENT"]',
      country: config.wazeApiCountry,
      tilesPerCity: 4,
      cities: ["london", "brampton"],
      londonBox: `${config.wazeBottomLeft} .. ${config.wazeTopRight}`,
      bramptonBox: "43.5933, -79.8897 .. 43.7733, -79.6437",
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
    this.googleMaps.start();
    logger.info("Data aggregator engine running (BlocksInside + fire dispatch + OpenWebNinja Google Maps)");
  }

  stop(): void {
    this.waze.stop();
    this.googleMaps.stop();
    this.radio.stop();
    logger.info("Data aggregator engine stopped");
  }
}
