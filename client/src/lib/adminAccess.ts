/** Comma-separated admin emails — can open the live road-alerts desk in production. */
export function parseAdminEmails(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

const ADMIN_EMAILS = parseAdminEmails(import.meta.env.VITE_ADMIN_EMAILS);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.trim().toLowerCase());
}

/** Local Vite dev — always allow the desk so map thumbnails and filters are testable. */
export function isLocalDeskHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

export function canAccessDesk(email: string | null | undefined): boolean {
  if (isLocalDeskHost()) return true;
  return isAdminEmail(email);
}
