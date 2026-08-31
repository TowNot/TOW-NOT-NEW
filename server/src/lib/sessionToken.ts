import { randomUUID } from "node:crypto";

export const SESSION_TOKEN_HEADER = "x-alertnav-session";

export const SESSION_REPLACED_MESSAGE =
  "Your account was logged in from another device.";

export function generateSessionToken(): string {
  return randomUUID();
}

export function readSessionTokenFromRequest(
  headers: Record<string, string | string[] | undefined>,
  querySession: unknown,
): string | null {
  const header = headers[SESSION_TOKEN_HEADER];
  if (typeof header === "string" && header.trim()) return header.trim();
  if (Array.isArray(header)) {
    const first = header.find((value) => typeof value === "string" && value.trim());
    if (first) return first.trim();
  }
  if (typeof querySession === "string" && querySession.trim()) {
    return querySession.trim();
  }
  return null;
}
