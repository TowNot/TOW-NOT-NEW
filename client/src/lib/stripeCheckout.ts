/** TEMP: 1-day Stripe test Payment Link (replaces live $59.99 monthly). */
export const STRIPE_CHECKOUT_URL_MONTHLY =
  "https://buy.stripe.com/bJedR832lcpJ42p5988Vi03";

/** Yearly Payment Link. */
export const STRIPE_CHECKOUT_URL_YEARLY =
  "https://buy.stripe.com/28E28q0UdgFZaqN3108Vi02";

/** @deprecated Use STRIPE_CHECKOUT_URL_MONTHLY */
export const DEFAULT_STRIPE_CHECKOUT_URL = STRIPE_CHECKOUT_URL_MONTHLY;

export type BillingInterval = "monthly" | "yearly";

/**
 * Stripe Payment Link for Subscribe / Upgrade.
 * Vite exposes only `VITE_*` vars (this is not Next.js — `NEXT_PUBLIC_*` is ignored).
 */
export function resolveStripeCheckoutUrl(billing: BillingInterval = "monthly"): string {
  if (billing === "yearly") {
    const fromEnv = import.meta.env.VITE_STRIPE_CHECKOUT_URL_YEARLY?.trim();
    if (fromEnv) return fromEnv;
    return STRIPE_CHECKOUT_URL_YEARLY;
  }
  // TEMP: ignore VITE_STRIPE_CHECKOUT_URL so a stale Railway env cannot keep the $59.99 link live.
  return STRIPE_CHECKOUT_URL_MONTHLY;
}

/** Stripe Payment Link with prefilled email + Clerk user id for webhook matching. */
export function buildStripeCheckoutUrl(options: {
  email?: string | null;
  clientReferenceId?: string | null;
  billing?: BillingInterval;
}): string {
  const base = resolveStripeCheckoutUrl(options.billing ?? "monthly");
  const url = new URL(base);
  const email = options.email?.trim();
  const clientReferenceId = options.clientReferenceId?.trim();
  if (email) url.searchParams.set("prefilled_email", email);
  if (clientReferenceId) url.searchParams.set("client_reference_id", clientReferenceId);
  return url.toString();
}
