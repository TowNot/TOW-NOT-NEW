// Trigger Railway Deploy
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import "dotenv/config";
import { applyClientAssets, applyTerminalHandlers, createApp } from "./app";
import { config } from "./config";
import { PushDispatcher } from "./dispatch/pushDispatcher";
import { DataAggregatorEngine } from "./engine/aggregator";
import { isGoogleMapsClusterUpgrade } from "./engine/googleMaps/clusterUpgrade";
import {
  googleMapsNotificationBlockReason,
  logGoogleMapsNotificationGate,
} from "./engine/googleMaps/googleMapsNotificationGate";
import { shouldNotifyIncident } from "./engine/notifyGate";
import { GoogleMapsTrafficPoller } from "./engine/pollers/googleMapsPoller";
import { TorontoFireCadPoller } from "./engine/pollers/torontoFireCadPoller";
import { WazeTrafficPoller } from "./engine/pollers/wazePoller";
import { RadioIngestionWorker } from "./engine/workers/radioIngestionWorker";
import { logger } from "./logger";
import { closeNotificationQueue } from "./queue/notificationQueue";
import { closeSharedRedis } from "./queue/redisClient";
import { warmSmsSubscriberCache } from "./sms/subscribers";
import { warmSubscriptionCache } from "./store/subscriptionStore";
import { connectPrisma, disconnectPrisma } from "./db/prisma";
import { IncidentStore } from "./store/incidentStore";
import {
  startNotificationWorker,
  stopNotificationWorker,
} from "./workers/notificationWorker";

const PROGRESSIER_SW_SOURCE = [
  'importScripts("https://progressier.app/Bv9Rb1Vm5PkATyh6w0wG/sw.js");',
  'self.addEventListener("push", (event) => {',
  "  event.waitUntil(",
  "    (async () => {",
  "      let payload = {};",
  "      try {",
  "        payload = event.data ? event.data.json() : {};",
  "      } catch {",
  "        payload = {};",
  "      }",
  "      const nested = payload.notification || {};",
  "      const data = payload.data || nested.data || {};",
  '      const title = payload.title || nested.title || "AlertNav";',
  "      const body = payload.body || payload.message || nested.body || nested.message || \"\";",
  '      const url = payload.url || data.url || nested.url || "";',
  '      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });',
  "      for (const client of windows) {",
  '        client.postMessage({ type: "tow-not-alert", title, body, url });',
  "      }",
  "    })(),",
  "  );",
  "});",
  "",
].join("\n");

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
const torontoFireCad = new TorontoFireCadPoller(store);
const engine = new DataAggregatorEngine(waze, googleMaps, radio, torontoFireCad);

