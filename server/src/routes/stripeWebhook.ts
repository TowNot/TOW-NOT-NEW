/**
 * POST /api/webhooks/stripe
 *
 * Verifies Stripe signatures against STRIPE_WEBHOOK_SECRET (raw body required).
 * Persists subscription state in Postgres keyed by checkout email + Stripe ids.
 */
import type { Request, Response } from "express";
import type Stripe from "stripe";
import { config } from "../config";
import { clerkPrimaryEmail } from "../lib/clerkUserEmail";
import { getStripe, verifyStripeWebhook } from "../stripe/client";
import { logger } from "../logger";
import {
  activateSubscription,
  isEntitledSubscriptionStatus,
  revokeSubscription,
  updateSubscriptionStatus,
  type SubscriptionStatus,
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

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subscription = invoice.parent?.subscription_details?.subscription ?? null;
  return subscriptionIdOf(subscription);
}

function localStatusFromStripe(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
  if (stripeStatus === "active") return "active";
  if (stripeStatus === "trialing") return "trialing";
  // Cancel-on-failure (0 retries): treat unpaid / past_due as revoked immediately.
  if (
    stripeStatus === "canceled" ||
    stripeStatus === "incomplete_expired" ||
    stripeStatus === "past_due" ||
    stripeStatus === "unpaid" ||
    stripeStatus === "paused" ||
    stripeStatus === "incomplete"
  ) {
    return "canceled";
  }
  return "canceled";
}

async function stripeCustomerEmail(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const stripe = getStripe();
  if (!stripe) return null;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer.deleted && typeof customer.email === "string") {
      return customer.email;
    }
  } catch (error) {
    logger.warn("Could not load Stripe customer email", {
      customerId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return null;
}

async function resolveCheckoutEmail(session: Stripe.Checkout.Session): Promise<string | null> {
  const fromSession = sessionEmail(session);
  if (fromSession) return fromSession;

  const clientReferenceId = session.client_reference_id?.trim();
  if (clientReferenceId) {
    try {
      const clerkEmail = await clerkPrimaryEmail(clientReferenceId);
      if (clerkEmail) return clerkEmail;
    } catch (error) {
      logger.warn("Could not resolve checkout email from Clerk client_reference_id", {
        clientReferenceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return stripeCustomerEmail(customerIdOf(session.customer));
}

async function resolveCheckoutStatus(
  stripeSubscriptionId: string | null,
): Promise<SubscriptionStatus> {
  if (!stripeSubscriptionId) return "active";
  const stripe = getStripe();
  if (!stripe) return "active";
  try {
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    return localStatusFromStripe(subscription.status);
  } catch (error) {
    logger.warn("Could not load Stripe subscription on checkout — defaulting to active", {
      stripeSubscriptionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return "active";
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const email = await resolveCheckoutEmail(session);
  const stripeCustomerId = customerIdOf(session.customer);
  const stripeSubscriptionId = subscriptionIdOf(session.subscription);
  const clientReferenceId = session.client_reference_id?.trim() || null;
  const status = await resolveCheckoutStatus(stripeSubscriptionId);

  const record = await activateSubscription({
    email,
    stripeCustomerId,
    stripeSubscriptionId,
    clientReferenceId,
    status,
  });

  logger.info("Stripe checkout completed — subscription entitled", {
    email: record.email,
    status: record.status,
    stripeCustomerId: record.stripeCustomerId,
    stripeSubscriptionId: record.stripeSubscriptionId,
    clientReferenceId: record.clientReferenceId,
    sessionId: session.id,
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const stripeCustomerId = customerIdOf(subscription.customer);
  const email = await stripeCustomerEmail(stripeCustomerId);
  const status = localStatusFromStripe(subscription.status);

  if (isEntitledSubscriptionStatus(status)) {
    const record = await activateSubscription({
      email,
      stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      status,
    });
    logger.info("Stripe subscription updated — access synced", {
      email: record.email,
      stripeStatus: subscription.status,
      localStatus: record.status,
    });
    return;
  }

  const record = await updateSubscriptionStatus({
    email,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    status,
  });

  if (record) {
    logger.info("Stripe subscription updated — access downgraded", {
      email: record.email,
      stripeStatus: subscription.status,
      localStatus: record.status,
    });
  } else {
    logger.warn("Stripe subscription updated — no matching local subscriber", {
      stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      stripeStatus: subscription.status,
    });
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const stripeCustomerId = customerIdOf(subscription.customer);
  const email = await stripeCustomerEmail(stripeCustomerId);

  const record = await revokeSubscription({
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

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const stripeCustomerId = customerIdOf(invoice.customer);
  const stripeSubscriptionId = invoiceSubscriptionId(invoice);
  const email = await stripeCustomerEmail(stripeCustomerId);

  // Stripe is configured to cancel on failure with 0 retries — revoke access immediately.
  const record = await updateSubscriptionStatus({
    email,
    stripeCustomerId,
    stripeSubscriptionId,
    status: "canceled",
  });

  if (record) {
    logger.info("Stripe invoice payment failed — access revoked (canceled)", {
      email: record.email,
      invoiceId: invoice.id,
      stripeSubscriptionId: record.stripeSubscriptionId,
      localStatus: record.status,
    });
  } else {
    logger.warn("invoice.payment_failed with no matching local subscriber", {
      stripeCustomerId,
      stripeSubscriptionId,
      invoiceId: invoice.id,
    });
  }
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
      case "customer.subscription.updated": {
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      }
      case "customer.subscription.deleted": {
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      }
      case "invoice.payment_failed": {
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
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
