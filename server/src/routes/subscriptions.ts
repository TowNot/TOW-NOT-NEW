import { Router } from "express";
import {
  findSubscriptionByEmail,
  isSubscriptionActive,
  listSubscriptions,
  subscriptionStoreStats,
} from "../store/subscriptionStore";

export function createSubscriptionsRouter(): Router {
  const router = Router();

  router.get("/status", (req, res) => {
    const email = typeof req.query.email === "string" ? req.query.email.trim() : "";
    if (!email) {
      res.status(400).json({ error: "Query param email is required" });
      return;
    }
    const record = findSubscriptionByEmail(email);
    res.json({
      email: email.trim().toLowerCase(),
      active: isSubscriptionActive(email),
      subscription: record,
    });
  });

  router.get("/summary", (_req, res) => {
    res.json({
      ...subscriptionStoreStats(),
      // Emails only in summary counts — no PII dump on public status.
      sample: listSubscriptions()
        .slice(0, 5)
        .map((row) => ({
          email: row.email.replace(/(^.).*(@.*$)/, "$1***$2"),
          status: row.status,
          updatedAt: row.updatedAt,
        })),
    });
  });

  return router;
}
