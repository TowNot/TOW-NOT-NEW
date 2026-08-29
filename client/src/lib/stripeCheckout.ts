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

/** Stripe Payment Link with prefilled email + Clerk user id for webhook matching. */
export function buildStripeCheckoutUrl(options: {
  email?: string | null;
  clientReferenceId?: string | null;
}): string {
  const base = resolveStripeCheckoutUrl();
  const url = new URL(base);
  const email = options.email?.trim();
  const clientReferenceId = options.clientReferenceId?.trim();
  if (email) url.searchParams.set("prefilled_email", email);
  if (clientReferenceId) url.searchParams.set("client_reference_id", clientReferenceId);
  return url.toString();
}
