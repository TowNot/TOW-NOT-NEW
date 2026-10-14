import { config } from "../config";
import { logger } from "../logger";
import { enabledCoverageZones } from "./coverageZones";
import { LONDON_ONLY_INGEST } from "./londonOnly";
import { GoogleMapsTrafficPoller } from "./pollers/googleMapsPoller";
import { TorontoFireCadPoller } from "./pollers/torontoFireCadPoller";
import { WazeTrafficPoller } from "./pollers/wazePoller";
import { RadioIngestionWorker } from "./workers/radioIngestionWorker";

export class DataAggregatorEngine {
  constructor(
    private readonly waze: WazeTrafficPoller,
    private readonly waze2: WazeTrafficPoller,
    private readonly googleMaps: GoogleMapsTrafficPoller,
    private readonly radio: RadioIngestionWorker,
    private readonly torontoFireCad: TorontoFireCadPoller,
  ) {}

  start(): void {
    const enabled = enabledCoverageZones();
    logger.info("[WAZE API] starting Waze 1 (BlocksInside) + Waze 2 (OpenWebNinja) 12-tile scrapers", {
      londonOnly: LONDON_ONLY_INGEST,
      prismaDemandedCities: true,
      wazeApi: Boolean(config.wazeApiKey),
      openWebNinjaWazeApi: Boolean(config.openWebNinjaWazeApiKey),
      twilio: Boolean(config.twilioAccountSid && config.twilioAuthToken),
      publicUrl: config.publicUrl,
      filter: '["ACCIDENT","POLICE"]',
      country: config.wazeApiCountry,
      tilesPerCity: 12,
      radioZones: enabled.map((zone) => zone.id),
      zones: enabled.map((zone) => ({
        id: zone.id,
        box: `${zone.bounds.southWest.lat}, ${zone.bounds.southWest.lng} .. ${zone.bounds.northEast.lat}, ${zone.bounds.northEast.lng}`,
      })),
    });
    if (config.wazePollingEnabled && !config.wazeApiKey) {
      logger.warn("WAZEAPI_KEY is unset — BlocksInside poll will be skipped");
    }
    if (!config.twilioAccountSid || !config.twilioAuthToken) {
      logger.warn("Twilio credentials unset — SMS alerts will not send until configured");
    }
    this.waze.start();
    this.waze2.start();
    if (config.fireDispatchEnabled) {
      logger.info("[FIRE SCANNER] starting zone audio orchestrator (HLS + continuous streams)", {
        zones: config.fireDispatchZoneIds,
      });
      this.radio.start();
    } else {
      logger.info(
        "[FIRE SCANNER] paused — set FIRE_DISPATCH_ENABLED=1 to resume Deepgram / radio listeners",
      );
    }
    this.googleMaps.start();
    // CAD no-ops under London-only / when TORONTO_FIRE_CAD_ENABLED is off.
    this.torontoFireCad.start();
    logger.info(
      "Data aggregator engine running (Waze/GMaps follow Prisma selectedCity demand)",
      {
        radioZones: enabled.map((z) => z.id),
        londonOnly: LONDON_ONLY_INGEST,
        fireDispatchEnabled: config.fireDispatchEnabled,
      },
    );
  }

  stop(): void {
    this.waze.stop();
    this.waze2.stop();
    this.googleMaps.stop();
    this.radio.stop();
    this.torontoFireCad.stop();
    logger.info("Data aggregator engine stopped");
  }
}
