import { existsSync } from "node:fs";
import path from "node:path";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { ensureAudioDir, resolveAudioRoot } from "./audioStorage";
import { config } from "./config";
import type { PushDispatcher } from "./dispatch/pushDispatcher";
import { logger } from "./logger";
import { createIncidentRouter } from "./routes/incidents";
import { healthRouter } from "./routes/health";
import { createPushRouter } from "./routes/push";
import { createSmsRouter } from "./routes/sms";
import { createSourcesRouter } from "./routes/sources";
import type { IncidentStore } from "./store/incidentStore";

export function createApp(store: IncidentStore, dispatcher: PushDispatcher): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: false,
      // Same-origin CORP can block EventSource when the desk is opened from
      // a preview origin; live feed endpoints must stay readable.
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(
    cors({
      origin: [config.clientOrigin, "http://127.0.0.1:5173"],
      methods: ["GET", "POST", "DELETE", "OPTIONS"],
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  ensureAudioDir();
  app.use(
    "/audio",
    express.static(resolveAudioRoot(), {
      index: false,
      maxAge: "1h",
      setHeaders(res) {
        res.setHeader("Cache-Control", "public, max-age=3600");
      },
    }),
  );

  // Health + incident snapshot/SSE are mounted with no auth or Stripe gate.
  app.use("/api", healthRouter);
  app.use("/api/incidents", createIncidentRouter(store));
  app.use("/api/push", createPushRouter(dispatcher));
  app.use("/api/sms", createSmsRouter());
  app.use("/api/sources", createSourcesRouter(store));

  return app;
}

function resolveClientDist(): string | undefined {
  const candidates = [
    path.join(__dirname, "public"),
    path.join(__dirname, "../public"),
    path.join(__dirname, "../../client/dist"),
    path.join(process.cwd(), "dist/public"),
    path.join(process.cwd(), "server/dist/public"),
    path.join(process.cwd(), "client/dist"),
    path.join(process.cwd(), "../client/dist"),
  ];
  return candidates.find((dir) => existsSync(path.join(dir, "index.html")));
}

export function applyClientAssets(app: express.Express): void {
  const clientDist = resolveClientDist();
  if (!clientDist) {
    logger.error("Client build not found; GET / will 404 until client/dist is built", {
      cwd: process.cwd(),
      dirname: __dirname,
    });
    return;
  }

  logger.info("Serving client assets", { clientDist });

  const indexFile = path.join(clientDist, "index.html");
  const sendIndex = (_req: Request, res: Response, next: NextFunction): void => {
    res.sendFile(indexFile, (error) => {
      if (error) next(error);
    });
  };

  app.use(
    express.static(clientDist, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith("progressier.js")) {
          res.setHeader("Content-Type", "application/javascript; charset=utf-8");
          res.setHeader("Service-Worker-Allowed", "/");
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        }
      },
    }),
  );

  app.get("/", sendIndex);
  app.get(/^\/(?!api(?:\/|$)|progressier\.js$|audio\/).*/, (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    if (path.extname(req.path)) {
      next();
      return;
    }
    sendIndex(req, res, next);
  });
}

export function applyTerminalHandlers(app: express.Express): void {
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : "Internal server error";
    logger.error("Request failed", { message });
    const status = message.includes("requires") ? 400 : 500;
    res.status(status).json({ error: message });
  });
}
