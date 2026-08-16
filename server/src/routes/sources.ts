import { Router } from "express";
import { config } from "../config";
import { getProviderRuntimeStats } from "../engine/wazeAggregator";
import { isFireListenerRunning } from "../engine/workers/londonFireListener";
import type { IncidentStore } from "../store/incidentStore";
import type { IncidentSource } from "../types/incident";

export function createSourcesRouter(store: IncidentStore): Router {
  const router = Router();

  const bySource = (source: IncidentSource) =>
    store.getActive().filter((incident) => incident.source === source);

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

  // Operational readiness snapshot: which credentials are present, which
  // upstream feeds answered last, and how many incidents each has produced.
  router.get("/status", (_req, res) => {
    const active = store.getActive();
    res.json({
      checkedAt: new Date().toISOString(),
      pollCenter: {
        lat: config.londonLat,
        lng: config.londonLng,
        radiusKm: config.pollRadiusKm,
        intervalMs: config.pollIntervalMs,
      },
      credentials: {
        rapidApi: Boolean(config.rapidApiKey),
        apify: Boolean(config.apifyApiToken),
        openai: Boolean(config.openaiApiKey),
        progressier: Boolean(config.progressierApiKey),
      },
      fireDispatch: {
        listening: isFireListenerRunning(),
        streamOverride: Boolean(config.radioHlsUrl),
      },
      providers: getProviderRuntimeStats(),
      incidents: {
        total: active.length,
        notified: active.filter((incident) => incident.notified).length,
        waze: bySource("waze").length,
        googleMaps: bySource("google_maps").length,
        fireDispatch: bySource("fire_dispatch").length,
      },
    });
  });

  return router;
}
