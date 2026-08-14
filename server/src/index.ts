import { existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import "dotenv/config";
import { applyTerminalHandlers, createApp } from "./app";
import { config } from "./config";
import { PushDispatcher } from "./dispatch/pushDispatcher";
import { DataAggregatorEngine } from "./engine/aggregator";
import { GoogleMapsTrafficPoller } from "./engine/pollers/googleMapsPoller";
import { WazeTrafficPoller } from "./engine/pollers/wazePoller";
import { RadioIngestionWorker } from "./engine/workers/radioIngestionWorker";
import { logger } from "./logger";
import { IncidentStore } from "./store/incidentStore";

const PROGRESSIER_SW_SOURCE =
  'importScripts("https://progressier.app/Bv9Rb1Vm5PkATyh6w0wG/sw.js");\n';

function resolveProgressierFile(): string | undefined {
  const candidates = [
    path.join(__dirname, "../../client/public/progressier.js"),
    path.join(process.cwd(), "client/public/progressier.js"),
    path.join(process.cwd(), "public/progressier.js"),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

const store = new IncidentStore();
const dispatcher = new PushDispatcher();
const waze = new WazeTrafficPoller(store);
const googleMaps = new GoogleMapsTrafficPoller(store);
const radio = new RadioIngestionWorker(store);
const engine = new DataAggregatorEngine(waze, googleMaps, radio);

store.on("created", (incident) => {
  void dispatcher.notifyIncident(incident).catch((error: unknown) => {
    logger.error("Automatic push failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
});

const app = createApp(store, dispatcher);

app.get("/progressier.js", (_req, res) => {
  res.set({
    "Content-Type": "application/javascript; charset=utf-8",
    "Service-Worker-Allowed": "/",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Access-Control-Allow-Origin": "*",
  });

  const filePath = resolveProgressierFile();
  if (!filePath) {
    res.send(PROGRESSIER_SW_SOURCE);
    return;
  }

  res.sendFile(filePath, (error) => {
    if (error && !res.headersSent) {
      logger.error("Failed to send progressier.js", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.send(PROGRESSIER_SW_SOURCE);
    }
  });
});

applyTerminalHandlers(app);

const server = createServer(app);

store.start();
engine.start();

server.listen(config.port, () => {
  logger.info("TOW-NOT server listening", { port: config.port });
});

function shutdown(signal: string): void {
  logger.info("Shutting down", { signal });
  engine.stop();
  store.stop();
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
