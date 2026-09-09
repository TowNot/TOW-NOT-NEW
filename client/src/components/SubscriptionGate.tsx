import { useUser } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { useSubscriptionStatus } from "../hooks/useSubscriptionStatus";
import { IncidentDesk } from "../pages/IncidentDesk";
import { SelectZonePage } from "../pages/SelectZonePage";
import { RouteLoadingShell } from "./RouteLoadingShell";
import { SessionTakenOverModal } from "./SessionTakenOverModal";
import { isClerkConfigured } from "../lib/clerkKey";
import { apiFetch } from "../lib/apiFetch";
import { loginRedirectUrl } from "../lib/onboarding";
import { useSessionTakeover } from "../lib/sessionTakeover";

function redirect(to: string): null {
  window.location.replace(to);
  return null;
}

function currentReturnPath(): string {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path === "/login" ? "/dashboard" : path;
}

function useCityChosen(enabled: boolean): { cityChosen: boolean | null; loading: boolean } {
  const [cityChosen, setCityChosen] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setCityChosen(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void apiFetch("/api/user/city")
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setCityChosen(data?.cityChosen === true);
      })
      .catch(() => {
        if (!cancelled) setCityChosen(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { cityChosen, loading };
}

/** Block desk until signed in with an active or trialing subscription. */
export function ProtectedDeskRoute({ user }: { user: Parameters<typeof IncidentDesk>[0]["user"] }) {
  const { isLoaded, isSignedIn } = useUser();
  const { active: subscribed, loading: subscriptionLoading, refresh } = useSubscriptionStatus();
  const sessionTakenOver = useSessionTakeover();
  const { cityChosen, loading: cityLoading } = useCityChosen(Boolean(isSignedIn && subscribed));

  useEffect(() => {
    if (!isSignedIn) return;
    // Quiet recheck — never set loading, or the desk unmounts every minute.
    const timer = window.setInterval(() => void refresh({ background: true }), 60_000);
    return () => window.clearInterval(timer);
  }, [isSignedIn, refresh]);

  if (!isClerkConfigured()) {
    return redirect("/get-started");
  }

  if (!isLoaded || subscriptionLoading || (subscribed && cityLoading)) {
    return <RouteLoadingShell label="Checking your access…" />;
  }

  if (!isSignedIn) {
    return redirect(loginRedirectUrl(currentReturnPath()));
  }

  if (!subscribed) {
    return redirect("/get-started");
  }

  if (cityChosen !== true) {
    return redirect("/welcome");
  }

  return (
    <div className={sessionTakenOver ? "session-takeover-desk" : undefined}>
      <IncidentDesk user={user} />
      {sessionTakenOver ? <SessionTakenOverModal /> : null}
    </div>
  );
}

/** Zone picker — subscribed accounts only (canceled → billing). */
export function ProtectedWelcomeRoute({ user }: { user: Parameters<typeof SelectZonePage>[0]["user"] }) {
  const { isLoaded, isSignedIn } = useUser();
  const { active: subscribed, loading: subscriptionLoading } = useSubscriptionStatus();

  if (!isClerkConfigured()) {
    return redirect("/get-started");
  }

  if (!isLoaded || subscriptionLoading) {
    return <RouteLoadingShell label="Checking your access…" />;
  }

  if (!isSignedIn) {
    return redirect(loginRedirectUrl("/welcome"));
  }

  if (!subscribed) {
    return redirect("/get-started");
  }

  return <SelectZonePage user={user} />;
}
