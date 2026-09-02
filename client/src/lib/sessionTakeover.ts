import { useSyncExternalStore } from "react";
import { clearDeviceSessionToken } from "./deviceSession";

const SESSION_TAKEN_OVER_EVENT = "alertnav:session-taken-over";

let takenOver = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
  window.dispatchEvent(new Event(SESSION_TAKEN_OVER_EVENT));
}

export function isSessionTakenOver(): boolean {
  return takenOver;
}

export function markSessionTakenOver(): void {
  if (takenOver) return;
  takenOver = true;
  clearDeviceSessionToken();
  emit();
}

export function clearSessionTakenOver(): void {
  if (!takenOver) return;
  takenOver = false;
  emit();
}

export function subscribeSessionTakeover(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React subscription for the Spotify-style desk lockout. */
export function useSessionTakeover(): boolean {
  return useSyncExternalStore(subscribeSessionTakeover, isSessionTakenOver, () => false);
}

export { SESSION_TAKEN_OVER_EVENT };
