/** Monthly Payment Link with trial (first-time subscribers). */
export const STRIPE_CHECKOUT_URL_MONTHLY_TRIAL =
  "https://buy.stripe.com/bJedR832lcpJ42p5988Vi03";

/** Monthly Payment Link with no trial (returning subscribers). */
export const STRIPE_CHECKOUT_URL_MONTHLY_NO_TRIAL =
  "https://buy.stripe.com/aFa28q0Ud0H142peJI8Vi04";

/** @deprecated Use STRIPE_CHECKOUT_URL_MONTHLY_TRIAL */
export const STRIPE_CHECKOUT_URL_MONTHLY = STRIPE_CHECKOUT_URL_MONTHLY_TRIAL;

/** Yearly Payment Link. */
export const STRIPE_CHECKOUT_URL_YEARLY =
  "https://buy.stripe.com/28E28q0UdgFZaqN3108Vi02";

/** @deprecated Use STRIPE_CHECKOUT_URL_MONTHLY */
export const DEFAULT_STRIPE_CHECKOUT_URL = STRIPE_CHECKOUT_URL_MONTHLY_TRIAL;

export type BillingInterval = "monthly" | "yearly";

/**
 * Stripe Payment Link for Subscribe / Upgrade.
 * Vite exposes only `VITE_*` vars (this is not Next.js — `NEXT_PUBLIC_*` is ignored).
 */
export function resolveStripeCheckoutUrl(
  billing: BillingInterval = "monthly",
  hasUsedTrial = false,
): string {
  if (billing === "yearly") {
    const fromEnv = import.meta.env.VITE_STRIPE_CHECKOUT_URL_YEARLY?.trim();
    if (fromEnv) return fromEnv;
    return STRIPE_CHECKOUT_URL_YEARLY;
  }
  return hasUsedTrial
    ? STRIPE_CHECKOUT_URL_MONTHLY_NO_TRIAL
    : STRIPE_CHECKOUT_URL_MONTHLY_TRIAL;
}

/** Stripe Payment Link with prefilled email + Clerk user id for webhook matching. */
export function buildStripeCheckoutUrl(options: {
  email?: string | null;
  clientReferenceId?: string | null;
  billing?: BillingInterval;
  hasUsedTrial?: boolean;
}): string {
  const base = resolveStripeCheckoutUrl(
    options.billing ?? "monthly",
    Boolean(options.hasUsedTrial),
  );
  const url = new URL(base);
  const email = options.email?.trim();
  const clientReferenceId = options.clientReferenceId?.trim();
  if (email) url.searchParams.set("prefilled_email", email);
  if (clientReferenceId) url.searchParams.set("client_reference_id", clientReferenceId);
  return url.toString();
}
