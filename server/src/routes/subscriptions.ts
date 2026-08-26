import { Router } from "express";
import {
  findSubscriptionByEmail,
  isSubscriptionActive,
  listSubscriptions,
  subscriptionStoreStats,
} from "../store/subscriptionStore";

export function createSubscriptionsRouter(): Router {
  const router = Router();

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
        active: await isSubscriptionActive(email),
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
