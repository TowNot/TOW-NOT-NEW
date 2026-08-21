/**
 * Resolve Clerk publishable key without crashing the app.
 * Prefer Vite build-time env; fall back to a runtime inject from Express
 * (`window.__CLERK_PUBLISHABLE_KEY__`) so Railway can set CLERK_PUBLISHABLE_KEY
 * without a separate VITE_ build arg.
 */
export function resolveClerkPublishableKey(): string {
  const fromVite = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() ?? "";
  if (isClerkPublishableKey(fromVite)) return fromVite;

  const fromWindow =
    typeof window !== "undefined" ? window.__CLERK_PUBLISHABLE_KEY__?.trim() ?? "" : "";
  if (isClerkPublishableKey(fromWindow)) return fromWindow;

  return "";
}

export function isClerkPublishableKey(value: string): boolean {
  return /^pk_(test|live)_[A-Za-z0-9]+/.test(value.trim());
}

export function isClerkConfigured(): boolean {
  return Boolean(resolveClerkPublishableKey());
}