store.on("created", (incident) => {
  if (!shouldNotifyIncident(incident, store)) {
    if (incident.source === "google_maps") {
      logGoogleMapsNotificationGate(
        incident.id,
        "STORED WITHOUT PUSH (Gate blocked)",
        googleMapsNotificationBlockReason(incident, store) ?? undefined,
      );
    } else {
      logger.info("Stored without push", {
        incidentId: incident.id,
        type: incident.type,
        subtype: incident.subtype,
        source: incident.source,
      });
    }
    return;
  }
  void dispatcher
    .notifyIncident(incident)
    .then((receipt) => {
      if (!receipt) return;
      store.markNotified(incident.id);
      if (incident.source === "google_maps") {
        logGoogleMapsNotificationGate(
          incident.id,
          "PUSHED NEW",
          `rawType=${incident.rawType ?? "unknown"} | subtype=${incident.subtype ?? "none"}`,
        );
      }
    })
    .catch((error: unknown) => {
      logger.error("Automatic push failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
});

store.on("clusterUpgrade", ({ previous, incoming, merged }) => {
  if (!isGoogleMapsClusterUpgrade(previous, incoming, merged)) return;
  if (!shouldNotifyIncident(merged, store)) {
    logGoogleMapsNotificationGate(
      merged.id,
      "STORED WITHOUT PUSH (Gate blocked)",
      googleMapsNotificationBlockReason(merged, store) ??
        `upgrade ${previous.rawType ?? "?"}→${incoming.rawType ?? "?"}`,
    );
    return;
  }
  void dispatcher
    .notifyIncident(merged)
    .then((receipt) => {
      if (!receipt) return;
      store.markNotified(merged.id);
      logGoogleMapsNotificationGate(
        merged.id,
        "UPGRADE PUSH TRIGGERED",
        `incoming=${incoming.id} | rawType ${previous.rawType ?? "?"}→${merged.rawType ?? "?"}`,
      );
    })
    .catch((error: unknown) => {
      logger.error("Google Maps cluster upgrade push failed", {
        incidentId: merged.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
});

store.on("clusterMergePush", ({ existing, incoming, merged }) => {
  if (!shouldNotifyIncident(merged, store)) {
    logGoogleMapsNotificationGate(
      merged.id,
      "STORED WITHOUT PUSH (Gate blocked)",
      googleMapsNotificationBlockReason(merged, store) ??
        `merge-offset from ${incoming.id}`,
    );
    return;
  }
  void dispatcher
    .notifyIncident(merged)
    .then((receipt) => {
      if (!receipt) return;
      store.markNotified(merged.id);
      logGoogleMapsNotificationGate(
        merged.id,
        "MERGE OFFSET PUSH",
        `incoming=${incoming.id} | offset from cluster=${existing.id} | rawType=${incoming.rawType ?? "unknown"}`,
      );
    })
    .catch((error: unknown) => {
      logger.error("Google Maps merge-offset push failed", {
        incidentId: merged.id,
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

// Desk UI lives in the client package and is copied into this image at build time.
applyClientAssets(app);
applyTerminalHandlers(app);

const server = createServer(app);

server.on("error", (error: unknown) => {
  logger.error("HTTP server failed to bind", {
    error: error instanceof Error ? error.message : String(error),
    port: config.port,
    host: config.host,
  });
  process.exit(1);
});

// Bind first so Railway healthchecks can pass. Pollers and the fire listener
// start only after listen — they must not block module eval or port bind.
server.listen(config.port, config.host, () => {
  logger.info("AlertNav server listening", { port: config.port, host: config.host });
  void (async () => {
    try {
      await connectPrisma();
      await Promise.all([warmSubscriptionCache(), warmSmsSubscriberCache()]);
    } catch (error) {
      logger.error("Database connection failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    store.start();
    engine.start();
    try {
      startNotificationWorker();
    } catch (error) {
      logger.error("Failed to start notification worker", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
});

function shutdown(signal: string): void {
  logger.info("Shutting down", { signal });
  engine.stop();
  store.stop();
  void Promise.allSettled([
    stopNotificationWorker(),
    closeNotificationQueue(),
    closeSharedRedis(),
    disconnectPrisma(),
  ]).finally(() => {
    server.close(() => {
      process.exit(0);
    });
  });
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

function isTransientProcessError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes("websocket was closed before the connection was established") ||
    message.includes("socket is not open") ||
    message.includes("socket not ready") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("etimedout") ||
    message.includes("epipe") ||
    message.includes("socket hang up") ||
    message.includes("network socket disconnected") ||
    message.includes("aborted")
  );
}

process.on("unhandledRejection", (reason: unknown) => {
  if (isTransientProcessError(reason)) {
    logger.warn("Unhandled rejection (transient network/WebSocket — continuing)", {
      error: reason instanceof Error ? reason.message : String(reason),
    });
    return;
  }
  logger.error("Unhandled promise rejection", {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on("uncaughtException", (error: Error) => {
  if (isTransientProcessError(error)) {
    logger.warn("Uncaught exception (transient network/WebSocket — continuing)", {
      error: error.message,
    });
    return;
  }
  logger.error("Uncaught exception", {
    error: error.message,
    stack: error.stack,
  });
  // Only fatal / unexpected exceptions tear down the process.
  shutdown("uncaughtException");
});
