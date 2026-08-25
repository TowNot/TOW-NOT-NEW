import { Router } from "express";
import { config } from "../config";
import { getProviderRuntimeStats } from "../engine/wazeAggregator";
import { enabledCoverageZones, zoneToBoundingBox } from "../engine/coverageZones";
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

export function createSourcesRouter(store: IncidentStore): Router {
  const router = Router();

  const bySource = (source: IncidentSource) =>
    store.getActive().filter((incident) => incident.source === source);

  /** Zone catalog for the Live Desk — includes scannedAgencies for UI tags. */
  router.get("/zones", (_req, res) => {
    res.json({
      checkedAt: new Date().toISOString(),
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

  // Operational readiness snapshot: which credentials are present, which
  // upstream feeds answered last, and how many incidents each has produced.
  router.get("/status", (_req, res) => {
    const active = store.getActive();
    const providers = getProviderRuntimeStats();
    const blocksinside = providers.blocksinside;
    res.json({
      checkedAt: new Date().toISOString(),
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
      subscriptions: subscriptionStoreStats(),
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
    });
  });

  return router;
}
