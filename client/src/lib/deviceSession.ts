export const DEVICE_SESSION_STORAGE_KEY = "alertnav-device-session-token";
export const SESSION_REPLACED_QUERY = "session_replaced";
export const SESSION_REPLACED_MESSAGE =
  "Your account was logged in from another device.";

export function getDeviceSessionToken(): string | null {
  try {
    return localStorage.getItem(DEVICE_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setDeviceSessionToken(token: string): void {
  try {
    localStorage.setItem(DEVICE_SESSION_STORAGE_KEY, token);
  } catch {
    // Ignore storage failures (private mode).
  }
}

export function clearDeviceSessionToken(): void {
  try {
    localStorage.removeItem(DEVICE_SESSION_STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

export function sessionReplacedRedirectUrl(): string {
  const url = new URL(window.location.origin);
  url.pathname = "/";
  url.searchParams.set(SESSION_REPLACED_QUERY, "1");
  return url.toString();
}

export function readSessionReplacedFromUrl(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get(SESSION_REPLACED_QUERY) === "1";
}

export function clearSessionReplacedFromUrl(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(SESSION_REPLACED_QUERY)) return;
  url.searchParams.delete(SESSION_REPLACED_QUERY);
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}
