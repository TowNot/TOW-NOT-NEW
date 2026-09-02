import { useAuth, useClerk } from "@clerk/clerk-react";
import { useEffect } from "react";
import {
  ensureDeviceSession,
  handleSessionReplaced,
  SESSION_REPLACED_EVENT,
  verifyDeviceSession,
} from "../lib/apiFetch";
import { clearDeviceSessionToken } from "../lib/deviceSession";
import { isClerkConfigured } from "../lib/clerkKey";
import { isProtectedDeskPath } from "../lib/protectedRoutes";
import { isSessionTakenOver, markSessionTakenOver } from "../lib/sessionTakeover";

const VERIFY_INTERVAL_MS = 15_000;

function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

/**
 * Claim a single active session on login; poll so other devices are signed out.
 * On the desk, lock the UI in place (Spotify model) instead of hard-redirecting.
 */
export function useDeviceSessionTakeover(): void {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();

  useEffect(() => {
    if (!isClerkConfigured() || !isLoaded) return;

    if (!isSignedIn) {
      clearDeviceSessionToken();
      return;
    }

    let cancelled = false;

    void ensureDeviceSession();

    const onSessionReplaced = () => {
      if (cancelled) return;
      markSessionTakenOver();
      // Desk stays put with the lockout modal; elsewhere redirect quietly.
      if (!isProtectedDeskPath(currentPath())) {
        handleSessionReplaced(() => signOut());
      }
    };
    window.addEventListener(SESSION_REPLACED_EVENT, onSessionReplaced);

    const timer = window.setInterval(() => {
      if (cancelled || isSessionTakenOver()) return;
      void verifyDeviceSession().then((valid) => {
        if (!valid && !cancelled) onSessionReplaced();
      });
    }, VERIFY_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener(SESSION_REPLACED_EVENT, onSessionReplaced);
      window.clearInterval(timer);
    };
  }, [isLoaded, isSignedIn, signOut]);
}
