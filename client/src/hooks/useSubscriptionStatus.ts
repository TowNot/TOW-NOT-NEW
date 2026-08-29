import { useAuth } from "@clerk/clerk-react";
import { useCallback, useEffect, useState } from "react";

interface SubscriptionStatus {
  active: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSubscriptionStatus(): SubscriptionStatus {
  const { isLoaded, isSignedIn } = useAuth();
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isLoaded || !isSignedIn) {
      setActive(false);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/subscriptions/me", { credentials: "include" });
      if (response.status === 401) {
        setActive(false);
        return;
      }
      if (!response.ok) {
        throw new Error("Unable to check subscription status");
      }
      const body = (await response.json()) as { active?: boolean };
      setActive(Boolean(body.active));
    } catch (caught) {
      setActive(false);
      setError(caught instanceof Error ? caught.message : "Unable to check subscription status");
    } finally {
      setLoading(false);
    }
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { active, loading, error, refresh };
}
