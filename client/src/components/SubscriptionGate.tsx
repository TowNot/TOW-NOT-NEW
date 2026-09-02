import { useUser } from "@clerk/clerk-react";
import { IncidentDesk } from "../pages/IncidentDesk";
import { SelectZonePage } from "../pages/SelectZonePage";
import { useSelectedZone } from "../hooks/useSelectedZone";
import { useSubscriptionStatus } from "../hooks/useSubscriptionStatus";
import { isClerkConfigured } from "../lib/clerkKey";
import { loginRedirectUrl } from "../lib/onboarding";

function redirect(to: string): null {
  window.location.replace(to);
  return null;
}

function currentReturnPath(): string {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path === "/login" ? "/dashboard" : path;
}

/** Block desk until the user is signed in, subscribed, and has a saved zone. */
export function ProtectedDeskRoute({ user }: { user: Parameters<typeof useSelectedZone>[0] }) {
  const { isLoaded, isSignedIn } = useUser();
  const { active: subscribed, loading: subscriptionLoading } = useSubscriptionStatus();
  const { hasPreference, cityLoading } = useSelectedZone(user);

  if (!isClerkConfigured()) {
    return redirect("/get-started");
  }

  if (!isLoaded || subscriptionLoading || cityLoading) {
    return null;
  }

  if (!isSignedIn) {
    return redirect(loginRedirectUrl(currentReturnPath()));
  }

  if (!subscribed) {
    return redirect("/get-started");
  }

  if (!hasPreference) {
    return redirect("/welcome");
  }

  return <IncidentDesk user={user} />;
}

/** Post-login zone picker — only for subscribed users without a saved city. */
export function ProtectedWelcomeRoute({ user }: { user: Parameters<typeof useSelectedZone>[0] }) {
  const { isLoaded, isSignedIn } = useUser();
  const { active: subscribed, loading: subscriptionLoading } = useSubscriptionStatus();
  const { hasPreference, cityLoading } = useSelectedZone(user);

  if (!isClerkConfigured()) {
    return redirect("/get-started");
  }

  if (!isLoaded || subscriptionLoading || cityLoading) {
    return null;
  }

  if (!isSignedIn) {
    return redirect(loginRedirectUrl("/welcome"));
  }

  if (!subscribed) {
    return redirect("/get-started");
  }

  if (hasPreference) {
    return redirect("/dashboard");
  }

  return <SelectZonePage user={user} />;
}
