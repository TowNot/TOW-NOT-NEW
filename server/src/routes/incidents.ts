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

export function createIncidentRouter(store: IncidentStore): Router {
  const router = createRouter();
  const clients = new Set<SseClient>();
  let nextId = 1;

  store.on("upsert", (incident) => broadcast(clients, "upsert", incident));
  store.on("expire", (incident) => broadcast(clients, "expire", incident));

  router.use(publicLiveFeed);

  router.get("/", (_req, res) => {
    res.json({ incidents: store.getActive() });
  });

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
