/** Payment Link used when no Vite env override is set. */
export const DEFAULT_STRIPE_CHECKOUT_URL =
  "https://buy.stripe.com/5kQbJ0eL3ahB6ax6dc8Vi00";

/**
 * Stripe Payment Link for Subscribe / Upgrade.
 * Vite exposes only `VITE_*` vars (this is not Next.js — `NEXT_PUBLIC_*` is ignored).
 */
export function resolveStripeCheckoutUrl(): string {
  const fromEnv = import.meta.env.VITE_STRIPE_CHECKOUT_URL?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_STRIPE_CHECKOUT_URL;
}
