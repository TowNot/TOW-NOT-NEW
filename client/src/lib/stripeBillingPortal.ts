import { apiFetch } from "./apiFetch";

/**
 * Ask the server for a Stripe Customer Portal URL (cancel trial, manage card, invoices).
 */
export async function createBillingPortalSession(
  returnPath = "/dashboard",
): Promise<{ url: string }> {
  const response = await apiFetch("/api/create-billing-portal-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnUrl: returnPath }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    url?: string;
    error?: string;
  };

  if (!response.ok || !body.url) {
    throw new Error(body.error || "Unable to open billing portal");
  }

  return { url: body.url };
}

/** Create a billing portal session and redirect the browser to Stripe. */
export async function openStripeBillingPortal(returnPath?: string): Promise<void> {
  const path =
    returnPath ??
    (typeof window !== "undefined"
      ? window.location.pathname.replace(/\/+$/, "") || "/dashboard"
      : "/dashboard");
  const { url } = await createBillingPortalSession(path.startsWith("/") ? path : "/dashboard");
  window.location.assign(url);
}
