import { useUser } from "@clerk/clerk-react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ensureDeviceSession, SessionReplacedError } from "../lib/apiFetch";

interface SubscriptionStatus {
  active: boolean;
  trialUsed: boolean;
  loading: boolean;
  error: string | null;
  refresh: (opts?: { background?: boolean }) => Promise<void>;
}

export function useSubscriptionStatus(): SubscriptionStatus {
  const { isLoaded, isSignedIn } = useUser();
  const [active, setActive] = useState(false);
  const [trialUsed, setTrialUsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (opts?: { background?: boolean }) => {
    const background = Boolean(opts?.background);

    if (!isLoaded) {
      if (!background) setLoading(true);
      return;
    }

    if (!isSignedIn) {
      setActive(false);
      setTrialUsed(false);
      setLoading(false);
      setError(null);
      return;
    }

    // Background rechecks must not flip loading — that unmounts the desk
    // ("Checking your access…"), drops SSE, and restarts Progressier tags.
    if (!background) setLoading(true);
    setError(null);
    try {
      await ensureDeviceSession();
      const response = await apiFetch("/api/subscriptions/me");
      if (response.status === 401) {
        setActive(false);
        setTrialUsed(false);
        return;
      }
      if (!response.ok) {
        throw new Error("Unable to check subscription status");
      }
      const body = (await response.json()) as { active?: boolean; trialUsed?: boolean };
      setActive(Boolean(body.active));
      setTrialUsed(Boolean(body.trialUsed));
    } catch (caught) {
      if (caught instanceof SessionReplacedError) {
        setActive(false);
        setTrialUsed(false);
        return;
      }
      setActive(false);
      setTrialUsed(false);
      setError(caught instanceof Error ? caught.message : "Unable to check subscription status");
    } finally {
      if (!background) setLoading(false);
    }
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { active, trialUsed, loading, error, refresh };
}
