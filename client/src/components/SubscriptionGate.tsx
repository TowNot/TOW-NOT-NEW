import { useUser } from "@clerk/clerk-react";
import { useEffect } from "react";
import { useSubscriptionStatus } from "../hooks/useSubscriptionStatus";
import { IncidentDesk } from "../pages/IncidentDesk";
import { SelectZonePage } from "../pages/SelectZonePage";
import { RouteLoadingShell } from "./RouteLoadingShell";
import { SessionTakenOverModal } from "./SessionTakenOverModal";
import { isClerkConfigured } from "../lib/clerkKey";
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

/** Block desk until signed in with an active or trialing subscription. */
export function ProtectedDeskRoute({ user }: { user: Parameters<typeof IncidentDesk>[0]["user"] }) {
  const { isLoaded, isSignedIn } = useUser();
  const { active: subscribed, loading: subscriptionLoading, refresh } = useSubscriptionStatus();
  const sessionTakenOver = useSessionTakeover();

  useEffect(() => {
    if (!isSignedIn) return;
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [isSignedIn, refresh]);

  if (!isClerkConfigured()) {
    return redirect("/get-started");
  }

  if (!isLoaded || subscriptionLoading) {
    return <RouteLoadingShell label="Checking your access…" />;
  }

  if (!isSignedIn) {
    return redirect(loginRedirectUrl(currentReturnPath()));
  }

  if (!subscribed) {
    return redirect("/get-started");
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
