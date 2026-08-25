import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { clerkMiddleware } from "@clerk/express";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { ensureAudioDir, resolveAudioRoot } from "./audioStorage";
import { config } from "./config";
import type { PushDispatcher } from "./dispatch/pushDispatcher";
import { logger } from "./logger";
import { requireClerkAuth } from "./middleware/requireClerkAuth";
import { createIncidentRouter } from "./routes/incidents";
import { healthRouter } from "./routes/health";
import { createPushRouter } from "./routes/push";
import { createSmsRouter } from "./routes/sms";
import { createSourcesRouter } from "./routes/sources";
import { createSubscriptionsRouter } from "./routes/subscriptions";
import { createMeRouter } from "./routes/me";
import { stripeWebhookHandler } from "./routes/stripeWebhook";
import type { IncidentStore } from "./store/incidentStore";

export function createApp(store: IncidentStore, dispatcher: PushDispatcher): express.Express {
  const app = express();

  app.disable("x-powered-by");

  // Clerk must run before other middleware so `getAuth()` / requireClerkAuth work.
  app.use(
    clerkMiddleware({
      publishableKey: config.clerkPublishableKey || undefined,
      secretKey: config.clerkSecretKey || undefined,
      authorizedParties: [
        config.publicUrl,
        config.clientOrigin,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ].filter((origin, index, list) => Boolean(origin) && list.indexOf(origin) === index),
    }),
  );

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
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    }),
  );

  // Stripe needs the raw body for signature verification — mount before json().
  // Webhook stays public (Stripe signs with its own secret).
  app.post(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json" }),
    (req, res, next) => {
      void stripeWebhookHandler(req, res).catch(next);
    },
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

  // Health + incident snapshot/SSE stay public (EventSource cannot send Bearer tokens).
  app.use("/api", healthRouter);
  app.use("/api/incidents", createIncidentRouter(store));
  app.use("/api/sources", createSourcesRouter(store));

  // Authenticated API surfaces
  app.use("/api/push", requireClerkAuth, createPushRouter(dispatcher));
  app.use("/api/sms", requireClerkAuth, createSmsRouter());
  app.use("/api/subscriptions", requireClerkAuth, createSubscriptionsRouter());
  app.use("/api/me", requireClerkAuth, createMeRouter());

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
  const indexTemplate = readFileSync(indexFile, "utf8");

  const sendIndex = (_req: Request, res: Response, next: NextFunction): void => {
    try {
      const scripts: string[] = [];
      const clerkKey = config.clerkPublishableKey;
      if (clerkKey && /^pk_(test|live)_/.test(clerkKey)) {
        scripts.push(
          `<script>window.__CLERK_PUBLISHABLE_KEY__=${JSON.stringify(clerkKey)};</script>`,
        );
      }
      const mapsKey = config.googleMapsApiKey;
      if (mapsKey) {
        scripts.push(
          `<script>window.__GOOGLE_MAPS_API_KEY__=${JSON.stringify(mapsKey)};</script>`,
        );
      }
      const inject = scripts.join("");
      const html = inject
        ? indexTemplate.replace(/<head([^>]*)>/i, `<head$1>${inject}`)
        : indexTemplate;
      res.type("html").send(html);
    } catch (error) {
      next(error);
    }
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
