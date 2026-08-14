import { Router } from "express";
import { scrapeGoogleMapsIncidents } from "../engine/pollers/googleMapsPoller";
import { scrapeWazeAccidents } from "../engine/pollers/wazePoller";

export const sourcesRouter = Router();

sourcesRouter.get("/waze", (_req, res) => {
  res.json({
    source: "waze",
    region: "London, ON",
    scrapedAt: new Date().toISOString(),
    alerts: scrapeWazeAccidents(),
  });
});

sourcesRouter.get("/google-maps", (_req, res) => {
  res.json({
    source: "google_maps",
    region: "London, ON",
    scrapedAt: new Date().toISOString(),
    incidents: scrapeGoogleMapsIncidents(),
  });
});
