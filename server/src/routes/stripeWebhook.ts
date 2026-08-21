import type { Request, Response } from "express";
import type Stripe from "stripe";
import { config } from "../config";
import { getStripe, verifyStripeWebhook } from "../stripe/client";
import { logger } from "../logger";
import {
  activateSubscription,
  revokeSubscription,
} from "../store/subscriptionStore";

function sessionEmail(session: Stripe.Checkout.Session): string | null {
  const fromDetails = session.customer_details?.email?.trim();
  if (fromDetails) return fromDetails;
  const fromSession = session.customer_email?.trim();
  return fromSession || null;
}

function customerIdOf(value: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id;
}

function subscriptionIdOf(value: string | Stripe.Subscription | null): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const email = sessionEmail(session);
  const stripeCustomerId = customerIdOf(session.customer);
  const stripeSubscriptionId = subscriptionIdOf(session.subscription);
  const clientReferenceId = session.client_reference_id?.trim() || null;

  const record = activateSubscription({
    email,
    stripeCustomerId,
    stripeSubscriptionId,
    clientReferenceId,
  });

  logger.info("Stripe checkout completed — subscription active", {
    email: record.email,
    stripeCustomerId: record.stripeCustomerId,
    stripeSubscriptionId: record.stripeSubscriptionId,
    clientReferenceId: record.clientReferenceId,
    sessionId: session.id,
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  let email: string | null = null;
  const stripeCustomerId = customerIdOf(subscription.customer);
  const stripe = getStripe();

  if (stripe && stripeCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(stripeCustomerId);
      if (!customer.deleted && typeof customer.email === "string") {
        email = customer.email;
      }
    } catch (error) {
      logger.warn("Could not load Stripe customer email on subscription.deleted", {
        stripeCustomerId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const record = revokeSubscription({
    email,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
  });

  if (!record) {
    logger.warn("subscription.deleted with no matching local subscriber", {
      stripeCustomerId,
      stripeSubscriptionId: subscription.id,
    });
    return;
  }

  logger.info("Stripe subscription deleted — access revoked", {
    email: record.email,
    stripeCustomerId: record.stripeCustomerId,
    stripeSubscriptionId: record.stripeSubscriptionId,
  });
}

export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  if (!config.stripeWebhookSecret) {
    logger.error("STRIPE_WEBHOOK_SECRET is not configured");
    res.status(503).json({ error: "Stripe webhook is not configured" });
    return;
  }

  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string" || !signature) {
    res.status(400).json({ error: "Missing Stripe-Signature header" });
    return;
  }

  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody)) {
    logger.error("Stripe webhook body is not a Buffer — raw parser missing");
    res.status(500).json({ error: "Webhook raw body unavailable" });
    return;
  }

  let event: Stripe.Event;
  try {
    event = verifyStripeWebhook(rawBody, signature);
  } catch (error) {
    logger.warn("Stripe webhook signature verification failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(400).json({ error: "Invalid Stripe signature" });
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      }
      case "customer.subscription.deleted": {
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      }
      default:
        logger.info("Stripe webhook ignored", { type: event.type, id: event.id });
    }
    res.json({ received: true });
  } catch (error) {
    logger.error("Stripe webhook handler failed", {
      type: event.type,
      id: event.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Webhook handler failed" });
  }
}
