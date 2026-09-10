/**
 * POST /api/create-billing-portal-session
 *
 * Opens Stripe Customer Portal so the signed-in driver can cancel a trial,
 * cancel a subscription, or update payment details.
 */
import { getAuth } from "@clerk/express";
import { Router } from "express";
import { config } from "../config";
import { clerkPrimaryEmail } from "../lib/clerkUserEmail";
import { logger } from "../logger";
import { getStripe } from "../stripe/client";
import {
  findSubscriptionByClientReferenceId,
  findSubscriptionByEmail,
} from "../store/subscriptionStore";

export function createBillingPortalSessionRouter(): Router {
  const router = Router();

  router.post("/", async (req, res, next) => {
    try {
      const auth = getAuth(req);
      if (!auth.isAuthenticated || !auth.userId) {
        res.status(401).json({ error: "Unauthorized — sign in required" });
        return;
      }

      const stripe = getStripe();
      if (!stripe) {
        res.status(503).json({ error: "Stripe is not configured" });
        return;
      }

      const email = await clerkPrimaryEmail(auth.userId);
      const existing =
        (await findSubscriptionByClientReferenceId(auth.userId)) ??
        (email ? await findSubscriptionByEmail(email) : null);

      const customerId = existing?.stripeCustomerId?.trim() || null;
      if (!customerId) {
        res.status(404).json({
          error:
            "No Stripe billing account found for this user — subscribe first, then manage billing here.",
        });
        return;
      }

      const origin = config.publicUrl.replace(/\/$/, "");
      const returnUrl =
        typeof req.body?.returnUrl === "string" && req.body.returnUrl.startsWith("/")
          ? `${origin}${req.body.returnUrl}`
          : `${origin}/dashboard`;

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      if (!session.url) {
        res.status(502).json({ error: "Stripe did not return a billing portal URL" });
        return;
      }

      logger.info("Stripe billing portal session created", {
        clerkUserId: auth.userId,
        customerId,
        sessionId: session.id,
      });

      res.json({ url: session.url });
    } catch (error) {
      logger.error("Failed to create Stripe billing portal session", {
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  });

  return router;
}
