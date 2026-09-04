/**
 * POST /api/create-checkout-session
 *
 * Server-side Stripe Checkout Sessions (not static Payment Links).
 * Trial is granted only when Prisma says the Clerk user has never used one.
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
  hasClerkUserUsedTrial,
} from "../store/subscriptionStore";

export type CheckoutBillingInterval = "monthly" | "yearly";

function resolvePriceId(billing: CheckoutBillingInterval): string | null {
  const priceId =
    billing === "yearly" ? config.stripePriceYearly : config.stripePriceMonthly;
  return priceId || null;
}

export function createCheckoutSessionRouter(): Router {
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

      const billingRaw =
        typeof req.body?.billing === "string" ? req.body.billing.trim().toLowerCase() : "monthly";
      const billing: CheckoutBillingInterval =
        billingRaw === "yearly" ? "yearly" : "monthly";

      const priceId = resolvePriceId(billing);
      if (!priceId) {
        logger.error("Stripe price id missing for checkout session", { billing });
        res.status(503).json({
          error:
            billing === "yearly"
              ? "STRIPE_PRICE_YEARLY is not configured"
              : "STRIPE_PRICE_MONTHLY is not configured",
        });
        return;
      }

      const email = await clerkPrimaryEmail(auth.userId);
      const trialUsed = await hasClerkUserUsedTrial(auth.userId);
      const grantTrial = !trialUsed && config.stripeTrialDays > 0;

      const existing =
        (await findSubscriptionByClientReferenceId(auth.userId)) ??
        (email ? await findSubscriptionByEmail(email) : null);

      const origin = config.publicUrl.replace(/\/$/, "");
      const successUrl = `${origin}/get-started?checkout=success`;
      const cancelUrl = `${origin}/get-started?checkout=canceled`;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: auth.userId,
        ...(existing?.stripeCustomerId
          ? { customer: existing.stripeCustomerId }
          : email
            ? { customer_email: email }
            : {}),
        metadata: {
          clerkUserId: auth.userId,
          billing,
          trialGranted: grantTrial ? "1" : "0",
        },
        subscription_data: {
          metadata: {
            clerkUserId: auth.userId,
            billing,
          },
          ...(grantTrial ? { trial_period_days: config.stripeTrialDays } : {}),
        },
        allow_promotion_codes: true,
      });

      if (!session.url) {
        res.status(502).json({ error: "Stripe did not return a checkout URL" });
        return;
      }

      logger.info("Stripe Checkout Session created", {
        clerkUserId: auth.userId,
        billing,
        grantTrial,
        trialUsed,
        sessionId: session.id,
      });

      res.json({
        url: session.url,
        sessionId: session.id,
        billing,
        trialGranted: grantTrial,
      });
    } catch (error) {
      logger.error("Failed to create Stripe Checkout Session", {
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  });

  return router;
}
