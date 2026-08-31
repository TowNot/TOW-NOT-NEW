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

const VERIFY_INTERVAL_MS = 45_000;

/** Claim a single active session on login; poll so other devices are signed out quietly. */
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
      if (!cancelled) handleSessionReplaced(() => signOut());
    };
    window.addEventListener(SESSION_REPLACED_EVENT, onSessionReplaced);

    const timer = window.setInterval(() => {
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
