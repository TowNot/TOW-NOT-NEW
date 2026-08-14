import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import type { IncidentStore } from "../store/incidentStore";
import { logger } from "../logger";

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

  router.get("/", (_req, res) => {
    res.json({ incidents: store.getActive() });
  });

  router.get("/stream", (req: Request, res: Response) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const client: SseClient = { id: nextId++, res };
    clients.add(client);
    logger.debug("SSE client connected", { id: client.id, total: clients.size });

    writeEvent(res, "snapshot", store.getActive());
    const heartbeat = setInterval(() => {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    }, 15_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      clients.delete(client);
      logger.debug("SSE client disconnected", { id: client.id, total: clients.size });
    });
  });

  return router;
}

function broadcast(clients: Set<SseClient>, event: string, data: unknown): void {
  for (const client of clients) {
    writeEvent(client.res, event, data);
  }
}

function writeEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
