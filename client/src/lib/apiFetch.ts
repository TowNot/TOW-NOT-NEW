import {
  clearDeviceSessionToken,
  getDeviceSessionToken,
  SESSION_REPLACED_MESSAGE,
  sessionReplacedRedirectUrl,
  setDeviceSessionToken,
} from "./deviceSession";
import { isSessionTakenOver, markSessionTakenOver } from "./sessionTakeover";

export const SESSION_TOKEN_HEADER = "x-alertnav-session";
export const SESSION_REPLACED_EVENT = "alertnav:session-replaced";

export class SessionReplacedError extends Error {
  constructor(message = SESSION_REPLACED_MESSAGE) {
    super(message);
    this.name = "SessionReplacedError";
  }
}

type ApiFetchInit = RequestInit & {
  skipSessionHeader?: boolean;
};

let pendingClaim: Promise<string | null> | null = null;

export async function claimDeviceSession(): Promise<string | null> {
  const response = await fetch("/api/user/session/claim", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { sessionToken?: string };
  return body.sessionToken?.trim() || null;
}

/** Claim once per tab so entitled API calls always carry the active session token. */
export async function ensureDeviceSession(): Promise<string | null> {
  const existing = getDeviceSessionToken();
  if (existing) return existing;

  if (!pendingClaim) {
    pendingClaim = claimDeviceSession()
      .then((token) => {
        if (token) setDeviceSessionToken(token);
        return token;
      })
      .finally(() => {
        pendingClaim = null;
      });
  }

  return pendingClaim;
}

function notifySessionReplaced(): void {
  markSessionTakenOver();
  window.dispatchEvent(new Event(SESSION_REPLACED_EVENT));
}

export async function apiFetch(input: RequestInfo | URL, init: ApiFetchInit = {}): Promise<Response> {
  if (isSessionTakenOver() && !init.skipSessionHeader) {
    throw new SessionReplacedError();
  }

  const headers = new Headers(init.headers);
  if (!init.skipSessionHeader) {
    await ensureDeviceSession();
    const token = getDeviceSessionToken();
    if (token) headers.set(SESSION_TOKEN_HEADER, token);
  }

  const response = await fetch(input, {
    ...init,
    credentials: init.credentials ?? "include",
    headers,
  });

  if (response.status === 409) {
    try {
      const body = (await response.clone().json()) as { code?: string };
      if (body.code === "session_replaced") {
        notifySessionReplaced();
        throw new SessionReplacedError();
      }
    } catch (error) {
      if (error instanceof SessionReplacedError) throw error;
    }
  }

  return response;
}

export async function verifyDeviceSession(): Promise<boolean> {
  try {
    const response = await apiFetch("/api/user/session/verify");
    return response.ok;
  } catch (error) {
    if (error instanceof SessionReplacedError) return false;
    return false;
  }
}

export function handleSessionReplaced(signOut: (() => Promise<void>) | (() => void)): void {
  clearDeviceSessionToken();
  void Promise.resolve(signOut()).finally(() => {
    window.location.replace(sessionReplacedRedirectUrl());
  });
}

export function incidentStreamUrl(): string {
  const token = getDeviceSessionToken();
  if (!token) return "/api/incidents/stream";
  const params = new URLSearchParams({ session: token });
  return `/api/incidents/stream?${params.toString()}`;
}

/** Same-origin media URLs cannot set x-alertnav-session; pass the token as `?session=`. */
export function withDeviceSessionQuery(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  const token = getDeviceSessionToken();
  if (!token) return trimmed;
  const origin = typeof window !== "undefined" ? window.location.origin : "https://alertnav.com";
  const url = trimmed.startsWith("http") ? new URL(trimmed) : new URL(trimmed, origin);
  url.searchParams.set("session", token);
  return trimmed.startsWith("http") ? url.toString() : `${url.pathname}${url.search}`;
}
