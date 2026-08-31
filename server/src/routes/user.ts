import { clerkClient, getAuth } from "@clerk/express";
import { Router } from "express";
import { isKnownCityId } from "../engine/coverageZones";
import { logger } from "../logger";
import { readSessionTokenFromRequest, SESSION_REPLACED_MESSAGE } from "../lib/sessionToken";
import {
  claimUserSessionToken,
  getUserSelectedCity,
  updateSmsSubscriberSelectedCity,
  updateSubscriptionSelectedCity,
  upsertUserSelectedCity,
  userSessionTokenMatches,
} from "../store/userPreferenceStore";
import { toE164 } from "../sms/e164";

export function createUserRouter(): Router {
  const router = Router();

  router.post("/session/claim", async (req, res, next) => {
    try {
      const auth = getAuth(req);
      if (!auth.isAuthenticated || !auth.userId) {
        res.status(401).json({ error: "Unauthorized — sign in required" });
        return;
      }

      const sessionToken = await claimUserSessionToken(auth.userId);
      res.json({ sessionToken });
    } catch (error) {
      next(error);
    }
  });

  router.get("/session/verify", async (req, res, next) => {
    try {
      const auth = getAuth(req);
      if (!auth.isAuthenticated || !auth.userId) {
        res.status(401).json({ error: "Unauthorized — sign in required" });
        return;
      }

      const presented = readSessionTokenFromRequest(req.headers, req.query.session);
      const valid = await userSessionTokenMatches(auth.userId, presented);
      if (!valid) {
        res.status(409).json({
          code: "session_replaced",
          error: SESSION_REPLACED_MESSAGE,
        });
        return;
      }

      res.json({ valid: true });
    } catch (error) {
      next(error);
    }
  });

  router.get("/city", async (req, res, next) => {
    try {
      const auth = getAuth(req);
      if (!auth.isAuthenticated || !auth.userId) {
        res.status(401).json({ error: "Unauthorized — sign in required" });
        return;
      }

      const selectedCity = await getUserSelectedCity(auth.userId);
      res.json({ selectedCity });
    } catch (error) {
      next(error);
    }
  });

  router.put("/city", async (req, res, next) => {
    try {
      const auth = getAuth(req);
      if (!auth.isAuthenticated || !auth.userId) {
        res.status(401).json({ error: "Unauthorized — sign in required" });
        return;
      }

      const raw =
        typeof req.body?.selectedCity === "string"
          ? req.body.selectedCity
          : typeof req.body?.selectedZoneId === "string"
            ? req.body.selectedZoneId
            : "";
      const selectedCity = raw.trim().toLowerCase();
      if (!isKnownCityId(selectedCity)) {
        res.status(400).json({ error: "Unknown city id", selectedCity: raw });
        return;
      }

      await upsertUserSelectedCity(auth.userId, selectedCity);

      const user = await clerkClient.users.getUser(auth.userId);
      const email = user.emailAddresses.find((entry) => entry.id === user.primaryEmailAddressId)
        ?.emailAddress;
      if (email) {
        await updateSubscriptionSelectedCity(email, selectedCity).catch((error) => {
          logger.debug("Subscription city update skipped", {
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      const phoneRaw =
        user.primaryPhoneNumber?.phoneNumber ??
        user.phoneNumbers.find((entry) => entry.id === user.primaryPhoneNumberId)?.phoneNumber;
      const phone = phoneRaw ? toE164(phoneRaw) : null;
      if (phone) {
        await updateSmsSubscriberSelectedCity(phone, selectedCity).catch((error) => {
          logger.debug("SMS subscriber city update skipped", {
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      const nextMeta = { ...(user.publicMetadata ?? {}), selectedZoneId: selectedCity };
      delete (nextMeta as Record<string, unknown>).pushZoneMode;
      await clerkClient.users.updateUser(auth.userId, {
        publicMetadata: nextMeta,
      });

      res.json({ ok: true, selectedCity });
    } catch (error) {
      logger.warn("Failed to persist selected city", {
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  });

  return router;
}
