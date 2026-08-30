import { getAuth } from "@clerk/express";
import { Router } from "express";
import { clerkPrimaryEmail } from "../lib/clerkUserEmail";
import {
  findSubscriptionByEmail,
  isEntitledSubscriptionStatus,
  isSubscriptionEntitled,
  listSubscriptions,
  subscriptionStoreStats,
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
      if (!email) {
        res.json({ active: false, status: "inactive", email: null });
        return;
      }

      const record = await findSubscriptionByEmail(email);
      const entitled = isEntitledSubscriptionStatus(record?.status);
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
      const email = typeof req.query.email === "string" ? req.query.email.trim() : "";
      if (!email) {
        res.status(400).json({ error: "Query param email is required" });
        return;
      }
      const record = await findSubscriptionByEmail(email);
      res.json({
        email: email.trim().toLowerCase(),
        active: await isSubscriptionEntitled(email),
        subscription: record,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/summary", async (_req, res, next) => {
    try {
      const stats = await subscriptionStoreStats();
      const sample = (await listSubscriptions())
        .slice(0, 5)
        .map((row) => ({
          email: row.email.replace(/(^.).*(@.*$)/, "$1***$2"),
          status: row.status,
          updatedAt: row.updatedAt,
        }));
      res.json({
        ...stats,
        sample,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
