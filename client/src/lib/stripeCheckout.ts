import { apiFetch } from "./apiFetch";

/** Billing interval for Stripe Checkout Sessions. */
export type BillingInterval = "monthly" | "yearly";

/**
 * Ask the server for a Stripe Checkout Session URL.
 * Trial eligibility is enforced in Prisma on the backend — never trust the client.
 */
export async function createCheckoutSession(
  billing: BillingInterval = "monthly",
): Promise<{ url: string; trialGranted: boolean }> {
  const response = await apiFetch("/api/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ billing }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    url?: string;
    trialGranted?: boolean;
    error?: string;
  };

  if (!response.ok || !body.url) {
    throw new Error(body.error || "Unable to start checkout");
  }

  return {
    url: body.url,
    trialGranted: Boolean(body.trialGranted),
  };
}

/** Create a Checkout Session and redirect the browser to Stripe. */
export async function startStripeCheckout(billing: BillingInterval = "monthly"): Promise<void> {
  const { url } = await createCheckoutSession(billing);
  window.location.assign(url);
}
