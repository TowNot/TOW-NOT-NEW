import "dotenv/config";
import { createServer } from "node:http";
import { createApp } from "./app";
import { config } from "./config";
import { PushDispatcher } from "./dispatch/pushDispatcher";
import { DataAggregatorEngine } from "./engine/aggregator";
import { GoogleMapsTrafficPoller } from "./engine/pollers/googleMapsPoller";
import { WazeTrafficPoller } from "./engine/pollers/wazePoller";
import { RadioIngestionWorker } from "./engine/workers/radioIngestionWorker";
import { logger } from "./logger";
import { IncidentStore } from "./store/incidentStore";

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
