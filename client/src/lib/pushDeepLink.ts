/**
 * When iOS opens the PWA on `/` instead of the Progressier notification URL,
 * recover a recently stashed deep-link from the service worker Cache Storage.
 */

const LAST_PUSH_CACHE = "alertnav-push-nav";
const LAST_PUSH_REQ = "/__alertnav_last_push_url";
/** Only honor a push deep-link if it arrived within this window. */
const MAX_AGE_MS = 3 * 60 * 1000;

export async function consumeRecentPushDeepLink(): Promise<string | null> {
  if (typeof window === "undefined" || !("caches" in window)) return null;
  try {
    const cache = await caches.open(LAST_PUSH_CACHE);
    const match = await cache.match(LAST_PUSH_REQ);
    if (!match) return null;
    await cache.delete(LAST_PUSH_REQ);
    const raw = await match.json() as { url?: string; at?: number };
    const url = typeof raw.url === "string" ? raw.url.trim() : "";
    const at = typeof raw.at === "number" ? raw.at : 0;
    if (!url || !at || Date.now() - at > MAX_AGE_MS) return null;
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin !== window.location.origin) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
