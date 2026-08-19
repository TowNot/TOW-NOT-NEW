import { Router } from "express";
import { isTwilioConfigured } from "../sms/twilioClient";
import {
  addSmsSubscriber,
  removeSmsSubscriber,
  smsSubscriberCount,
} from "../sms/subscribers";

export function createSmsRouter(): Router {
  const router = Router();

  router.get("/status", (_req, res) => {
    res.json({
      configured: isTwilioConfigured(),
      subscribers: smsSubscriberCount(),
    });
  });

  router.post("/opt-in", (req, res) => {
    const phone = typeof req.body?.phone === "string" ? req.body.phone : "";
    try {
      const result = addSmsSubscriber(phone);
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

  router.delete("/opt-in", (req, res) => {
    const phone = typeof req.body?.phone === "string" ? req.body.phone : "";
    try {
      const result = removeSmsSubscriber(phone);
      res.json({ ok: true, phone: result.phone, removed: result.removed });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to remove phone number";
      res.status(400).json({ error: message });
    }
  });

  return router;
}
