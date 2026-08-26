import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { publicLiveFeed } from "../middleware/liveFeedAccess";
import type { IncidentStore } from "../store/incidentStore";
import { logger } from "../logger";
import type { Incident } from "../types/incident";

interface SseClient {
  id: number;
  res: Response;
}

/** Short TTL cache so concurrent desk polls reuse one serialized payload. */
const ACTIVE_INCIDENTS_CACHE_MS = 2_500;

export function createIncidentRouter(store: IncidentStore): Router {
  const router = createRouter();
  const clients = new Set<SseClient>();
  let nextId = 1;
  let activeListCache: { body: string; at: number } | null = null;

  const invalidateActiveCache = (): void => {
    activeListCache = null;
  };

  store.on("upsert", (incident) => {
    invalidateActiveCache();
    broadcast(clients, "upsert", incident);
  });
  store.on("expire", (incident) => {
    invalidateActiveCache();
    broadcast(clients, "expire", incident);
  });

  router.use(publicLiveFeed);

  const sendActiveIncidents = (_req: Request, res: Response): void => {
    const now = Date.now();
    if (!activeListCache || now - activeListCache.at >= ACTIVE_INCIDENTS_CACHE_MS) {
      activeListCache = {
        body: JSON.stringify({ incidents: store.getActive() }),
        at: now,
      };
    }
    res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
    res.type("json").send(activeListCache.body);
  };

  router.get("/", sendActiveIncidents);
  router.get("/active", sendActiveIncidents);

  router.get("/stream", (req: Request, res: Response) => {
    req.socket.setTimeout(0);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    const client: SseClient = { id: nextId++, res };
    clients.add(client);
    logger.info("SSE client connected", { id: client.id, total: clients.size });

    writeEvent(res, "snapshot", store.getActive());
    const heartbeat = setInterval(() => {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    }, 15_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      clients.delete(client);
      logger.info("SSE client disconnected", { id: client.id, total: clients.size });
    });
    req.on("error", (error) => {
      clearInterval(heartbeat);
      clients.delete(client);
      logger.warn("SSE client error", {
        id: client.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });

  return router;
}

function broadcast(clients: Set<SseClient>, event: string, data: unknown): void {
  const incident = data as Incident | undefined;
  logger.debug("[BROADCAST] Sending incident to client...", {
    event,
    clients: clients.size,
    id: incident?.id,
    title: incident?.title,
    source: incident?.source,
  });
  for (const client of clients) {
    writeEvent(client.res, event, data);
  }
}

function writeEvent(res: Response, event: string, data: unknown): void {
  if (res.writableEnded || res.destroyed) return;
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (error) {
    logger.debug("SSE write failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
