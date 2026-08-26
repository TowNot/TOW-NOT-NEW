import { Router } from "express";
import { isTwilioConfigured } from "../sms/twilioClient";
import {
  addSmsSubscriber,
  removeSmsSubscriber,
  smsSubscriberCount,
} from "../sms/subscribers";

export function createSmsRouter(): Router {
  const router = Router();

  router.get("/status", async (_req, res, next) => {
    try {
      res.json({
        configured: isTwilioConfigured(),
        subscribers: await smsSubscriberCount(),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/opt-in", async (req, res) => {
    const phone = typeof req.body?.phone === "string" ? req.body.phone : "";
    const zoneId = typeof req.body?.zoneId === "string" ? req.body.zoneId : undefined;
    try {
      const result = await addSmsSubscriber(phone, zoneId);
      res.status(result.created ? 201 : 200).json({
        ok: true,
        phone: result.phone,
        created: result.created,
        configured: isTwilioConfigured(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save phone number";
      res.status(400).json({ error: message });
    }
  });

  router.delete("/opt-in", async (req, res) => {
    const phone = typeof req.body?.phone === "string" ? req.body.phone : "";
    try {
      const result = await removeSmsSubscriber(phone);
      res.json({ ok: true, phone: result.phone, removed: result.removed });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to remove phone number";
      res.status(400).json({ error: message });
    }
  });

  return router;
}
