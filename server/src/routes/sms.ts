import { Router } from "express";
import { isTwilioConfigured } from "../sms/twilioClient";
import {
  isTwilioVerifyConfigured,
  sendSmsVerificationCode,
  verifySmsVerificationCode,
} from "../sms/twilioVerify";
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
        verifyConfigured: isTwilioVerifyConfigured(),
        subscribers: await smsSubscriberCount(),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/verify/start", async (req, res) => {
    const phone = typeof req.body?.phone === "string" ? req.body.phone : "";
    try {
      const result = await sendSmsVerificationCode(phone);
      res.status(200).json({ ok: true, phone: result.phone });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send verification code";
      const status = message.includes("not configured") ? 503 : 400;
      res.status(status).json({ error: message });
    }
  });

  router.post("/opt-in", async (req, res) => {
    const phone = typeof req.body?.phone === "string" ? req.body.phone : "";
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const zoneId = typeof req.body?.zoneId === "string" ? req.body.zoneId : undefined;
    try {
      if (!isTwilioVerifyConfigured()) {
        res.status(503).json({ error: "SMS verification is not configured on the server" });
        return;
      }
      const verified = await verifySmsVerificationCode(phone, code);
      const result = await addSmsSubscriber(verified.phone, zoneId);
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
