import { Router } from "express";
import { config } from "../config";
import { getProviderRuntimeStats } from "../engine/wazeAggregator";
import { enabledCoverageZones, zoneToBoundingBox } from "../engine/coverageZones";
import { LONDON_ONLY_INGEST, LONDON_ZONE_ID } from "../engine/londonOnly";
import { zonePublicSummaries } from "../engine/zones.config";
import {
  countGoogleMapsFetchJobs,
  getOpenWebNinjaGoogleMapsRuntime,
  GOOGLE_MAPS_ZOOM_LEVELS,
} from "../engine/googleMaps/openWebNinjaGoogleMapsScraper";
import { getFireDispatchRuntime } from "../engine/workers/fireDispatchRuntime";
import type { IncidentStore } from "../store/incidentStore";
import { subscriptionStoreStats } from "../store/subscriptionStore";
import type { IncidentSource } from "../types/incident";

async function buildSourcesStatusPayload(store: IncidentStore) {
  const active = store.getActive();
  const providers = getProviderRuntimeStats();
  const blocksinside = providers.blocksinside;

  const bySource = (source: IncidentSource) =>
    store.getActive().filter((incident) => incident.source === source);

  return {
    checkedAt: new Date().toISOString(),
    londonOnly: LONDON_ONLY_INGEST,
    activeIngestZones: enabledCoverageZones().map((z) => z.id),
    activeZone: LONDON_ONLY_INGEST ? LONDON_ZONE_ID : null,
    pollCenter: {
      lat: config.londonLat,
      lng: config.londonLng,
      radiusKm: config.pollRadiusKm,
      intervalMs: config.pollIntervalMs,
    },
    wazeQuery: {
      endpoint: "https://api.wazeapi.com/v1/alerts",
      filter: '["ACCIDENT","POLICE"]',
      limit: "",
      tiles: 4,
      tileDivisions: 2,
      cities: enabledCoverageZones().map((zone) => zone.id),
      "bottom-left": config.wazeBottomLeft,
      "top-right": config.wazeTopRight,
      country: config.wazeApiCountry,
    },
    lastTypeCounts: blocksinside.lastTypeCounts,
    lastDroppedBy: blocksinside.lastDroppedBy,
    lastReceived: blocksinside.lastReceived,
    lastRetained: blocksinside.lastRetained,
    credentials: {
      wazeApi: Boolean(config.wazeApiKey),
      apify: Boolean(config.apifyApiToken),
      deepgram: Boolean(config.deepgramApiKey),
      redis: Boolean(config.redisUrl) || Boolean(process.env.REDIS_HOST),
      postgres: Boolean(config.databaseUrl),
      progressier: Boolean(config.progressierApiKey),
      twilio: Boolean(config.twilioAccountSid && config.twilioAuthToken),
      stripe: Boolean(config.stripeSecretKey && config.stripeWebhookSecret),
      clerk: Boolean(config.clerkPublishableKey && config.clerkSecretKey),
      openWebNinja: Boolean(config.openWebNinjaApiKey),
    },
    googleMapsOpenWebNinja: {
      ...getOpenWebNinjaGoogleMapsRuntime(),
      intervalMs: config.googleMapsPollIntervalMs,
      zooms: GOOGLE_MAPS_ZOOM_LEVELS.join("-"),
      tilesPerCity: "4 @ Z11–14; dynamic @ Z15",
      requestsPerPoll: countGoogleMapsFetchJobs(
        zoneToBoundingBox(enabledCoverageZones().find((z) => z.id === "london")!),
      ),
      fetchConcurrency: 8,
      endpoint: "https://api.openwebninja.com/google-maps-traffic-alerts/traffic-alerts",
    },
    subscriptions: await subscriptionStoreStats(),
    liveWazeProvider: "blocksinside",
    push: {
      endpoint: config.progressierPushUrl,
      appId: config.progressierAppId,
      publicUrl: config.publicUrl,
      recipients: { users: "all" },
    },
    fireDispatch: {
      ...getFireDispatchRuntime(),
      streamOverride: Boolean(config.radioHlsUrl),
    },
    torontoFireCad: {
      enabled: config.torontoFireCadEnabled && !LONDON_ONLY_INGEST,
      blockedByLondonOnly: LONDON_ONLY_INGEST,
      envFlag: config.torontoFireCadEnabled,
    },
    zones: zonePublicSummaries(),
    providers,
    incidents: {
      total: active.length,
      notified: active.filter((incident) => incident.notified).length,
      waze: bySource("waze").length,
      googleMaps: bySource("google_maps").length,
      fireDispatch: bySource("fire_dispatch").length,
      ems: bySource("ems").length,
    },
  };
}

/** Admin-only internal ops dashboard. Mount at /api/sources/status. */
export function createSourcesStatusRouter(store: IncidentStore): Router {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      res.json(await buildSourcesStatusPayload(store));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export function createSourcesRouter(store: IncidentStore): Router {
  const router = Router();

  const bySource = (source: IncidentSource) =>
    store.getActive().filter((incident) => incident.source === source);

  /** Zone catalog for the Live Desk — includes scannedAgencies for UI tags. */
  router.get("/zones", (_req, res) => {
    res.json({
      checkedAt: new Date().toISOString(),
      londonOnly: LONDON_ONLY_INGEST,
      activeIngestZones: enabledCoverageZones().map((z) => z.id),
      zones: zonePublicSummaries(),
    });
  });

  router.get("/waze", (_req, res) => {
    res.json({
      source: "waze",
      region: "London, ON",
      scrapedAt: new Date().toISOString(),
      incidents: bySource("waze"),
    });
  });

  router.get("/google-maps", (_req, res) => {
    res.json({
      source: "google_maps",
      region: "London, ON",
      scrapedAt: new Date().toISOString(),
      incidents: bySource("google_maps"),
    });
  });

  router.get("/fire-dispatch", (_req, res) => {
    res.json({
      source: "fire_dispatch",
      region: "London, ON",
      scrapedAt: new Date().toISOString(),
      incidents: bySource("fire_dispatch"),
    });
  });

  router.get("/ems", (_req, res) => {
    res.json({
      source: "ems",
      region: "Waterloo Region, ON",
      scrapedAt: new Date().toISOString(),
      incidents: bySource("ems"),
    });
  });

  return router;
}
