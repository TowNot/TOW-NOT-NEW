import { getAuth } from "@clerk/express";
import { Router } from "express";
import { clerkPrimaryEmail } from "../lib/clerkUserEmail";
import {
  findSubscriptionByClientReferenceId,
  findSubscriptionByEmail,
  isClerkUserEntitled,
  isSubscriptionEntitled,
} from "../store/subscriptionStore";

export function createSubscriptionsRouter(): Router {
  const router = Router();

  router.get("/me", async (req, res, next) => {
    try {
      const auth = getAuth(req);
      if (!auth.isAuthenticated || !auth.userId) {
        res.status(401).json({ error: "Unauthorized — sign in required" });
        return;
      }

      const email = await clerkPrimaryEmail(auth.userId);
      const entitled = await isClerkUserEntitled(auth.userId);
      const record =
        (email ? await findSubscriptionByEmail(email) : null) ??
        (await findSubscriptionByClientReferenceId(auth.userId));
      res.json({
        email,
        active: entitled,
        status: record?.status ?? "inactive",
        subscription: record,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/status", async (req, res, next) => {
    try {
      const auth = getAuth(req);
      if (!auth.isAuthenticated || !auth.userId) {
        res.status(401).json({ error: "Unauthorized — sign in required" });
        return;
      }

      const ownEmail = await clerkPrimaryEmail(auth.userId);
      const requested =
        typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
      const email = requested || ownEmail || "";
      if (!email) {
        res.status(400).json({ error: "No email on file for this account" });
        return;
      }
      if (ownEmail && email !== ownEmail) {
        res.status(403).json({ error: "Forbidden — cannot query another user's subscription" });
        return;
      }

      const record = await findSubscriptionByEmail(email);
      res.json({
        email,
        active: await isSubscriptionEntitled(email),
        subscription: record,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
