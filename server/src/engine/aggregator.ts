import { config } from "../config";
import { logger } from "../logger";
import { enabledCoverageZones } from "./coverageZones";
import { GoogleMapsTrafficPoller } from "./pollers/googleMapsPoller";
import { TorontoFireCadPoller } from "./pollers/torontoFireCadPoller";
import { WazeTrafficPoller } from "./pollers/wazePoller";
import { RadioIngestionWorker } from "./workers/radioIngestionWorker";

export class DataAggregatorEngine {
  constructor(
    private readonly waze: WazeTrafficPoller,
    private readonly googleMaps: GoogleMapsTrafficPoller,
    private readonly radio: RadioIngestionWorker,
    private readonly torontoFireCad: TorontoFireCadPoller,
  ) {}

  start(): void {
    const enabled = enabledCoverageZones();
    logger.info("[WAZE API] starting BlocksInside 4-tile Waze scraper", {
      wazeApi: Boolean(config.wazeApiKey),
      twilio: Boolean(config.twilioAccountSid && config.twilioAuthToken),
      publicUrl: config.publicUrl,
      filter: '["ACCIDENT","POLICE"]',
      country: config.wazeApiCountry,
      tilesPerCity: 4,
      cities: enabled.map((zone) => zone.id),
      zones: enabled.map((zone) => ({
        id: zone.id,
        box: `${zone.bounds.southWest.lat}, ${zone.bounds.southWest.lng} .. ${zone.bounds.northEast.lat}, ${zone.bounds.northEast.lng}`,
      })),
    });
    if (!config.wazeApiKey) {
      logger.warn("WAZEAPI_KEY is unset — BlocksInside poll will be skipped");
    }
    if (!config.twilioAccountSid || !config.twilioAuthToken) {
      logger.warn("Twilio credentials unset — SMS alerts will not send until configured");
    }
    this.waze.start();
    logger.info("[FIRE SCANNER] starting zone audio orchestrator (HLS + continuous streams)");
    this.radio.start();
    this.googleMaps.start();
    // Independent 60s CAD poller — does not share timers with Waze/GMaps/audio.
    this.torontoFireCad.start();
    logger.info(
      "Data aggregator engine running (BlocksInside + fire dispatch + OpenWebNinja Google Maps + Toronto Fire CAD)",
    );
  }

  stop(): void {
    this.waze.stop();
    this.googleMaps.stop();
    this.radio.stop();
    this.torontoFireCad.stop();
    logger.info("Data aggregator engine stopped");
  }
}
