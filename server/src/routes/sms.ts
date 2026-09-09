import { getAuth } from "@clerk/express";
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
  updateSmsAlertPreferences,
  type SmsAlertPreferences,
} from "../sms/subscribers";

/** Per Clerk user: limit Twilio Verify sends (cost / abuse). */
const VERIFY_WINDOW_MS = 60 * 60 * 1000;
const VERIFY_MAX_PER_WINDOW = 5;
const verifySendLog = new Map<string, number[]>();

function assertSmsVerifyRateLimit(clerkUserId: string): void {
  const now = Date.now();
  const recent = (verifySendLog.get(clerkUserId) ?? []).filter((t) => now - t < VERIFY_WINDOW_MS);
  if (recent.length >= VERIFY_MAX_PER_WINDOW) {
    throw new Error("Too many verification texts — try again in an hour");
  }
  recent.push(now);
  verifySendLog.set(clerkUserId, recent);
}

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
    const auth = getAuth(req);
    const userId = auth.userId?.trim() ?? "";
    if (!userId) {
      res.status(401).json({ error: "Unauthorized — sign in required" });
      return;
    }

    const phone = typeof req.body?.phone === "string" ? req.body.phone : "";
    try {
      assertSmsVerifyRateLimit(userId);
      const result = await sendSmsVerificationCode(phone);
      res.status(200).json({ ok: true, phone: result.phone });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send verification code";
      const status = message.includes("not configured")
        ? 503
        : message.includes("Too many")
          ? 429
          : 400;
      res.status(status).json({ error: message });
    }
  });

  router.post("/opt-in", async (req, res) => {
    const auth = getAuth(req);
    const userId = auth.userId?.trim() ?? "";
    if (!userId) {
      res.status(401).json({ error: "Unauthorized — sign in required" });
      return;
    }

    const phone = typeof req.body?.phone === "string" ? req.body.phone : "";
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const zoneId = typeof req.body?.zoneId === "string" ? req.body.zoneId : undefined;
    const alertPrefs = req.body?.alertPreferences as Partial<SmsAlertPreferences> | undefined;
    try {
      let verifiedPhone = phone;
      if (isTwilioVerifyConfigured()) {
        const verified = await verifySmsVerificationCode(phone, code);
        verifiedPhone = verified.phone;
      }
      const result = await addSmsSubscriber(verifiedPhone, zoneId, alertPrefs, userId);
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

  /** Keep SMS category toggles in sync with Live Desk / Progressier preferences. */
  router.put("/preferences", async (req, res) => {
    const auth = getAuth(req);
    const userId = auth.userId?.trim() ?? "";
    if (!userId) {
      res.status(401).json({ error: "Unauthorized — sign in required" });
      return;
    }

    const phone = typeof req.body?.phone === "string" ? req.body.phone : "";
    const alertPrefs = req.body?.alertPreferences as Partial<SmsAlertPreferences> | undefined;
    if (!alertPrefs || typeof alertPrefs !== "object") {
      res.status(400).json({ error: "alertPreferences is required" });
      return;
    }
    try {
      const result = await updateSmsAlertPreferences(phone, alertPrefs, userId);
      res.json({ ok: true, phone: result.phone, alertPreferences: result.prefs });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update SMS preferences";
      res.status(400).json({ error: message });
    }
  });

  router.delete("/opt-in", async (req, res) => {
    const auth = getAuth(req);
    const userId = auth.userId?.trim() ?? "";
    if (!userId) {
      res.status(401).json({ error: "Unauthorized — sign in required" });
      return;
    }

    const phone = typeof req.body?.phone === "string" ? req.body.phone : "";
    try {
      const result = await removeSmsSubscriber(phone, userId);
      res.json({ ok: true, phone: result.phone, removed: result.removed });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to remove phone number";
      res.status(400).json({ error: message });
    }
  });

  return router;
}
