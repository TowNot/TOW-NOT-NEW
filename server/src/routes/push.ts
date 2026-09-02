import { Router } from "express";
import type { PushDispatcher } from "../dispatch/pushDispatcher";
import type { PushPayload } from "../types/incident";

export function createPushRouter(dispatcher: PushDispatcher): Router {
  const router = Router();

  router.post("/test", async (_req, res, next) => {
    try {
      const receipt = await dispatcher.sendTest();
      res.status(201).json({ ok: true, receipt });
    } catch (error) {
      next(error);
    }
  });

  router.post("/send", async (req, res, next) => {
    try {
      const payload = req.body as PushPayload;
      if (!payload.zoneId?.trim()) {
        res.status(400).json({ error: "zoneId is required — broadcast pushes are not allowed" });
        return;
      }
      const receipt = await dispatcher.send(payload, "dispatch");
      res.status(201).json({ ok: true, receipt });
    } catch (error) {
      next(error);
    }
  });

  router.get("/recent", (_req, res) => {
    res.json({ receipts: dispatcher.listRecent() });
  });

  return router;
}
