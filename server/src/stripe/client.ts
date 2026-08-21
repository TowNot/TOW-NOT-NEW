import Stripe from "stripe";
import { config } from "../config";

let stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!config.stripeSecretKey) return null;
  if (!stripe) {
    stripe = new Stripe(config.stripeSecretKey, {
      apiVersion: "2026-07-29.dahlia",
    });
  }
  return stripe;
}

/** Verify webhook signature — only needs STRIPE_WEBHOOK_SECRET. */
export function verifyStripeWebhook(rawBody: Buffer, signature: string): Stripe.Event {
  if (!config.stripeWebhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  return Stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
}
