import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { config } from "./config";
import type { PushDispatcher } from "./dispatch/pushDispatcher";
import { logger } from "./logger";
import { createIncidentRouter } from "./routes/incidents";
import { healthRouter } from "./routes/health";
import { createPushRouter } from "./routes/push";
import { sourcesRouter } from "./routes/sources";
import type { IncidentStore } from "./store/incidentStore";

export function createApp(store: IncidentStore, dispatcher: PushDispatcher): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: [config.clientOrigin, "http://127.0.0.1:5173"],
      methods: ["GET", "POST", "OPTIONS"],
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", healthRouter);
  app.use("/api/incidents", createIncidentRouter(store));
  app.use("/api/push", createPushRouter(dispatcher));
  app.use("/api/sources", sourcesRouter);

  return app;
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
